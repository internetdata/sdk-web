# Changelog

What each release changed for you, newest first. Each line is a commit's summary, linked to its full description and diff.

## 1.5.1 - 2026-11-23

### Fixes

- Re-pin the spec to 2026.11.22: whose bot an unverified address names ([`c0a586f`](https://github.com/internetdata/sdk-web/commit/c0a586f9de72a16a820d9e7294b98d49842699a7))

## 1.5.0 - 2026-11-22

### Features

- Read whether a bot uses an address, and whose: isBot and bot ([`2df25fe`](https://github.com/internetdata/sdk-web/commit/2df25feba9c2f58ab0b988ed6e371029c00620a4))
- README: the bot flag on every plan, and whose bot it is on a paid plan ([`b27316a`](https://github.com/internetdata/sdk-web/commit/b27316abd0bc1ec976d286ec000d8714bc0a284b))

### Fixes

- Refuse a cache TTL or size that is not a whole number from 1 ([`5cef7b7`](https://github.com/internetdata/sdk-web/commit/5cef7b7a859972cd6eee5d911814df4014b3c5cd))
- Comments: the free plan counts its trial by the UTC month ([`8e8d205`](https://github.com/internetdata/sdk-web/commit/8e8d2056c3bde68c091461afef928ac199e02ec6))

## 1.4.0 - 2026-11-20

### Features

- Read a paid domain answer's hosting, co-hosted domains, home page, redirects and backlinks ([`f3ae560`](https://github.com/internetdata/sdk-web/commit/f3ae56056b07467eba48c733855c4cd9770c5389))
- README: the paid domain answer's new members, and usage without a period ([`a3981cb`](https://github.com/internetdata/sdk-web/commit/a3981cbe52bf9034c774b98a53e3b5251ec54c21))

## 1.3.3 - 2026-11-20

### Fixes

- Re-pin the spec to 2026.11.20: the trial without a count, and no per-minute limit ([`f94c69a`](https://github.com/internetdata/sdk-web/commit/f94c69af8017fed5c4c6cc2dcb32bbf4ff1e275c))

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
