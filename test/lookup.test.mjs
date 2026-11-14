// What this API answers that a VPN lookup does not: an AS and a domain beside an
// address, the refusal of a target that is not an address at the address's own
// path, the hosts each call goes to, and the apex the sign-in derives from the
// base URL. Runs against dist/, which is what ships.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { DEFAULT_BASE_URL, InternetData, InternetDataError } from '../dist/index.js';

const data = JSON.parse(readFileSync(new URL('../testdata/testdata.json', import.meta.url), 'utf8'));

const IP = '146.70.116.130';
const OTHER = '9.9.9.9';

// A served answer for any address: Unlimited's, as the corpus spells it.
const UNLIMITED = data.lookup.find((c) => c.name === 'unlimited-answer').body;
const served = (ip) => ({ ...UNLIMITED, ip: ip });
const ASN = data.lookup.find((c) => c.name === 'asn-unlimited-answer').body;
const DOMAIN = data.lookup.find((c) => c.name === 'domain-unlimited-answer').body;
const ENTITLEMENT = {
    org_id: '85bb51e4-2eb6-4a31-8e4d-02ba8b98fe61',
    apikey: { id: '0ab424cc-7619-4dad-b027-afacdc2cedb0', expires: null, allowed_cidrs: [] },
    plan: { key: 'max', tier: 'max' },
    usage: {
        requests: 580, quota: 5000000, hard_limit: null,
        window_start: '2026-09-04T07:00:00Z', window_end: '2026-10-04T07:00:00Z',
    },
};

// A fetch that answers one fixed body and counts calls.
function countingFetch(body) {
    const state = { calls: 0, urls: [] };
    const fn = async (input) => {
        const url = typeof input === 'string' ? input : input.url;
        state.calls++;
        state.urls.push(new URL(url));
        return Response.json(body);
    };
    return { fetch: fn, state: state };
}

// The API answers an AS or a domain at the lookup's own path, in a shape the call
// cannot read, so one sent there would fail as three retried server errors.
test('lookup refuses what is not an IP address before sending, naming the calls that take it', async () => {
    const t = countingFetch(served(IP));
    const client = new InternetData({ fetch: t.fetch, retries: 2 });
    for (const target of ['AS15169', '15169', 'example.com', '', 'not an address', '1.2.3', '1.2.3.4.5',
        '256.1.1.1', '2001:db8::g', '::ffff:1.2.3.400', 15169, null, undefined]) {
        await assert.rejects(() => client.lookup(target), (err) => {
            assert.ok(err instanceof InternetDataError, `${String(target)}: wrong error type`);
            assert.equal(err.kind, 'bad_request', String(target));
            assert.equal(err.status, undefined, String(target));
            assert.equal(err.message, `'${String(target)}' is not an IP address: `
                + 'look up an AS with lookupAsn, and a domain with lookupDomain', String(target));
            return true;
        });
    }
    assert.equal(t.state.calls, 0, 'a refused target was sent');
    for (const ip of [IP, '2606:4700:4700::1111', '::ffff:146.70.116.130']) {
        await client.lookup(ip);
    }
    assert.deepEqual(t.state.urls.map((u) => u.pathname), [`/${IP}`, '/2606%3A4700%3A4700%3A%3A1111']);
});

// The spec names a production host on each lookup operation, which a generator
// may honor over the client's own base URL. Served from a real local origin, so
// nothing but the base URL can decide where a request goes.
test('every lookup goes to the base URL, never the host the spec names for it', async (t) => {
    const seen = [];
    const server = createServer((req, res) => {
        seen.push(`${req.method} ${req.url}`);
        const path = req.url;
        const reply = path === '/batch' ? { results: { [OTHER]: served(OTHER) }, errors: {} }
            : path.startsWith('/asn/') ? ASN
                : path.startsWith('/domain/') ? DOMAIN
                    : path === '/api/v1/entitlement' ? ENTITLEMENT : served(IP);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(reply));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    const client = new InternetData({ baseUrl: `http://127.0.0.1:${server.address().port}`, apiKey: 'k' });

    assert.equal((await client.lookup(IP)).ip, IP);
    assert.equal((await client.lookupBatch([OTHER])).get(OTHER).ip, OTHER);
    assert.equal((await client.myIp()).ip, IP);
    assert.equal((await client.lookupAsn(9009)).asn, 9009);
    assert.equal((await client.lookupDomain('example.com')).domain, 'example.com');
    assert.equal((await client.myEntitlement()).plan.key, 'max');
    assert.deepEqual(seen, [
        `GET /${IP}`, 'POST /batch', 'GET /myip', 'GET /asn/9009', 'GET /domain/example.com',
        'GET /api/v1/entitlement',
    ]);
});

// The AS number and the domain go out as given, the domain path-escaped: the API
// normalizes both and refuses what it cannot read.
test('lookupAsn and lookupDomain send what they are given, escaped into the path', async () => {
    const asn = countingFetch(ASN);
    const client = new InternetData({ fetch: asn.fetch });
    const got = await client.lookupAsn(9009);
    assert.equal(got.asn, 9009);
    assert.equal(got.registry, 'ripe');
    assert.equal(asn.state.urls[0].pathname, '/asn/9009');

    const domain = countingFetch(DOMAIN);
    const named = new InternetData({ fetch: domain.fetch });
    assert.equal((await named.lookupDomain('example.com')).isRegistered, true);
    await named.lookupDomain('Bücher.example/x?y#z');
    assert.deepEqual(domain.state.urls.map((u) => u.pathname), [
        '/domain/example.com', '/domain/B%C3%BCcher.example%2Fx%3Fy%23z',
    ]);
    assert.equal(domain.state.urls[1].search, '', 'the domain leaked into the query');
});

test('an AS or domain the API cannot read is its bad_request, sent once', async () => {
    for (const invoke of [(c) => c.lookupAsn(-1), (c) => c.lookupDomain('not a domain')]) {
        let calls = 0;
        const client = new InternetData({
            retries: 2,
            fetch: async () => {
                calls++;
                return Response.json({ error: 'not a valid IP address, AS number or domain' }, { status: 400 });
            },
        });
        await assert.rejects(() => invoke(client), (err) => {
            assert.equal(err.kind, 'bad_request');
            assert.equal(err.message, 'not a valid IP address, AS number or domain');
            return true;
        });
        assert.equal(calls, 1);
    }
});

// Answers every call the way its path expects and records each URL.
function urlRecordingFetch() {
    const urls = [];
    const fn = async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url);
        urls.push(url);
        const path = url.pathname;
        if (path.endsWith('oauth-authorization-server')) {
            return Response.json({ issuer: 'x', authorization_endpoint: 'x', token_endpoint: 'x' });
        }
        if (path === '/batch') {
            return Response.json({ results: { [OTHER]: served(OTHER) }, errors: {} });
        }
        if (path.startsWith('/asn/')) {
            return Response.json(ASN);
        }
        if (path.startsWith('/domain/')) {
            return Response.json(DOMAIN);
        }
        return Response.json(path === '/api/v1/entitlement' ? ENTITLEMENT : served(IP));
    };
    return { fetch: fn, urls: urls };
}

