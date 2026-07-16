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
