# Database foundation

Ordered Supabase SQL migrations are the schema source of truth. Create additions with `npx supabase migration new <name>`; never rewrite a migration already applied to shared infrastructure. The initial migration was corrected before release and before any shared database application.

| Table                       | Purpose / ownership                                             |
| --------------------------- | --------------------------------------------------------------- |
| profiles                    | Onboarding identity/goals; auth user ID primary key             |
| user_preferences            | Units, privacy, notification preference; profile ID primary key |
| activities                  | Metres, seconds, activity date, optional owned shoe             |
| activity_splits             | Basic reserved split records owned through parent activity      |
| routes                      | Metadata, optional SRID 4326 LineString                         |
| saved_routes                | Unique owner/route pair, private route library                  |
| shoes                       | Brand, baseline metres and retirement flag                      |
| shoe_assignments            | Trigger-maintained mirror of activity shoe ID                   |
| workouts                    | Date, notes and manual completion                               |
| training_plans              | Reserved basic plan metadata                                    |
| route_condition_reports     | Reserved reports, optional SRID 4326 point geography            |
| connected_provider_accounts | Provider/status metadata only; no credentials                   |
| sync_jobs                   | Reserved job state, no worker in Phase 1                        |
| activity_uploads            | Private file metadata with pending status                       |

All tables have timestamps and update triggers. Owned tables have owner/created indexes, composite unique `(id,user_id)` constraints and owner-preserving foreign keys. Splits and saved-route links cascade with parents. Shoes cannot be deleted while assigned; retire or unassign them. User deletion cascades relational records; storage objects require separate operator cleanup. Activities store calendar dates in Phase 1, not device timestamps. Date/time fidelity belongs to ingestion work.

RLS permits only `(select auth.uid()) = user_id` (or ID for profiles/preferences), with both USING and WITH CHECK. Public sharing is not enabled even when a preference is saved. Provider/job/upload-result states and mirrored assignments cannot be directly mutated by authenticated clients. No public or security-definer view bypasses ownership.

`save_profile(jsonb)` is an invoker transaction that saves profile and preferences atomically. `running_summary(date)` is an invoker aggregate over every owned activity, including shoe baselines. `private.mirror_assignment` is a restricted definer trigger with an empty search path. `register_upload` is a narrowly scoped definer function: validates identity, path ownership and object existence, then inserts pending metadata; it cannot set a processed state. Execute grants are restricted. Future tokens belong in a private encrypted secret store, never connected-account rows exposed by the Data API.

PostGIS is installed in `extensions`, with route geometry and a GiST index. No advanced spatial operations are present. The local relational-only test explicitly substitutes spatial columns and skips the spatial index; it does not verify PostGIS. CI's full test requires the extension.

Storage: private `activity-files` bucket, 5 MB object limit, allowed GPX/XML/octet-stream types, and user-ID path policies. Files receive UUID object names. Deleting an auth user does not automatically erase stored objects; implement an audited cleanup job before a public launch.

## Seed

Automatic seed is intentionally empty. `scripts/seed-development.sql` requires an existing local auth UUID and labels every fixture `[DEV]`. Do not use it on production.

## Phase 2 migrations

| Migration                            | Adds                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `20261031120000_activity_processing` | timestamped/sourced activities, streams, laps, upload hashes, job queue state machine + leases, `import_activity`, client write boundaries |
| `20261031130000_analytics`           | `comparable_candidates`                                                                                                                    |
| `20261031140000_coros`               | provider account fields, `private.provider_clients`, `private.provider_tokens`, `provider_records`, vault RPCs                             |
| `20261031150000_routes_network`      | network nodes/edges/imports (read-only role), route geometry fields, `save_route`, rate limiter                                            |
| `20261031160000_conditions`          | reports, votes, moderation, masked `conditions_near`, corridor RPCs, official upsert                                                       |
| `20261031170000_training`            | workout kind/status/steps/plan/compliance/route, plan creation and change RPCs                                                             |
| `20261031180000_gear`                | purchase/retirement/lifespan/default, wear observations, default attribution trigger, `gear_analytics`, `assign_shoe`                      |
| `20261031190000_form`                | private video buckets, `form_analyses`, `request_form_analysis`                                                                            |

Every new table enables RLS and revokes Supabase's default `anon`/`authenticated` grants explicitly before granting what clients need. Spatial data uses SRID 4326 with GiST indexes (activity tracks, route paths, network, condition locations).
