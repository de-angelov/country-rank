# Dependency Hygiene Policy

This policy covers dependency update cadence, lockfile expectations, and npm
audit triage for Country Ranking. It applies to npm package updates and GitHub
Actions workflow dependency updates.

## Automated updates

Dependabot checks npm dependencies and GitHub Actions weekly. Each update should
land through a normal pull request with CI verification instead of direct
commits to `main`.

Review dependency update pull requests with the same scope discipline as feature
work:

1. Keep one update pull request focused on the dependency changes it proposes.
2. Read release notes for framework, build, server runtime, Redis, Stripe, and
   security-sensitive packages before merging.
3. Run or confirm the normal verification gates: `npm test`, `npm run build`,
   and `npm run lint`.
4. For Redis, Stripe, React Router, Vite, TypeScript, or ESLint major updates,
   prefer a dedicated task that can include local runtime checks and focused
   regression tests.

## Lockfile expectations

`package-lock.json` is part of the dependency contract. Any change to
`package.json` dependencies, devDependencies, package version ranges, npm
metadata, or the resolved install graph must include the matching lockfile
change in the same pull request.

Do not hand-edit lockfile entries. Generate them with npm, then review the diff
for the expected package names, versions, transitive dependency movement, and
registry metadata. If npm install/update fails or times out, leave package files
unchanged or document the failed command and exact output in the task notes.

Dependency-only pull requests should not include unrelated source, formatting,
or generated artifact changes.

## npm audit triage

CI runs `npm audit --audit-level=high` as a non-blocking signal so vulnerability
data is visible without destabilizing normal development. A clean audit is not a
substitute for the normal test, build, and lint gates.

Triage audit findings by impact before applying updates:

1. Confirm whether the vulnerable package is present in production runtime code,
   development tooling only, or an unreachable transitive path.
2. Check whether the advisory affects server execution, request parsing, Redis
   access, Stripe handling, build-time code execution, or browser-delivered
   assets.
3. Prefer the smallest update that resolves the advisory while preserving the
   current npm package manager and lockfile.
4. Avoid `npm audit fix --force` unless a task explicitly accepts the breaking
   update risk and includes the required regression verification.
5. If no safe fix exists, document the affected package path, reachable surface,
   current mitigation, and follow-up review date.

High or critical findings on production runtime paths should be handled as
release-blocking until triaged. Findings limited to local development tooling
may be scheduled normally when they cannot affect deployed code or secrets.
