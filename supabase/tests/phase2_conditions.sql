-- Conditions: masking, idempotency, abuse limits, voting rules, auto-moderation, corridor matching.
insert into auth.users values ('a3000000-0000-4000-8000-000000000001'), ('a3000000-0000-4000-8000-000000000002'),
  ('a3000000-0000-4000-8000-000000000003'), ('a3000000-0000-4000-8000-000000000004') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000001', false);
do $$ declare a uuid; b uuid; i int; r uuid; begin
  a := public.report_condition('ice', 3::smallint, 51.0532, -114.0727, now() - interval '1 hour', 'Black ice under the bridge', 'c0000000-0000-4000-8000-0000000000c1');
  b := public.report_condition('ice', 3::smallint, 51.0532, -114.0727, now() - interval '1 hour', 'retry', 'c0000000-0000-4000-8000-0000000000c1');
  assert a = b, 'Offline retry must be idempotent';
  begin perform public.report_condition('ice', 2::smallint, 51.05, -114.07, now() - interval '4 days', '', gen_random_uuid()); raise exception 'Old observation must be rejected';
  exception when check_violation then null; end;
  for i in 1..7 loop perform public.report_condition('wet', 1::smallint, 51.05, -114.07, now(), '', gen_random_uuid()); end loop;
  begin perform public.report_condition('wet', 1::smallint, 51.05, -114.07, now(), '', gen_random_uuid()); raise exception 'Hourly limit expected';
  exception when check_violation then null; end;
  begin perform public.vote_condition(a, 'confirm'); raise exception 'Self-vote must fail';
  exception when check_violation then null; end;
  r := public.save_route(null, 'Bridge loop', '', '{"type":"LineString","coordinates":[[-114.0740,51.0532],[-114.0710,51.0532]]}', 'generated', '[]', null, null);
  assert (select count(*) from public.route_corridor_ids(r, array[a])) = 1, 'Report on the path must match the corridor';
  assert (select radius_m from public.route_condition_points(r)) between 200 and 220, 'Corridor radius should be ~half length + 100 m';
end $$;
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000002', false);
do $$ declare a uuid := (select id from public.conditions_near(51.0532, -114.0727, 200) where kind = 'ice'); n record; begin
  select * into n from public.conditions_near(51.0532, -114.0727, 200) where kind = 'ice';
  assert n.own = false and n.reporter_reliability = 0.5 and length(n.reporter_key) = 32, 'Masked, neutral prior reliability';
  assert (select count(*) from condition_reports) = 0, 'Other users cannot read report rows directly';
  perform public.vote_condition(a, 'confirm');
  perform public.vote_condition(a, 'flag');  -- changing one's vote replaces it
  assert (select count(*) from condition_votes) = 1;
end $$;
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000003', false);
select public.vote_condition((select id from public.conditions_near(51.0532, -114.0727, 200) where kind = 'ice'), 'flag');
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000004', false);
select public.vote_condition((select id from public.conditions_near(51.0532, -114.0727, 200) where kind = 'ice'), 'flag');
do $$ begin
  assert (select count(*) from public.conditions_near(51.0532, -114.0727, 200) where kind = 'ice') = 0, 'Three flags must hide the report';
end $$;
reset role;
-- Reporter reliability drops after their report was flagged; official upserts are idempotent.
set role service_role;
select public.upsert_official_condition('City of Calgary: Construction Detours', 'w8zq:1', 'construction', 2::smallint, 51.05, -114.07, now(), now() + interval '1 day', 'Sidewalk closed');
select public.upsert_official_condition('City of Calgary: Construction Detours', 'w8zq:1', 'construction', 2::smallint, 51.05, -114.07, now(), now() + interval '2 day', 'Sidewalk closed');
do $$ begin assert (select count(*) from public.condition_reports where source = 'official') = 1; end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000002', false);
do $$ begin
  assert (select reporter_reliability from public.conditions_near(51.05, -114.07, 500) where kind = 'wet' limit 1) < 0.5, 'Flagged reporter loses reliability';
  assert (select reporter_reliability from public.conditions_near(51.05, -114.07, 500) where source = 'official') = 0.95;
end $$;
reset role;
