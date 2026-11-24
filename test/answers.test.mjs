// What each call does with a 2xx it cannot read as its answer, how a Retry-After
// is read, and what an API key sends: an unreadable answer is a retried
// server_error carrying its status, never a Result holding nothing, a raw
// TypeError or an answer of the wrong type.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { InternetData } from '../dist/index.js';

const data = JSON.parse(readFileSync(new URL('../testdata/testdata.json', import.meta.url), 'utf8'));

const IP = '146.70.116.130';
const OTHER = '9.9.9.9';
const ch = (code) => String.fromCharCode(code);

// A served answer for any address: Unlimited's, as the corpus spells it.
const UNLIMITED = data.lookup.find((c) => c.name === 'unlimited-answer').body;
const served = (ip) => ({ ...UNLIMITED, ip: ip });
const ASN = data.lookup.find((c) => c.name === 'asn-unlimited-answer').body;
const DOMAIN = data.lookup.find((c) => c.name === 'domain-unlimited-answer').body;
const PAID = data.lookup.find((c) => c.name === 'paid-services').body;
const ASN_PAID = data.lookup.find((c) => c.name === 'asn-paid-answer').body;
const DOMAIN_PAID = data.lookup.find((c) => c.name === 'domain-paid-answer').body;
const ENTITLEMENT = {
    org_id: '85bb51e4-2eb6-4a31-8e4d-02ba8b98fe61',
    apikey: { id: '0ab424cc-7619-4dad-b027-afacdc2cedb0', expires: null, allowed_cidrs: [] },
    plan: { key: 'max', name: 'Max', tier: 'max' },
    usage: {
        requests: 580, quota: 5000000, hard_limit: null,
        window_start: '2026-09-04T07:00:00Z', window_end: '2026-10-04T07:00:00Z',
    },
};

const without = (object, member) => Object.fromEntries(Object.entries(object).filter(([k]) => k !== member));

function rawClient(reply, options = {}) {
    const calls = [];
    const fetch = async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        calls.push({ url: request.url, auth: request.headers.get('authorization') });
        return reply(request);
    };
    return {
        calls: calls,
        client: new InternetData({ apiKey: 'test-key', fetch: fetch, retries: 2, cache: false, ...options }),
    };
}

function body(text, type = 'application/json') {
    return () => new Response(text, { status: 200, headers: { 'content-type': type } });
}

// The body stops part way, as when a proxy drops the connection.
function cutOff() {
    return () => new Response(new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(`{"ip":"${IP}","is_b`));
            controller.error(new TypeError('terminated'));
        },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
}

// Each call, a body with its member of the wrong type, and one missing a member it needs.
const CALLS = {
    lookup: [(c) => c.lookup(IP), { ...served(IP), is_tor: 'no' }, without(served(IP), 'is_bogon')],
    myIp: [(c) => c.myIp(), { ...served(IP), ip: 1 }, without(served(IP), 'ip')],
    lookupAsn: [(c) => c.lookupAsn(9009), { ...ASN, asn: '9009' }, without(ASN, 'registry')],
    lookupDomain: [(c) => c.lookupDomain('example.com'), { ...DOMAIN, has_a: 'yes' }, without(DOMAIN, 'has_mx')],
    myEntitlement: [(c) => c.myEntitlement(), { ...ENTITLEMENT, apikey: 'x' }, without(ENTITLEMENT, 'usage')],
};

test('a 2xx a call cannot read is a retried server_error carrying its status', async () => {
    for (const [name, [call, wrongType, noMembers]] of Object.entries(CALLS)) {
        const replies = {
            html: body('<html><body>Bad gateway</body></html>', 'text/html'),
            cut: cutOff(),
            empty: body(''),
            null: body('null'),
            array: body('[]'),
            object: body('{}'),
            wrongType: body(JSON.stringify(wrongType)),
            noMembers: body(JSON.stringify(noMembers)),
        };
        // Concurrently, since each sits out the retries' backoff.
        await Promise.all(Object.entries(replies).map(async ([kind, reply]) => {
            const c = rawClient(reply);
            await assert.rejects(() => call(c.client), (err) => {
                assert.equal(err.kind, 'server_error', `${name} ${kind}: ${err.message}`);
                assert.equal(err.status, 200, `${name} ${kind}`);
                return true;
            });
            assert.equal(c.calls.length, 3, `${name} ${kind} is retried`);
        }));
    }
});

test('a batch chunk it cannot read is retried, and fails every address with the status', async () => {
    const replies = {
        html: body('<html><body>Bad gateway</body></html>', 'text/html'),
        cut: cutOff(),
        empty: body(''),
        null: body('null'),
        array: body('[]'),
        object: body('{}'),
        noErrors: body(JSON.stringify({ results: { [IP]: served(IP) } })),
        wrongType: body('{"results":[],"errors":{}}'),
    };
    await Promise.all(Object.entries(replies).map(async ([kind, reply]) => {
        const c = rawClient(reply);
        const out = await c.client.lookupBatch([IP, OTHER]);
        for (const ip of [IP, OTHER]) {
            assert.equal(out.get(ip).kind, 'server_error', `${kind} ${ip}: ${out.get(ip).message}`);
            assert.equal(out.get(ip).status, 200, `${kind} ${ip}`);
        }
        assert.equal(c.calls.length, 3, `${kind} is retried`);
    }));
});

