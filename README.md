# Country Ranking

Country Ranking is a TypeScript React Router framework-mode app for browsing country ranking data and submitting like/dislike votes backed by Redis.

## Project Architecture

### App Structure

- `app/root.tsx` defines the shared React Router document layout, metadata outlet, script wiring, and root error boundary.
- `app/routes.ts` registers framework-mode routes. The current route table contains the home index route at `app/routes/home.tsx` and the vote submission resource route at `app/routes/votes.ts`.
- Route-local CSS Modules, such as `app/routes/home.module.css`, are used only for narrow layout gaps.

### Frontend Responsibilities

- UI routes live in `app/routes/`. The current home route is a minimal landing shell for country rankings and voting flows.
- Country records are modeled in `app/countries/country.ts` and exported through `app/countries/index.ts`.
- Placeholder country data lives in `app/countries/fixtures.ts`; it includes country codes, names, capitals, remote flag image URLs, and starter like/dislike totals for ranking UI work.

### Server Route And Vote Flow

- `app/routes/votes.ts` is the same-app backend action for vote submissions.
- The action accepts JSON or form data with `countryCode` and `voteType`.
- `app/votes/request.server.ts` validates the submitted country code against the fixture list and accepts only `like` or `dislike` vote types.
- Valid vote requests call `incrementCountryVoteTotal` from `app/votes/storage.server.ts` and return the updated totals.
- Validation, Redis configuration, connection, and command failures are represented as typed `neverthrow` result errors before being converted to JSON responses.

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
- The development Compose service exposes Redis at `redis://localhost:6379`.
- Copy `.env.example` to `.env` or otherwise set `REDIS_URL=redis://localhost:6379` before running app flows that read or write vote totals.
- Seed the local country catalog and dummy vote totals from the current country fixtures with `REDIS_URL=redis://localhost:6379 npm run seed:redis:votes`.
- Redis data is persisted in the `redis-data` Docker volume across container restarts.

### Full App Docker Compose Development

Run the web app and Redis together with:

```sh
npm run compose:dev
```

The `compose:dev` preset starts the Compose `app` and `redis` services. The
`app` service runs `npm run dev -- --host 0.0.0.0`, connects to Redis with
`REDIS_URL=redis://redis:6379` inside the Compose network, mounts the repository
for live reload, and exposes the React Router dev server at
`http://localhost:5173`. To use a different host port, set `APP_HOST_PORT`, for
example:

```sh
APP_HOST_PORT=5174 npm run compose:dev
```

Open `http://localhost:${APP_HOST_PORT}` when `APP_HOST_PORT` is set.

To start the same local dev stack and seed Redis country catalog data in one command,
run:

```sh
npm run compose:dev:seed
```

The `compose:dev:seed` preset starts the Compose `app` and `redis` services in
the background, then runs the existing `seed:redis:votes` command against the
host-mapped Compose Redis instance. The seed writes the `country:catalog` JSON
document with metadata-only country records, refreshes `country:votes:likes`,
and refreshes `country:votes:dislikes`. It honors the same port overrides as
Compose. For example:

```sh
APP_HOST_PORT=5174 REDIS_HOST_PORT=6380 npm run compose:dev:seed
```

Open `http://localhost:5174` after the command reports that Redis country
catalog data was seeded.

For production-style local execution through Compose, run:

```sh
npm run compose:prod
```

The `compose:prod` preset starts the Compose `app-prod` and `redis` services.
The `app-prod` service runs `npm install`, `npm run build`, and then
`npm run start` with `HOST=0.0.0.0` and `PORT=3000`. It uses the same
`APP_HOST_PORT` host override as the dev preset, so the default URL is
`http://localhost:5173` and an override such as
`APP_HOST_PORT=5174 npm run compose:prod` exposes the app at
`http://localhost:5174`.

