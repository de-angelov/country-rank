# Country Ranking

Country Ranking is a TypeScript React Router framework-mode app for browsing country ranking data and submitting like/dislike votes backed by Redis.

## Project Architecture

### App Structure

- `app/root.tsx` defines the shared React Router document layout, metadata outlet, script wiring, and root error boundary.
- `app/routes.ts` registers framework-mode routes. The current route table contains browsing routes, paid checkout status routes, and the Stripe webhook route.
- Route-local CSS Modules, such as `app/routes/home.module.css`, are used only for narrow layout gaps.

### Frontend Responsibilities

- UI routes live in `app/routes/`. The current home route is a minimal landing shell for country rankings and voting flows.
- Country records are modeled in `app/countries/country.ts` and exported through `app/countries/index.ts`.
- Placeholder country data lives in `app/countries/fixtures.ts`; it includes country codes, names, capitals, remote flag image URLs, and starter like/dislike totals for ranking UI work.
- Country flag assets are generated under `public/flags/` from the
  `flagImageUrl` values already present in `app/countries/fixtures.ts`.
  Regenerate them with `npm run download:country-flags`; the script preserves
  the downloaded source format, names files by ISO alpha-2 code, and writes the
  `public/flag-assets.json` manifest with local public paths for runtime use.
- Country-card flags render the local manifest asset directly and apply a
  layered CSS `drop-shadow(...)` treatment to the image. The shadow follows the
  rendered alpha silhouette for transparent or non-rectangular artwork without
  adding SVG strokes to internal stripes, emblems, or diagonal boundaries. For
  normal rectangular flags, the visible artwork silhouette is the flag rectangle.
- App shell banner variants live under `public/images/banner/` and are
  generated from `public/images/country-ranking-banner-v7.png` in 960, 1600,
  and 2400 pixel widths as AVIF, WebP, and PNG fallback files. Regenerate them
  with `npm run generate:banner-assets` after changing the source banner.

### Server Route And Vote Flow

- Public clients create paid checkout sessions through the checkout route. There is no public `/votes` mutation route.
- `app/votes/request.server.ts` validates submitted country vote intent against the fixture list and accepts only `like` or `dislike` vote types.
- Verified Stripe webhook fulfillment applies paid votes through `app/votes/paid-application.server.ts`, which calls `incrementCountryVoteTotal` from `app/votes/storage.server.ts`.
- Validation, Redis configuration, connection, and command failures are represented as typed `neverthrow` result errors before being converted to route responses.

### Domain And Data

- Country shape and fixture data are kept under `app/countries/`.
- Vote request validation is kept under `app/votes/request.server.ts`.
- Redis vote persistence is kept under `app/votes/storage.server.ts`.
- Redis vote reads and writes use aggregate `country:votes:likes` and
  `country:votes:dislikes` hashes keyed by country code.
- Redis seeding writes a metadata-only `country:catalog` JSON document plus
  aggregate `country:votes:likes` and `country:votes:dislikes` hashes keyed by
  country code.
- Redis configuration is read from `REDIS_URL`.

### Development Redis

- Start the local Redis dependency with `docker compose up -d redis`.
- The development Compose service exposes Redis at `redis://localhost:4000`.
- Copy `.env.example` to `.env` or otherwise set `REDIS_URL=redis://localhost:4000` before running app flows that read or write vote totals.
- Seed the local country catalog and dummy vote totals from the current country fixtures with `REDIS_URL=redis://localhost:4000 npm run redis:seed`.
- Redis data is persisted in the `redis-data` Docker volume across container restarts.

### Full App Docker Compose Development

Common Compose scripts are grouped by environment:

| Script | Use |
| --- | --- |
| `npm run compose:dev` | Start the local dev app and Redis in attached mode. |
| `npm run compose:dev:seed` | Start the local dev app and Redis in detached mode, then seed Redis. |
| `npm run compose:prod` | Start the production-style app, Redis, and backup sidecar in detached mode. |
| `npm run compose:prod:update` | Pull the latest code, stop the prod stack without deleting volumes, and restart it. |
| `npm run compose:prod:down` | Stop the prod stack without deleting Redis data volumes. |
| `npm run compose:prod:ps` | Show prod stack container status. |
| `npm run compose:prod:logs` | Follow prod app, Redis, and backup sidecar logs. |

Run the web app and Redis together with:

```sh
npm run compose:dev
```