test('one batch entry it cannot read is that address error alone', async () => {
    for (const entry of [{}, [], 'x', { ip: OTHER }, { ...served(OTHER), is_tor: 'no' }]) {
        for (const map of ['results', 'errors']) {
            const answer = { results: { [IP]: served(IP) }, errors: {} };
            answer[map][OTHER] = entry;
            const c = rawClient(body(JSON.stringify(answer)));
            const out = await c.client.lookupBatch([IP, OTHER]);
            const label = `${map} ${JSON.stringify(entry).slice(0, 40)}`;
            assert.equal(out.get(IP).ip, IP, label);
            assert.equal(out.get(OTHER).kind, 'server_error', label);
            assert.equal(out.get(OTHER).status, 200, label);
            assert.equal(c.calls.length, 1, `${label} is not retried for one entry`);
        }
    }
});

test('an address named like a member of every object reads its own entry', async () => {
    const names = ['__proto__', 'constructor', 'toString'];
    const errors = names.map((name) => `"${name}":{"status":400,"error":"not a valid IP address"}`).join(',');
    const c = rawClient(body(`{"results":{"${IP}":${JSON.stringify(served(IP))}},"errors":{${errors}}}`));
    const out = await c.client.lookupBatch([IP, ...names]);
    assert.equal(out.get(IP).ip, IP);
    for (const name of names) {
        assert.equal(out.get(name).kind, 'bad_request', name);
        assert.equal(out.get(name).status, 400, name);
    }
    assert.equal(c.calls.length, 1);
});

// Every shape the corpus serves is readable, and the readable ones come back whole.
test('a readable answer still comes back', async () => {
    for (const c of data.lookup) {
        const call = { lookup: (x) => x.lookup(c.target), lookupAsn: (x) => x.lookupAsn(c.target),
            lookupDomain: (x) => x.lookupDomain(c.target) }[c.call];
        const raw = rawClient(body(JSON.stringify(c.body)));
        assert.deepEqual((await call(raw.client)).raw, c.body, c.name);
        assert.equal(raw.calls.length, 1, c.name);
    }
    // A detail object requires no member: `{}` under a false flag, and whatever it carries.
    const partial = { ...PAID, ip: IP, cdn: { provider: 'cloudflare' }, bittorrent: { verified: true } };
    const detail = rawClient(body(JSON.stringify(partial)));
    assert.deepEqual((await detail.client.lookup(IP)).cdn, { provider: 'cloudflare' });
    const ent = rawClient(body(JSON.stringify(ENTITLEMENT)));
    assert.deepEqual(await ent.client.myEntitlement(), ENTITLEMENT);
    const batch = rawClient(body(JSON.stringify({
        results: { [IP]: served(IP) }, errors: { [OTHER]: { status: 429, error: 'spent' } },
    })));
    const out = await batch.client.lookupBatch([IP, OTHER]);
    assert.deepEqual(out.get(IP).raw, served(IP));
    assert.equal(out.get(OTHER).kind, 'quota_exceeded');
    assert.equal(batch.calls.length, 1);
});

// A paid domain answer's hosting, co-hosted domains, home page, redirects and
// backlinks come back on their camelCase names, and an Unlimited answer has none.
test('a paid domain answer carries its hosting, home page and linking domains; Unlimited none', async () => {
    const paid = await rawClient(body(JSON.stringify(DOMAIN_PAID))).client.lookupDomain('example.com');
    assert.deepEqual(paid.hosting, DOMAIN_PAID.hosting);
    assert.equal(paid.hosting[1].asn.prefix, '2001:db8::/32');
    assert.deepEqual(paid.cohostedDomains, DOMAIN_PAID.cohosted_domains);
    assert.deepEqual(paid.web, DOMAIN_PAID.web);
    assert.deepEqual(paid.redirects, DOMAIN_PAID.redirects);
    assert.deepEqual(paid.backlinks, DOMAIN_PAID.backlinks);
    const free = await rawClient(body(JSON.stringify(DOMAIN))).client.lookupDomain('example.com');
    for (const member of ['hosting', 'cohostedDomains', 'web', 'redirects', 'backlinks']) {
        assert.equal(member in free, false, member);
    }
});