Use `compose:dev` while changing app code and `compose:prod` when checking the
production build/start path locally. Direct host commands remain available:
`npm run dev`, `npm run build`, and `npm run start`.

For Redis-only development or manual reset workflows, keep using the explicit
standalone seed command:

```sh
docker compose up -d redis
REDIS_URL=redis://localhost:6379 npm run seed:redis:votes
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
| `REDIS_URL` | Browsing Redis-backed country pages, reading/writing votes, seeding, restore, and Redis backup commands. Optional for backup dry-run and local restore only because those runners default to local Redis. | App loaders/actions and Redis scripts | `redis://localhost:6379` |
| `APP_HOST_PORT` | Optional when starting the app service through Docker Compose and the host port must differ from `5173`. | `docker-compose.yml` app port mapping | `5173` |
| `REDIS_HOST_PORT` | Optional when starting Redis through Docker Compose and the host port must differ from `6379`. | `docker-compose.yml` Redis port mapping and local Redis restore wrapper | `6379` |
| `STRIPE_WEBHOOK_SECRET` | Handling Stripe webhook requests. | `/webhooks/stripe` signature verification | `whsec_replace_with_local_or_deployment_secret` |
| `STRIPE_SECRET_KEY` | Local test-mode Stripe Checkout creation work. | Server-side checkout helpers | `sk_test_replace_with_local_test_secret` |
| `REDIS_BACKUP_SIDECAR_ENABLED` | Optional when running the Compose `backup` profile. Must be truthy to run backups from the sidecar. | Redis backup sidecar | `false` |
| `REDIS_BACKUP_CADENCE_SECONDS` | Optional when the backup sidecar loops instead of running once. | Redis backup sidecar | `86400` |
| `REDIS_BACKUP_DRY_RUN` | Optional when running the backup sidecar. Set to `false` only for GitHub-backed push mode. | Redis backup sidecar | `true` |
| `REDIS_BACKUP_SIDECAR_RUN_ONCE` | Optional when running the backup sidecar. | Redis backup sidecar | `false` |
| `REDIS_BACKUP_GITHUB_REPOSITORY` | GitHub-backed backup push mode, including sidecar push mode. | Redis backup runner and sidecar | Empty placeholder |
| `REDIS_BACKUP_GITHUB_TOKEN` | GitHub-backed backup push mode, including sidecar push mode. | Redis backup runner and sidecar | Empty placeholder |
| `REDIS_BACKUP_BRANCH` | Optional for GitHub-backed backup push mode. | Redis backup runner and sidecar | `main` |
| `REDIS_BACKUP_PATH` | Optional for GitHub-backed backup push mode. | Redis backup runner and sidecar | `redis` |
| `REDIS_BACKUP_RETENTION_COUNT` | Optional for GitHub-backed backup push mode. | Redis backup runner and sidecar | `30` |

Configuration by workflow:

| Workflow | Required variables |
| --- | --- |
| Local browsing and vote reads/writes | `REDIS_URL`; start Redis first with `docker compose up -d redis`. |
| Redis seeding | `REDIS_URL`. |
| Stripe checkout request validation | `STRIPE_SECRET_KEY`; use only a Stripe test-mode `sk_test_...` secret for local checkout work. |
| Stripe webhook verification | `STRIPE_WEBHOOK_SECRET`; webhook vote application also needs `REDIS_URL`. |
| Redis backup dry-run | No GitHub variables; set `REDIS_URL` when targeting anything other than local Redis. |
| GitHub-backed Redis backup push | `REDIS_BACKUP_GITHUB_REPOSITORY` and `REDIS_BACKUP_GITHUB_TOKEN`; set `REDIS_URL` for the source Redis instance and override branch/path/retention only when needed. |

Stripe integration status: the app currently validates paid vote checkout
requests with `STRIPE_SECRET_KEY` present, verifies Stripe webhook signatures
with `STRIPE_WEBHOOK_SECRET`, and applies paid votes from verified
`checkout.session.completed` events that include the approved metadata. Checkout
session creation is not implemented yet. Use only Stripe test-mode
`STRIPE_SECRET_KEY` values for local checkout development.