// Every lookup goes to the API host, and the oauth calls to the apex, where the
// authorization server is.
test('a client without a base URL looks up at the API host and signs in at the apex', async () => {
    const stub = urlRecordingFetch();
    const client = new InternetData({ apiKey: 'k', fetch: stub.fetch });
    await client.lookup(IP);
    await client.lookupBatch([OTHER]);
    await client.myIp();
    await client.lookupAsn(9009);
    await client.lookupDomain('example.com');
    await client.myEntitlement();
    await client.oauth.metadata();

    assert.equal(DEFAULT_BASE_URL, 'https://api.internetdata.io');
    assert.deepEqual(stub.urls.map((u) => u.origin), [
        ...Array(6).fill('https://api.internetdata.io'), 'https://internetdata.io',
    ]);
    assert.deepEqual(stub.urls.map((u) => u.pathname), [
        `/${IP}`, '/batch', '/myip', '/asn/9009', '/domain/example.com', '/api/v1/entitlement',
        '/.well-known/oauth-authorization-server',
    ]);
    assert.ok(client.oauth.authorizationUrl('c', 'https://app.example/cb', 'x')
        .startsWith('https://internetdata.io/oauth/authorize?'));
});

test('the oauth host is the base URL apex, and any other base URL as given', async () => {
    const cases = [
        ['https://api-staging.internetdata.io', 'https://staging.internetdata.io'],
        ['https://api-staging.internetdata.io//', 'https://staging.internetdata.io'],
        ['https://API.internetdata.io', 'https://internetdata.io'],
        ['https://api.example.test:8443', 'https://example.test:8443'],
        ['http://api-dev.example.test', 'http://dev.example.test'],
        ['https://internetdata.io', 'https://internetdata.io'],
        ['https://staging.internetdata.io', 'https://staging.internetdata.io'],
        ['http://127.0.0.1:8080', 'http://127.0.0.1:8080'],
        ['https://apis.example.test', 'https://apis.example.test'],
        ['https://proxy.example.test/api.internetdata.io', 'https://proxy.example.test/api.internetdata.io'],
    ];
    for (const [baseUrl, apex] of cases) {
        const stub = urlRecordingFetch();
        const client = new InternetData({ baseUrl: baseUrl, fetch: stub.fetch });
        await client.lookup(IP);
        await client.oauth.metadata();
        const base = baseUrl.replace(/\/+$/, '');
        assert.equal(stub.urls[0].href, new URL(`${base}/${IP}`).href, baseUrl);
        assert.equal(stub.urls[1].href, new URL(`${apex}/.well-known/oauth-authorization-server`).href, baseUrl);
        assert.ok(
            client.oauth.authorizationUrl('c', 'http://127.0.0.1/cb', 'x').startsWith(`${apex}/oauth/authorize?`),
            baseUrl,
        );
    }
});

// Answers slowly enough that concurrent calls overlap, and records the peak
// number in flight. A batch arrives as one POST per chunk.
function concurrencyTrackingFetch(delayMs = 20) {
    const state = { inFlight: 0, peak: 0, calls: 0 };
    const fn = async (input) => {
        const ips = JSON.parse(await input.text()).ips;
        state.calls++;
        state.inFlight++;
        state.peak = Math.max(state.peak, state.inFlight);
        await new Promise((r) => setTimeout(r, delayMs));
        state.inFlight--;
        return Response.json({ results: Object.fromEntries(ips.map((ip) => [ip, served(ip)])), errors: {} });
    };
    return { fetch: fn, state: state };
}

test('a null concurrency reads as unset, on the client and per call', async () => {
    const addrs = Array.from(
        { length: 6001 },
        (_, i) => `9.${1 + Math.floor(i / 65536)}.${Math.floor(i / 256) % 256}.${i % 256}`,
    );
    const t = concurrencyTrackingFetch();
    const client = new InternetData({ fetch: t.fetch, cache: false, concurrency: null });
    await client.lookupBatch(addrs, { concurrency: null });
    // Seven chunks, all in flight under the default of 8.
    assert.equal(t.state.calls, 7);
    assert.equal(t.state.peak, 7);
});
