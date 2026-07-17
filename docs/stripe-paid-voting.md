# Stripe paid voting flow contract

This document defines the implementation-neutral shape for paid vote checkout
and webhook handling. It records the human-approved paid vote terms that
checkout and webhook implementation must use.

## Approved paid terms

- Currency: `usd`
- Stripe checkout mode: `payment`
- Successful payment event type: `checkout.session.completed`
- Like vote price: `$1.00` USD, represented to Stripe as `100` cents
- Dislike vote price: `$2.00` USD, represented to Stripe as `200` cents

Checkout creation must choose the amount from the accepted `voteType`:

| Vote type | Amount | Stripe unit amount | Currency |
| --- | ---: | ---: | --- |
| `like` | `$1.00` | `100` | `usd` |
| `dislike` | `$2.00` | `200` | `usd` |

The Stripe Checkout Session must include these approved metadata fields:

| Metadata key | Value |
| --- | --- |
| `countryCode` | The accepted uppercase country code from vote request validation |
| `voteType` | The accepted vote type: `like` or `dislike` |

These metadata fields authorize backend vote submission after Stripe confirms
payment. Implementations must not use other metadata key names, infer vote
intent from line item text, or apply a vote without recovering and validating
both fields from the verified successful payment event.

## Existing vote primitives

Paid voting must reuse the vote primitives documented in
`docs/vote-primitives.md`.

The checkout request must carry the same user vote intent accepted by
`validateVoteRequest` in `app/votes/request.server.ts`:

```json
{
  "countryCode": "JP",
  "voteType": "like"
}
```

- `countryCode` is the selected supported country code. The existing vote
  validator trims lower-case input and normalizes accepted values to uppercase.
- `voteType` is the existing `VoteKind` value from
  `app/votes/storage.server.ts`: `like` or `dislike`.

Server-side checkout helpers require `STRIPE_SECRET_KEY` before accepting a
checkout request. For local checkout work, set this to a Stripe test-mode
`sk_test_...` secret key only. Do not use or commit live-mode Stripe secret
keys.

The checkout request may include only additional fields that are part of the
approved paid terms. Price, currency, checkout mode, and Stripe metadata names
must match the approved paid terms above.

## Checkout request responsibilities

The client-to-server checkout request starts from a selected country and vote
type. The server-side checkout creator is responsible for:

- validating the request with the existing vote request contract, or preserving
  its accepted `countryCode` and `voteType` values before checkout creation
- applying the approved price for the accepted `voteType`, using currency `usd`
  and Stripe checkout mode `payment`
- attaching `countryCode` and `voteType` metadata values that can later be read
  by the webhook handler without guessing metadata key names
- returning the checkout handoff response shape chosen by the implementation
  task, such as a Stripe-hosted checkout URL or equivalent redirect target

Checkout creation records intent only. It must not increment Redis vote totals.

## Webhook success path responsibilities

Webhook vote application is authorized only after Stripe sends a verified
`checkout.session.completed` event. A webhook handler must:

1. verify the webhook signature with the configured Stripe webhook secret
2. confirm the event type is `checkout.session.completed`
3. read only the approved `countryCode` and `voteType` metadata keys from the
   verified Checkout Session event
4. recover the accepted vote intent as `countryCode` and `voteType`
5. validate the recovered vote intent against the existing vote primitives
6. hand off the validated vote intent to the vote application layer

The vote application layer is the only place that may update Redis vote totals,
for example by calling the existing storage helper after the payment event has
been verified and accepted.

Webhook code must reject or ignore events when signature verification fails, the
event is not `checkout.session.completed`, approved metadata is missing,
or the recovered vote intent fails validation. None of those paths may apply a
vote.