// A member of the wrong type, at any depth, a numeric string or a null where the
// spec allows none included, is unreadable.
test('a member of the wrong type is a retried server_error carrying its status', async () => {
    const look = (c) => c.lookup(IP);
    const lookup = { ...PAID, ip: IP };
    const asn = (c) => c.lookupAsn(9009);
    const domain = (c) => c.lookupDomain('example.com');
    const ent = (c) => c.myEntitlement();
    const cases = {
        'is_vpn as "yes"': [look, { ...lookup, is_vpn: 'yes' }],
        'is_bogon as null': [look, { ...lookup, is_bogon: null }],
        'a hostname of 1': [look, { ...lookup, hostname: 1 }],
        'a tor detail of "x"': [look, { ...lookup, tor: 'x' }],
        'a cdn provider of 1': [look, { ...lookup, cdn: { ...lookup.cdn, provider: 1 } }],
        'dcproxy hits of "3"': [look, {
            ...lookup, dcproxy: { provider: '', provider_name: '', first_seen: '', last_seen: '', hits: '3',
                hits_days_pct: 1, providers_num: 1 },
        }],
        'a web row with a port of "443"': [look, { ...lookup, web: [{ ...lookup.web[0], port: '443' }] }],
        'web as {}': [look, { ...lookup, web: {} }],
        'web of [null]': [look, { ...lookup, web: [null] }],
        'bittorrent clients of [1]': [look, { ...lookup, bittorrent: { ...lookup.bittorrent, clients: [1] } }],
        'a location latitude of "1"': [look, { ...lookup, location: { ...lookup.location, latitude: '1' } }],
        'a location city of 1': [look, { ...lookup, location: { ...lookup.location, city: 1 } }],
        'a location without its members': [look, { ...lookup, location: {} }],
        'an asn of "5"': [look, { ...lookup, asn: { ...lookup.asn, asn: '5' } }],
        'an asn rpki_status of 1': [look, { ...lookup, asn: { ...lookup.asn, rpki_status: 1 } }],
        'a company type of 1': [look, { ...lookup, company: { ...lookup.company, type: 1 } }],
        'abuse validated as "no"': [look, { ...lookup, abuse: { ...lookup.abuse, validated: 'no' } }],
        'a whois asn of "1"': [look, { ...lookup, whois: { ...lookup.whois, asn: '1' } }],
        'rwhois as {}': [look, { ...lookup, rwhois: {} }],
        'hosted_domains total of 1.5': [look, { ...lookup, hosted_domains: { total: 1.5 } }],
        'trial_expired as 0': [look, { ...lookup, trial_expired: 0 }],
        'cap_reached as "true"': [look, { ...lookup, cap_reached: 'true' }],
        'myIp with is_web as 0': [(c) => c.myIp(), { ...lookup, is_web: 0 }],
        'num_ips of "1"': [asn, { ...ASN_PAID, num_ips: '1' }],
        'an AS cap_reached of 1': [asn, { ...ASN_PAID, cap_reached: 1 }],
        'a rank of "341"': [asn, { ...ASN_PAID, rank: '341' }],
        'a tier1 of "false"': [asn, { ...ASN_PAID, tier1: 'false' }],
        'upstreams of ["174"]': [asn, { ...ASN_PAID, upstreams: ['174'] }],
        'downstreams of [null]': [asn, { ...ASN_PAID, downstreams: [null] }],
        'an AS hosted_domains without total': [asn, { ...ASN_PAID, hosted_domains: { domains: [] } }],
        'AS hosted domains of [1]': [asn, { ...ASN_PAID, hosted_domains: { total: 1, domains: [1] } }],
        'an AS whois value of 1': [asn, { ...ASN_PAID, whois: { ...ASN_PAID.whois, country: 1 } }],
        'a prefix size of "1024"': [asn, { ...ASN_PAID, prefixes: [{ ...ASN_PAID.prefixes[0], size: '1024' }] }],
        'other_origins of ["1"]': [asn, {
            ...ASN_PAID, prefixes: [{ ...ASN_PAID.prefixes[0], other_origins: ['1'] }],
        }],
        'is_registered as "yes"': [domain, { ...DOMAIN_PAID, is_registered: 'yes' }],
        'a domain cap_reached of "false"': [domain, { ...DOMAIN_PAID, cap_reached: 'false' }],
        'an mx priority of "10"': [domain, {
            ...DOMAIN_PAID, dns: { ...DOMAIN_PAID.dns, mx: [{ ...DOMAIN_PAID.dns.mx[0], priority: '10' }] },
        }],
        'dns without cname': [domain, { ...DOMAIN_PAID, dns: without(DOMAIN_PAID.dns, 'cname') }],
        'ip_ranges ipv4 of "256"': [domain, {
            ...DOMAIN_PAID, ip_ranges: { ...DOMAIN_PAID.ip_ranges, ipv4: '256' },
        }],
        'disposable providers of [1]': [domain, {
            ...DOMAIN_PAID, disposable: { confidence: 'high', providers: [1], first_seen: '', last_seen: '' },
        }],
        'hosting as {}': [domain, { ...DOMAIN_PAID, hosting: {} }],
        'hosting of [null]': [domain, { ...DOMAIN_PAID, hosting: [null] }],
        'a hosting entry without asn': [domain, { ...DOMAIN_PAID, hosting: [without(DOMAIN_PAID.hosting[0], 'asn')] }],
        'a hosting asn of "64496"': [domain, {
            ...DOMAIN_PAID, hosting: [{ ...DOMAIN_PAID.hosting[0], asn: { ...DOMAIN_PAID.hosting[0].asn, asn: '64496' } }],
        }],
        'a hosting asn without prefix': [domain, {
            ...DOMAIN_PAID, hosting: [{ ...DOMAIN_PAID.hosting[0], asn: without(DOMAIN_PAID.hosting[0].asn, 'prefix') }],
        }],
        'a cohosted_domains total of "3"': [domain, {
            ...DOMAIN_PAID, cohosted_domains: { ...DOMAIN_PAID.cohosted_domains, total: '3' },
        }],
        'cohosted_domains without ip': [domain, { ...DOMAIN_PAID, cohosted_domains: without(DOMAIN_PAID.cohosted_domains, 'ip') }],
        'cohosted domains of [1]': [domain, {
            ...DOMAIN_PAID, cohosted_domains: { ...DOMAIN_PAID.cohosted_domains, domains: [1] },
        }],
        'web as []': [domain, { ...DOMAIN_PAID, web: [] }],
        'web without last_seen': [domain, { ...DOMAIN_PAID, web: without(DOMAIN_PAID.web, 'last_seen') }],
        'a web title of null': [domain, { ...DOMAIN_PAID, web: { ...DOMAIN_PAID.web, title: null } }],
        'web links without hosts': [domain, {
            ...DOMAIN_PAID, web: { ...DOMAIN_PAID.web, links: without(DOMAIN_PAID.web.links, 'hosts') },
        }],
        'web link hosts of [1]': [domain, {
            ...DOMAIN_PAID, web: { ...DOMAIN_PAID.web, links: { ...DOMAIN_PAID.web.links, hosts: [1] } },
        }],
        'a redirects total of 1.5': [domain, { ...DOMAIN_PAID, redirects: { ...DOMAIN_PAID.redirects, total: 1.5 } }],
        'redirects without domains': [domain, { ...DOMAIN_PAID, redirects: without(DOMAIN_PAID.redirects, 'domains') }],
        'backlinks domains of [null]': [domain, {
            ...DOMAIN_PAID, backlinks: { ...DOMAIN_PAID.backlinks, domains: [null] },
        }],
        'backlinks as "3"': [domain, { ...DOMAIN_PAID, backlinks: '3' }],
        'requests of "5"': [ent, { ...ENTITLEMENT, usage: { ...ENTITLEMENT.usage, requests: '5' } }],
        'a hard_limit of "5"': [ent, { ...ENTITLEMENT, usage: { ...ENTITLEMENT.usage, hard_limit: '5' } }],
        'a tier of 1': [ent, { ...ENTITLEMENT, plan: { key: 'max', name: 'Max', tier: 1 } }],
        'a plan name of 1': [ent, { ...ENTITLEMENT, plan: { key: 'max', name: 1, tier: 'max' } }],
        'a plan without a name': [ent, { ...ENTITLEMENT, plan: { key: 'max', tier: 'max' } }],
        'allowed_cidrs of [1]': [ent, { ...ENTITLEMENT, apikey: { ...ENTITLEMENT.apikey, allowed_cidrs: [1] } }],
        'a window_end of "tomorrow"': [ent, {
            ...ENTITLEMENT, usage: { ...ENTITLEMENT.usage, window_end: 'tomorrow' },
        }],
    };
    // Concurrently, since each sits out the retries' backoff.
    await Promise.all(Object.entries(cases).map(async ([name, [call, answer]]) => {
        const c = rawClient(body(JSON.stringify(answer)));
        await assert.rejects(() => call(c.client), (err) => {
            assert.equal(err.kind, 'server_error', `${name}: ${err.message}`);
            assert.equal(err.status, 200, name);
            return true;
        });
        assert.equal(c.calls.length, 3, `${name} is retried`);
    }));
    // A batch entry it cannot read is that address's error alone, unretried.
    const c = rawClient(body(JSON.stringify({ results: { [IP]: { ...lookup, is_vpn: 'yes' } }, errors: {} })));
    const out = await c.client.lookupBatch([IP]);
    assert.equal(out.get(IP).kind, 'server_error');
    assert.equal(c.calls.length, 1);
});

