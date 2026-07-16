# Stripe paid voting flow contract

This document defines the implementation-neutral shape for paid vote checkout
and webhook handling. It does not choose paid vote business terms.

Human-approved paid terms must be supplied before implementation for:

- vote price
- currency
- Stripe checkout mode
- Stripe product, price, or line item shape
- Stripe metadata key names and allowed values
- successful payment event type

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

The checkout request may include only additional fields that are part of the
approved paid terms. Implementations must not introduce price, currency,
checkout mode, or Stripe metadata naming decisions in route code without that
approval.

## Checkout request responsibilities

The client-to-server checkout request starts from a selected country and vote
type. The server-side checkout creator is responsible for:

- validating the request with the existing vote request contract, or preserving
  its accepted `countryCode` and `voteType` values before checkout creation
- applying the human-approved paid terms for price, currency, and checkout mode
- attaching approved metadata values that can later be read by the webhook
  handler without guessing metadata key names
- returning the checkout handoff response shape chosen by the implementation
  task, such as a Stripe-hosted checkout URL or equivalent redirect target

Checkout creation records intent only. It must not increment Redis vote totals.

## Webhook success path responsibilities

Webhook vote application is authorized only after Stripe sends a verified
successful payment event. A webhook handler must:

1. verify the webhook signature with the configured Stripe webhook secret
2. confirm the event type is the human-approved successful payment event
3. read only the approved metadata keys or approved lookup reference from the
   verified event
4. recover the accepted vote intent as `countryCode` and `voteType`
5. validate the recovered vote intent against the existing vote primitives
6. hand off the validated vote intent to the vote application layer

The vote application layer is the only place that may update Redis vote totals,
for example by calling the existing storage helper after the payment event has
been verified and accepted.

Webhook code must reject or ignore events when signature verification fails, the
event is not the approved successful payment event, approved metadata is missing,
or the recovered vote intent fails validation. None of those paths may apply a
vote.

## Deferred decisions

The following names are placeholders for later human-approved terms and must
not be treated as final API or Stripe metadata names:

- `<PAID_VOTE_PRICE>`
- `<PAID_VOTE_CURRENCY>`
- `<STRIPE_CHECKOUT_MODE>`
- `<STRIPE_SUCCESSFUL_PAYMENT_EVENT>`
- `<APPROVED_COUNTRY_METADATA_KEY>`
- `<APPROVED_VOTE_TYPE_METADATA_KEY>`
- `<APPROVED_PAYMENT_TO_VOTE_LOOKUP_REFERENCE>`
