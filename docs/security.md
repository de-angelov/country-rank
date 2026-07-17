# Security Exposure Inventory

This inventory records the current technical behavior of the app's vote and
paid-vote routes. It is descriptive only. Baseline posture decisions for rate
limiting, CSRF, security headers, CSP, remote flag images, and logging privacy
are tracked separately in CR-156 and CR-158.

## Route exposure

### `POST /votes`

- Accepts JSON or form data with `countryCode` and `voteType`.
- Validates the country code against the app's country list and accepts only
  `like` or `dislike`.
- Increments the matching Redis aggregate vote hash and returns the updated
  totals.
- Does not require a signed payment event, user account, session, or other
  authentication before updating the free vote total.
- Redis configuration, connection, and command failures are returned as typed
  errors instead of falling back to fixture totals.

### `POST /checkout`

- Accepts JSON or form data with the same vote intent fields as `/votes`.
- Requires `STRIPE_SECRET_KEY` before validating or creating checkout sessions.
- Validates the vote intent before contacting Stripe.
- Creates a Stripe Checkout Session in `payment` mode with app-defined pricing,
  success and cancel URLs, and Stripe metadata containing `countryCode` and
  `voteType`.
- Returns a checkout URL for JSON requests or redirects form requests to the
  Stripe-hosted checkout page.
- Does not apply vote totals. Paid vote application happens only after the
  Stripe webhook flow accepts a completed checkout event.

Stripe-hosted checkout means card entry, card validation, and card processing
happen on Stripe's hosted payment page. The app creates the session and receives
the checkout result through Stripe APIs and webhooks; it does not render card
fields or store card numbers, CVC values, or payment method payloads in its own
Redis data.

### `GET /checkout-status`

- Accepts a `session_id` query parameter.
- Requires the value to match the current Stripe Checkout Session ID pattern
  used by the app.
- Reads `paid-vote:fulfillment:<checkoutSessionId>` from Redis.
- Returns whether the paid vote fulfillment record is `not_found`, `pending`,
  or `applied`; applied records may include `countryCode`, `voteType`, and
  totals.
- Does not call Stripe and does not apply votes.
- Redis configuration, connection, command, and malformed-record failures are
  returned as typed errors.

### `POST /webhooks/stripe`

- Reads the raw request body and verifies the `stripe-signature` header with
  `STRIPE_WEBHOOK_SECRET`.
- Rejects missing webhook configuration, missing signatures, invalid
  signatures, and malformed completed-checkout session IDs.
- Ignores signed Stripe events other than `checkout.session.completed`.
- For completed checkout events, reads only the approved `countryCode` and
  `voteType` metadata, validates them against the vote primitives, and applies
  the paid vote through the Redis vote storage layer.
- Uses `paid-vote:fulfillment:<checkoutSessionId>` records to claim fulfillment
  and skip duplicate webhook deliveries for an already-claimed session.
- Returns typed errors when metadata parsing, Redis fulfillment, or vote
  application fails.

## Payment identifiers and logs

Structured app logs may include payment identifiers and vote context from the
existing checkout and webhook code:

- `checkoutSessionId` for webhook metadata, fulfillment claim/read/write,
  duplicate fulfillment, and checkout-status storage failures.
- Stripe webhook `eventId` and `eventType` for ignored, invalid, or failed
  webhook processing.
- `countryCode` and `voteType` for checkout creation failures, paid vote
  application, fulfillment records, and duplicate fulfillment.
- Optional request correlation identifiers from `x-request-id` or
  `x-correlation-id`.

The shared Pino logger redacts configured structured fields for authorization
headers, cookies, Stripe signatures, Stripe secret keys, webhook secrets, raw
request or webhook payloads, card fields, and payment method fields. That
redaction is path based, so secrets must not be interpolated into free-form log
message strings.