### Redis Backup Runner

The Redis backup runner is available through `npm run backup:redis`. It exports
`country:catalog`, `country:votes:likes`, and `country:votes:dislikes` to a
timestamped JSON artifact. Real backup credentials must be supplied through
environment variables and must never be committed to the repository.

Backup artifacts are JSON files named with the backup timestamp, for example
`2026-07-16T12-00-00-000Z-country-votes.json`. Each schema v2 artifact records
`schemaVersion`, `createdAt`, the exported Redis key names, the catalog JSON
document, and sorted field maps for the aggregate like and dislike vote hashes.

Environment variables read by the runner:

| Variable | Required | Used for | Default |
| --- | --- | --- | --- |
| `REDIS_URL` | Optional | Redis connection URL for dry-run and push modes. | `redis://localhost:6379` |
| `REDIS_BACKUP_GITHUB_REPOSITORY` | Required for `--push` only | Backup repository destination as `owner/repo` or an `https://github.com/...` URL. | None |
| `REDIS_BACKUP_GITHUB_TOKEN` | Required for `--push` only | GitHub token used to clone and push to the backup repository. | None |
| `REDIS_BACKUP_BRANCH` | Optional | Branch to clone and push in the backup repository. | `main` |
| `REDIS_BACKUP_PATH` | Optional | Relative directory inside the backup repository where artifacts are stored. | `redis` |
| `REDIS_BACKUP_RETENTION_COUNT` | Optional | Number of newest backup artifacts to keep during push mode. | `30` |

Create a local backup artifact from the current Redis state with dry-run mode.
This does not require GitHub backup credentials:

1. Start local Redis with `docker compose up -d redis`.
2. Seed demo vote totals if needed with `REDIS_URL=redis://localhost:6379 npm run seed:redis:votes`.
3. Run `REDIS_URL=redis://localhost:6379 npm run backup:redis -- --dry-run`.
4. Confirm the command prints `Created Redis backup artifact:` and `Exported Redis country catalog and ... country vote total(s).`.
5. Inspect the generated JSON file under `tmp/redis-backups/`.

Push a backup artifact to GitHub-backed storage by running the same script with
`--push` in an environment that provides the backup repository and token:

```sh
REDIS_URL=redis://localhost:6379 \
REDIS_BACKUP_GITHUB_REPOSITORY=owner/repo \
REDIS_BACKUP_GITHUB_TOKEN=github-token-with-repository-write-access \
npm run backup:redis -- --push
```

The token must come from the deployment environment, local shell, or a secret
store injected as an environment variable. Do not place GitHub tokens, Redis
URLs, or generated backup artifacts in tracked source files. The backup
repository may be private; the token only needs enough access to clone the
configured branch and push commits containing files under `REDIS_BACKUP_PATH`.

For a new deployment, configure these prerequisites before relying on Redis vote
backups:

1. Provision the deployment Redis instance and expose its connection string as
   `REDIS_URL`.
2. Create or choose a GitHub repository and branch for backup artifacts.
3. Supply `REDIS_BACKUP_GITHUB_REPOSITORY` and `REDIS_BACKUP_GITHUB_TOKEN` as
   environment variables in the job or runtime that executes `npm run backup:redis -- --push`.
4. Optionally set `REDIS_BACKUP_BRANCH`, `REDIS_BACKUP_PATH`, and
   `REDIS_BACKUP_RETENTION_COUNT` to match the backup repository layout and
   retention policy.
5. Run a one-off `--dry-run` against the deployment Redis URL to confirm Redis
   connectivity without using GitHub credentials.
6. Run `--push` once and confirm a timestamped `*-country-votes.json` artifact
   appears in the configured backup repository path.