The `compose:dev` preset starts the Compose `app` and `redis` services. The
`app` service runs `npm run dev -- --host 0.0.0.0`, connects to Redis with
`REDIS_URL=redis://redis:6379` inside the Compose network, mounts the repository
for live reload, and exposes the React Router dev server at
`http://localhost:3000`. To use a different host port, set `APP_HOST_PORT`, for
example:

```sh
APP_HOST_PORT=3001 npm run compose:dev
```

Open `http://localhost:${APP_HOST_PORT}` when `APP_HOST_PORT` is set.

To start the same local dev stack and seed Redis country catalog data in one command,
run:

```sh
npm run compose:dev:seed
```

The `compose:dev:seed` preset starts the Compose `app` and `redis` services in
the background, then runs the `redis:seed` command against the
host-mapped Compose Redis instance. The seed writes the `country:catalog` JSON
document with metadata-only country records, refreshes `country:votes:likes`,
and refreshes `country:votes:dislikes`. It honors the same port overrides as
Compose. For example:

```sh
APP_HOST_PORT=3001 REDIS_HOST_PORT=4001 npm run compose:dev:seed
```

Open `http://localhost:3001` after the command reports that Redis country
catalog data was seeded.

For production-style local execution through Compose, run:

```sh
npm run compose:prod
```

The `compose:prod` preset starts the Compose `app-prod`, `redis`, and
`redis-backup` services in detached mode with the `backup` profile enabled. The
`app-prod` service runs `npm install`, `npm run build`, and then `npm run start`
with `HOST=0.0.0.0` and `PORT=3000`. It uses the same `APP_HOST_PORT` host
override as the dev preset, so the default URL is `http://localhost:3000` and
an override such as `APP_HOST_PORT=3001 npm run compose:prod` exposes the app at
`http://localhost:3001`.

Use `compose:dev` while changing app code and `compose:prod` when checking the
production build/start path locally. Direct host commands remain available:
`npm run dev`, `npm run build`, and `npm run start`.

For Redis-only development or manual reset workflows, keep using the explicit
standalone seed command:

```sh
docker compose up -d redis
REDIS_URL=redis://localhost:4000 npm run redis:seed
```

Redis-only development still uses `docker compose up -d redis` and does not
start the app service. When `REDIS_HOST_PORT` is set for Compose, point
`REDIS_URL` at the same host port before running the seed command.

### Environment Configuration

Use `.env.example` as the safe template for local configuration. Copy it to
`.env` or set the same variables through your shell, deployment environment, or
secret manager. Never commit real Redis credentials, Stripe secrets, GitHub
tokens, generated backup artifacts, or `.env` files that contain secrets.

Runtime and integration variables currently supported by the app and scripts:

| Variable | Required when | Used by | Safe local/default value |
| --- | --- | --- | --- |
| `REDIS_URL` | Browsing Redis-backed country pages, reading/writing votes, seeding, restore, and Redis backup commands. Optional for backup dry-run and local restore only because those runners default to local Redis. | App loaders/actions and Redis scripts | `redis://localhost:4000` |
| `LOG_LEVEL` | Optional for every app runtime. Supported values are `fatal`, `error`, `warn`, `info`, `debug`, `trace`, and `silent`; invalid or missing values fall back to `info`. | Shared Pino application logger | `info` |
| `APP_HOST_PORT` | Optional when starting the app service through Docker Compose and the host port must differ from `3000`. | `docker-compose.yml` app port mapping | `3000` |
| `REDIS_HOST_PORT` | Optional when starting Redis through Docker Compose and the host port must differ from `4000`. | `docker-compose.yml` Redis port mapping and local Redis restore wrapper | `4000` |
| `STRIPE_WEBHOOK_SECRET` | Handling Stripe webhook requests. | `/webhooks/stripe` signature verification | `whsec_replace_with_local_or_deployment_secret` |
| `STRIPE_SECRET_KEY` | Local test-mode Stripe Checkout creation work. | Server-side checkout helpers | `sk_test_replace_with_local_test_secret` |
| `REDIS_BACKUP_SIDECAR_ENABLED` | Optional when running the Compose `backup` profile. Must be truthy to run backups from the sidecar. | Redis backup sidecar | `false` |
| `REDIS_BACKUP_CADENCE_SECONDS` | Optional when the backup sidecar loops instead of running once. | Redis backup sidecar | `86400` |
| `REDIS_BACKUP_DRY_RUN` | Optional when running the backup sidecar. Set to `false` only for Git-backed push mode. | Redis backup sidecar | `true` |
| `REDIS_BACKUP_SIDECAR_RUN_ONCE` | Optional when running the backup sidecar. | Redis backup sidecar | `false` |
| `REDIS_BACKUP_GIT_REPOSITORY` | Git-backed backup push mode. Supports full Git URLs or GitHub `owner/repo` shorthand. Use an SSH URL when the sidecar uses the mounted deploy key. | Redis backup runner and sidecar | `git@github.com:de-angelov/country-ranking.online-backups.git` |
| `REDIS_BACKUP_SSH_KEY_PATH` | Git-over-SSH backup sidecar push mode. Host path to the private deploy key mounted read-only into `redis-backup`. | Docker Compose `redis-backup` service | `/home/deploy/.ssh/country_rank_backup_key` |
| `REDIS_BACKUP_BRANCH` | Optional for Git-backed backup push mode. | Redis backup runner and sidecar | `main` |
| `REDIS_BACKUP_PATH` | Optional for Git-backed backup push mode. | Redis backup runner and sidecar | `redis` |
| `REDIS_BACKUP_RETENTION_COUNT` | Optional for Git-backed backup push mode. | Redis backup runner and sidecar | `30` |

