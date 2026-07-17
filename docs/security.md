# Security Baseline

This document records the app's initial technical security baseline. It
separates the current route behavior inventoried by CR-159 from the baseline
posture decisions approved in CR-156 and the follow-up controls that still need
implementation.

## Current behavior

The following inventory records current behavior only. It does not imply that
the recommended future controls are already implemented.

### Route exposure

#### `POST /votes`

- Accepts JSON or form data with `countryCode` and `voteType`.
- Validates the country code against the app's country list and accepts only
  `like` or `dislike`.
- Increments the matching Redis aggregate vote hash and returns the updated
  totals.
- Does not require a signed payment event, user account, session, or other
  authentication before updating the free vote total.
- Redis configuration, connection, and command failures are returned as typed
  errors instead of falling back to fixture totals.

#### `POST /checkout`

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

#### `GET /checkout-status`

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

#### `POST /webhooks/stripe`

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

### Payment identifiers and logs

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

## Baseline decisions

These decisions describe the selected posture for the initial security baseline.
They are not a statement that every future control listed here is already
implemented.

### Rate limiting

The approved baseline is to ship without rate limiting for now and document rate
limiting as a follow-up control. This means the current unauthenticated
`POST /votes` and `POST /checkout` endpoints still rely on validation and typed
error handling, not request throttling, to constrain misuse.

Recommended follow-up task: add endpoint rate limiting for `POST /votes` and
`POST /checkout`, with separate limits for free vote increments and Stripe
Checkout Session creation. The implementation should define the keying strategy
for anonymous traffic, Redis storage keys and TTLs, response status/body shape
for limited requests, and focused tests for allowed and blocked submissions.

### CSRF posture

The approved CSRF posture is to rely on same-origin form/action behavior for now
for both form and JSON submissions to `POST /votes` and `POST /checkout`. The
app does not currently use user accounts, privileged browser sessions, or
same-site authenticated state for these endpoints, so CR-156 selected
documentation over introducing CSRF tokens in the initial baseline.

This decision should be revisited before adding authenticated sessions, admin
actions, saved payment state, or any cookie-backed privilege that would make a
cross-site submission act on behalf of a specific user.

### Security headers and CSP

The approved posture is to add standard security headers and a Content Security
Policy as follow-up implementation work. The CSP must preserve the current flag
image model by allowing remote flag images from Wikimedia-backed sources.

Recommended follow-up task: add shared security headers at the React Router
document/server boundary. At minimum, define and test a CSP,
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, frame
embedding policy, and production HTTPS/HSTS behavior appropriate for the
deployment target.

### Remote Wikimedia flag images

Country flag URLs are public, remote Wikimedia-backed image URLs stored in the
country catalog and rendered by the app. The baseline allows those remote flag
images rather than copying flag assets into the repository or proxying them
through the app.

Future CSP work must explicitly permit the selected Wikimedia image origins.
Changing this policy would require a separate implementation decision, such as
vendoring flag assets, introducing an image proxy, or moving to a controlled CDN.

### Logging privacy boundaries

Payment and session identifiers may be logged only when needed for diagnostics,
idempotency tracing, or failure investigation. Logs must not include card data,
CVC values, payment method payloads, raw Stripe webhook payloads, Stripe secret
keys, webhook secrets, authorization headers, cookies, or customer personal data.

Structured logging remains the expected path because the shared logger can
redact configured structured fields. Do not place secrets or personal data in
free-form log message strings, where path-based redaction cannot reliably remove
them.
