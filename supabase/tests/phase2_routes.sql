-- Route geometry RPC, derived distance, network isolation.
insert into auth.users values ('a2000000-0000-4000-8000-0000000000a2') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-0000000000a2', false);
do $$ declare r uuid; d numeric; begin
  r := public.save_route(null, 'River loop', '', '{"type":"LineString","coordinates":[[-114.07,51.05],[-114.06,51.05]]}', 'generated', '[]', '{"score":1}', null);
  select distance_m into d from routes where id = r;
  assert abs(d - 700.6) < 1.5, 'Geodesic distance expected ~700 m, got ' || d;
  begin perform public.save_route(null, 'Bad', '', '{"type":"Point","coordinates":[0,0]}', 'generated', '[]', null, null); raise exception 'Expected rejection';
  exception when check_violation then null; end;
  begin perform public.save_route(null, 'Bad', '', '{"type":"LineString","coordinates":[[0,0]]}', 'drawn', '[]', null, null); raise exception 'Expected rejection';
  exception when check_violation then null; end;
  begin update routes set distance_m = 42 where id = r; raise exception 'Distance must be derived';
  exception when check_violation then null; end;
  update routes set title = 'Renamed' where id = r;
  begin perform count(*) from network_edges; raise exception 'Network must not be client-readable';
  exception when insufficient_privilege then null; end;
  delete from routes;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-0000000000a2', false);
do $$ declare i int; ok boolean; begin
  for i in 1..3 loop ok := public.hit_rate_limit('route_generate', 3, 60); assert ok, 'Within limit'; end loop;
  assert not public.hit_rate_limit('route_generate', 3, 60), 'Fourth hit must be limited';
  assert public.hit_rate_limit('other_action', 3, 60), 'Limits are per action';
end $$;
reset role;
