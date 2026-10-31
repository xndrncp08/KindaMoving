# Claude Code — Phase 2 handoff

## Release scope

Phase 1 provides a small, extensible running-log foundation. Repository and remote were verified empty before initialization; no pre-existing work was overwritten. npm workspaces replaces the suggested pnpm structure because npm is available in the supplied environment and provides the required workspace semantics without an additional toolchain.

## Implemented modules and actual functionality

- Original KM monogram/wordmark treatment, SVG favicon, PNG app/touch icons, web manifest; responsive forest/citron identity with light/dark/system themes.
- Marketing, product status labels, illustrative sample metrics, privacy and terms drafts, metadata, robots and sitemap.
- Supabase cookie SSR clients, proxy refresh, per-request user verification, email/password signup/login, conditional Google button, PKCE callback, recovery, password update, logout.
- Onboarding and account profile/preferences, including goals, experience, location, units, privacy and notification preferences.
- Dashboard database-wide distance/count/weekly and shoe totals, recent runs/workouts, lazy Recharts distance chart and configurable gear visibility.
- Activity listing/search, detail, create/edit/delete, basic pace, comparison of up to four selected activities, shoe assignment.
- Route metadata create/edit/delete, private saved routes, detail and lazy MapLibre geometry display infrastructure. Manual routes have no invented GPS trace.
- Workout CRUD, date-based weekly calendar, manual completion; goal management through profile settings.
- Gear create/edit/delete, retirement, baseline wear, database-wide mileage and assigned run history.
- GPX/FIT private file storage with bounded admission checks and pending metadata. No file creates an activity automatically.

## Architecture and layout

`apps/web` is the only runtime. `packages/ui` owns reusable Radix/shadcn-style primitives; `packages/types` owns Zod schemas, domain interfaces and future contracts; `packages/config` owns TypeScript defaults. `services/analytics` is reserved documentation only. `supabase/migrations` owns schema history. See [architecture](ARCHITECTURE.md), [state](STATE_MANAGEMENT.md), [database](DATABASE.md), [auth](AUTHENTICATION.md), [contracts](API_CONTRACTS.md) and [local setup](LOCAL_SETUP.md).

Extend the shared validation, query factories, user-key cache convention and per-route identity guard. Keep APIs as a minimal server boundary instead of duplicating domain rules in each page. Keep server responses out of Zustand. Add query invalidation for new dependent summaries. Existing client interaction stores provide preferences, dashboard controls, map state, route editing, workout drafting, activity comparison and dialog/announcement slices; complex builders can extend them when real behavior exists.

## Database and auth

Fourteen owned tables cover profiles, user preferences, activities/splits, routes/saves, shoes/assignments, workouts/plans, condition reports, provider accounts, sync jobs and file registrations. All have RLS. Composite ownership FKs prevent foreign-user associations. Profiles save atomically with preferences. Totals aggregate in SQL. PostGIS types are installed but advanced operations are absent. Provider/job states cannot be forged by client writes; no OAuth secrets are stored in public tables. Upload registration is a restricted identity/path-checked RPC; assignment mirroring is a private trigger.

Use the caller's publishable-key Supabase client. No service-role key is needed or exposed. Identity checks occur both in layouts and handlers. OAuth and account recovery require actual project/SMTP setup and redirect allowlists. Generate full Supabase `Database` types from the applied project as schema evolution begins; current domain/input contracts are typed, while the underlying Supabase client is not bound to generated database types.

## API contracts

Implemented: domain CRUD, single-record reads, profile transaction, saved routes, summary RPC and file admission. See API_CONTRACTS.md for methods, statuses and validation. Future ingestion/provider/routing/conditions/analytics/training interfaces in `packages/types` are contracts only, not running placeholder services.

## Verification

- `npm run check`: passed: ESLint, strict TypeScript, 44 Vitest tests, Prettier and the production Next.js build.
- `npm run test:e2e`: 6 desktop/mobile public-flow tests passed locally.
- `python3 scripts/test-database.py --without-postgis`: passed against an isolated PostgreSQL 16 cluster with two identities; spatial types/index excluded explicitly.
- Production dependency audit: zero known findings at initial verification. Full dev audit: 16 moderate ESLint/minimatch findings, upstream/tooling remediation pending.
- Landing screenshots inspected at desktop and mobile sizes; clipped badge/mobile metric layout corrected.

No live Supabase Auth/Storage/OAuth, PostGIS geometry, actual phone hardware, production deployment, map tile interaction with real GPS geometry, or hosted database migration is claimed verified locally. The full PostgreSQL/PostGIS migration and ownership harness passed in GitHub Actions [run 41183871914](https://github.com/xndrncp08/KindaMoving/actions/runs/41183871914), database job. This verifies extension/type/index installation, not advanced geospatial behavior.

The complete web and database CI jobs passed on the verified feature commit in [run 41183871914](https://github.com/xndrncp08/KindaMoving/actions/runs/41183871914). The following documentation-only evidence commit preserves that tested implementation.

## Known limits and launch requirements

- Resource lists/search and assigned-run history use the latest 500 records. The UI discloses this cap; database-wide summary/mileage totals remain complete and detail lookup supports any owned ID. Add cursor pagination before wearable imports.
- Signed-in product UI is covered by component/API tests and real SQL ownership tests, not by an end-to-end live Supabase browser session yet.
- Activity dates have day precision. Ingestion must add timestamp/timezone semantics before watch data is accepted.
- Current notification settings store preferences only. No email notification job exists. Public-profile preference does not expose any records.
- GPX root/FIT header checks are admission checks, not semantic parsing or FIT CRC validation. Files remain pending; add a worker, idempotency, quotas and orphan-object reconciliation before large-scale ingestion.
- Storage objects need explicit cleanup during account deletion; an account deletion/export self-service flow is not present.
- Legal pages are candid foundation drafts: operator identity, support contact, retention policy and applicable legal review remain required before public launch.
- Configure Supabase, SMTP, redirects, rate limits, backup/restore, monitoring, retention and an application host. Run Supabase advisors on the actual project after migration. No hosted infrastructure was created.
- No deployment or device connection is included. Google requires provider credentials; COROS is visibly unavailable.
- The early foundation and subsequent feature work share `feat/foundation`; logical commits replace parallel feature branches to keep one-agent schema/UI changes coherent.

## COROS prerequisites

Obtain official partner/developer access and approved OAuth credentials; verify current provider documentation, scopes, redirect URLs, webhook signatures, rate limits and data retention requirements. Implement server-only encrypted token storage, refresh/revocation, idempotent ingestion and observable sync jobs. Never add tokens to the public connected-account metadata table or return them to the browser. No unofficial endpoint, fake sync or simulated account state is provided.

## Explicitly reserved for Phase 2

- COROS OAuth and actual data synchronization
- Advanced FIT/GPX processing
- Python analysis engine
- Sophisticated running metrics
- Workout-aware route algorithms
- Geospatial scoring and optimization
- Pathway condition aggregation
- Route-confidence modeling
- Adaptive training logic
- Ghost racing
- Computer vision running-form analysis
- Complex realtime synchronization
- Advanced performance tuning

Extend the foundation rather than replacing its ownership model, validation units, query ownership or UI primitives. Introduce infrastructure only with a real consumer and a verified failure path.
