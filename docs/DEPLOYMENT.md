# Production deployment and operations

Phase 3 prepares deployable configuration; it does not provision billable infrastructure or apply hosted database changes. See [PHASE3_HANDOFF](PHASE3_HANDOFF.md) for actual evidence and remaining gates.

## Selected topology and plans

- **Vercel Pro**, Node 22, Next.js App Router, project root **apps/web**, include workspace files outside that directory. `apps/web/vercel.json` installs from the workspace root and runs the app build; all API functions have a 300-second budget unless a route explicitly selects less. Pro is required for minute-resolution cron and commercial use. Hobby's daily-only scheduling cannot provide the queue/conditions cadence. [Cron plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [function limits](https://vercel.com/docs/functions/limitations).
- **Render paid 0.5c-512mb** Python web service, one process and concurrency two. Free services sleeping/cold-starting are inappropriate for the synchronous web-to-analytics timeout. `render.yaml` is configuration only: auto deploy is **off**, no disk, no database replacement, secrets prompt only at initial creation. Render must be publicly reachable over HTTPS from Vercel; a Render-private hostname cannot serve Vercel. Start on the smallest always-on plan, validate pilot graph memory/latency, and increase capacity before enabling MediaPipe or a whole-city graph. [Compute plans](https://render.com/docs/compute-plans), [Blueprint specification](https://render.com/docs/blueprint-spec).
- Existing **Supabase Postgres/PostGIS/Auth/Storage** remains the data authority. No Phase 3 migration changes production schema or data. Align host regions with the existing Supabase location after checking that project's actual region; no region was guessed in config.

## Required setup and release sequence

1. Record a tested Git SHA. Require `web`, `analytics`, and `database` CI checks on main, restrict merges, and configure a GitHub `production` environment with required reviewers and main-only deployment access.
2. Confirm Supabase project, backups/restore access, migration history and advisors. Do not blindly replay migrations. Enable the existing `km_network_reader` login outside migrations using a generated password; retain SELECT-only grants. See [NETWORK_IMPORT](NETWORK_IMPORT.md).
3. Run the native database timezone acceptance script. Supabase documents updated tzdata in **15.19.0.003 / 17.11.0.003 or later**; the PostgreSQL major/minor alone is insufficient evidence. Use the provider's supported upgrade flow with backup/maintenance review, never rewrite historical activity timestamps. [Supabase notice](https://supabase.com/changelog/tzdata-local-time-vancouver-edmonton-casablanca).
4. Review and dry-run the Calgary pilot network. An actual import is an operator action against reference tables, not an automated deploy/migration step. Approve replacements explicitly. Keep the resulting data/license provenance and restart analytics after replacement to invalidate every process's graph cache.
5. Review [credentials and costs](PRODUCTION_REQUIREMENTS.md). Apply the Render Blueprint only after confirming its workspace, plan, region and secrets. The [Blueprint creation page](https://dashboard.render.com/blueprint/new?repo=https://github.com/xndrncp08/KindaMoving) reads the committed file; applying it creates billable compute. Do not reuse an unrelated existing service name.
6. Set shared analytics token, the verified read-only DSN and `KM_DEPLOYMENT=production` on Render. `/healthz` is process liveness; `/readyz` is the platform health gate. Startup validates configuration; readiness checks DB permissions, a nonempty Calgary network and native historical/current tzdata. Probe results cache for 15 seconds, timeouts are bounded and errors never include credentials.
7. Configure a Vercel project with root `apps/web`, production environment variables and Node 22. Use a separate preview Supabase project and secrets for previews. Never connect unreviewed preview code to the production service-role key. Set `KM_DEPLOYMENT=production` in real deployment environments; leave it unset/development for credential-free CI builds. Rebuild after changing NEXT_PUBLIC variables.
8. Configure Supabase SMTP, allowed origins, confirmation/recovery templates and Auth rate limits using [AUTHENTICATION](AUTHENTICATION.md). COROS callbacks must use the final origin; its dynamic registration is per issuer and redirect URI. Do not rotate TOKEN_ENCRYPTION_KEY as part of deployment.
9. Gate Vercel production assignment with required deployment checks, or stage a production build without assigning domains, smoke it, then promote it. Keep Render auto deploy off until the exact SHA passes CI. Configure the selected provider's deployment checks in its dashboard; these settings are not created by source configuration alone. Never publish a preview build merely because it passed public-page checks.
10. Set GitHub production environment variables `WEB_BASE_URL`, `ANALYTICS_URL` and secrets `CRON_SECRET`, `ANALYTICS_SERVICE_TOKEN`. Run the **Production read-only smoke** workflow from main, or `python3 scripts/smoke-production.py` with the same values in a secure shell. It does not enqueue, import or delete anything, does not follow redirects with tokens, and never logs secrets. A protected staged Vercel URL needs its separately configured platform bypass; this script does not bypass SSO automatically.
11. Perform the two-user release acceptance and synthetic upload/route journey in a dedicated staging project, then promote. Do not run destructive acceptance against real users. Record URLs, SHA, smoke results and verified capacity. No deployment success is implied by the presence of these files.

## Schedules and runtime bounds

All schedules are UTC and production-only. Vercel sends `Authorization: Bearer CRON_SECRET`; constant-time verification is already shared by the handlers.

| Path                       | UTC cadence      | Operational behavior                                                                                                                                                                                                                                                                                         |
| -------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/jobs/run`            | every minute     | Claims use leases/SKIP LOCKED; 100 s claim budget, one in-flight handler can extend beyond it. 300 s function limit covers a final 170 s video request plus overhead. Leases expire after 240 s; failures retry with existing backoff. Monitor timeouts rather than treating a claim budget as cancellation. |
| `/api/conditions/official` | every 15 minutes | Fixed Calgary feeds; fetch/persistence failures now return 503 so monitoring can detect stale inputs. Upserts remain idempotent.                                                                                                                                                                             |
| `/api/form/cleanup`        | daily 09:17 UTC  | Up to 500 expired annotated outputs per pass. References clear only after Storage confirms deletion; failure returns 503 and retains retry state. Monitor backlog; invoke additional authenticated passes if over 500, with operator authorization.                                                          |

`after(kickJobs)` remains best-effort; durability relies on the scheduled drain. Vercel may overlap invocations; the existing lease protocol handles job overlap. Feed upserts and deletion retries are idempotent, but exactly-once scheduling is not claimed. External schedulers are an alternative only if they support HTTPS, bearer headers and equivalent runtime bounds; disable duplicate schedules when switching.

## CSP and caching

Proxy issues a fresh nonce in both request and response CSP. The root reads that nonce and passes it to next-themes. Scripts use nonce + strict-dynamic, no unsafe-inline or unsafe-eval in production. Worker sources are same-origin/blob; only the configured Supabase origin/WSS and OpenFreeMap connect origins are granted. Analytics, COROS, weather and municipal feed requests remain server-to-server, so their origins are deliberately absent from browser CSP. Inline styles are the documented exception needed by React/Radix/MapLibre/Recharts. Browser tests verify actual worker/GeoJSON rendering and parser-inserted script blocking.

Nonce-based HTML is now dynamically rendered, including marketing; do not enable ISR/shared HTML caching or cache a CSP header independently of its matching HTML. Private API/session responses remain no-store. Existing service-worker offline copies retain the original HTML/CSP pair and are purged by existing logout behavior. CSP does not replace RLS, authorization or output escaping.

## Hosting limits and feature acceptance

Manual GPX/FIT upload now advertises/enforces **4 MiB** plus bounded multipart overhead, below Vercel's 4.5 MB request ceiling. Python and COROS server-to-server parsing limits are unchanged. Form video input still uploads directly to Supabase Storage and is fetched by the job handler. Check output memory, response and execution limits with realistic synthetic media before enabling Form in production. A larger ingress path should extend the existing direct-storage/job pattern rather than bypass validation.

Render's default build excludes the optional Form extra/model. Existing Form endpoints fail honestly with 503 until the operator installs the optional extra, supplies a checksum-verified model and proves plan capacity. No real-footage accuracy claim is made. Do not promise all-media availability on 512 MB.

## Rollback

Record the prior Vercel deployment ID and Render deploy ID/SHA before release. Roll back Vercel to its last known-good production deployment, then restore Render's compatible prior build. Vercel rollback can disable automatic domain assignment until a later explicit promotion. Never roll back database schema or delete data automatically; Phase 3 needs no schema migration. A reference network replacement is a separate approved operation, recoverable from the reviewed extract/provenance snapshot, followed by analytics restart. Preserve TOKEN_ENCRYPTION_KEY and token-vault compatibility across rollback. Re-run read-only smoke and inspect job retry/backlog after recovery.

## Monitoring and alerts

Use external monitoring for public liveness and authenticated readiness (store monitoring bearer secrets privately). Alert on repeated 503/5xx, function timeouts, Render OOM/restarts and elevated latency. Inspect job status/event counts, oldest due/expired lease, retry_wait/failed growth, stale municipal conditions (>30 min), expired annotated-video backlog, Supabase Auth 429/delivery failures, DB connection pressure and COROS quota deferrals. Check providers' spend dashboards and set budget alerts before launch. Never log Authorization, DSNs, sealed-token material, video bytes, precise tracks or exported accounts. Request/deploy IDs and aggregate status counts are sufficient for initial operations.

## Phase 5 staging acceptance

The existing `kindamoving-staging` project remains an SSO-protected **preview**,
not a production release. `scripts/deploy-staging.sh` exports committed HEAD,
uses the existing daily-only staging config and attaches `kmGitSha` metadata.
Verify the linked project/team and CI first, then inspect READY, metadata and
project-wide SSO after deploying; metadata does not replace actual build checks.
No plan upgrade, data import or production promotion is implicit.

Current provider observations, authenticated read probes, exact reader operator
steps, Calgary archived-extract dry-run and blocked workflows are in the
[Phase 5 report](release/PHASE5_MOBILE_READINESS.md). Shared privileged credentials
and failed Render readiness prevent beta invitations even when the web preview
is READY. Use an isolated staging project for destructive acceptance. Never
substitute another Supabase project for the intended inaccessible one.

## Phase 6 isolated staging

Use `KM_DEPLOYMENT=staging` with a new approved `KM_STAGING_SUPABASE_REF` on both runtimes. The helper rejects shared refs and CLI overrides; web URL and reader DSN must agree. Existing shared previews are not a deployment target for new acceptance. Separate templates and the exact migration/Auth/Storage/secret/job procedure are in [Phase 6](release/PHASE6_BETA_READINESS.md#isolation-runbook--operator-approval-required). `scripts/validate-staging.py` proves consistency only; no provisioning or credential binding is inferred.