// RFC 3339 alone, on a day that exists: the entitlement's, the only dates these calls read.
test('a date or date-time that is not RFC 3339 is a retried server_error', async () => {
    const dateTimes = ['2026-10-05', '2026-10-05T10:00:00', '2026-10-05T10:00:00+05', '2026-10-05T10:00Z',
        '2026-10-05T10:00:00+0500', '2026-10-05T10:00:00+05:00:30', '2026-10-05T24:00:00Z',
        '2026-10-05T10:60:00Z', '2026-10-05T10:00:60Z', '2026-02-30T10:00:00Z', '2026-10-05T10:00:00+24:00',
        '2026-10-05T10:00:00+05:60', ' 2026-10-05T10:00:00Z', '2026-10-05T10:00:00Z ', '2026-10-05 10:00:00Z',
        '2026-10-5T10:00:00Z', '+12026-10-05T10:00:00Z', '2026-10-05T10:00:00.Z', '20261005T100000Z', 'x',
        'tomorrow', 'monday', ''];
    const entitlement = {
        org_id: 'o', apikey: { id: 'a', expires: null, allowed_cidrs: [] }, plan: { key: 'max', name: 'Max', tier: 'max' },
        usage: {
            requests: 1, quota: 2, hard_limit: null,
            window_start: '2026-10-01T00:00:00Z', window_end: '2026-11-01T00:00:00Z',
        },
    };
    const ent = (c) => c.myEntitlement();
    const cases = [];
    const usage = (member, value) => ({ ...entitlement, usage: { ...entitlement.usage, [member]: value } });
    const expiring = (value) => ({ ...entitlement, apikey: { ...entitlement.apikey, expires: value } });
    for (const value of dateTimes) {
        cases.push([`window_start ${value}`, ent, usage('window_start', value)]);
        cases.push([`window_end ${value}`, ent, usage('window_end', value)]);
        cases.push([`expires ${value}`, ent, expiring(value)]);
    }
    await Promise.all(cases.map(async ([name, call, served]) => {
        const c = rawClient(body(JSON.stringify(served)), { retries: 1 });
        await assert.rejects(() => call(c.client), (err) => {
            assert.equal(err.kind, 'server_error', `${name}: ${err.message}`);
            assert.equal(err.status, 200, name);
            return true;
        });
        assert.equal(c.calls.length, 2, `${name} is retried`);
    }));
    for (const value of ['2026-10-05T10:00:00Z', '2026-10-05t10:00:00.5z', '2026-10-05T10:00:00-00:00',
        '2026-10-05T10:00:00.123456789+05:30', '2024-02-29T23:59:59+23:59', '0001-01-01T00:00:00Z']) {
        const c = rawClient(body(JSON.stringify(expiring(value))));
        assert.equal((await c.client.myEntitlement()).apikey.expires, value, value);
    }
});

