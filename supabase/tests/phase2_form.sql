-- Form analysis: path ownership, limits, isolation.
insert into auth.users values ('a6000000-0000-4000-8000-000000000001'), ('a6000000-0000-4000-8000-000000000002') on conflict do nothing;
insert into storage.objects(bucket_id, name) values ('form-videos', 'a6000000-0000-4000-8000-000000000001/run.mp4');
set role authenticated;
select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000001', false);
do $$ declare a uuid; begin
  a := public.request_form_analysis('a6000000-0000-4000-8000-000000000001/run.mp4', 'Side view');
  assert (select status from form_analyses where id = a) = 'queued';
  assert (select count(*) from sync_jobs where kind = 'form_analysis' and payload->>'analysis_id' = a::text) = 1, 'Job queued with analysis';
  begin perform public.request_form_analysis('a6000000-0000-4000-8000-000000000002/x.mp4', ''); raise exception 'Foreign path must fail';
  exception when raise_exception then null; end;
end $$;
select set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000002', false);
do $$ begin assert (select count(*) from form_analyses) = 0, 'Isolation'; end $$;
reset role;
