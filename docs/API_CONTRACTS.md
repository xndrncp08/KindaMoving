# API contracts

All app data endpoints require a verified Supabase user. Writes require a same-origin `Origin` header. JSON errors have `{error:string}`. Input schemas strip unknown properties, including forged owner IDs. Units are always metres and seconds in storage/contracts. Display conversion happens at the edge.

| Endpoint                                  | Methods / behavior                                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/api/{activities,routes,shoes,workouts}` | GET: newest 500 owned records; POST: validated create (201); PATCH: full validated record plus UUID; DELETE: `?id=UUID` (204) |
| `/api/{resource}/{id}`                    | GET: a single owned record, 404 if absent                                                                                     |
| `/api/profile`                            | GET combined profile/preferences or null; PUT full validated profile, atomic RPC                                              |
| `/api/saved-routes`                       | GET owned IDs; POST `{route_id}` idempotent save; DELETE `?id=route_id`                                                       |
| `/api/summary?week=YYYY-MM-DD`            | GET full activity totals, seven-day distance and per-shoe totals                                                              |
| `/api/uploads`                            | POST multipart `file`; private storage and registration, 202 `{id,status:'pending',message}`                                  |
| `/auth/callback`                          | GET PKCE exchange; local-only redirect; failure returns to login                                                              |

400 invalid fields/body or a rejected DB constraint; 401 missing identity; 403 invalid Origin; 404 unknown/absent resource; 413 oversized multipart stream; 503 missing Supabase configuration. Unexpected failures return generic 500 messages without database internals. Constraint responses deliberately avoid exposing ownership or foreign-record existence.

## File boundary

The request stream is capped before multipart parsing (5 MB plus 64 KB framing). Files must be 1 byte–5 MB and have a safe, bounded filename. GPX admission requires a UTF-8 GPX root signature and disallows DTD/entity declarations. FIT admission requires a header and `.FIT` signature. These checks are **not** complete XML/FIT parsing, CRC validation, malware scanning or activity extraction. Files remain pending indefinitely until Phase 2 implements a worker. Users receive that exact limitation before and after upload. Storage failure never yields success; metadata failure triggers best-effort object cleanup. Failed cleanup can leave an orphan private object, so operations need reconciliation before large-scale uploads.

## Reserved contracts

`packages/types` defines `ActivityIngestion`, `WearableProvider`, `RoutingService`, `ConditionsService`, `AnalyticsService`, and `TrainingService`. They are TypeScript contracts only: no fake implementation is registered. Upload admission is the implemented part of ingestion. COROS authentication, sync, route computation, conditions aggregation, advanced analytics and training recommendations remain unavailable. Add versioned, validated network contracts when Python services become real; do not treat TypeScript types alone as runtime validation.

## Phase 2 endpoints

All require a verified session (writes: same-origin `Origin`) unless marked _cron_ (`Authorization: Bearer $CRON_SECRET`).

| Endpoint                                                                                              | Behaviour                                                                                         |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `POST /api/uploads`                                                                                   | multipart `file`, `tz`; SHA-256 dedupe; enqueues `activity_import`; 202 `{id, job_id, duplicate}` |
| `GET /api/jobs`, `GET/POST /api/jobs/:id`                                                             | recent jobs; transition history; `{action: cancel\|retry}`                                        |
| `GET /api/jobs/run`                                                                                   | _cron_ durable queue drain                                                                        |
| `GET /api/activity-streams/:id`, `GET /api/activity-splits/:id`                                       | processed streams; km splits and laps                                                             |
| `GET /api/analytics/overview?today=`, `GET /api/analytics/explain/:id`                                | PBs/volume/load/consistency; "why was this run different"                                         |
| `GET/DELETE /api/coros`, `POST /api/coros/connect`, `GET /api/coros/callback`, `POST /api/coros/sync` | status (no tokens); disconnect + revoke; OAuth start; OAuth redirect; queue sync/backfill         |
| `POST /api/routes/generate\|snap\|validate\|save`                                                     | generation (rate limited), waypoint routing, network validation, geometry save                    |
| `GET /api/routes/:id/gpx`, `GET /api/routes/:id/conditions`, `POST /api/routes/:id/coros`             | GPX 1.1; live suitability; confirmed COROS upload (`confirm: true`)                               |
| `GET/POST /api/conditions`, `POST /api/conditions/:id/vote`, `DELETE /api/conditions/:id`             | scored conditions near a point; report (idempotent `client_id`); vote; delete own                 |
| `GET /api/conditions/official`                                                                        | _cron_ City of Calgary import                                                                     |
| `POST /api/training/plan[?preview=1]`, `GET /api/training/overview`, `POST /api/training/apply`       | generate/save plan; calendar + compliance + proposals; apply accepted changes                     |
| `PUT /api/workouts/:id/structure`, `GET /api/workouts/:id/history`, `POST /api/workouts/:id/coros`    | structured steps; same-type history; confirmed COROS push                                         |
| `GET /api/ghost?a=&b=`                                                                                | ghost alignment of two owned runs                                                                 |
| `GET /api/gear?today=`, `POST /api/gear/assign`, `GET/POST /api/gear/:id/wear`                        | gear analytics + unassigned runs; bulk assignment; wear notes                                     |
| `GET/POST /api/form`, `GET/DELETE /api/form/:id`, `GET /api/form/cleanup`                             | analyses; register an uploaded video; signed video URL; delete; _cron_ retention                  |
| `GET /api/account/export`, `DELETE /api/account`                                                      | JSON export (5/day); permanent deletion (`confirm: "DELETE"`)                                     |

Analytics service (`Authorization: Bearer $ANALYTICS_SERVICE_TOKEN`): `POST /v1/activities/parse`, `/v1/analyze/explain`, `/v1/routes/generate|snap|validate`, `/v1/ghost/align`, `/v1/form/analyze`; `GET /healthz`. 422 means invalid input (permanent), 5xx/429 transient, 503 not configured.