Until automated restore support is available for deployment recovery, the dummy
seed script remains the fallback for demo and local reset scenarios only:

```sh
REDIS_URL=redis://localhost:6379 npm run seed:redis:votes
```

The seed script reloads fixture country metadata and vote totals into Redis. It
is not a production restore path and should not be used as evidence that a
GitHub backup artifact can be recovered into a live deployment.

### Redis Backup Sidecar

Docker Compose includes a `redis-backup` sidecar service for running the Redis
backup runner on a cadence. Normal local development does not start the sidecar:
`docker compose up -d redis` starts only Redis, and the sidecar is also idle by
default because `REDIS_BACKUP_SIDECAR_ENABLED` defaults to `false`.

The sidecar runs `npm run redis:backup:sidecar`, which starts
`npm run backup:redis` with either `--dry-run` or `--push`. The runner variables
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
| `REDIS_BACKUP_GITHUB_REPOSITORY` | Required only when `REDIS_BACKUP_DRY_RUN=false` | Passed to the backup runner for GitHub-backed push mode. | Empty |
| `REDIS_BACKUP_GITHUB_TOKEN` | Required only when `REDIS_BACKUP_DRY_RUN=false` | Passed to the backup runner for GitHub-backed push mode. | Empty |
| `REDIS_BACKUP_BRANCH` | Optional | Passed to the backup runner as the backup repository branch. | `main` |
| `REDIS_BACKUP_PATH` | Optional | Passed to the backup runner as the relative artifact directory in the backup repository. | `redis` |
| `REDIS_BACKUP_RETENTION_COUNT` | Optional | Passed to the backup runner as the number of newest artifacts to keep in push mode. | `30` |

Use this one-off dry-run to verify the sidecar locally without GitHub backup
credentials:

```sh
docker compose up -d redis
REDIS_URL=redis://localhost:6379 npm run seed:redis:votes
REDIS_BACKUP_SIDECAR_ENABLED=true \
REDIS_BACKUP_DRY_RUN=true \
REDIS_BACKUP_SIDECAR_RUN_ONCE=true \
docker compose --profile backup up --abort-on-container-exit --exit-code-from redis-backup redis-backup
```

The sidecar should print `Created Redis backup artifact:` and
`Exported Redis country catalog and ... country vote total(s).`, then exit successfully. Inspect the
generated JSON file under `tmp/redis-backups/`.

For regular local app work, leave the `backup` profile off and keep
`REDIS_BACKUP_SIDECAR_ENABLED` unset or set to `false`. If the profile is
started accidentally while the sidecar remains disabled, the service exits after
printing that `REDIS_BACKUP_SIDECAR_ENABLED` is not enabled.

Supply secrets only through environment variables from the shell, runtime, or
secret manager. Do not commit GitHub tokens, Redis URLs, `.env` files containing
secrets, or generated backup artifacts.

### Local Redis Restore

The local Redis restore wrapper is available through
`npm run restore:redis:local`. It restores an existing backup artifact into the
Redis service already running through Docker Compose. The wrapper defaults to
`redis://localhost:6379`, honors an explicit `REDIS_URL`, and can target a
non-default Compose host port through `REDIS_HOST_PORT`.

Run the local restore flow with:

```sh
docker compose up -d redis
npm run restore:redis:local -- ./path/to/2026-07-16T12-00-00-000Z-country-votes.json
docker compose exec redis redis-cli GET country:catalog
docker compose exec redis redis-cli HGETALL country:votes:likes
docker compose exec redis redis-cli HGETALL country:votes:dislikes
```

When Redis is exposed on a non-default host port, use the same port for Compose
and restore:

```sh
REDIS_HOST_PORT=6380 docker compose up -d redis
REDIS_HOST_PORT=6380 npm run restore:redis:local -- ./path/to/2026-07-16T12-00-00-000Z-country-votes.json
```

