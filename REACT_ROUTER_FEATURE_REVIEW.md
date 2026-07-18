# React Router Feature Review

Date: 2026-07-18

App version reviewed: React Router `7.18.1`

Reference docs:

- [Route Module](https://reactrouter.com/start/framework/route-module)
- [Data Loading](https://reactrouter.com/start/framework/data-loading)
- [Actions](https://reactrouter.com/start/framework/actions)
- [Rendering Strategies](https://reactrouter.com/start/framework/rendering)
- [Pre-Rendering](https://reactrouter.com/how-to/pre-rendering)
- [Middleware](https://reactrouter.com/how-to/middleware)
- [Error Boundaries](https://reactrouter.com/how-to/error-boundary)
- [Resource Routes](https://reactrouter.com/how-to/resource-routes)

## Executive Summary

The app is using React Router Framework Mode correctly for the core product shape: SSR, typed route modules, server loaders, server actions, root document rendering, route metadata, and resource-style endpoints for votes, checkout, checkout status, and Stripe webhooks.

The biggest unused React Router features worth considering are `headers` for cache control, route `middleware` for request logging/timing, `shouldRevalidate` for avoiding unnecessary loader refreshes, `useFetcher`/`Form` for route-native mutations, and selective pre-rendering for truly static routes if the app gets static pages later.

The app should not rush into client loaders, streaming, route handles, custom entry files, or React Server Components unless a concrete problem appears.

## Feature Usage Matrix

| React Router feature | Current usage | Evidence | Assessment | Recommended next step |
| --- | --- | --- | --- | --- |
| Framework Mode | Used | `vite.config.ts` uses `reactRouter()`, `react-router.config.ts` has `ssr: true`, package scripts use `react-router build/dev/typegen` | Correct baseline for this app | Keep |
| Explicit route config | Used | `app/routes.ts` declares index, ranking routes, votes, checkout, checkout-status, Stripe webhook | Good for a small app; easy to audit | Keep |
| SSR | Used | `ssr: true`; prod uses `react-router-serve` | Appropriate because country/vote data comes from Redis at request time | Keep |
| Root `Layout` | Used | `app/root.tsx` renders `<Meta />`, `<Links />`, `<ScrollRestoration />`, `<Scripts />` | Correct framework structure | Keep |
| Nested route outlet | Used | `app/root.tsx` renders `<Outlet />` inside `AppShell` | Correct for shared shell | Keep |
| Server loaders | Used | `/`, `/top-liked`, `/top-disliked`, `/checkout-status` export `loader` | Good fit for Redis-backed reads and checkout verification | Keep; consider cache headers/revalidation tuning |
| `useLoaderData` | Used | Home and ranking pages consume loader data with typed loader references | Correct and simple | Keep |
| Server actions | Used | `/votes`, `/checkout`, `/webhooks/stripe` export `action` | Good for mutations and webhook handling | Keep |
| Resource routes | Used by convention | Routes like `/votes`, `/checkout`, `/checkout-status`, `/webhooks/stripe` return JSON/redirect/webhook responses rather than UI | Good fit for backend-for-frontend endpoints | Keep |
| Route `meta` | Used | Home and ranking pages export `meta()` | Good basic SEO coverage | Expand if richer social metadata is needed |
| Root error boundary | Used | `app/root.tsx` exports `ErrorBoundary` and uses `isRouteErrorResponse` | Good baseline; user-facing errors are already improving | Keep; consider route-specific boundaries only if needed |
| Type-safe route args | Used | Route modules import `./+types/...` for `Route.LoaderArgs` and `Route.ActionArgs` | Good | Keep |
| Client navigation hooks | Used | Home uses `useLocation` and `useNavigate` to clear checkout redirect query state | Appropriate targeted use | Keep |
| React Router testing helpers | Light use | `MemoryRouter` used in AppShell tests; route handlers mostly unit-tested directly | Acceptable for current size | Consider `createRoutesStub` only for route integration tests that need framework behavior |
| `Link` / `NavLink` | Not used | AppShell uses plain `<a>` and `Button asChild` | Works, but plain anchors can force full document navigation | Consider converting internal nav/brand anchors to `<Link>`/`NavLink` when polishing navigation UX |
| `<Form>` | Not used | Checkout dialog submits with custom `fetch`; direct endpoint tests cover handlers | Current approach is explicit and works | Consider only if progressive enhancement or route-native pending/revalidation becomes important |
| `useFetcher` | Not used | Paid vote/checkout flows use custom `fetch` and component state | Fine, but duplicates some router-native mutation state handling | Consider for unpaid vote actions or checkout creation if we want built-in pending/error/revalidation semantics |
| `useNavigation` pending UI | Not used | No route-level pending state found | Fine for now, but ranking/home navigation could feel slow with Redis | Add if route transitions remain visibly slow |
| `headers` | Not used | No route exports for `headers()` | Missed opportunity for cache-control, especially read-heavy pages/assets | High-value candidate for measured performance work |
| `shouldRevalidate` | Not used | No route exports found | May help avoid unnecessary Redis reloads after query-only or UI-only navigation | Candidate after measuring actual revalidation behavior |
| `clientLoader` / `clientAction` | Not used | No route exports found | Not needed for current SSR/Redis model | Avoid unless a route needs browser-only data or hydration-specific behavior |
| `HydrateFallback` | Not used | No route exports found | Not needed without client loaders that block hydration | Avoid for now |
| Pre-rendering | Not used | `react-router.config.ts` has no `prerender()` | Not a direct ISR replacement; loaders run at build time for pre-rendered URLs | Do not use for Redis-live ranking pages; consider only for static future pages |
| Middleware | Not used | No route/root middleware exports found | Could centralize request logging, timing, request IDs, and error reporting | High-value candidate for logging architecture |
| `handle` / `useMatches` | Not used | No route `handle` exports found | Useful for breadcrumbs/layout metadata, but app does not need it yet | Avoid for now |
| `links` route export | Not used by route modules | Root renders `<Links />`, but no route `links()` exports found | Global CSS import is enough currently | Consider for route-specific preloads only if measured |
| `PrefetchPageLinks` / link prefetching | Not used | No references found | Could improve perceived nav speed for top-liked/top-disliked | Candidate after main performance bottlenecks are fixed |
| Streaming with Suspense | Not used | No deferred/streaming pattern found | The app returns one Redis-backed country list; streaming likely adds complexity | Avoid until a route has independently slow sub-sections |
| Sessions/cookies | Not used | No `createCookieSessionStorage` or auth/session primitives found | Not needed for anonymous voting/checkout flow yet | Avoid until product requires user accounts or durable client state |
| Custom server/entry files | Not used | No `entry.client.tsx` or `entry.server.tsx`; uses default framework server | Good for simplicity | Keep default unless deployment/instrumentation requires custom entry |
| SPA mode | Not used | SSR enabled | Correct because Redis-backed pages should fail clearly on server dependency errors | Keep SSR |
| RSC unstable APIs | Not used | No RSC imports | Correct; unstable and unnecessary for this app | Avoid |

## Current Architecture In React Router Terms

```text
Browser request
   |
   v
React Router server runtime
   |
   +-- root Layout
   |     +-- Meta / Links / ScrollRestoration / Scripts
   |     +-- AppShell
   |
   +-- matched route module
         |
         +-- loader for reads
         |     +-- Redis country catalog / vote totals / Stripe status
         |
         +-- action for writes
               +-- vote endpoint / checkout endpoint / Stripe webhook
```

## Features We Use Well

### SSR With Server Loaders

Country list and ranking pages are server-rendered and get their data from route loaders. This matches the app's Redis-backed model because users should see current-ish vote totals without shipping Redis access to the browser.

### Resource-Style Backend Routes

The app uses React Router routes as backend endpoints:

- `/votes` for vote mutation
- `/checkout` for Stripe Checkout creation/redirect
- `/checkout-status` for checking payment result after redirect
- `/webhooks/stripe` for Stripe webhook handling

This is a good fit for a small backend-for-frontend app.

### Root Error Boundary

The root error boundary gives the app a consistent user-facing failure page and hides stack traces outside dev mode. That is aligned with the recent work on better user-facing payment/Redis errors.

### Typed Route Modules

The route modules use generated `Route.*Args` types from `./+types/...`, and scripts run `react-router typegen`. This is the right direction.

## Best Opportunities

### 1. Add Route Headers For Cache Policy

The read-heavy routes currently do not declare `headers()`. React Router supports route headers for SSR responses. For this app, headers could document and enforce policies like:

- no-store for checkout/payment status endpoints
- short cache or stale-while-revalidate for country ranking reads if acceptable
- stronger static asset caching where handled by the server/deployment layer

This should be measured carefully because vote totals are live product data.

### 2. Add Middleware For Request Logging

The app already has `pino`. React Router middleware can centralize request timing, route/action status, and request IDs around document/data/action requests. That is a cleaner long-term place for request logs than repeating logging in every loader/action.

This pairs well with payment error logging and performance diagnosis.

### 3. Evaluate `shouldRevalidate`

React Router can revalidate loaders after navigations and submissions. That is often useful, but this app has expensive Redis-backed full-list reads. If query-string cleanup or route-local UI changes trigger unnecessary reloads, `shouldRevalidate` could reduce redundant work.

This should be added only after observing a concrete extra loader call.

### 4. Consider `useFetcher` For Vote/Checkout Mutations

Current custom `fetch` logic is explicit and testable. `useFetcher` may still help with route-native mutation state, pending UI, and automatic loader revalidation. It is most relevant for unpaid `/votes`; paid checkout redirect flows may remain clearer with explicit fetch/redirect handling.

### 5. Consider Link/NavLink For Internal Navigation

The nav currently uses plain anchors. Converting internal navigation to React Router `<Link>` or `<NavLink>` could avoid full-page reload behavior and support active nav styling. This is low risk but should be coordinated with the pending AppShell/banner tasks.

## Features To Avoid For Now

### Pre-rendering For Live Country Pages

Pre-rendering is build-time. It is useful for static content, but `/`, `/top-liked`, and `/top-disliked` depend on Redis totals and should not be frozen at build time.

### Client Loaders

Client loaders are useful for browser-only data or mixed client/server loading. This app benefits from SSR and server-only Redis/Stripe code, so client loaders would mostly add complexity right now.

### Streaming

Streaming is useful when independent slow sections can progressively render. The main bottleneck appears to be a single country-list payload/render path, so streaming is probably not the next optimization.

### Route Handles

Route handles are useful for breadcrumbs and shared route metadata. The current navigation is simple and does not need this abstraction.

### RSC

React Server Components support is listed as unstable in the docs and is not needed for this product.

## Suggested Task Candidates

| Priority | Candidate | Why |
| --- | --- | --- |
| High | Add React Router middleware request timing logs | Centralizes request duration/status logging and supports performance work |
| High | Add route headers/cache policy review | Helps performance and makes payment/status endpoints safer |
| Medium | Measure and tune loader revalidation | Could avoid unnecessary Redis reads |
| Medium | Convert AppShell internal nav anchors to Link/NavLink | Improves client navigation and enables active nav state |
| Medium | Evaluate useFetcher for unpaid vote action | May simplify pending/error/revalidation behavior |
| Low | Add route-specific link preloads | Only after measuring that navigation asset/data fetch timing matters |
| Low | Add createRoutesStub integration tests | Useful once route behavior becomes harder to test through pure handlers |

## Open Questions

- Do we want vote totals to be cacheable for a short window, or must every page request reflect Redis immediately?
- Should paid checkout status always bypass all caches, including CDN and browser caches?
- Do we want internal nav to preserve current full document reload behavior during prod debugging, or should it become client navigation everywhere?
- Should request logging live in React Router middleware, individual loader/action helpers, or both?

