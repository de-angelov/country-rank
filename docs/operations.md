# Operations runbook

This runbook covers local production-style verification, rollback, Redis
backup and restore drills, Stripe webhook replay, and first-response incident
triage for Country Ranking.

Use the README as the command reference for environment variables and script
contracts. This runbook is the operational checklist for when to run those
commands and what to check before moving on.

## Service map

- App runtime: React Router framework-mode app served by `npm run start` after
  `npm run build`.
- Local production-style Compose service: `app-prod` in `docker-compose.yml`,
  started through `npm run compose:prod`.
- Redis data required by country pages and vote flows:
  `country:catalog`, `country:votes:likes`, and `country:votes:dislikes`.
- Paid vote idempotency records: `paid-vote:fulfillment:<checkoutSessionId>`.
- Health endpoint: `GET /health` reports process health only. It does not
  prove Redis or Stripe readiness.
- Stripe webhook endpoint: `POST /webhooks/stripe`.

Primary docs:

- Redis backup, sidecar, and restore commands: README sections
  "Redis Backup Runner", "Redis Backup Sidecar", "Local Redis Restore", and
  "Redis Restore Runner".
- Paid vote and webhook contract: [Stripe paid voting flow contract](./stripe-paid-voting.md).
- Vote primitives reused by checkout and webhooks: [Vote primitives](./vote-primitives.md).

## Local production-style deploy verification

Run this before treating a branch or deployment artifact as operationally
ready:

1. Install dependencies with the lockfile: `timeout 10m npm install`.
2. Run the normal verification gates: `npm test`, `npm run build`, and
   `npm run lint`.
3. Start Redis and the production-style app locally:
   `APP_HOST_PORT=5173 npm run compose:prod`.
4. In another shell, verify the process endpoint:
   `curl -fsS http://localhost:5173/health`.
5. If Redis is empty in the local Compose volume, load demo data only for this
   local verification: `REDIS_URL=redis://localhost:6379 npm run seed:redis:votes`.
6. Open `http://localhost:5173` and confirm the home, top-liked, and
   top-disliked pages load country data without server errors.
7. Stop the local stack after verification with `docker compose down`.

Production deployments must restore from a backup artifact when a production
backup exists. `npm run seed:redis:votes` is a demo/local reset command; it is
not a production recovery path and is not evidence that backup recovery works.

## Deployment checklist

1. Confirm `REDIS_URL` points at the intended deployment Redis instance.
2. Confirm `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set from the
   deployment secret store, not committed files.
3. Confirm backup push mode has `REDIS_BACKUP_GITHUB_REPOSITORY` and
   `REDIS_BACKUP_GITHUB_TOKEN` when the backup sidecar or job is expected to
   push artifacts.
4. Run `npm run build` in the deployment environment or equivalent build job.
5. Start the app with `npm run start` after the build output exists.
6. Verify `GET /health` returns 200.
7. Verify Redis-backed pages load. A Redis configuration, connection, or command
   failure should surface as a server error rather than fixture fallback data.
8. Run a backup dry-run or confirm the latest successful pushed backup artifact
   before opening paid voting traffic.

## Rollback checklist

Use rollback when a new release causes app errors, payment failures, or
unexpected Redis writes.

1. Stop new traffic to the bad release through the hosting platform.
2. Redeploy the previous known-good app build or image.
3. Keep the current Redis instance in place unless the incident is confirmed to
   be data corruption. Rolling app code back should not normally roll data back.
4. Verify `GET /health` and Redis-backed pages on the rolled-back app.
5. For Stripe-related incidents, leave webhook delivery enabled only if the
   previous release can safely verify signatures and apply idempotent paid vote
   fulfillment records.
6. If bad data was written, take a backup of the current Redis state before any
   destructive action, then follow the Redis corruption triage and restore
   sections below.
7. Record the bad release identifier, rollback target, Redis action taken, and
   Stripe event range affected.

## Redis backup and restore objectives

Initial targets for review:

- RPO: 24 hours for country catalog and aggregate vote totals, matching the
  default `REDIS_BACKUP_CADENCE_SECONDS=86400`.
- RTO: 60 minutes to identify the correct artifact, restore
  `country:catalog`, `country:votes:likes`, and `country:votes:dislikes`, and
  verify the app against the restored Redis instance.
- Restore drill cadence: monthly until two consecutive drills meet the RTO,
  then quarterly. Run an extra drill after changing backup, restore, Redis key
  schema, or deployment environment behavior.

These are starting recommendations, not final business commitments. Revisit
them after real backup sizes, traffic, and maintainer availability are known.

## Redis restore drill

Use a non-production Redis target for drills.

1. Retrieve a recent `*-country-votes.json` artifact from the configured backup
   repository path.
2. Start local Redis: `docker compose up -d redis`.
3. Restore the artifact locally:
   `npm run restore:redis:local -- ./path/to/<artifact>-country-votes.json`.
4. Verify required keys:
   `docker compose exec redis redis-cli EXISTS country:catalog country:votes:likes country:votes:dislikes`.
   The result should be `3`.
5. Verify restored data is populated:
   `docker compose exec redis redis-cli STRLEN country:catalog`,
   `docker compose exec redis redis-cli HLEN country:votes:likes`, and
   `docker compose exec redis redis-cli HLEN country:votes:dislikes` should
   return positive values for a populated artifact.
6. Start the app against that Redis instance and browse the ranking pages.
7. Record artifact name, restore duration, verification results, and any manual
   steps that slowed the drill.

For deployment recovery, retrieve the artifact onto the machine or job runner,
then run:

```sh
REDIS_URL=<target> npm run restore:redis -- ./path/to/<artifact>-country-votes.json
```

Do not replace this with demo seeding unless the target environment is
intentionally non-production or no production backup artifact exists and
stakeholders accept the data loss.

## Failed backup sidecar triage

Symptoms include missing new backup artifacts, sidecar container exits, or logs
from `npm run redis:backup:sidecar` reporting configuration, Redis, GitHub, or
retention errors.

1. Inspect sidecar logs:
   `docker compose --profile backup logs redis-backup`.
2. Confirm `REDIS_BACKUP_SIDECAR_ENABLED` is truthy. If it is false or unset,
   the sidecar is expected to exit idle.
3. Confirm dry-run versus push mode. Push mode requires
   `REDIS_BACKUP_DRY_RUN=false`, `REDIS_BACKUP_GITHUB_REPOSITORY`, and
   `REDIS_BACKUP_GITHUB_TOKEN`.
4. Confirm Redis connectivity from the same environment. The sidecar uses
   `REDIS_URL=redis://redis:6379` inside Compose.
