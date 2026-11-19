# Changelog

What each release changed for you, newest first. Each line is a commit's summary, linked to its full description and diff.

## 1.3.2 - 2026-11-19

### Fixes

- Cache a spent trial's or a reached cap's answer for a minute at most ([`29f4b80`](https://github.com/internetdata/sdk-web/commit/29f4b80b2d783f201e3c843e7b7d00e503c61f7c))

## 1.3.1 - 2026-11-18

### Fixes

- Re-pin the spec to 2026.11.17 as republished: KEY_OVER_HTTP on the account 403 ([`fcf90c1`](https://github.com/internetdata/sdk-web/commit/fcf90c17caed198e924919c8c683f60a0d40dc52))
- Say ASNs, not ASes, in the package description ([`e97bac2`](https://github.com/internetdata/sdk-web/commit/e97bac2edcc4dddfbecd16fef1975e65bc93c210))

## 1.3.0 - 2026-11-17

### Features

- Read cap_reached on a paid answer past its overage cap ([`d81f4e1`](https://github.com/internetdata/sdk-web/commit/d81f4e1a4016ef3986ce3630a1c5878de73337f7))

## 1.2.0 - 2026-11-16

### Features

- Read an AS's rank, neighbors and hosted domains, and the plan's name ([`1cfff9d`](https://github.com/internetdata/sdk-web/commit/1cfff9d08cabcade04cec5eb69b2a657a29e08c1))

## 1.1.0 - 2026-11-15

### Features

- Read hosted_domains' 10 most popular domains ([`a7b11c1`](https://github.com/internetdata/sdk-web/commit/a7b11c11bf3ac1afb1f4d039c32a954d0ff1ec3d))

## 1.0.0 - 2026-11-14

### Features

- Look up an address, or many in one call, from a browser: `lookup` and `lookupBatch`, with bogons answered locally, retries, per-attempt timeouts and the errors every InternetData library raises ([`c45eea4`](https://github.com/internetdata/sdk-web/commit/c45eea479d2fee2f3fec74dcf54a33f1ef65abfc))
- Look up an AS with `lookupAsn` and a domain with `lookupDomain`, and the address the browser calls from with `myIp` ([`c45eea4`](https://github.com/internetdata/sdk-web/commit/c45eea479d2fee2f3fec74dcf54a33f1ef65abfc))
- Ask what a key may spend with `myEntitlement` ([`c45eea4`](https://github.com/internetdata/sdk-web/commit/c45eea479d2fee2f3fec74dcf54a33f1ef65abfc))
- Cache address answers per client, concurrent misses sharing one request, with an optional `store` that keeps them across a page reload or an extension's worker restart ([`c45eea4`](https://github.com/internetdata/sdk-web/commit/c45eea479d2fee2f3fec74dcf54a33f1ef65abfc))
- Sign a person in with the OAuth authorization code flow at internetdata.io: `authorizationUrl`, `exchangeAuthorizationCode`, `exchangeRefreshToken`, `revoke`, `metadata`, and PKCE from Web Crypto with `createPkce` and `pkceChallenge` ([`c45eea4`](https://github.com/internetdata/sdk-web/commit/c45eea479d2fee2f3fec74dcf54a33f1ef65abfc))
- ES modules with types and nothing of Node.js, from npm or from jsDelivr in a module script ([`c45eea4`](https://github.com/internetdata/sdk-web/commit/c45eea479d2fee2f3fec74dcf54a33f1ef65abfc))