// The generated types and the pinned spec, read as text: the tables are
// hand-written, so a member or a date the spec adds must fail here until it is
// checked.
const GENERATED = readFileSync(new URL('../src/generated/types.gen.ts', import.meta.url), 'utf8');

function generatedBlock(name) {
    const block = GENERATED.split(`export type ${name} = {\n`)[1];
    assert.ok(block !== undefined, `types.gen.ts has no ${name}`);
    return block.split('\n};')[0];
}

// A first or last seen day is the spec's `format: date`, so one that is no
// RFC 3339 full-date on a real day is unreadable, wherever it sits; it stays a
// string. DomainWeb's `last_seen`, BitTorrent's `last_reachable` and Public Proxy
// IP's `last_usable` may be empty, so they are not days.
test('a seen day that is no full-date is a retried server_error', async () => {
    const day = { first_seen: '2026-06-01', last_seen: '2026-11-12' };
    const lookupBodies = [
        data.lookup.find((c) => c.name === 'paid-full-shape').body,
        data.lookup.find((c) => c.name === 'paid-services').body,
        {
            ...PAID, ip: IP, is_resproxy: true, is_pubproxy: true, is_ssh: true, is_smtp: true,
            resproxy: { provider: 'p', provider_name: 'P', ...day, hits: 7, hits_days_pct: 42, providers_num: 2 },
            pubproxy: {
                entry: true, exit: false, protocols: ['socks5'], num_ports: 1, num_proxies: 0, last_seen: '2026-11-12',
                last_usable: '',
            },
            ssh: { port: 22, banner: 'SSH-2.0-OpenSSH_9.6', host_key_fp: 'SHA256:x', session_ok: true, ...day },
            smtp: { port: 25, banner: '220 mx ESMTP', session_ok: true, ...day },
        },
    ];
    const domainBody = {
        ...DOMAIN_PAID, is_disposable: true,
        disposable: { confidence: 'high', providers: ['p'], ...day },
    };
    const calls = [
        ...lookupBodies.map((answer) => [(c) => c.lookup(answer.ip), answer]),
        [(c) => c.lookupAsn(9009), ASN_PAID],
        [(c) => c.lookupDomain('example.com'), domainBody],
    ];
    // Each answer reads as served, then with one day at a time made unreadable.
    const cases = [];
    for (const [call, answer] of calls) {
        const got = await call(rawClient(body(JSON.stringify(answer))).client);
        assert.deepEqual(got.raw, answer);
        const paths = [];
        const walk = (value, path) => {
            if (Array.isArray(value)) {
                value.forEach((element, i) => walk(element, [...path, i]));
            } else if (value !== null && typeof value === 'object') {
                for (const [member, inner] of Object.entries(value)) {
                    const skip = member === 'last_seen' && path.length === 1 && path[0] === 'web' && !Array.isArray(answer.web);
                    if ((member === 'first_seen' || member === 'last_seen') && !skip) {
                        paths.push([...path, member]);
                    } else {
                        walk(inner, [...path, member]);
                    }
                }
            }
        };
        walk(answer, []);
        for (const path of paths) {
            for (const bad of ['x', '', '2026-02-30', '2026-11-5', '2026-11-05T00:00:00Z', '2026-11-05\n']) {
                const copy = structuredClone(answer);
                path.slice(0, -1).reduce((o, k) => o[k], copy)[path.at(-1)] = bad;
                cases.push([`${path.join('.')} of ${JSON.stringify(bad)}`, call, copy]);
            }
        }
    }
    assert.equal(new Set(cases.map(([name]) => name.split(' of ')[0])).size >= 20, true);
    await Promise.all(cases.map(async ([name, call, answer]) => {
        const c = rawClient(body(JSON.stringify(answer)));
        await assert.rejects(() => call(c.client), (err) => {
            assert.equal(err.kind, 'server_error', `${name}: ${err.message}`);
            assert.equal(err.status, 200, name);
            return true;
        });
        assert.equal(c.calls.length, 3, `${name} is retried`);
    }));
});