Configuration by workflow:

| Workflow | Required variables |
| --- | --- |
| Local browsing and vote reads/writes | `REDIS_URL`; start Redis first with `docker compose up -d redis`. |
| Redis seeding | `REDIS_URL`. |
| Stripe checkout request validation | `STRIPE_SECRET_KEY`; use only a Stripe test-mode `sk_test_...` secret for local checkout work. |
| Stripe webhook verification | `STRIPE_WEBHOOK_SECRET`; webhook vote application also needs `REDIS_URL`. |
| Redis backup dry-run | No GitHub variables; set `REDIS_URL` when targeting anything other than local Redis. |
| Git-backed Redis backup push | `REDIS_BACKUP_GIT_REPOSITORY` and existing Git credentials with write access; for the Compose sidecar, set `REDIS_BACKUP_SSH_KEY_PATH` to a host deploy key with write access. Set `REDIS_URL` for the source Redis instance and override branch/path/retention only when needed. |

The shared server logger emits newline-delimited JSON through Pino so platform
stdout/stderr collectors can ingest structured app logs. It redacts configured
sensitive fields only when those values are passed as structured object
properties, such as headers, Stripe secrets, raw payloads, card fields, or
payment method fields. Do not interpolate secrets into free-form log message
strings because path-based redaction cannot reliably sanitize message text.

Stripe integration status: the app currently validates paid vote checkout
requests with `STRIPE_SECRET_KEY` present, verifies Stripe webhook signatures
with `STRIPE_WEBHOOK_SECRET`, and applies paid votes from verified
`checkout.session.completed` events that include the approved metadata. Checkout
session creation is not implemented yet. Use only Stripe test-mode
`STRIPE_SECRET_KEY` values for local checkout development.

### Redis Backup Runner

Redis maintenance scripts are grouped under `redis:*`:

| Script | Use |
| --- | --- |
| `npm run redis:seed` | Seed local/demo Redis country catalog and vote totals. |
| `npm run redis:backup:dry-run` | Export a local backup artifact under `tmp/redis-backups`. |
| `npm run redis:backup:push` | Export and push a backup artifact to the configured Git repository. |
| `npm run redis:restore` | Restore a selected artifact into `REDIS_URL`. |
| `npm run redis:restore:local` | Restore a selected artifact into the local Compose Redis port. |
| `npm run redis:backup:sidecar` | Internal sidecar loop used by the Compose backup service. |

The Redis backup runner is available through `npm run redis:backup:dry-run` and
`npm run redis:backup:push`. It exports
`country:catalog`, `country:votes:likes`, and `country:votes:dislikes` to a
timestamped JSON artifact. Push mode writes to the configured Git repository
using the Git credentials available to the runtime.

Backup artifacts are JSON files named with the backup timestamp, for example
`2026-07-16T12-00-00-000Z-country-votes.json`. Each schema v2 artifact records
`schemaVersion`, `createdAt`, the exported Redis key names, the catalog JSON
document, and sorted field maps for the aggregate like and dislike vote hashes.

Environment variables read by the runner:

