# Security architecture and Phase 2 review

## Trust boundaries

```
Browser ──(session cookie, same-origin)──▶ Next.js route handlers ──(user JWT, RLS)──▶ Supabase Postgres/Storage
                                              │  service role: job runner, token vault, account deletion only
                                              └──(bearer ANALYTICS_SERVICE_TOKEN, TLS)──▶ Python analytics (no user credentials)
                                                                                         └──(km_network_reader, select-only)──▶ network tables
Scheduler ──(Bearer CRON_SECRET, constant-time)──▶ /api/jobs/run, /api/conditions/official, /api/form/cleanup
COROS ◀──(OAuth 2.1 + PKCE, public client)── server only; tokens sealed with TOKEN_ENCRYPTION_KEY
```

## Controls

| Area              | Control                                                                                                                                                                                                                                                                                                                                                   | Evidence                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Authentication    | Every handler calls `context()` (verified `getUser()` + same-origin `Origin` for writes) or `cronAuthorized()`. The COROS callback authenticates with session + sealed, user-bound, single-use state                                                                                                                                                      | Mechanical sweep of all 55 handlers (see the audit commit); `tests/api.test.ts` |
| Authorization     | RLS on every table; composite `(id,user_id)` owner foreign keys make cross-account links impossible even for the service role's bugs                                                                                                                                                                                                                      | `supabase/tests/*.sql` (10 suites, two identities each)                         |
| Column privileges | Clients cannot write provenance, metrics, geometry, job state, provider state or route distance; imported measurements are read-only                                                                                                                                                                                                                      | `phase2_jobs_import.sql`, `phase2_routes.sql`                                   |
| Definer functions | `search_path=''`, owner pinned to `auth.uid()`, explicit `revoke … from public, anon` and minimal grants; service-only RPCs granted to `service_role` only                                                                                                                                                                                                | Migration review; SQL tests assert `insufficient_privilege`                     |
| Job queue         | State machine trigger rejects invalid transitions for every role; leases bound work to a worker; payload ownership is re-checked by handlers (service role bypasses RLS)                                                                                                                                                                                  | `phase2_jobs_import.sql`, `jobs.test.ts`                                        |
| OAuth tokens      | AES-256-GCM with per-account AAD; ciphertext only in `private.provider_tokens` (not exposed via the Data API); never returned or exported; revoked on disconnect and account deletion                                                                                                                                                                     | `coros.test.ts`, `phase2_coros.sql`                                             |
| Outbound requests | COROS endpoints must be `https://*.coros.com`; FIT links HTTPS, non-local hosts, 25 MB cap; weather and City feeds are fixed hosts; all with timeouts                                                                                                                                                                                                     | `coros.test.ts`                                                                 |
| Uploads           | Streamed size caps, admission checks, defusedxml (no DTD/entities), FIT CRC enforced, SHA-256 dedupe, owner-folder storage policies, video size/duration/resolution validation                                                                                                                                                                            | `test_processing.py`, `test_form.py`                                            |
| Spatial input     | All coordinates bounds-checked with Zod and pydantic; geometry validated in PostGIS (`st_isvalid`, ≤ 20,000 points); search radii clamped (≤ 25 km SQL, ≤ 15 km network loads)                                                                                                                                                                            | `routes.test.ts`, `phase2_routes.sql`                                           |
| Rate limiting     | SQL fixed-window limiter shared by all instances (route generation 12/10 min, snapping 120/10 min, exports 5/day); SQL limits on reports (8/h, 30/day), votes (60/h), form analyses (10/day), queued jobs (25)                                                                                                                                            | `phase2_routes.sql`, `phase2_conditions.sql`                                    |
| Cache isolation   | Query keys prefixed `['user', id]`; logout/identity change clears Query, Zustand, IndexedDB (all stores) and service-worker caches; API responses `private, no-store` and never cached by the service worker                                                                                                                                              | `query.test.tsx`, `offline.test.ts`                                             |
| Privacy           | Runs, routes, plans and videos are private; no public sharing of activities exists. Condition reports are public by design but reporter identity is masked (daily pseudonyms) and deletion cascades. Weather requests send coordinates rounded to ~1 km. Videos: originals deleted after analysis, annotated copies face-blurred and deleted after 7 days | `phase2_conditions.sql`, `docs/FORM.md`                                         |
| Data rights       | `GET /api/account/export` (all owned rows as JSON, tokens excluded); `DELETE /api/account` removes storage objects, revokes COROS, deletes the auth user (cascade)                                                                                                                                                                                        | Settings → Your data                                                            |

## Findings fixed in Phase 2