// Each `date` and `date-time` kind is the spec's `format` for that member, and no
// other member carries one, so a date the spec adds is checked before it ships.
test('each date kind is the format the spec names', async () => {
    const shapes = await import('../dist/shapes.js');
    const spec = readFileSync(new URL('../spec/openapi.yaml', import.meta.url), 'utf8');
    const formats = new Map();
    let schema = null;
    let member = null;
    for (const line of spec.split('\n').slice(spec.split('\n').indexOf('components:'))) {
        schema = /^ {4}([A-Za-z][A-Za-z0-9]*):$/.exec(line)?.[1] ?? schema;
        member = /^ {8}([a-z_]+):$/.exec(line)?.[1] ?? member;
        const format = /^ {10}format: (date|date-time)$/.exec(line)?.[1];
        if (format !== undefined) {
            formats.set(`${schema}.${member}`, format);
        }
    }
    const tables = typeTables(shapes);
    const kinds = new Map();
    for (const [name, table] of Object.entries(tables)) {
        for (const [m, kind] of Object.entries(table)) {
            if (kind === 'date' || kind === 'date-time') {
                kinds.set(`${name}.${m}`, kind);
            }
        }
    }
    const covered = [...formats].filter(([at]) => tables[at.split('.')[0]] !== undefined);
    assert.equal(covered.length, 26, "the entitlement's three and the lookups' 23 first and last seen days");
    for (const [at, format] of covered) {
        assert.equal(kinds.get(at), format, at);
    }
    assert.equal(kinds.size, covered.length);
});

// The lists are hand-written, so a member the spec makes required, and never null,
// must not be able to go unchecked: read the generated types and compare.
test('each checked member list is every required member of its generated type', async () => {
    const shapes = await import('../dist/shapes.js');
    const required = (name) => [...generatedBlock(name).matchAll(/^ {4}([a-z][a-z0-9_]*): (.*)$/gm)]
        .filter((m) => !/\| null;$/.test(m[2])).map((m) => m[1]).sort();
    const lists = {
        LookupResponse: shapes.LOOKUP_MEMBERS, WebDetail: shapes.WEB_DETAIL_MEMBERS,
        Location: shapes.LOCATION_MEMBERS,
        Asn: shapes.ASN_MEMBERS, Company: shapes.COMPANY_MEMBERS, AbuseContact: shapes.ABUSE_CONTACT_MEMBERS,
        Whois: shapes.WHOIS_MEMBERS, Rwhois: shapes.RWHOIS_MEMBERS, HostedDomains: shapes.HOSTED_DOMAINS_MEMBERS,
        AsnLookupResponse: shapes.ASN_LOOKUP_MEMBERS, AsnPrefix: shapes.ASN_PREFIX_MEMBERS,
        DomainLookupResponse: shapes.DOMAIN_LOOKUP_MEMBERS, DomainDns: shapes.DOMAIN_DNS_MEMBERS,
        DnsAddressRecord: shapes.DNS_ADDRESS_RECORD_MEMBERS, DnsMxRecord: shapes.DNS_MX_RECORD_MEMBERS,
        DnsNsRecord: shapes.DNS_NS_RECORD_MEMBERS, DnsCnameRecord: shapes.DNS_CNAME_RECORD_MEMBERS,
        DomainIpRanges: shapes.DOMAIN_IP_RANGES_MEMBERS, DomainIpRange: shapes.DOMAIN_IP_RANGE_MEMBERS,
        DomainHost: shapes.DOMAIN_HOST_MEMBERS, CohostedDomains: shapes.COHOSTED_DOMAINS_MEMBERS,
        DomainWeb: shapes.DOMAIN_WEB_MEMBERS, DomainWebLinks: shapes.DOMAIN_WEB_LINKS_MEMBERS,
        DomainRedirects: shapes.DOMAIN_REDIRECTS_MEMBERS, DomainBacklinks: shapes.DOMAIN_BACKLINKS_MEMBERS,
        BatchLookupResponse: shapes.BATCH_MEMBERS,
        BatchLookupError: shapes.BATCH_ERROR_MEMBERS, Entitlement: shapes.ENTITLEMENT_MEMBERS,
        EntitlementApikey: shapes.ENTITLEMENT_APIKEY_MEMBERS, EntitlementPlan: shapes.ENTITLEMENT_PLAN_MEMBERS,
        EntitlementUsage: shapes.ENTITLEMENT_USAGE_MEMBERS, UserAgentVerdict: shapes.USER_AGENT_VERDICT_MEMBERS,
    };
    for (const [name, list] of Object.entries(lists)) {
        assert.deepEqual([...list].sort(), required(name), name);
    }
    // A detail object requires nothing, which is what lets `{}` stand under a false flag.
    for (const name of ['ClassDetail', 'ProxyDetail', 'PubproxyDetail', 'CarrierDetail', 'SatelliteDetail',
        'SshDetail', 'SmtpDetail', 'DnsResolverDetail', 'BitTorrentDetail', 'DisposableDetail', 'BotDetail']) {
        assert.deepEqual(required(name), [], name);
    }
});

