-- comparable_candidates: owner-scoped, distance/time filtered, bounded simplified tracks.
insert into auth.users values ('e0000000-0000-4000-8000-000000000005'), ('f0000000-0000-4000-8000-000000000006') on conflict do nothing;
reset role;
set role service_role;
do $$ declare uid uuid := 'e0000000-0000-4000-8000-000000000005'; i int; p jsonb; begin
  for i in 1..5 loop
    p := jsonb_build_object('sport', 'running', 'start_time', format('2026-09-%sT13:00:00+00:00', lpad((i * 3)::text, 2, '0')), 'local_date', format('2026-09-%s', lpad((i * 3)::text, 2, '0')),
      'utc_offset_s', 0, 'summary', jsonb_build_object('distance_m', case when i = 5 then 3000 else 10000 + i * 100 end, 'elapsed_s', 3000, 'moving_s', 3000),
      'streams', jsonb_build_object('t', jsonb_build_array(0, 1)),
      'track', jsonb_build_object('type', 'LineString', 'coordinates', (select jsonb_agg(jsonb_build_array(-114.07 + k * 0.00001, 51.04)) from generate_series(0, 2000) k)));
    perform public.import_activity(uid, 'file', md5(i::text) || md5(i::text), null, p);
  end loop;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000005', false);
do $$ declare target uuid; n int; pts int; begin
  select id into target from activities where started_at = '2026-09-12';
  select count(*) into n from public.comparable_candidates(target);
  -- 3 earlier 10 km runs + itself; the 3 km run and the later run are excluded.
  assert n = 4, 'Expected 4 candidates, got ' || n;
  select max(json_array_length(track_coords)) into pts from public.comparable_candidates(target);
  assert pts < 50, 'Straight 2001-point track must simplify, got ' || pts;
end $$;
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000006', false);
do $$ begin
  assert (select count(*) from public.comparable_candidates((select id from public.activities limit 1))) = 0, 'Other users see nothing';
end $$;
reset role;
