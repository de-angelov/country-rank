# Home Route Lighthouse Diagnosis

Date: 2026-07-18  
Task: CR-165  
Route: `/`

## Reported Baseline

The reported Lighthouse baseline for the home route was:

- Performance: 27
- First Contentful Paint: 8.6s
- Largest Contentful Paint: 8.7s
- Total Blocking Time: 4,130ms
- Cumulative Layout Shift: 0
- Speed Index: 8.7s

## Local Production-Style Reproduction

Environment:

- Redis: Docker Compose project `countryranking_agent1_perf`, host port `6381`
- Seed command: `REDIS_URL=redis://localhost:6381 npm run seed:redis:votes`
- Build command: `npm run build`
- Server command: `HOST=127.0.0.1 PORT=4185 REDIS_URL=redis://localhost:6381 npm run start`
- Diagnostic command: `REDIS_URL=redis://localhost:6381 APP_URL=http://127.0.0.1:4185/ npx vite-node scripts/diagnose-home-loader.ts`

Chrome, Lighthouse, Playwright, and Puppeteer were not installed in this workspace, so the local browser portion used equivalent production-server timing, rendered HTML inspection, build asset inspection, and route-phase instrumentation.

## Loader And Response Timings

Diagnostic output against the production server:

| Phase | Timing |
| --- | ---: |
| Redis catalog read | 53.81ms |
| Redis vote totals read | 8.01ms |
| Catalog/totals join | 0.40ms |
| Client-side initial sort equivalent | 0.69ms |
| Blank search filter preparation | 0.10ms |
| HTTP GET `/` response time | 377.82ms |

Repeated warm `curl` timings against the same production server:

| Run | TTFB | Total | Bytes |
| --- | ---: | ---: | ---: |
| 1 | 0.177s | 0.200s | 1,328,806 |
| 2 | 0.111s | 0.138s | 1,328,806 |
| 3 | 0.117s | 0.138s | 1,328,806 |
| 4 | 0.095s | 0.115s | 1,328,806 |
| 5 | 0.084s | 0.109s | 1,328,806 |

Finding: server-side Redis work is measurable but not dominant. The warm production server serves `/` in roughly 0.11-0.14s locally after startup, while the reported Lighthouse FCP/LCP are 8.6-8.7s.

## Rendered Page Evidence

The SSR HTML for `/` contains:

| Item | Count |
| --- | ---: |
| HTML bytes | 1,328,806 |
| Country cards rendered | 249 |
| Images | 250 |
| Lazy images | 249 |
| Remote Wikimedia flag images | 249 image tags, 492 total URL occurrences |
| Buttons | 498 |
| Inline SVGs | 997 |
| Progress bars | 249 |
| Script tags | 1 |
| Stylesheet links | 1 |
| Banner PNG references | 2 |

Largest local static assets:

| Asset | Size |
| --- | ---: |
| `public/images/country-ranking-banner-v7.png` | 1,431,424 bytes |
| `entry.client-BB8UGbcD.js` | 186,384 bytes |
| `jsx-runtime-DD6wKs6H.js` | 128,108 bytes |
| `country-card-DIINCeuC.js` | 52,074 bytes |
| `card-C2Gh787W.js` | 32,382 bytes |
| `root-gBpHq-Qp.css` | 31,610 bytes |
| `home-Chysl5dn.js` | 4,627 bytes |

The route renders every country card on first load. Each card hydrates interactive like/dislike controls, icon SVGs, a progress bar, and a paid-vote dialog component instance. Flag images use `loading="lazy"`, which helps network scheduling below the fold, but the SSR payload still includes every remote flag URL and the client still hydrates the full list.

The shared shell also eagerly renders `country-ranking-banner-v7.png`, a 1.43 MB PNG. Because it appears before the route content and has no `loading`, `fetchpriority`, explicit dimensions, or smaller responsive variant, it is a plausible LCP candidate or early bandwidth competitor.

## Diagnosis

Dominant bottleneck: client render/hydration and initial document/image payload, not Redis.

Evidence:

- Redis catalog and vote total reads together measured about 62ms in the diagnostic run.
- Catalog/totals join and display-name sorting were below 2ms combined.
- Warm production SSR response time was about 0.11-0.14s locally.
- The initial document is 1.33 MB before external image downloads.
- The page hydrates 249 cards, 498 buttons, 997 inline SVGs, and 249 progress bars.
- The route includes 249 remote Wikimedia flag images and a 1.43 MB eager banner image.
- The reported Lighthouse TBT of 4,130ms aligns better with main-thread hydration/render work than with the measured Redis/server timings.

Docker/prod-server setup does not appear to be the primary issue. Remote flag image behavior and the eager banner image may contribute to FCP/LCP/Speed Index, while full-list hydration is the strongest candidate for high TBT.

## Recommended Follow-Up Tasks

1. Add pagination or virtualization to the home country list.
   - Scope: render an initial bounded list instead of all 249 cards.
   - Verification: Lighthouse TBT drops materially; SSR country-card count and HTML bytes decrease.

2. Split paid-vote dialog state so one dialog is mounted at the list level.
   - Scope: keep per-card buttons but avoid hydrating a dialog component instance for every country.
   - Verification: React profiler or Lighthouse TBT improves; SSR/client component count decreases.

3. Optimize the shell banner image.
   - Scope: generate smaller responsive variants or serve a compressed modern format, add dimensions, and consider `fetchpriority` based on LCP testing.
   - Verification: Lighthouse LCP and Speed Index improve; network transfer for the banner is reduced from 1.43 MB.

4. Reduce repeated icon/SVG work in country cards.
   - Scope: replace repeated inline icon SVGs where possible or simplify card markup after the list-size fix.
   - Verification: SSR HTML bytes and hydration time decrease.

5. Consider catalog caching only after client-side work.
   - Scope: memoize validated catalog data in-process with a clear invalidation/dev reset story.
   - Verification: Redis catalog read time decreases, but this is expected to have limited Lighthouse impact unless server TTFB regresses in production.
