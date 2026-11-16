# Changelog

What each release changed for you, newest first. Each line is a commit's summary, linked to its full description and diff.

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
