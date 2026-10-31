-- KM Train: structured workouts, generated plans, compliance and missed-workout changes.
alter table public.workouts
  add column kind text not null default 'easy' check (kind in ('easy', 'long', 'tempo', 'intervals', 'recovery', 'race', 'cross', 'rest')),
  add column status text not null default 'planned' check (status in ('planned', 'completed', 'missed', 'skipped')),
  add column steps jsonb not null default '[]' check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 40),
  add column planned_distance_m numeric check (planned_distance_m between 0 and 100000),
  add column plan_id uuid,
  add column activity_id uuid,
  add column route_id uuid,
  add column compliance jsonb,
  add column moved_from date,
  add constraint workouts_plan foreign key (plan_id, user_id) references public.training_plans(id, user_id) on delete cascade,
  add constraint workouts_activity foreign key (activity_id, user_id) references public.activities(id, user_id) on delete set null (activity_id),
  add constraint workouts_route foreign key (route_id, user_id) references public.routes(id, user_id) on delete set null (route_id);
update public.workouts set status = 'completed' where completed;
create index workouts_plan on public.workouts(plan_id) where plan_id is not null;
create index workouts_activity on public.workouts(activity_id) where activity_id is not null;
create index workouts_route on public.workouts(route_id) where route_id is not null;

-- `completed` (Phase 1 API) and `status` stay consistent whichever one a client writes.
create function private.sync_workout_status() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.completed then new.status := 'completed'; end if;
  elsif new.status is distinct from old.status then
    new.completed := new.status = 'completed';
  elsif new.completed is distinct from old.completed then
    new.status := case when new.completed then 'completed' else 'planned' end;
  end if;
  new.completed := new.status = 'completed';
  return new;
end $$;
revoke all on function private.sync_workout_status() from public;
create trigger sync_workout_status before insert or update on public.workouts for each row execute function private.sync_workout_status();

alter table public.training_plans
  add column race text check (race in ('5k', '10k', 'half', 'marathon')),
  add column race_date date,
  add column settings jsonb not null default '{}',
  add column paces jsonb;

-- Plans are created atomically: the plan and every workout, or nothing.
create function public.create_training_plan(p_plan jsonb, p_workouts jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare plan_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_array_length(p_workouts) > 400 then raise exception 'Plan too large' using errcode = 'check_violation'; end if;
  insert into public.training_plans(user_id, title, starts_on, ends_on, goal, race, race_date, settings, paces)
  values (auth.uid(), left(p_plan->>'title', 120), (p_plan->>'starts_on')::date, (p_plan->>'ends_on')::date, left(coalesce(p_plan->>'goal', ''), 2000),
          p_plan->>'race', (p_plan->>'race_date')::date, coalesce(p_plan->'settings', '{}'), p_plan->'paces')
  returning id into plan_id;
  insert into public.workouts(user_id, plan_id, title, scheduled_on, description, kind, steps, planned_distance_m)
  select auth.uid(), plan_id, left(w->>'title', 120), (w->>'scheduled_on')::date, left(coalesce(w->>'description', ''), 2000),
         w->>'kind', coalesce(w->'steps', '[]'), (w->>'planned_distance_m')::numeric
  from jsonb_array_elements(p_workouts) w;
  return plan_id;
end $$;

-- Applies reconciliation changes the athlete accepted. Invoker: RLS confines it to their rows.
create function public.apply_training_changes(p_changes jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare c jsonb; n integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  for c in select * from jsonb_array_elements(p_changes) loop
    case c->>'type'
      when 'link' then
        update public.workouts set activity_id = (c->>'activity_id')::uuid, status = 'completed',
          compliance = jsonb_build_object('grade', c->>'compliance', 'ratio', (c->>'ratio')::numeric)
        where id = (c->>'workout_id')::uuid and user_id = auth.uid() and status in ('planned', 'missed');
      when 'missed' then
        update public.workouts set status = 'missed' where id = (c->>'workout_id')::uuid and user_id = auth.uid() and status = 'planned';
      when 'skip' then
        update public.workouts set status = 'skipped', compliance = jsonb_build_object('reason', left(c->>'reason', 200))
        where id = (c->>'workout_id')::uuid and user_id = auth.uid() and status in ('planned', 'missed');
      when 'move' then
        update public.workouts set moved_from = coalesce(moved_from, scheduled_on), scheduled_on = (c->>'to')::date, status = 'planned'
        where id = (c->>'workout_id')::uuid and user_id = auth.uid() and status in ('planned', 'missed');
      else raise exception 'Unknown change' using errcode = 'check_violation';
    end case;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.create_training_plan(jsonb, jsonb), public.apply_training_changes(jsonb) from public, anon;
grant execute on function public.create_training_plan(jsonb, jsonb), public.apply_training_changes(jsonb) to authenticated;