// Each type table names every member of its generated type, optional and nullable
// ones included, so a member the spec adds is typed before it can come back unread.
test('each type table covers every member of its generated type', async () => {
    const shapes = await import('../dist/shapes.js');
    const members = (name) => [...generatedBlock(name).matchAll(/^ {4}([a-z][a-z0-9_]*)\??: /gm)]
        .map((m) => m[1]).sort();
    const tables = typeTables(shapes);
    for (const [name, table] of Object.entries(tables)) {
        assert.deepEqual(Object.keys(table).sort(), members(name), name);
    }
    // Each wire member the client maps has a type, and `number` only where the spec says so.
    for (const [name, table] of Object.entries(tables)) {
        for (const [member, kind] of Object.entries(table)) {
            if (kind === 'number' || kind === 'integer') {
                const declared = new RegExp(`^ {4}${member}\\??: (.*);$`, 'm').exec(generatedBlock(name))?.[1];
                assert.match(declared ?? '', /^number( \| null)?$/, `${name}.${member}`);
            }
        }
    }
});

// Every type table, by the generated type it checks.
function typeTables(shapes) {
    return {
        LookupResponse: shapes.LOOKUP_TYPES, ClassDetail: shapes.CLASS_DETAIL_TYPES,
        ProxyDetail: shapes.PROXY_DETAIL_TYPES, PubproxyDetail: shapes.PUBPROXY_DETAIL_TYPES,
        CarrierDetail: shapes.CARRIER_DETAIL_TYPES, SatelliteDetail: shapes.SATELLITE_DETAIL_TYPES,
        SshDetail: shapes.SSH_DETAIL_TYPES, SmtpDetail: shapes.SMTP_DETAIL_TYPES,
        WebDetail: shapes.WEB_DETAIL_TYPES,
        DnsResolverDetail: shapes.DNS_RESOLVER_DETAIL_TYPES, BitTorrentDetail: shapes.BITTORRENT_DETAIL_TYPES,
        Location: shapes.LOCATION_TYPES, Asn: shapes.ASN_TYPES, Company: shapes.COMPANY_TYPES,
        AbuseContact: shapes.ABUSE_CONTACT_TYPES, Whois: shapes.WHOIS_TYPES, Rwhois: shapes.RWHOIS_TYPES,
        HostedDomains: shapes.HOSTED_DOMAINS_TYPES, AsnLookupResponse: shapes.ASN_LOOKUP_TYPES,
        AsnPrefix: shapes.ASN_PREFIX_TYPES, DomainLookupResponse: shapes.DOMAIN_LOOKUP_TYPES,
        DomainDns: shapes.DOMAIN_DNS_TYPES, DnsAddressRecord: shapes.DNS_ADDRESS_RECORD_TYPES,
        DnsMxRecord: shapes.DNS_MX_RECORD_TYPES, DnsNsRecord: shapes.DNS_NS_RECORD_TYPES,
        DnsCnameRecord: shapes.DNS_CNAME_RECORD_TYPES, DomainIpRanges: shapes.DOMAIN_IP_RANGES_TYPES,
        DomainIpRange: shapes.DOMAIN_IP_RANGE_TYPES, DisposableDetail: shapes.DISPOSABLE_DETAIL_TYPES,
        DomainHost: shapes.DOMAIN_HOST_TYPES, CohostedDomains: shapes.COHOSTED_DOMAINS_TYPES,
        DomainWeb: shapes.DOMAIN_WEB_TYPES, DomainWebLinks: shapes.DOMAIN_WEB_LINKS_TYPES,
        DomainRedirects: shapes.DOMAIN_REDIRECTS_TYPES, DomainBacklinks: shapes.DOMAIN_BACKLINKS_TYPES,
        BatchLookupError: shapes.BATCH_ERROR_TYPES, Entitlement: shapes.ENTITLEMENT_TYPES,
        EntitlementApikey: shapes.ENTITLEMENT_APIKEY_TYPES, EntitlementPlan: shapes.ENTITLEMENT_PLAN_TYPES,
        EntitlementUsage: shapes.ENTITLEMENT_USAGE_TYPES, BotDetail: shapes.BOT_DETAIL_TYPES,
        UserAgentVerdict: shapes.USER_AGENT_VERDICT_TYPES,
    };
}

