// The staging fixtures the test files share: a client recording what it sent,
// and what a test is allowed to remember about a request.
//
// The package runs here under Node, which has fetch and Web Crypto as a browser
// does; what only a browser can show is the repo's own browser test.

import { createRequire } from 'node:module';

import { InternetData } from 'internetdata-web';

// The API host, and the apex its sign-in derives from it.
export const STAGING_API = 'https://api-staging.internetdata.io';
export const STAGING = 'https://staging.internetdata.io';
export const PROD_API = 'https://api.internetdata.io';

const require = createRequire(import.meta.url);
export const INSTALLED_VERSION = require('internetdata-web/package.json').version;

/**
 * A client on `baseUrl` (the default when undefined) with `key`, which hands each
 * request's facts to `onRequest` before sending it.
 */
export function clientFor(baseUrl, key, onRequest = () => {}) {
    return new InternetData({
        ...(baseUrl === undefined ? {} : { baseUrl: baseUrl }),
        ...(key === '' ? {} : { apiKey: key }),
        fetch: async (...args) => {
            onRequest({ ...requestFacts(args, key), ips: await batchAddresses(args) });
            return fetch(...args);
        },
    });
}

// The addresses a POST carried, read off a CLONE so the request still sends its
// body; undefined for anything else. Addresses are the one part of a body worth
// remembering, and they are not a secret.
async function batchAddresses(args) {
    const input = args[0];
    if (typeof input === 'string' || input.method !== 'POST') {
        return undefined;
    }
    return JSON.parse(await input.clone().text()).ips;
}

/**
 * What a test is allowed to remember about a request it made.
 *
 * Only derived facts leave here. An assertion that fails prints its operands,
 * so holding on to the Request itself is how a key ends up in a public CI log:
 * whether the key was carried is a boolean, and the caller never sees the key.
 */
export function requestFacts(args, key) {
    const input = args[0];
    const url = typeof input === 'string' ? input : (input.url ?? String(input));
    const headers = input?.headers ?? new Headers(args[1]?.headers ?? {});
    const carriedKey = key !== ''
        && (url.includes(key) || [...headers.values()].some((v) => v.includes(key)));
    const parsed = new URL(url);
    return { origin: parsed.origin, path: parsed.pathname, carriedKey: carriedKey };
}
