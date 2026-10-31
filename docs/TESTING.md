# Testing

## Commands

- `npm run lint` — Next/TypeScript ESLint checks.
- `npm run typecheck` — strict TypeScript across web and imported shared packages.
- `npm test` — Vitest unit/component/API contract tests.
- `npm run format:check` — Prettier source/documentation formatting.
- `npm run build` — production Next build, no credentials required for public pages.
- `npm run check` — all five checks above.
- `npx playwright install chromium && npm run test:e2e` — desktop Chrome and Chromium mobile emulation. Runs a local development server without Supabase credentials.
- `python3 scripts/test-database.py` — creates and destroys its own isolated PostgreSQL cluster (UTF-8, default PG 17 + PostGIS), applies **all** migrations, then runs every `supabase/tests/*.sql` suite with multiple identities. `--then "<cmd>"` runs a command against the migrated database (`KM_TEST_DATABASE_URL`) before teardown, e.g. the PostGIS routing integration tests. Never connects to an existing database.
- `cd services/analytics && .venv/bin/python -m pytest -q` — processing, metrics (incl. property-based), analysis, routing (synthetic city), ghost, form, API boundary.
- `python3 scripts/test-database.py --then "services/analytics/.venv/bin/python -m pytest -q services/analytics/tests/test_network_db.py"` — real Calgary OSM network through PostGIS.
- `ANALYTICS_URL=… npx vitest run tests/analytics.integration.test.ts` (in `apps/web`) — live TS → Python round trip.
- `python3 scripts/test-database.py --without-postgis` — explicit alternative that substitutes only the spatial columns and skips PostGIS/GiST installation. All other DDL, functions, constraints, RLS policies and SQL assertions execute against real PostgreSQL.

## Coverage and evidence

Vitest covers metric edge cases, all domain schemas, onboarding/preferences, SDK-backed login/signup/recovery UI flows using mocks, endpoint identity and Origin checks, forged ownership, query cache isolation/invalidation, failed mutations, Zustand resets/persistence, comparison selections, GPX/FIT admission, gear assignment form submission, and accessible navigation drawer behavior.

Playwright covers marketing responsiveness and horizontal overflow, working signup links, honest feature states, unauthenticated route protection, legal pages and reduced-motion rendering in desktop/mobile viewports. It saves full-page landing screenshots in ignored `output/playwright`. Browser tests do not bypass auth to claim verified signed-in product flows.

SQL assertions cover the complete ownership table set, profile/preference transactions, manual activity updates/deletes, workout completion, shoe foreign-key protection, assignment mirroring/clearing, saved-route cascade, all-record aggregates, upload registration, restricted provider/job state, cross-user read/write denial, and anonymous denial. Auth identity functions and storage tables in this harness are test doubles. This does not verify GoTrue, PostgREST, Storage APIs or SMTP.

## Recorded local result, October 31, 2026

Final command results are recorded in `CLAUDE_HANDOFF.md`. The relational-only harness is the local database evidence because Docker and PostGIS are unavailable. The full PostGIS migration/ownership harness also passed in the database job of [GitHub Actions run 41183871914](https://github.com/xndrncp08/KindaMoving/actions/runs/41183871914). No deployed environment or real OAuth flow was tested locally.

## CI

GitHub Actions runs npm clean install, lint, typecheck, Vitest, Prettier, build, and both browser projects. A separate Ubuntu job installs PostgreSQL 16/PostGIS and runs the full migration harness. Browser failure traces upload as artifacts. No production credentials are required by CI. Passing these jobs is not a live Supabase or production acceptance test.

## Dependency audit

The release audit reports no production dependency vulnerabilities. The full development audit reports 16 moderate findings through ESLint/minimatch. `npm audit fix` cannot resolve them without incompatible version changes; no forced downgrade or unverified major override was applied. Recheck the upstream lint-tool chain before accepting untrusted repository patterns in automation.

## Required external acceptance

With a dedicated Supabase test project: apply migrations, inspect advisors, test signup confirmation, password login, session refresh, recovery, Google if enabled, onboarding, all CRUD screens, storage upload failure/success and direct REST isolation with two users. Test map rendering with actual geometry/network tiles. Verify device keyboard/focus, dark theme and navigation on real mobile hardware. No credentials were available for these checks in the initial implementation session.

## Phase 2 results (2026-10-31, local)

| Suite                                        | Result                                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Vitest (web)                                 | 105 passed, 2 skipped (live-service integration, run separately: passed)                             |
| pytest (analytics)                           | 69 passed, 4 skipped (PostGIS network suite, run via the harness: 4 passed)                          |
| SQL contract suites on PG 17.x + PostGIS 3.7 | 10 passed (ownership, jobs/import, analytics, COROS vault, routes, conditions, training, gear, form) |
| `npm run check`                              | lint (0 errors), typecheck, tests, Prettier, production build: passed                                |

Edge cases covered: corrupted/truncated FIT, DTD/entity GPX, missing GPS samples, null-island fixes, backwards device clock jumps, out-of-order samples, cross-midnight local dates, auto-pause gaps, duplicate imports across channels, conflicting and stale condition reports, disconnected roads (island), unreachable tempo constraints, off-network geometry, failed OAuth refresh and refresh races, offline queue and reconnection, account switching purge, large (6 h) activities.

Not verified here: live COROS account flows, hosted Supabase Auth/Storage end-to-end (see README for the hosted status), physical mobile devices, MediaPipe accuracy on real footage.
