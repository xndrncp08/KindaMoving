# Activity processing pipeline

```
Browser ──multipart──▶ POST /api/uploads (user session, RLS)
   │                     ├─ stream cap 5 MB, admission check, SHA-256
   │                     ├─ Storage put  activity-files/<uid>/<uuid>.<fmt>
   │                     ├─ register_upload(…, sha256)  → duplicate? delete new object
   │                     ├─ enqueue_job('activity_import', {upload_id, tz}, key = upload_id)
   │                     └─ after(): kickJobs()          (best effort, post-response)
   │
   │            GET /api/jobs/run  (cron, CRON_SECRET)  ── durable drain
   │                                   │
   ▼                                   ▼
JobSync (polls /api/jobs        runJobs(): claim_jobs (SKIP LOCKED lease)
while jobs are active)            └─ importUpload: ownership re-check → download
   │                                 → POST analytics /v1/activities/parse
   │                                 → import_activity(user, 'file', sha256, upload, payload)
   │                                   (one transaction: dedupe, row, splits, laps, streams)
   └─ on succeeded: invalidate activities, summary, analytics, shoes, workouts, training
```

## Components

| Piece    | Where                                           | Role                                                                                                                                               |
| -------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parsers  | `services/analytics/km_analytics/{gpx,fit}.py`  | GPX via defusedxml (DTD/entity-free), FIT via Garmin's official SDK with CRC enforcement                                                           |
| Cleaning | `clean.py`                                      | clock repair, sort/merge, coordinate validation, outlier rejection, jitter-robust distance, elevation smoothing, moving time, stoppages            |
| Metrics  | `metrics.py`                                    | splits, laps, best efforts, grade-adjusted pace, decoupling, variability, split type, classification. See [RUNNING_METRICS.md](RUNNING_METRICS.md) |
| HTTP     | `api.py`                                        | `POST /v1/activities/parse?format=gpx\|fit&tz=IANA`, bearer service token, 25 MB cap, threadpool execution                                         |
| Queue    | `supabase/migrations/…_activity_processing.sql` | `sync_jobs` state machine, leases, `claim_jobs`/`heartbeat_job`/`finish_job`                                                                       |
| Runner   | `apps/web/src/lib/jobs/runner.ts`               | claims, executes, classifies errors, backoff                                                                                                       |
| Import   | `import_activity` RPC                           | transactional persistence and reconciliation                                                                                                       |

## Idempotency and reconciliation

1. **Same file twice**: `activity_uploads(user_id, sha256)` is unique. The second upload deletes its new object and returns the original upload ID. The job key is the upload ID, so no second job is created.
2. **Same source object twice** (a retried job, or a re-synced COROS label): `activities(user_id, source, source_ref)` is unique, and the RPC returns `existing`.
3. **Same run through another channel** (COROS sync plus a manual FIT upload): a device record within ±2 min of start and ±5 % distance is a `duplicate`. Nothing new is written, so mileage cannot be double-counted.
4. **Manual entry later imported**: exactly one manual entry on the same local date within ±10 % distance is upgraded in place (`merged`). Its title and shoe are kept, and source, measurements, streams and track are replaced. Ambiguous matches create a new activity instead of guessing.

## Time semantics

- `start_time` is the exact UTC instant. `started_at` is the local calendar date, used for weekly totals and the calendar.
- FIT supplies the local offset (`activity.local_timestamp − timestamp`, rounded to 15 min). GPX has none, so the browser's IANA zone is the fallback, evaluated at the activity's start instant (DST-correct) and flagged `timezone_assumed`.
- Offsets come from the runtime's IANA time-zone database. **Alberta (America/Edmonton, the pilot city) moved to permanent UTC−6 from November 2026**, so servers and CI must run a tz database newer than 2026a (Node and Python update it with their releases) or Calgary times after 2026-11-01 will be off by an hour.
- `crosses_midnight` is set when the local end date differs. The activity belongs to its local **start** date.

## Failure handling

| Failure                                                                            | Classification                                                                       | Result                                                                                   |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Malformed/corrupt/truncated file, course FIT, < 2 timestamped samples, no distance | Permanent (422)                                                                      | Job `failed`, upload `failed` with the reason shown to the user                          |
| Analytics unreachable/5xx/429, storage/database hiccup                             | Transient                                                                            | `retry_wait`, exponential backoff with equal jitter (30 s base, 1 h cap), max 5 attempts |
| Worker killed mid-job                                                              | Lease expiry (120 s)                                                                 | Next claim re-queues it (`lease_expired` event) and the attempt counts                   |
| User cancels                                                                       | `queued`/`retry_wait` → `cancelled`; `running` → flag observed at the next heartbeat |

## Limits

- Streams are thinned by even stride to ≤ 20,001 points per activity (5.5 h at 1 Hz before thinning).
- Uploads are capped at 5 MB by the storage bucket and the route handler. Hosts with smaller request limits need direct-to-Storage uploads.
- Weather and environmental context are attached by the analytics feature (see [ANALYTICS.md](ANALYTICS.md)), not by the parser.