| Variable | Required | Used for | Default |
| --- | --- | --- | --- |
| `REDIS_URL` | Optional | Redis connection URL for dry-run and push modes. | `redis://localhost:4000` |
| `REDIS_BACKUP_GIT_REPOSITORY` | Required for `--push` only | Backup Git repository destination. Supports full Git URLs or GitHub `owner/repo` shorthand. | None |
| `REDIS_BACKUP_BRANCH` | Optional | Branch to clone and push in the backup repository. | `main` |
| `REDIS_BACKUP_PATH` | Optional | Relative directory inside the backup repository where artifacts are stored. | `redis` |
| `REDIS_BACKUP_RETENTION_COUNT` | Optional | Number of newest backup artifacts to keep during push mode. | `30` |

Create a local backup artifact from the current Redis state with dry-run mode.
This does not require GitHub backup credentials:

1. Start local Redis with `docker compose up -d redis`.
2. Seed demo vote totals if needed with `REDIS_URL=redis://localhost:4000 npm run redis:seed`.
3. Run `REDIS_URL=redis://localhost:4000 npm run redis:backup:dry-run`.
4. Confirm the command prints `Created Redis backup artifact:` and `Exported Redis country catalog and ... country vote total(s).`.
5. Inspect the generated JSON file under `tmp/redis-backups/`.

Push a backup artifact to Git-backed storage by running the same script with
`--push` in an environment whose Git configuration can write to the configured
backup repository:

```sh
REDIS_URL=redis://localhost:4000 \
REDIS_BACKUP_GIT_REPOSITORY=git@github.com:de-angelov/country-ranking.online-backups.git \
npm run redis:backup:push
```

Do not place GitHub credentials, Redis URLs, or generated backup artifacts in
tracked source files. The configured Git account needs enough access to clone
the backup repository branch and push commits containing files under
`REDIS_BACKUP_PATH`.

For a new deployment, configure these prerequisites before relying on Redis vote
backups:

1. Provision the deployment Redis instance and expose its connection string as
   `REDIS_URL`.
2. Set `REDIS_BACKUP_GIT_REPOSITORY` to the backup repository destination and
   ensure the runtime Git account can clone and push to it.
3. For the Docker Compose sidecar, create a dedicated SSH deploy key on the VM,
   add its public key to the backup repository with write access, and set
   `REDIS_BACKUP_SSH_KEY_PATH` to the host private-key path.
4. Use the `main` backup branch unless `REDIS_BACKUP_BRANCH` is explicitly
   changed.
5. Optionally set `REDIS_BACKUP_BRANCH`, `REDIS_BACKUP_PATH`, and
   `REDIS_BACKUP_RETENTION_COUNT` to match the backup repository layout and
   retention policy.
6. Run a one-off `--dry-run` against the deployment Redis URL to confirm Redis
   connectivity without using GitHub credentials.
7. Run `--push` once and confirm a timestamped `*-country-votes.json` artifact
   appears in the configured backup repository path.

Backup artifacts are the recovery path for Redis country data. The dummy seed
script remains a fallback for demo and local reset scenarios only:

```sh
REDIS_URL=redis://localhost:4000 npm run redis:seed
```

The seed script reloads fixture country metadata and vote totals into Redis. It
is not a production restore path and should not be used as evidence that a
GitHub backup artifact can be recovered into a live deployment. Use
`npm run redis:restore` or `npm run redis:restore:local` with a backup artifact
when validating backup recovery.

### Redis Backup Sidecar

Docker Compose includes a `redis-backup` sidecar service for running the Redis
backup runner on a cadence. Normal local development does not start the sidecar:
`docker compose up -d redis` starts only Redis, and the sidecar is also idle by
default because `REDIS_BACKUP_SIDECAR_ENABLED` defaults to `false`.