1. Route maps could never render: PostGIS columns were returned as hex EWKB; now explicit `::json` casts.
2. Imported activity measurements were client-editable (would desynchronise streams, splits and shoe totals); now column grants plus a trigger.
3. `register_upload` allowed unlimited duplicate files; now SHA-256 dedupe.
4. Storage objects survived account deletion (documented Phase 1 gap); now removed first by the deletion flow.
5. Supabase grants default privileges on new `public` objects to `anon`/`authenticated`; every Phase 2 table and function revokes explicitly instead of relying on RLS alone.
6. `Permissions-Policy` blocked geolocation needed for route starts; now `geolocation=(self)` (camera and microphone still denied).

## Hosted project status (Supabase `yqzbsuandpdlvgtgnwln`, 2026-10-31)

All 11 migrations are applied and recorded in `supabase_migrations.schema_migrations` (PostgreSQL 17.11, PostGIS 3.3.7). There are 24 public tables, all with RLS, and three private buckets. Every PostGIS function the code uses was smoke-tested on 3.3.7.

- **Security advisor**: 0 errors. 10 warnings, all "signed-in users can execute a SECURITY DEFINER function", reviewed and intended: `cancel_job`, `enqueue_job`, `register_upload`, `request_form_analysis`, `save_route`, `report_condition`, `vote_condition`, `conditions_near`, `route_corridor_ids`, `hit_rate_limit`. Each pins ownership to `auth.uid()`, validates inputs and applies its own limits; definer rights are needed to write worker-owned columns or read masked community data. No worker-only function is callable by clients, and nothing is callable by `anon`.
- **Performance advisor**: 0 errors, 0 warnings. 15 unindexed-foreign-key suggestions were fixed by `20261031200000_fk_indexes`. The remaining `saved_routes (route_id, user_id)` is covered by the unique `(user_id, route_id)` index (column-order false positive). "Unused index" suggestions reflect an empty database.

## Residual risks and recommendations

- No Content-Security-Policy yet (MapLibre needs `blob:` workers and tile hosts; add a tested CSP before public launch).
- Rate limits for login/signup rely on Supabase Auth's own limits; configure them in the project.
- `km_network_reader` needs a login password set by the operator outside migrations; keep it read-only.
- Run Supabase security and performance advisors after every migration on the hosted project.
- The development audit's moderate ESLint/minimatch findings (Phase 1) remain upstream.

## Phase 3 controls (supersedes the earlier “no CSP” residual risk)

Every HTML request receives a fresh CSP nonce forwarded through Proxy to Next and next-themes. Production scripts require that nonce/strict-dynamic; neither unsafe-inline scripts nor unsafe-eval is allowed. MapLibre's pinned installed module worker remains served locally. Worker sources are same-origin/blob, map resources are restricted to tiles.openfreemap.org, Supabase connections/storage/media to the configured origin and WSS. Analytics and provider/feed URLs are server-only and receive no browser CSP grants. Inline style permission is retained for MapLibre/Radix/React/Recharts positioning; this is a documented style exception, not script permission. Frame ancestors, objects and base injection are denied. Production browser tests cover parser-inserted script blocking and actual worker/GeoJSON rendering.

The analytics HTTP client rejects redirects to prevent leaking bearer tokens. Render exposes no OpenAPI schema or cross-origin browser API; token checks remain constant-time. Production startup rejects missing/invalid secrets and insecure DSNs. Readiness probes are bounded, avoid user-data exports and redact dependency exceptions. The web dependency probe is scheduler-authenticated. The Render platform probe is public but returns only `{ok}`.

Retention leaves annotated object references intact if Storage deletion fails, so retry is possible. Official feed/persistence failures produce a detectable HTTP 503. The network importer defaults to dry-run and requires explicit application/replacement opt-in; atomic transactions and locks prevent partial/colliding replacements. Reference-data writer credentials never enter the runtime analytics service. No hosted schema/data/security settings were mutated in Phase 3.

## Phase 6 hardening

Staging mode rejects the documented shared project and mismatched reader identity. libpq query parameters cannot override inspected connection identity; graph caches are keyed by its digest. Readiness rejects escalated/schema-create/inherited-role and non-network privileges, including TRUNCATE. HTTP readiness is bounded to four seconds with one background probe; late failures are redacted. Analytics rejects invalid successful JSON and retains caller aborts; export fails closed on missing rate-limit admission. Outbox cancellation protects identity transitions. Existing RLS already limits raw condition reports to owners; no ownership policy rewrite was necessary. See [Phase 6](release/PHASE6_BETA_READINESS.md) for remaining isolation/device gates.
