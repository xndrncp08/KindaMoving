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
