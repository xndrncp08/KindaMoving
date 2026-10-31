-- Job queue state machine, leases, idempotent import and source reconciliation.
insert into auth.users values ('c0000000-0000-4000-8000-000000000003'), ('d0000000-0000-4000-8000-000000000004') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000003', false);
select public.save_profile('{"preferred_name":"Runner C","country":"Canada","city":"Calgary","experience":"regular","weekly_distance_m":30000,"race_distance":"10k","goals":"","units":"metric","private_profile":true,"notifications":false}');
insert into activities(id, user_id, title, started_at, distance_m, elapsed_s)
values ('c2000000-0000-4000-8000-000000000001', auth.uid(), 'Manual tempo', '2026-10-01', 10000, 3000);

do $$ declare a uuid; b uuid; begin
  a := public.enqueue_job('activity_import', '{"upload_id":"x"}', 'upload-1');
  b := public.enqueue_job('activity_import', '{"upload_id":"x"}', 'upload-1');
  assert a = b, 'Enqueue must be idempotent per key';
  assert (select count(*) from sync_job_events where job_id = a) = 1, 'Creation event missing';
  begin perform public.enqueue_job('conditions_official', '{}', 'k'); raise exception 'Expected kind rejection';
  exception when check_violation then null; end;
  begin perform public.claim_jobs('w', 1, 60); raise exception 'Clients must not claim jobs';
  exception when insufficient_privilege then null; end;
  begin perform public.import_activity(auth.uid(), 'file', 'x', null, '{}'); raise exception 'Clients must not import directly';
  exception when insufficient_privilege then null; end;
  begin update sync_jobs set status = 'succeeded'; raise exception 'Clients must not mutate job state';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
set role service_role;
do $$ declare j public.sync_jobs; s text; n int; payload jsonb; r jsonb; uid uuid := 'c0000000-0000-4000-8000-000000000003';
begin
  select * into j from public.claim_jobs('worker-1', 5, 60);
  assert j.status = 'running' and j.attempts = 1 and j.locked_by = 'worker-1', 'Claim failed';
  select count(*) into n from public.claim_jobs('worker-2', 5, 60);
  assert n = 0, 'A running job must not be claimed twice';
  -- A different worker cannot finish a job it does not hold.
  begin perform public.finish_job(j.id, 'worker-2', 'succeeded', null, null, null, null); raise exception 'Expected lease check';
  exception when lock_not_available then null; end;
  -- Transient failure -> retry_wait with backoff, then a crashed worker's lease expires and is recovered.
  s := public.finish_job(j.id, 'worker-1', 'failed', null, 'rate_limited', 'Provider rate limit', 0);
  assert s = 'retry_wait', 'Expected retry_wait';
  select * into j from public.claim_jobs('worker-3', 5, 60);
  assert j.attempts = 2, 'Retry claim must increment attempts';
  update public.sync_jobs set lease_until = now() - interval '1 second' where id = j.id;
  select * into j from public.claim_jobs('worker-4', 5, 60);
  assert j.locked_by = 'worker-4' and j.attempts = 3, 'Expired lease must be recovered and re-claimed';
  assert exists (select 1 from public.sync_job_events where job_id = j.id and detail = 'lease_expired'), 'Recovery must be recorded';
  -- Invalid transitions are rejected even for the service role.
  begin update public.sync_jobs set status = 'queued' where id = j.id and status = 'running';
        update public.sync_jobs set status = 'succeeded' where id = j.id; raise exception 'Expected invalid transition';
  exception when check_violation then null; end;
  update public.sync_jobs set max_attempts = 3 where id = j.id;
  s := public.finish_job(j.id, 'worker-4', 'failed', null, 'bad', 'still failing', 30);
  assert s = 'failed', 'Exhausted attempts must fail permanently';
  begin update public.sync_jobs set status = 'running' where id = j.id; raise exception 'failed -> running is invalid';
  exception when check_violation then null; end;

  -- Import: create, idempotent repeat, cross-channel duplicate, manual reconciliation.
  payload := jsonb_build_object('version', 'km-analytics/1', 'sport', 'running', 'name', 'Morning run',
    'start_time', '2026-10-01T13:00:00+00:00', 'local_date', '2026-10-01', 'utc_offset_s', -21600,
    'summary', jsonb_build_object('distance_m', 10050, 'elapsed_s', 3010, 'moving_s', 2990, 'elevation_gain_m', 12,
      'splits', jsonb_build_array(jsonb_build_object('index', 0, 'distance_m', 1000, 'elapsed_s', 300, 'moving_s', 299)),
      'laps', jsonb_build_array(jsonb_build_object('index', 0, 'distance_m', 10050, 'elapsed_s', 3010, 'moving_s', 2990, 'start_offset_s', 0))),
    'streams', jsonb_build_object('t', jsonb_build_array(0, 1), 'dist', jsonb_build_array(0, 3)),
    'track', jsonb_build_object('type', 'LineString', 'coordinates', jsonb_build_array(jsonb_build_array(-114.07, 51.04), jsonb_build_array(-114.06, 51.04))));
  r := public.import_activity(uid, 'file', repeat('c', 64), null, payload);
  assert r->>'outcome' = 'merged' and (r->>'activity_id')::uuid = 'c2000000-0000-4000-8000-000000000001', 'Manual entry should be upgraded: ' || r::text;
  assert (select title from public.activities where id = 'c2000000-0000-4000-8000-000000000001') = 'Manual tempo', 'Manual title must be preserved';
  assert (select source from public.activities where id = 'c2000000-0000-4000-8000-000000000001') = 'file';
  assert (select count(*) from public.activity_splits where activity_id = 'c2000000-0000-4000-8000-000000000001') = 2;
  r := public.import_activity(uid, 'file', repeat('c', 64), null, payload);
  assert r->>'outcome' = 'existing', 'Re-import must be idempotent';
  r := public.import_activity(uid, 'coros', '476000001', null, jsonb_set(payload, '{start_time}', '"2026-10-01T13:00:40+00:00"'));
  assert r->>'outcome' = 'duplicate', 'COROS copy of the same run must not double count';
  assert (select count(*) from public.activities where user_id = uid) = 1, 'Exactly one activity expected';
  assert (select coalesce(sum(distance_m), 0) from public.activities where user_id = uid) = 10050;
  r := public.import_activity(uid, 'coros', '476000002', null, jsonb_set(payload, '{start_time}', '"2026-10-02T13:00:00+00:00"'));
  assert r->>'outcome' = 'created', 'A different run must be created';