The sidecar runs `npm run redis:backup:sidecar`, which starts
`npm run redis:backup:dry-run` or `npm run redis:backup:push`. The runner variables
documented in [Redis Backup Runner](#redis-backup-runner) pass through the
sidecar environment; keep the runner section as the source of truth for backup
repository, branch, path, retention, and credential behavior.

Docker Compose environment variables used by the sidecar:

| Variable | Required | Used for | Compose default |
| --- | --- | --- | --- |
| `REDIS_URL` | Always supplied by Compose | Redis connection URL used inside the Compose network. | `redis://redis:6379` |
| `REDIS_BACKUP_SIDECAR_ENABLED` | Optional | Enables the sidecar loop when set to `true`, `1`, `yes`, or `on`; otherwise the sidecar logs that it is idle and exits. | `false` |
| `REDIS_BACKUP_CADENCE_SECONDS` | Optional | Delay between backup runs when the sidecar is enabled and not running once. Must be a positive integer. | `86400` |
| `REDIS_BACKUP_DRY_RUN` | Optional | Runs the backup runner with `--dry-run` when truthy, or `--push` when false. | `true` |
| `REDIS_BACKUP_SIDECAR_RUN_ONCE` | Optional | Runs one backup and exits when truthy; otherwise repeats after each cadence delay. | `false` |
| `REDIS_BACKUP_GIT_REPOSITORY` | Required when `REDIS_BACKUP_DRY_RUN=false` | Passed to the backup runner as the backup Git repository destination. | Empty |
| `REDIS_BACKUP_SSH_KEY_PATH` | Required for sidecar Git-over-SSH push mode | Host private key mounted read-only at `/run/secrets/backup_ssh_key`. | `/dev/null` |
| `REDIS_BACKUP_BRANCH` | Optional | Passed to the backup runner as the backup repository branch. | `main` |
| `REDIS_BACKUP_PATH` | Optional | Passed to the backup runner as the relative artifact directory in the backup repository. | `redis` |
| `REDIS_BACKUP_RETENTION_COUNT` | Optional | Passed to the backup runner as the number of newest artifacts to keep in push mode. | `30` |

Use this one-off dry-run to verify the sidecar locally without GitHub backup
credentials:

```sh
docker compose up -d redis
REDIS_URL=redis://localhost:4000 npm run redis:seed
REDIS_BACKUP_SIDECAR_ENABLED=true \
REDIS_BACKUP_DRY_RUN=true \
REDIS_BACKUP_SIDECAR_RUN_ONCE=true \
docker compose --profile backup up --abort-on-container-exit --exit-code-from redis-backup redis-backup
```

The sidecar should print `Created Redis backup artifact:` and
`Exported Redis country catalog and ... country vote total(s).`, then exit successfully. Inspect the
generated JSON file under `tmp/redis-backups/`.

For sidecar push mode on a VM, create a deploy key and configure the backup repo
before setting `REDIS_BACKUP_DRY_RUN=false`:

```sh
ssh-keygen -t ed25519 -f ~/.ssh/country_rank_backup_key -C "country-rank-backups"
cat ~/.ssh/country_rank_backup_key.pub
```

Add the public key to the backup repository as a deploy key with write access,
then set:

```sh
REDIS_BACKUP_DRY_RUN=false
REDIS_BACKUP_GIT_REPOSITORY=git@github.com:de-angelov/country-ranking.online-backups.git
REDIS_BACKUP_SSH_KEY_PATH=/home/<vm-user>/.ssh/country_rank_backup_key
```

For regular local app work, leave the `backup` profile off and keep
`REDIS_BACKUP_SIDECAR_ENABLED` unset or set to `false`. If the profile is
started accidentally while the sidecar remains disabled, the service exits after
printing that `REDIS_BACKUP_SIDECAR_ENABLED` is not enabled.

Supply Git credentials through the server or container runtime, not through
tracked files. Do not commit GitHub credentials, Redis URLs, `.env` files
containing secrets, or generated backup artifacts.

### Local Redis Restore

The local Redis restore wrapper is available through
`npm run redis:restore:local`. It restores an existing optimized backup artifact
into the Redis service already running through Docker Compose. Optimized schema
v2 artifacts contain the metadata-only `country:catalog` JSON document and the
aggregate `country:votes:likes` and `country:votes:dislikes` hashes created by
the backup runner. The wrapper defaults to `redis://localhost:4000`, honors an
explicit `REDIS_URL`, and can target a non-default Compose host port through
`REDIS_HOST_PORT`.

Run the local restore flow with:

```sh
docker compose up -d redis
npm run redis:restore:local -- ./path/to/2026-07-16T12-00-00-000Z-country-votes.json
docker compose exec redis redis-cli EXISTS country:catalog country:votes:likes country:votes:dislikes
docker compose exec redis redis-cli STRLEN country:catalog
docker compose exec redis redis-cli HLEN country:votes:likes
docker compose exec redis redis-cli HLEN country:votes:dislikes
```

The `EXISTS` command should return `3`, confirming that `country:catalog`,
`country:votes:likes`, and `country:votes:dislikes` were restored. `STRLEN` and
both `HLEN` commands should return positive values for a populated country
backup artifact.

When Redis is exposed on a non-default host port, use the same port for Compose
and restore:

```sh
REDIS_HOST_PORT=4001 docker compose up -d redis
REDIS_HOST_PORT=4001 npm run redis:restore:local -- ./path/to/2026-07-16T12-00-00-000Z-country-votes.json
```

The local wrapper is a restore command, not a seed reset. It reads a selected
optimized backup artifact and replaces the country catalog plus the aggregate
like and dislike vote hashes represented by that artifact. `npm run
redis:seed` reloads fixture/demo data and should only be used as an
explicit local reset fallback when that is the intended behavior.

### Redis Restore Runner

The Redis restore runner is available through `npm run redis:restore`. It reads
one backup artifact created by the [Redis backup runner](#redis-backup-runner),
validates the artifact shape, writes the `country:catalog` JSON document, and
replaces the `country:votes:likes` and `country:votes:dislikes` hashes.

The restore runner expects the backup artifact to already be present on the
machine where the command runs. When the artifact is stored in the Git-backed
backup repository, retrieve it with repository access supplied by the shell or
deployment job. Do not commit GitHub credentials, Redis URLs, downloaded
artifacts, or temporary restore files to this repository.

Environment variables read by the restore command:

| Variable | Required | Used for | Default |
| --- | --- | --- | --- |
| `REDIS_URL` | Required | Target Redis instance that will receive the restored vote totals. | None |

Run a restore against a target Redis instance with:

```sh
REDIS_URL=redis://target-redis-host:6379 \
npm run redis:restore -- ./path/to/2026-07-16T12-00-00-000Z-country-votes.json
```

The command prints `Restored country:catalog and 2 Redis country vote hash(es).`
after a successful restore. The restore replaces only `country:catalog`,
`country:votes:likes`, and `country:votes:dislikes`; it does not delete
unrelated Redis keys.

For a new deployment, use this restore flow before treating fixture seeding as
an option:

1. Provision the new Redis instance and expose its connection string to the
   restore environment as `REDIS_URL`.
2. Follow the [backup prerequisites](#redis-backup-runner) to identify the
   backup repository, branch, path, and artifact naming convention.
3. Retrieve the selected `*-country-votes.json` artifact from the backup
   repository using the runtime's GitHub credentials.
4. Run `npm run redis:restore -- <artifact-path>` with `REDIS_URL` pointing at
   the new Redis instance.
5. Start the app against that same `REDIS_URL` and verify the country pages show
   the restored vote totals.

Use Docker Compose Redis for a local backup-and-restore round trip:

```sh
docker compose up -d redis
REDIS_URL=redis://localhost:4000 npm run redis:seed
REDIS_URL=redis://localhost:4000 npm run redis:backup:dry-run
npm run redis:restore:local -- tmp/redis-backups/<generated-backup-file>.json
docker compose exec redis redis-cli EXISTS country:catalog country:votes:likes country:votes:dislikes
docker compose exec redis redis-cli STRLEN country:catalog
docker compose exec redis redis-cli HLEN country:votes:likes
docker compose exec redis redis-cli HLEN country:votes:dislikes
```

The dummy seed command in this local example is only there to create demo data
before the dry-run backup. For deployment recovery, restore from a Git-backed
backup artifact first. Use `npm run redis:seed` only as an explicit
demo/local reset fallback when no production backup artifact exists or the
environment is intentionally non-production.

### Request And Data Flow

- Browsing: React Router renders the index route from `app/routes/home.tsx`. Country browsing UI loads metadata from `country:catalog` and joins it with aggregate Redis vote totals.
- Voting: a client submits `countryCode` and `voteType` to the paid checkout flow. Checkout creation records intent only; the verified Stripe webhook fulfillment path validates paid vote metadata, increments the matching Redis hash field, reads the updated totals, and records fulfillment.

### Styling Foundation

- Shared styling is based on shadcn UI components configured with neobrutalism-components tokens.
- Global Tailwind and neobrutalism CSS variables live in `app/app.css`.
- Project-wide CSS custom properties in `app/app.css` use the `--size-*`, `--space-*`, `--border-*`, `--radius-*`, `--shadow`, and `--accent-*` names for reusable content widths, spacing, neobrutalist borders, radius, shadow, and shared accents.
- Shared UI primitives live under `app/components/ui/`; `app/components/ui/button.tsx` is the current generated shadcn-style primitive.
- Use CSS Modules only for local route/component layout needs that are not covered by shared primitives or tokens; keep one-off positioning, grid structure, and route-specific responsive rules in the module.

### Pending Paid Vote Work

Stripe checkout, pricing, checkout mode, webhook metadata, and paid-vote contract details are intentionally out of scope for this architecture note. Future paid-vote work should reuse the existing country code, vote type, validation, and Redis vote helper contracts rather than redefining them.
