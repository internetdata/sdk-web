// The eight flags Unlimited's answer stopped carrying (is_bot, is_carrier, is_satellite, is_ssh,
// is_smtp, is_web, is_dns_resolver, is_bittorrent), and `asn.type` with them: an answer may
// omit each, a present one is still read for its type, and what an absent one reads as is held
// at the type `Result` always had.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { InternetData } from '../dist/index.js';

const data = JSON.parse(readFileSync(new URL('../testdata/testdata.json', import.meta.url), 'utf8'));

const IP = '146.70.116.130';
const OTHER = '9.9.9.9';

const FLAGS = [
    'is_bot', 'is_carrier', 'is_satellite', 'is_ssh', 'is_smtp', 'is_web', 'is_dns_resolver', 'is_bittorrent',
];
// Typed boolean on `Result`, so an absent one reads false; `isBot` is optional there and reads absent.
const HELD = FLAGS.filter((flag) => flag !== 'is_bot');

const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

const UNLIMITED = data.lookup.find((c) => c.name === 'unlimited-answer').body;
const DOMAIN_PAID = data.lookup.find((c) => c.name === 'domain-paid-answer').body;
const served = (ip, extra = {}) => ({ ...UNLIMITED, ip: ip, ...extra });
const without = (object, member) => Object.fromEntries(Object.entries(object).filter(([k]) => k !== member));

function clientFor(reply, options = {}) {
    const fetch = async (input) => {
        const path = new URL(input.url).pathname;
        if (path === '/batch') {
            return Response.json(reply(JSON.parse(await input.text()).ips));
        }
        return Response.json(reply([decodeURIComponent(path.slice(1))]));
    };
    return new InternetData({ fetch: fetch, retries: 0, cache: false, ...options });
}

const lookupReply = (extra) => ([ip]) => served(ip, extra);

test('an answer without the eight flags is read, and what it lacks reads as the type Result has', async () => {
    for (const flag of FLAGS) {
        assert.ok(!(flag in UNLIMITED), `the corpus's Unlimited answer carries ${flag}`);
    }
    const client = clientFor(lookupReply({}));
    for (const r of [await client.lookup(IP), await client.myIp()]) {
        assert.ok(!('isBot' in r), 'isBot is absent: not in this plan');
        for (const flag of HELD) {
            assert.equal(r[camel(flag)], false, `${flag} is typed boolean, so it reads false`);
            assert.ok(!(flag in r.raw), `${flag} is not in raw`);
        }
        assert.equal(r.isTor, false);
    }
});

test('a batch entry without the eight flags is read the same way', async () => {
    const client = clientFor(([...ips]) => ({
        results: Object.fromEntries(ips.map((ip) => [ip, served(ip)])), errors: {},
    }));
    const got = await client.lookupBatch([IP, OTHER]);
    for (const ip of [IP, OTHER]) {
        const r = got.get(ip);
        assert.equal(r.ip, ip);
        assert.ok(!('isBot' in r));
        for (const flag of HELD) {
            assert.equal(r[camel(flag)], false, `${ip} ${flag}`);
        }
    }
});

test('an answer carrying the eight flags reads each as served', async () => {
    for (const value of [true, false]) {
        const extra = Object.fromEntries(FLAGS.map((flag) => [flag, value]));
        const r = await clientFor(lookupReply(extra)).lookup(IP);
        for (const flag of FLAGS) {
            assert.equal(r[camel(flag)], value, flag);
            assert.equal(r.raw[flag], value, flag);
        }
    }
});

test('a flag that is present is still refused when it is no boolean, or null', async () => {
    for (const flag of FLAGS) {
        for (const bad of ['yes', 1, 0, null, [], {}]) {
            const client = clientFor(lookupReply({ [flag]: bad }));
            for (const call of [(c) => c.lookup(IP), (c) => c.myIp()]) {
                await assert.rejects(() => call(client), (err) => {
                    assert.equal(err.kind, 'server_error', `${flag} ${JSON.stringify(bad)}`);
                    assert.equal(err.status, 200, `${flag} ${JSON.stringify(bad)}`);
                    return true;
                });
            }
            const batch = clientFor(() => ({
                results: { [IP]: served(IP), [OTHER]: served(OTHER, { [flag]: bad }) }, errors: {},
            }));
            const got = await batch.lookupBatch([IP, OTHER]);
            assert.equal(got.get(IP).ip, IP);
            assert.equal(got.get(OTHER).kind, 'server_error', `${flag} ${JSON.stringify(bad)} in a batch`);
        }
    }
});

test('a cached answer without the flags reads false from the persistent store as from the network', async () => {
    const entries = new Map();
    const store = {
        get: (key) => entries.get(key),
        set: (key, result) => {
            entries.set(key, structuredClone(result));
        },
    };
    await clientFor(lookupReply({}), { cache: { store: store } }).lookup(IP);
    assert.equal(entries.size, 1);
    const offline = new InternetData({
        cache: { store: store },
        fetch: () => {
            throw new Error('the stored answer was not used');
        },
    });
    const r = await offline.lookup(IP);
    assert.ok(!('isBot' in r));
    for (const flag of HELD) {
        assert.equal(r[camel(flag)], false, flag);
    }
});

test('the asn type is read when served, may be absent, and is refused when it is no string', async () => {
    const asn = UNLIMITED.asn;
    assert.equal(typeof asn.type, 'string');
    const present = await clientFor(lookupReply({})).lookup(IP);
    assert.equal(present.asn.type, asn.type);

    const absent = await clientFor(lookupReply({ asn: without(asn, 'type') })).lookup(IP);
    assert.ok(!('type' in absent.asn), 'an absent type is not made up');
    assert.deepEqual(absent.raw.asn, without(asn, 'type'));

    for (const bad of [null, 5, true, []]) {
        await assert.rejects(
            () => clientFor(lookupReply({ asn: { ...asn, type: bad } })).lookup(IP),
            (err) => err.kind === 'server_error' && err.status === 200,
            `asn.type ${JSON.stringify(bad)}`,
        );
    }
    const gone = without(asn, 'name');
    await assert.rejects(
        () => clientFor(lookupReply({ asn: gone })).lookup(IP), (err) => err.kind === 'server_error',
        'asn.name is still required',
    );
});

test("a domain's host network may omit its type, and still refuses one that is no string", async () => {
    const [host] = DOMAIN_PAID.hosting;
    assert.equal(typeof host.asn.type, 'string');
    const reply = (hosting) => () => ({ ...DOMAIN_PAID, hosting: hosting });
    const client = (hosting) => clientFor(reply(hosting));

    const absent = await client([{ ...host, asn: without(host.asn, 'type') }]).lookupDomain('example.com');
    assert.ok(!('type' in absent.hosting[0].asn));
    for (const bad of [null, 5]) {
        await assert.rejects(
            () => client([{ ...host, asn: { ...host.asn, type: bad } }]).lookupDomain('example.com'),
            (err) => err.kind === 'server_error' && err.status === 200,
            `type ${JSON.stringify(bad)}`,
        );
    }
});