end $$;
reset role;

-- The other identity sees none of it, and streams cascade with their activity.
set role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000004', false);
do $$ begin
  assert (select count(*) from activities) = 0 and (select count(*) from activity_streams) = 0
     and (select count(*) from sync_jobs) = 0 and (select count(*) from sync_job_events) = 0, 'Cross-user leak';
  begin perform public.cancel_job((select id from sync_jobs limit 1)); exception when others then null; end;
end $$;
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000003', false);
delete from activities;
do $$ begin assert (select count(*) from activity_streams) = 0, 'Streams must cascade'; end $$;
reset role;

-- Imported measurements are read-only to clients; provenance cannot be forged.
reset role;
set role service_role;
select public.import_activity('c0000000-0000-4000-8000-000000000003', 'file', repeat('e', 64), null,
  jsonb_build_object('sport', 'running', 'start_time', '2026-10-05T13:00:00+00:00', 'local_date', '2026-10-05', 'utc_offset_s', 0,
    'summary', jsonb_build_object('distance_m', 5000, 'elapsed_s', 1500, 'moving_s', 1500), 'streams', jsonb_build_object('t', jsonb_build_array(0, 1))));
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000003', false);
do $$ begin
  update activities set title = 'Renamed import' where source = 'file';
  assert (select title from activities where source = 'file') = 'Renamed import', 'Title must stay editable';
  begin update activities set distance_m = 1 where source = 'file'; raise exception 'Expected read-only measurement';
  exception when check_violation then null; end;
  begin update activities set source = 'manual'; raise exception 'Expected column privilege';
  exception when insufficient_privilege then null; end;
  begin insert into activities(user_id, title, started_at, distance_m, elapsed_s, source) values (auth.uid(), 'Forged', '2026-10-05', 1, 1, 'coros');
    raise exception 'Expected column privilege'; exception when insufficient_privilege then null; end;
end $$;
delete from activities;
reset role;
