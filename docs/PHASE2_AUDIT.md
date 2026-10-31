# Phase 2 audit (October 31, 2026)

Audit of the Codex Phase 1 foundation (`main` @ `62d8eff`) before Phase 2 work. Baseline: `npm run check` passed locally (lint, typecheck, 44 Vitest tests, Prettier, build).

## Kept as-is

- Ownership model: RLS on every table with `(select auth.uid())`, composite `(id,user_id)` owner foreign keys, restricted provider/job state. Correct and efficient.
- Per-handler identity + same-origin `Origin` checks in `lib/api.ts`; layouts are not trusted as authorization.
- Query keys prefixed with `['user', userId]`; `QueryClient` per provider; logout/identity change clears Query and Zustand. No cross-account cache leakage found.
- Zustand for interaction state, RHF + Zod forms, URL search params for filters. Not replaced.
- SQL aggregates for totals (`running_summary`) so the 500-row list cap cannot undercount mileage.

## Defects and gaps fixed in Phase 2

| Finding                                                                                     | Impact                                                                                               | Resolution                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `activities.started_at` is a calendar `date`; no timestamp, timezone, source or external ID | Wearable/file imports cannot be deduplicated or ordered; cross-midnight runs ambiguous               | `start_time timestamptz`, `utc_offset_s`, `source`, `source_ref`, unique `(user_id, source, source_ref)`; calendar date kept for manual entries |
| `route_condition_reports` requires a route owned by the reporter                            | Community condition reports are impossible; a report on a private route would leak it if made public | New `condition_reports` with point geography, votes, moderation and a reporter-masking read function; old table kept as private route notes     |
| `sync_jobs` has only `pending/processing/complete/failed`                                   | No leases, retries, backoff, idempotency or crash recovery                                           | Job state machine enforced by trigger, leases with expiry, attempts/backoff, idempotency keys, transition history                               |
| Uploaded GPX/FIT files stay `pending` forever                                               | Upload feature is storage only                                                                       | Job-driven import through the Python analytics service, transactional `import_activity` RPC                                                     |
| `Permissions-Policy: geolocation=()`                                                        | "Start from my location" for route generation is blocked by the browser                              | `geolocation=(self)`                                                                                                                            |
| Default map viewport is Edmonton                                                            | Pilot geography is Calgary                                                                           | Calgary default                                                                                                                                 |
| No account export or deletion flow                                                          | Privacy requirement; storage objects orphaned on deletion                                            | Export endpoint and server-side deletion that removes storage objects first                                                                     |
| Connected-account table has no place for tokens (correctly)                                 | COROS needs server-only credentials                                                                  | `private.provider_tokens` (not exposed through the Data API), AES-256-GCM encrypted by the server                                               |

## Observations left unchanged (documented limits)

- Uploads stream through a Next.js route handler. On hosts with small request-body limits (e.g. Vercel's 4.5 MB), larger files need direct-to-Storage uploads. The 5 MB cap stays.
- `check()` maps every database error to a 400. That hides transient 5xx causes, but it also avoids leaking constraint details. Kept.
- List endpoints cap at 500 rows. Imports now order by `start_time`, and history views use dedicated, bounded endpoints.
