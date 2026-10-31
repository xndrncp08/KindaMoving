-- Training: status/completed consistency, atomic plan creation, change application, ownership.
insert into auth.users values ('a4000000-0000-4000-8000-000000000001'), ('a4000000-0000-4000-8000-000000000002') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000001', false);
do $$ declare plan uuid; w1 uuid; w2 uuid; a uuid := 'a4100000-0000-4000-8000-000000000001'; n int; begin
  insert into activities(id, user_id, title, started_at, distance_m, elapsed_s) values (a, auth.uid(), 'Tempo', '2026-11-03', 9000, 2700);
  plan := public.create_training_plan('{"title":"Half","starts_on":"2026-11-02","ends_on":"2027-02-28","race":"half","race_date":"2027-02-28"}',
    '[{"title":"Tempo","scheduled_on":"2026-11-03","kind":"tempo","planned_distance_m":9500,"steps":[]},{"title":"Easy","scheduled_on":"2026-11-04","kind":"easy","planned_distance_m":6000}]');
  select id into w1 from workouts where scheduled_on = '2026-11-03';
  select id into w2 from workouts where scheduled_on = '2026-11-04';
  n := public.apply_training_changes(jsonb_build_array(jsonb_build_object('type', 'link', 'workout_id', w1, 'activity_id', a, 'compliance', 'completed', 'ratio', 0.95)));
  assert n = 1 and (select completed from workouts where id = w1), 'Linking completes the workout and the legacy flag';
  update workouts set completed = false where id = w1;
  assert (select status from workouts where id = w1) = 'planned', 'Legacy completed=false reopens';
  perform public.apply_training_changes(jsonb_build_array(jsonb_build_object('type', 'move', 'workout_id', w2, 'to', '2026-11-06')));
  assert (select moved_from from workouts where id = w2) = '2026-11-04' and (select scheduled_on from workouts where id = w2) = '2026-11-06';
  begin perform public.create_training_plan('{"title":"Bad","starts_on":"2026-11-02","ends_on":"2027-02-28"}', '[{"title":"x","scheduled_on":"2026-11-03","kind":"sprint"}]');
    raise exception 'Invalid kind must roll back the whole plan'; exception when check_violation then null; end;
  assert (select count(*) from training_plans) = 1, 'Failed plan must leave nothing behind';
  delete from activities where id = a;
  assert (select activity_id from workouts where id = w1) is null, 'Deleting the run unlinks it';
end $$;
select set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-000000000002', false);
do $$ begin
  assert public.apply_training_changes(jsonb_build_array(jsonb_build_object('type', 'skip', 'workout_id',
    (select id from public.workouts limit 1), 'reason', 'x'))) = 0, 'Cannot change another user''s workouts';
  assert (select count(*) from workouts) = 0;
end $$;
reset role;
