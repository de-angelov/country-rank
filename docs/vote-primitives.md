# Vote primitives for paid voting

This document records the existing vote contracts that paid voting must reuse.
It intentionally describes only current app behavior. Stripe price, currency,
checkout mode, metadata names, and webhook behavior are recorded separately in
`docs/stripe-paid-voting.md`.

## Canonical values

- Country codes are uppercase two-letter codes from `countryFixtures` in
  `app/countries/fixtures.ts`.
- `validateVoteRequest` accepts lower-case country input, trims it, and
  normalizes it to uppercase before storage.
- Vote types use the `VoteKind` union from `app/votes/storage.server.ts`:
  `like` or `dislike`.
- Redis stores vote totals in plural fields: `likes` and `dislikes`.

## Public vote route

The app does not expose a public `/votes` mutation route. Clients must not be
able to increment country vote totals directly. Vote totals change only through
verified Stripe webhook fulfillment after a paid checkout session completes.

## Vote intent payload

Paid checkout and webhook fulfillment use the same vote intent field names:

```json
{
  "countryCode": "JP",
  "voteType": "like"
}
```

Validation failures use the typed `invalid_vote_request` error from
`app/votes/request.server.ts`:

```json
{
  "ok": false,
  "error": {
    "code": "invalid_vote_request",
    "message": "Vote request payload is invalid.",
    "fieldErrors": {
      "countryCode": "Country code must match a supported country.",
      "voteType": "Vote type must be like or dislike."
    }
  }
}
```

Redis country-code validation failures use this storage error shape:

```json
{
  "ok": false,
  "error": {
    "code": "invalid_country_code",
    "message": "Country code must be a two-letter ISO country code.",
    "countryCode": "USA"
  }
}
```

Redis configuration, connection, and command failures use storage error values.
Route response adapters strip `cause` from connection and command errors before
responding. Missing Redis configuration includes the missing environment
variable name:

```json
{
  "ok": false,
  "error": {
    "code": "missing_redis_config",
    "message": "REDIS_URL must be set to read or write vote totals.",
    "envVar": "REDIS_URL"
  }
}
```

## Request validation helper

`validateVoteRequest` in `app/votes/request.server.ts` accepts:

```ts
type VoteRequestPayload = Readonly<{
  countryCode: unknown;
  voteType: unknown;
}>;
```

It returns a `neverthrow` `Result`:

- `ok`: `{ status: "accepted", countryCode: string, voteType: VoteKind }`
- `err`: `{ code: "invalid_vote_request", message: string, fieldErrors: ... }`

Paid voting code should use this helper, or preserve its accepted values, before
calling storage.

## Redis vote storage helpers

Redis storage lives in `app/votes/storage.server.ts`.

- `getRedisVoteStorageConfig(env = process.env)` reads `REDIS_URL`, trims it,
  and returns `{ url }` or a `missing_redis_config` error.
- `voteTotalsKey(countryCode)` returns `country:votes:${countryCode}`.
- `createRedisVoteStorage(options)` accepts optional `env` and `clientFactory`
  inputs and returns `readCountryVoteTotals` and `incrementCountryVoteTotal`.
- The module also exports default singleton helpers:
  `readCountryVoteTotals` and `incrementCountryVoteTotal`.

`readCountryVoteTotals(countryCode)` normalizes a valid country code to
uppercase, reads the Redis hash at `country:votes:${countryCode}`, and returns:

```ts
type VoteTotals = Readonly<{
  countryCode: string;
  likes: number;
  dislikes: number;
}>;
```

Missing Redis hash fields default to `0`.

`incrementCountryVoteTotal(countryCode, voteKind)` normalizes a valid country
code, increments exactly one Redis hash field by `1`, then reads and returns the
full totals:

- `voteKind: "like"` increments field `likes` by `1`.
- `voteKind: "dislike"` increments field `dislikes` by `1`.

Both storage helpers reject syntactically invalid country codes before
connecting to Redis. Storage country-code validation is intentionally narrower
than route validation: it checks only the uppercase two-letter code pattern,
while route validation checks that the code exists in `countryFixtures`.