// Digits, or one of RFC 9110's three date forms in GMT, and nothing else.
test('a Retry-After is seconds or an HTTP date and nothing else', async () => {
    const at = (offset) => new Date(Date.now() + offset);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = (d) => days[d.getUTCDay()];
    const forms = {
        imf: (d) => d.toUTCString(),
        rfc850: (d) => {
            const [, dd, mon, yyyy, time] = d.toUTCString().split(' ');
            return `${day(d)}, ${dd}-${mon}-${yyyy.slice(2)} ${time} GMT`;
        },
        asctime: (d) => {
            const [wkd, , mon, yyyy, time] = d.toUTCString().split(' ');
            return `${wkd.slice(0, 3)} ${mon} ${String(d.getUTCDate()).padStart(2, ' ')} ${time} ${yyyy}`;
        },
    };
    const throttled = (value) => () => new Response('{"error":"slow down"}', {
        status: 429, headers: { 'content-type': 'application/json', 'retry-after': value() },
    });
    for (const [form, format] of Object.entries(forms)) {
        // Computed when its case runs: a date fixed up front can pass before it is served.
        const c = rawClient(throttled(() => format(at(10_000))), { retries: 0 });
        await assert.rejects(() => c.client.lookup(IP), (err) => {
            assert.equal(err.kind, 'rate_limited', form);
            const seconds = err.retryAfterSeconds;
            assert.ok(seconds >= 8 && seconds <= 11, `${form}: ${seconds}`);
            return true;
        });
    }
    for (const value of ['7', '0']) {
        const c = rawClient(throttled(() => value), { retries: 0 });
        await assert.rejects(() => c.client.lookup(IP), (err) => {
            assert.equal(err.kind, 'rate_limited', value);
            assert.equal(err.retryAfterSeconds, Number(value));
            return true;
        });
    }
    const spent = [
        '+1', '-1', 'x', 'tomorrow', '1e400', '0x10', '0b11', '1_0', '1e3', '1.5', '2099-01-01',
        '2099-01-01T00:00:00', 'Jan 1 2099', 'Sun, 31 Nov 2099 08:49:37 GMT', 'Fri, 01 Jan 2099 00:00:00 PST',
        'Fri, 01 Jan 2099 00:00:00 +0500', 'Fri, 01 Jan 2099 24:00:00 GMT', 'Xyz, 01 Jan 2099 00:00:00 GMT',
    ];
    for (const value of spent) {
        const c = rawClient(throttled(() => value));
        await assert.rejects(() => c.client.lookup(IP), (err) => {
            assert.equal(err.kind, 'quota_exceeded', value);
            return true;
        });
        assert.equal(c.calls.length, 1, value);
    }
});

test('the key goes out trimmed, blanks are no key, and a control character is refused', async () => {
    const answer = body(JSON.stringify(served(IP)));
    for (const [key, sent] of [['', null], [' ', null], ['\t', null], ['  k  ', 'Bearer k'], [null, null]]) {
        const c = rawClient(answer, { apiKey: key });
        await c.client.lookup(IP);
        assert.equal(c.calls[0].auth, sent, JSON.stringify(key));
    }
    for (const key of ['k\r\nX-Injected: 1', `k${ch(0)}`, `k${ch(0x7f)}`, 'k\nx']) {
        assert.throws(() => new InternetData({ apiKey: key }),
            (err) => err.kind === 'bad_request', JSON.stringify(key));
    }
    assert.throws(() => new InternetData({ apiKey: 5 }), (err) => err.kind === 'bad_request');
    // fetch refuses a header character past U+00FF, so such a key would fail every
    // call as a retried network error with nothing sent.
    for (const key of [`k${ch(0x4e2d)}`, `k${ch(0x100)}`]) {
        assert.throws(() => new InternetData({ apiKey: key }),
            (err) => err.kind === 'bad_request', JSON.stringify(key));
    }
    // A Latin-1 key goes out as its bytes, and is answered as any wrong key is.
    const c = rawClient(answer, { apiKey: `k${ch(0xe9)}` });
    await c.client.lookup(IP);
    assert.equal(c.calls[0].auth, `Bearer k${ch(0xe9)}`);
});

// p-retry checks the count only inside the call, so a negative, NaN or
// non-number would fail every call as `network` with p-retry's own message, and
// a bogon would answer any value.
test('a retry count that is not a whole number from 0 is refused where it is set', async () => {
    const answer = body(JSON.stringify(served(IP)));
    for (const retries of [-1, 1.5, NaN, -Infinity, '2']) {
        const name = String(retries);
        assert.throws(() => new InternetData({ retries: retries }), (err) => err.kind === 'bad_request', name);
        const c = rawClient(answer);
        for (const [call, run] of [
            ['lookup', () => c.client.lookup(IP, { retries: retries })],
            ['a bogon', () => c.client.lookup('10.0.0.1', { retries: retries })],
            ['myIp', () => c.client.myIp({ retries: retries })],
            ['myEntitlement', () => c.client.myEntitlement({ retries: retries })],
            ['lookupBatch', () => c.client.lookupBatch(['10.0.0.1'], { retries: retries })],
            ['lookupAsn', () => c.client.lookupAsn(9009, { retries: retries })],
            ['lookupDomain', () => c.client.lookupDomain('example.com', { retries: retries })],
        ]) {
            await assert.rejects(run, (err) => err.kind === 'bad_request', `${call}, ${name}`);
        }
        assert.equal(c.calls.length, 0, name);
    }
    for (const retries of [0, 3, Infinity, null]) {
        const c = rawClient(answer, { retries: retries });
        await c.client.lookup(IP, { retries: retries });
    }
});
