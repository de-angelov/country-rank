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
- Redis keys use the `country:votes:{COUNTRY_CODE}` pattern with `likes` and `dislikes` hash fields.
- Redis configuration is read from `REDIS_URL`.

### Development Redis

- Start the local Redis dependency with `docker compose up -d redis`.
- The development Compose service exposes Redis at `redis://localhost:6379`.
- Copy `.env.example` to `.env` or otherwise set `REDIS_URL=redis://localhost:6379` before running app flows that read or write vote totals.
- Seed dummy local vote totals from the current country fixtures with `REDIS_URL=redis://localhost:6379 npm run seed:redis:votes`.
- Redis data is persisted in the `redis-data` Docker volume across container restarts.

### Redis Backup Runner

The Redis backup runner is available through `npm run backup:redis`. It exports
the `country:votes:*` hashes to a timestamped JSON artifact. Real backup
credentials must be supplied through environment variables and must never be
committed to the repository.

Backup artifacts are JSON files named with the backup timestamp, for example
`2026-07-16T12-00-00-000Z-country-votes.json`. Each artifact records
`schemaVersion`, `createdAt`, the exported Redis key pattern, and a sorted
`records` list. Each record includes the Redis hash key, country code, normalized
`likes` and `dislikes` numbers, and the original Redis hash fields.

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
4. Confirm the command prints `Created Redis backup artifact:` and `Exported ... country vote record(s).`.
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

The seed script reloads fixture vote totals into Redis. It is not a production
restore path and should not be used as evidence that a GitHub backup artifact can
be recovered into a live deployment.

### Request And Data Flow

- Browsing: React Router renders the index route from `app/routes/home.tsx`. Country browsing UI should source country records from `app/countries/fixtures.ts` until a later task introduces a different data source.
- Voting: a client submits `countryCode` and `voteType` to `/votes`; the route validates the payload, increments the matching Redis hash field, reads the updated totals, and returns a JSON success or typed error response.

### Styling Foundation

- Shared styling is based on shadcn UI components configured with neobrutalism-components tokens.
- Global Tailwind and neobrutalism CSS variables live in `app/app.css`.
- Shared UI primitives live under `app/components/ui/`; `app/components/ui/button.tsx` is the current generated shadcn-style primitive.
- Use CSS Modules only for local route/component layout needs that are not covered by shared primitives or tokens.

### Pending Paid Vote Work

Stripe checkout, pricing, checkout mode, webhook metadata, and paid-vote contract details are intentionally out of scope for this architecture note. Future paid-vote work should reuse the existing country code, vote type, vote route, and Redis vote helper contracts rather than redefining them.
