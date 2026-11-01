# Phase 3 — Production-readiness handoff

## Implemented, with existing architecture preserved

- Vercel Pro Next.js monorepo config, 300-second API budgets and authenticated minute/15-minute/daily schedules; Render Python Blueprint, bounded concurrency, startup/readiness gates and explicit manual deployment.
- Nonce/strict-dynamic CSP, Next/next-themes nonce propagation, restricted map/worker/Supabase resources and no browser analytics-service access.
- Redacted production environment validation and dependency readiness; process liveness independent of dependency outages; redirect rejection on analytics bearer calls.
- Retryable video retention and observable official-condition import failures.
- Safe-by-default Calgary network admission/dry-run, env-only writer DSN, explicit apply/replacement consent, transaction/lock guards and read-only role regression assertions.
- Alberta permanent UTC−6 compatibility after November 2026 with historical DST retained in JS/Python; separate native database acceptance script.
- Protected manual read-only production smoke workflow, deployment settings assertions, and production-mode browser CSP tests.
- Manual GPX/FIT ingress now 4 MiB to remain below Vercel's 4.5 MB request ceiling. Python/COROS parsing and direct Storage video paths are unchanged.

Zustand, Query, PostgreSQL/PostGIS, COROS, routing and analytics remain in place. No product module, schema rewrite, automatic migration or new scheduler system was added.

## Deployment status, 2026-11-01

No service was created, deployed, promoted, restarted or deleted by this work. No production data or Auth configuration was changed. A read-only Vercel name search found no KindaMoving project in the connector's current scope; the connected Render workspace had no KindaMoving service. This is scoped discovery, not proof about inaccessible accounts. Supabase connector access to the documented project was denied, so Phase 2's hosted database/Auth evidence was not refreshed. Blueprint validation against Render's current official JSON schema passed; an authenticated Render CLI/provider validation and actual capacity/health verification remain operator gates.

## Verification

Local verification: 129 Vitest tests passed, 2 live-service tests skipped; 86 Python tests passed, 7 PostGIS tests skipped in the standalone suite and then all 7 passed through the disposable database harness. All 10 SQL suites passed. Lint/typecheck/Prettier/production build passed (two pre-existing React Hook Form compiler warnings). Ten production-mode desktop/mobile Playwright tests passed. The native database timezone acceptance also passed on local PostgreSQL, not the hosted project. Production npm dependency audit reported zero known vulnerabilities. Render's official Blueprint schema and static deployment checks passed. Tests use disposable PostgreSQL/PostGIS or synthetic fixtures/mocked services; no real-user destructive acceptance was run. Actual hosted SMTP/COROS/media capacity and deployed smoke remain unverified. Node here ships old tzdata (2026a); the application compatibility regression tests explicitly verify Alberta's new offset even on that runtime, preserving 2025 winter/summer and spring-DST offsets. Native database acceptance is a separate check, not inferred from those application tests.

## Exact next tasks for Claude/operator

1. Confirm the target Supabase project/region and regain scoped access. Check migration history/advisors and backups without replaying data migrations. Configure the separate network reader login/verified TLS. Run `scripts/check-timezones.py`; use the supported Supabase image/tzdata upgrade if needed, with maintenance/backup review. Never rewrite historical activity UTC timestamps.
2. Prepare and review one licensed Calgary pilot extract; run the default import dry-run, approve `--apply` separately, and approve `--replace-existing` only if reference data already exists. Keep source/checksum/provenance and restart analytics after replacement. Do not assemble a city by repeated destructive tile replacement.
3. Review/fund Vercel Pro and Render always-on compute. Create the app project/root and Blueprint in the correct accounts/region. Set environment values from PRODUCTION_REQUIREMENTS.md, preserving TOKEN_ENCRYPTION_KEY. Validate the Blueprint with an authenticated Render CLI/provider before applying. No purchase/deployment is authorized by a passing local test alone.
4. Configure verified SMTP sender/domain, Auth Site URL and exact callbacks, confirmation/recovery templates, password policy, rate limits and optional Google consent; test synthetic staging users, including expired/reused email links. Test COROS with a real opted-in account separately.
5. Require CI/deployment checks on main, configure main-only protected GitHub production environment and trusted URL variables/secrets. Stage the exact production build, deploy analytics at the same reviewed SHA, run read-only smoke, and verify CDN no-store/CSP behavior before promotion.
6. Load-test pilot routing and jobs on actual Render/Vercel plans. Enable the optional Form extra/model only after checksum, memory/runtime and synthetic-media retention tests. Inspect failure/timeout/retry metrics. Evaluate larger manual-file ingress by extending the existing direct-Storage/job pattern if 4 MiB is insufficient.
7. Set monitoring/spend alerts, test backup restoration, record rollback deployment IDs and complete operator/support/retention/legal details. Exercise non-destructive smoke after rollback. Document final URLs/SHAs and measured acceptance results here.

Remaining blockers are external configuration, native database acceptance, real service capacity, and end-to-end acceptance—not implemented provider success. See DEPLOYMENT.md for release/rollback/monitoring and PRODUCTION_REQUIREMENTS.md for credentials, costs and quotas.
