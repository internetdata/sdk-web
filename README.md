# [<img src="https://s3.internetdata.io/internetdata-public/brand/mark.svg" alt="InternetData" height="28"/>](https://internetdata.io/) InternetData Web Client Library

[![npm](https://img.shields.io/npm/v/internetdata-web.svg)](https://www.npmjs.com/package/internetdata-web)
[![license](https://img.shields.io/npm/l/internetdata-web.svg)](LICENSE)

The official browser client library for the [InternetData](https://internetdata.io) API, for a page's own scripts and for browser extensions.

It looks up what every InternetData database says about an IP address, an AS or a domain.

## Getting Started

**An API key in a web page is public.** Anyone who opens the page can read it from the page's source or its network requests and use it as you would: spend your plan's lookups and, if the key may download databases, download every database your organization is licensed for. In a page, use no key, or call the API from your own server and hand the page its answer. A key belongs only where the person it belongs to is the only one who can read it, such as their own browser extension or an internal tool, and there a key that may only look up.

```bash
npm install internetdata-web
```

Or, with no build step, import it from jsDelivr in a module script:

```html
<script type="module">
    import { InternetData } from 'https://cdn.jsdelivr.net/npm/internetdata-web@1/+esm';

    const me = await new InternetData().myIp();
    console.log(me.location.country);
</script>
```

It runs in Chrome and Edge 109, Firefox 115 ESR and Safari 16.4 or newer. TypeScript types are included.

## Usage

**No API key needed to start.** Unlimited, the free plan, answers Tor, relay, anycast, carrier, satellite and the five service flags (SSH, SMTP, web, DNS resolver and BitTorrent), reverse DNS, country-level `location`, `asn`, the company's name and domain and the abuse email, with no daily or monthly cap, with a key or without one. In a page the address calling is the visitor's, so `myIp` tells you about the visitor:

```js
import { InternetData } from 'internetdata-web';

const client = new InternetData();

const me = await client.myIp();
console.log(me.location.country);   // where this visitor is

const result = await client.lookup('146.70.116.130');
console.log(result.isTor);              // false
console.log(result.location.country);   // the ISO 3166 country code
console.log(result.company.name);       // who the address belongs to
```

### With an API key

Where the key stays private (see above), every paid plan answers every field: `is_vpn`, `is_hosting`, `is_cdn` and the four proxy flags as well, city-level location, the whois records and the detail behind each flag. The plans differ only in how many lookups they include, and a free account tries every field, 100 lookups a day. Create a key in the [console](https://app.internetdata.io), then pass it in:

```js
const client = new InternetData({ apiKey: 'your-api-key' });

const result = await client.lookup('146.70.116.130');
console.log(result.isVpn);           // on a paid plan
console.log(result.vpn?.provider);   // on a paid plan
console.log(result.location.city);   // on a paid plan
```

An extension can sign its user in rather than ask them to paste a key: see Sign in with OAuth below.

### An AS or a domain

```js
const asn = await client.lookupAsn(9009);
console.log(asn.name);           // M247 Europe SRL
console.log(asn.prefixes);       // on a paid plan

const domain = await client.lookupDomain('example.com');
console.log(domain.isRegistered);   // true
console.log(domain.dns?.mx);        // on a paid plan
```

Unlimited answers an AS's registration, and whether a domain is registered and which record types it has. A paid plan adds the AS's whois record and prefixes, and the domain's records, IP ranges and whether it is disposable. Neither lookup is cached or batched, and `lookup` refuses an AS or a domain before sending it.

### Your own address

```js
const result = await client.myIp();
console.log(result.ip);   // the address we saw this call come from: in a page, the visitor's
```

It is never cached, since which address the browser is calling from is the question, and a laptop moves between networks.

### Your plan and usage

```js
const ent = await client.myEntitlement();
console.log(ent.plan.key);          // starter
console.log(ent.usage.requests);    // 580
console.log(ent.usage.window_end);  // when the allowance resets
```

Usage counts against the anniversary of your subscription on a paid plan, not the calendar month and not the billing period, and against the UTC day on the free plan; it is the same number a lookup is gated on. `hard_limit` is null on an uncapped plan, which is not the same as zero. It needs a key, so it belongs where a key does.

### Batch lookup

Look up as many addresses as you like in one call. Bogons and cached answers are handled locally, and the rest go to the batch endpoint in chunks of up to 1000, in parallel. The batch endpoint needs a paid plan:

```js
const results = await client.lookupBatch(['146.70.116.130', '8.8.8.8', '1.1.1.1']);

for (const [ip, result] of results) {
    if (result instanceof Error) {
        console.log(`${ip}: ${result.message}`);
        continue;
    }
    console.log(`${ip}: ${result.isVpn}`);
}
```

Results are keyed by address, in the order you first listed each one, so duplicates in your list collapse into a single entry and one address failing never loses the rest: it carries its error as its value, with the status the API would have given that address on its own.

How many chunks are in flight at once, how many times a failed chunk is retried, and how long each request may take are configurable per call:

```js
const results = await client.lookupBatch(manyIps, { concurrency: 4, retries: 4, timeoutMs: 10_000 });
```

### Caching

Answers are cached in memory by default, so repeat lookups of the same address are free, and lookups of one address made at the same moment share a single request:

```js
const client = new InternetData();

const result = await client.lookup('146.70.116.130');
console.log(result.isTor);   // false, API request

const result2 = await client.lookup('146.70.116.130');
console.log(result2.isTor);  // false, no API request, result was cached
```

You can change the default cache variables (max size, TTL, etc) on initialization, or even disable it:

```js
const client = new InternetData({ cache: { max: 50_000, ttlMs: 6 * 60 * 60 * 1000 } });
const clientNoCache = new InternetData({ cache: false });
```

### Keeping answers across a reload

The in-memory cache lasts as long as the client, so a page reload starts with an empty one, and so does an extension's service worker, which the browser stops once it sits idle. Give the cache a `store` and answers outlive the client: it is read when the in-memory cache misses, before the network, and written after each answer the API serves. In a page, `sessionStorage` keeps them for the tab:

```js
const store = {
    get(key) {
        const saved = JSON.parse(sessionStorage.getItem(`internetdata:${key}`) ?? 'null');
        return saved !== null && saved.expires > Date.now() ? saved.result : undefined;
    },
    set(key, result, ttlMs) {
        const saved = { result: result, expires: Date.now() + ttlMs };
        sessionStorage.setItem(`internetdata:${key}`, JSON.stringify(saved));
    },
};

const client = new InternetData({ cache: { store: store } });
```

In an extension's service worker, `chrome.storage.session` does the same. A store's methods may return promises, as these do:

```js
const store = {
    async get(key) {
        const saved = (await chrome.storage.session.get(key))[key];
        return saved !== undefined && saved.expires > Date.now() ? saved.result : undefined;
    },
    async set(key, result, ttlMs) {
        await chrome.storage.session.set({ [key]: { result: result, expires: Date.now() + ttlMs } });
    },
};

const client = new InternetData({ cache: { store: store } });
```

`set` is told how long the answer stays fresh, and dropping it after that is the store's job. Each `key` carries a hash of the client's API key and base URL beside the address, so clients holding different keys can share one store without reading each other's answers. Bogons, errors, `myIp`, `myEntitlement` and the AS and domain lookups are never stored, and a store that fails costs a request, never an answer: a `get` that throws reads as a miss, and a `set` that throws is ignored.

### Private and reserved addresses

Private, loopback, link-local, documentation and multicast addresses (and their IPv6 equivalents, including the 6to4 and Teredo ranges) are answered locally, so they cost no request and no quota. Each gets the answer the API gives one, every flag false bar `is_bogon` and every other field empty:

```js
const result = await client.lookup('192.168.1.1');
result.isBogon;   // true
result.isVpn;     // false
```

The check is available on the client, which is handy when your inputs are addresses anyway:

```js
client.isBogon('10.0.0.1');    // true
client.isBogon('8.8.8.8');     // false
```

It is also importable on its own, if you want it without a client:

```js
import { isBogon } from 'internetdata-web';

isBogon('10.0.0.1');    // true
```

### Errors

Failures throw an `InternetDataError` carrying a `kind` and a `retryable` flag:

```js
import { InternetDataError } from 'internetdata-web';

try {
    await client.lookup('1.1.1.1');
} catch (err) {
    if (err instanceof InternetDataError) {
        console.error(err.kind, err.retryable);
    }
}
```

`kind` is one of `bad_request`, `unauthorized`, `forbidden`, `rate_limited`, `quota_exceeded`, `server_error` or `network`.

Note that `rate_limited` and `quota_exceeded` both arrive as HTTP 429 and are not the same thing. A rate limit is when the API faces extreme traffic bursts and so retrying later works; but a spent quota needs your allowance raised or the window to roll over. The library retries rate limits for you, but not if your quota is exceeded.

A request the browser never got an answer to is a retryable `network` error carrying what the browser said: offline, blocked by an extension, or refused by the page's Content-Security-Policy.

### Timeouts

A request that hasn't finished after 30 seconds is abandoned and surfaces as a retryable `network` error. The limit applies to each attempt, so a call that gets retried can take longer in total. Set it for the client, or for a single lookup:

```js
const client = new InternetData({ timeoutMs: 10_000 });

const result = await client.lookup('146.70.116.130', { timeoutMs: 2000 });
```

### Sign in with OAuth (authorization code)

An app or an extension that can take a browser redirect signs the person in there, with a PKCE pair made for that one sign-in:

```js
const client = new InternetData();
const redirectUri = 'https://your-app.example/callback';
const pkce = await client.oauth.createPkce();

const url = client.oauth.authorizationUrl('your-client-id', redirectUri, pkce.challenge, {
    scope: 'apikeys.use', state: 'your-state',
});
// Send the browser to url. Its redirect to redirectUri carries code and state.
const token = await client.oauth.exchangeAuthorizationCode('your-client-id', code, pkce.verifier, redirectUri);
```

Check that `state` came back as you sent it before you exchange `code`, which works once. The client ID can also be the https URL of a client metadata document your app serves, and such an app is never handed a key, so `token.apikey` stays absent.

`createPkce` and `pkceChallenge` return promises, as Web Crypto does, and need a secure context: a page served over https or from localhost, or an extension. `exchangeRefreshToken` trades the refresh token for a new pair, and `revoke` with it signs the person out. The sign-in is at `https://internetdata.io`, the apex of the API's host. Client IDs are issued on request from support@internetdata.io.

### Browser support

The library is ES2022 and needs only what a browser has, `fetch` and, for PKCE, Web Crypto, so it runs in Chrome and Edge 109, Firefox 115 ESR and Safari 16.4 or newer: in a page, a web worker, or an extension's service worker. Every endpoint it calls answers CORS for any origin, so a page needs nothing from your server. A page whose Content-Security-Policy restricts `connect-src` must allow `https://api.internetdata.io`, and `https://internetdata.io` to sign in. For Node.js, use [@internetdata/internetdata](https://www.npmjs.com/package/@internetdata/internetdata) instead.

### Absent is not false

Unlimited leaves out `isVpn`, `isHosting`, `isCdn` and the four proxy flags, the detail behind them, and the paid members inside `location`, `asn`, `company` and `abuse`, such as `location.city`; a free-plan key's answer carries `trialExpired`, true once its daily trial is spent. A field your key does not include is `undefined`, which means "not in your plan" rather than "checked, and no".

```js
result.isVpn ?? false            // when you only want the flag
result.isVpn === undefined       // on Unlimited: not in your plan
result.trialExpired === true     // a free-plan key's daily trial is spent
```

## Other Libraries

There are official InternetData client libraries available for many languages including PHP, Python, Go, Java, and Ruby. See our GitHub at https://github.com/internetdata for more.

## About InternetData

Geolocation, anonymity, ownership and network data for IP addresses, AS numbers and domains, as an API and as databases you download and query yourself.

[<img src="https://s3.internetdata.io/internetdata-public/brand/mark.svg" alt="InternetData" height="64"/>](https://internetdata.io/)

## License

This project is licensed under the [MIT License](LICENSE).