The local wrapper is a restore command, not a seed reset. It reads a selected
backup artifact and replaces the country catalog plus the aggregate like and
dislike vote hashes represented by that artifact. `npm run seed:redis:votes`
reloads fixture/demo data and should only be used as an explicit local reset
fallback when that is the intended behavior.

### Redis Restore Runner

The Redis restore runner is available through `npm run restore:redis`. It reads
one backup artifact created by the [Redis backup runner](#redis-backup-runner),
validates the artifact shape, writes the `country:catalog` JSON document, and
replaces the `country:votes:likes` and `country:votes:dislikes` hashes.

The restore runner expects the backup artifact to already be present on the
machine where the command runs. When the artifact is stored in a GitHub-backed
backup repository, retrieve it with repository access supplied by the shell,
deployment job, or secret manager environment. Do not commit GitHub tokens,
Redis URLs, downloaded artifacts, or temporary restore files to this repository.

Environment variables read by the restore command:

| Variable | Required | Used for | Default |
| --- | --- | --- | --- |
| `REDIS_URL` | Required | Target Redis instance that will receive the restored vote totals. | None |

Run a restore against a target Redis instance with:

```sh
REDIS_URL=redis://target-redis-host:6379 \
npm run restore:redis -- ./path/to/2026-07-16T12-00-00-000Z-country-votes.json
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
   GitHub backup repository, branch, path, and artifact naming convention.
3. Retrieve the selected `*-country-votes.json` artifact from the backup
   repository using GitHub credentials supplied through environment variables or
   the deployment platform's secret injection.
4. Run `npm run restore:redis -- <artifact-path>` with `REDIS_URL` pointing at
   the new Redis instance.
5. Start the app against that same `REDIS_URL` and verify the country pages show
   the restored vote totals.

Use Docker Compose Redis for a local backup-and-restore round trip:

```sh
docker compose up -d redis
REDIS_URL=redis://localhost:6379 npm run seed:redis:votes
REDIS_URL=redis://localhost:6379 npm run backup:redis -- --dry-run
npm run restore:redis:local -- tmp/redis-backups/<generated-backup-file>.json
docker compose exec redis redis-cli GET country:catalog
docker compose exec redis redis-cli HGETALL country:votes:likes
docker compose exec redis redis-cli HGETALL country:votes:dislikes
```

The dummy seed command in this local example is only there to create demo data
before the dry-run backup. For deployment recovery, restore from a GitHub-backed
backup artifact first. Use `npm run seed:redis:votes` only as an explicit
demo/local reset fallback when no production backup artifact exists or the
environment is intentionally non-production.

### Request And Data Flow

- Browsing: React Router renders the index route from `app/routes/home.tsx`. Country browsing UI loads metadata from `country:catalog` and joins it with aggregate Redis vote totals.
- Voting: a client submits `countryCode` and `voteType` to `/votes`; the route validates the payload, increments the matching Redis hash field, reads the updated totals, and returns a JSON success or typed error response.

### Styling Foundation

- Shared styling is based on shadcn UI components configured with neobrutalism-components tokens.
- Global Tailwind and neobrutalism CSS variables live in `app/app.css`.
- Project-wide CSS custom properties in `app/app.css` use the `--size-*`, `--space-*`, `--border-*`, `--radius-*`, `--shadow`, and `--accent-*` names for reusable content widths, spacing, neobrutalist borders, radius, shadow, and shared accents.
- Shared UI primitives live under `app/components/ui/`; `app/components/ui/button.tsx` is the current generated shadcn-style primitive.
- Use CSS Modules only for local route/component layout needs that are not covered by shared primitives or tokens; keep one-off positioning, grid structure, and route-specific responsive rules in the module.

### Pending Paid Vote Work

Stripe checkout, pricing, checkout mode, webhook metadata, and paid-vote contract details are intentionally out of scope for this architecture note. Future paid-vote work should reuse the existing country code, vote type, vote route, and Redis vote helper contracts rather than redefining them.
