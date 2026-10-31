-- Gear: default attribution, recomputed totals under delete/reassign/duplicate import, analytics.
insert into auth.users values ('a5000000-0000-4000-8000-000000000001') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000001', false);
insert into shoes(id, user_id, title, brand, initial_distance_m) values
  ('a5100000-0000-4000-8000-000000000001', auth.uid(), 'Daily', 'X', 100000),
  ('a5100000-0000-4000-8000-000000000002', auth.uid(), 'Racer', 'Y', 0);
reset role;
-- Defaults and prices are set through the API's update path; here as superuser for brevity.
update shoes set is_default = true, purchase_price = 180, purchased_on = '2026-09-01' where id = 'a5100000-0000-4000-8000-000000000001';
set role service_role;
do $$ declare p jsonb := jsonb_build_object('sport', 'running', 'utc_offset_s', 0, 'streams', jsonb_build_object('t', jsonb_build_array(0, 1))); r jsonb; begin
  r := public.import_activity('a5000000-0000-4000-8000-000000000001', 'file', repeat('1', 64), null,
    p || jsonb_build_object('start_time', '2026-10-01T13:00:00Z', 'local_date', '2026-10-01', 'summary', jsonb_build_object('distance_m', 10000, 'elapsed_s', 3000, 'moving_s', 3000)));
  assert (select shoe_id from public.activities where id = (r->>'activity_id')::uuid) = 'a5100000-0000-4000-8000-000000000001', 'Default shoe attributed';
  r := public.import_activity('a5000000-0000-4000-8000-000000000001', 'coros', '777', null,
    p || jsonb_build_object('start_time', '2026-10-01T13:00:30Z', 'local_date', '2026-10-01', 'summary', jsonb_build_object('distance_m', 10020, 'elapsed_s', 3000, 'moving_s', 3000)));
  assert r->>'outcome' = 'duplicate', 'COROS copy must not add mileage';
  r := public.import_activity('a5000000-0000-4000-8000-000000000001', 'file', repeat('2', 64), null,
    p || jsonb_build_object('start_time', '2026-08-15T13:00:00Z', 'local_date', '2026-08-15', 'summary', jsonb_build_object('distance_m', 5000, 'elapsed_s', 1500, 'moving_s', 1500)));
  assert (select shoe_id from public.activities where id = (r->>'activity_id')::uuid) is null, 'Run before purchase must not be attributed';
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000001', false);
do $$ declare g jsonb; daily jsonb; begin
  g := public.gear_analytics('2026-10-31');
  select s into daily from jsonb_array_elements(g->'shoes') s where s->>'title' = 'Daily';
  assert (daily->>'total_m')::numeric = 110000 and (daily->>'runs')::int = 1, 'Total = baseline + one run: ' || daily::text;
  assert (daily->>'cost_per_km')::numeric = 18, 'Cost per km over tracked distance';
  assert (g->>'unassigned_runs_90d')::int = 1, 'One pre-purchase run left unassigned';
  -- Reassign then delete: totals follow the activities, no stale counters.
  perform public.assign_shoe(array(select id from activities where shoe_id is not null), 'a5100000-0000-4000-8000-000000000002');
  g := public.gear_analytics('2026-10-31');
  assert (select (s->>'total_m')::numeric from jsonb_array_elements(g->'shoes') s where s->>'title' = 'Daily') = 100000;
  assert (select (s->>'total_m')::numeric from jsonb_array_elements(g->'shoes') s where s->>'title' = 'Racer') = 10000;
  delete from activities where shoe_id = 'a5100000-0000-4000-8000-000000000002';
  assert (select (s->>'total_m')::numeric from jsonb_array_elements(public.gear_analytics('2026-10-31')->'shoes') s where s->>'title' = 'Racer') = 0, 'Deletion removes mileage';
  insert into shoe_wear_observations(user_id, shoe_id, rating, note) values (auth.uid(), 'a5100000-0000-4000-8000-000000000001', 3, 'Outsole worn at heel');
  update shoes set is_default = true where id = 'a5100000-0000-4000-8000-000000000002';
  assert (select count(*) from shoes where is_default) = 1 and (select is_default from shoes where title = 'Racer'), 'Default moves, never duplicates';
end $$;
reset role;