5. Run a one-off dry-run:

   ```sh
   REDIS_BACKUP_SIDECAR_ENABLED=true \
   REDIS_BACKUP_DRY_RUN=true \
   REDIS_BACKUP_SIDECAR_RUN_ONCE=true \
   docker compose --profile backup up --abort-on-container-exit --exit-code-from redis-backup redis-backup
   ```

6. If dry-run succeeds but push mode fails, check backup repository access,
   branch name, path, token permissions, and retention count.
7. If Redis export fails because `country:catalog` is missing, treat it as a
   Redis data incident, not a sidecar-only issue.

## Redis corruption triage

Corruption means required keys are missing, `country:catalog` is invalid JSON,
vote hashes are empty or malformed, or app loaders return Redis data errors.

1. Stop write paths if possible by pausing app traffic and Stripe webhook
   delivery.
2. Capture current state before repair:
   `REDIS_URL=<affected> npm run backup:redis -- --dry-run` when the backup
   runner can still read the keys, or platform-level Redis snapshot/export when
   it cannot.
3. Check the required keys with `redis-cli EXISTS country:catalog
   country:votes:likes country:votes:dislikes`.
4. Check catalog and hash sizes with `STRLEN country:catalog`,
   `HLEN country:votes:likes`, and `HLEN country:votes:dislikes`.
5. Identify the latest known-good backup artifact before the corruption window.
6. Restore the selected artifact to a staging or local Redis instance first and
   verify it.
7. Restore to the affected Redis instance with `npm run restore:redis` only
   after confirming the artifact and accepting the data-loss window.
8. Resume app traffic, then replay relevant Stripe webhooks for paid votes that
   completed after the restored artifact timestamp.

## Stripe webhook replay

Use replay when Stripe shows delivered or failed `checkout.session.completed`
events that did not apply paid votes, or after restoring Redis to an earlier
backup artifact.

1. Identify the event time range and affected Checkout Session IDs from Stripe.
2. Confirm the app is running with the intended `STRIPE_WEBHOOK_SECRET` and
   `REDIS_URL`.
3. Confirm the webhook endpoint is reachable at the deployed
   `/webhooks/stripe` URL.
4. In the Stripe Dashboard, open the webhook endpoint or event list and resend
   the selected `checkout.session.completed` events to the endpoint.
5. If using the Stripe CLI for local or controlled replay, forward events to
   the app endpoint and trigger/resend only events from the selected range.
6. Watch app logs for `route: "webhooks.stripe"` actions. Expected non-error
   outcomes include ignored non-target events and duplicate fulfillment skips.
7. For each replayed session, verify the corresponding
   `paid-vote:fulfillment:<checkoutSessionId>` record reaches `applied` or was
   already applied.
8. Verify aggregate country vote totals on the affected country page.

Webhook replay should be idempotent for already-applied paid votes because the
app records fulfillment by Checkout Session ID. Do not manually increment Redis
vote hashes for Stripe payments unless webhook replay is impossible and the
manual change has been approved as an incident-specific data repair.

## Incident triage

### App down or deploy failed

1. Check `GET /health`.
2. Check process logs for build, start, or runtime exceptions.
3. If only the new release is affected, follow the rollback checklist.
4. If Redis errors appear on country pages, move to Redis triage.

### Redis unavailable

1. Confirm `REDIS_URL` is present and points at the expected instance.
2. Check Redis platform/container status.
3. Confirm whether failures are connection errors, command errors, or malformed
   data errors in structured logs.
4. Restore service availability first. Restore data from backup only when keys
   are missing or corrupted.

### Paid voting failing

1. Separate checkout creation failures from webhook application failures.
2. Checkout creation needs `STRIPE_SECRET_KEY`; webhook verification needs
   `STRIPE_WEBHOOK_SECRET`.
3. For webhook failures, inspect logs for signature verification, invalid paid
   metadata, Redis fulfillment, and vote application errors.
4. After fixing configuration or Redis availability, replay only the affected
   Stripe events.

### Backup artifacts missing

1. Check sidecar/job logs and the configured backup repository path.
2. Run a sidecar dry-run to prove Redis export still works.
3. Run push mode only after confirming GitHub repository, branch, token, and
   retention configuration.
4. Treat a missing or invalid Redis catalog as a Redis data incident.
