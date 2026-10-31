-- KM Gear: purchase/retirement details, default-shoe attribution for imports, wear
-- observations, and analytics computed from current activities (never stored counters).
alter table public.shoes
  add column purchase_price numeric check (purchase_price between 0 and 10000),
  add column currency text not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  add column purchased_on date,
  add column retired_on date,
  add column target_distance_m numeric not null default 700000 check (target_distance_m between 100000 and 3000000),
  add column is_default boolean not null default false;
-- At most one default shoe per runner: choosing a new default moves the flag; the index guards it.
create unique index shoes_one_default on public.shoes(user_id) where is_default;
create function private.single_default_shoe() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_default then
    update public.shoes set is_default = false where user_id = new.user_id and id <> new.id and is_default;
  end if;
  return new;
end $$;
revoke all on function private.single_default_shoe() from public;
create trigger single_default_shoe before insert or update of is_default on public.shoes
  for each row when (new.is_default) execute function private.single_default_shoe();

create table public.shoe_wear_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shoe_id uuid not null,
  observed_on date not null default current_date,
  rating smallint check (rating between 1 and 5),
  note text not null default '' check (length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (shoe_id, user_id) references public.shoes(id, user_id) on delete cascade,
  unique (id, user_id)
);
alter table public.shoe_wear_observations enable row level security;
create policy own_records on public.shoe_wear_observations to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.shoe_wear_observations from anon, authenticated;
grant select, insert, delete on public.shoe_wear_observations to authenticated;
create index shoe_wear_owner on public.shoe_wear_observations(shoe_id, observed_on desc);
create trigger updated_at before update on public.shoe_wear_observations for each row execute function public.touch_updated_at();

-- Imported runs without a shoe get the owner's default shoe, if it was in service that day.
-- Manual entries are never auto-assigned; a later reassignment always wins.
create function private.attribute_default_shoe() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.shoe_id is null and new.source <> 'manual' and (tg_op = 'INSERT' or old.source = 'manual') then
    select s.id into new.shoe_id from public.shoes s
    where s.user_id = new.user_id and s.is_default and not s.retired
      and (s.purchased_on is null or s.purchased_on <= new.started_at)
      and (s.retired_on is null or s.retired_on >= new.started_at);
  end if;
  return new;
end $$;
revoke all on function private.attribute_default_shoe() from public;
create trigger attribute_default_shoe before insert or update of source on public.activities
  for each row execute function private.attribute_default_shoe();

-- Per-shoe analytics. Everything derives from activities as they are now, so imports,
-- deletions, edits and reassignments can never leave totals stale or double counted.
create function public.gear_analytics(p_today date) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with runs as (
    select a.shoe_id, a.started_at, a.distance_m, coalesce(a.moving_s, a.elapsed_s) as secs, a.avg_hr,
           coalesce(w.kind, a.metrics->'classification'->>'kind', 'unclassified') as kind
    from public.activities a
    left join public.workouts w on w.activity_id = a.id and w.user_id = a.user_id
    where a.user_id = (select auth.uid()) and a.shoe_id is not null
  ), per_shoe as (
    select s.id, s.title, s.brand, s.retired, s.retired_on, s.purchased_on, s.purchase_price, s.currency, s.is_default,
      s.target_distance_m, s.initial_distance_m,
      s.initial_distance_m + coalesce(sum(r.distance_m), 0) as total_m,
      count(r.shoe_id) as runs,
      max(r.started_at) as last_used,
      coalesce(sum(r.distance_m) filter (where r.started_at > p_today - 56), 0) as last_8w_m,
      coalesce(sum(r.distance_m) filter (where r.started_at > p_today - 30), 0) as last_30d_m
    from public.shoes s left join runs r on r.shoe_id = s.id
    where s.user_id = (select auth.uid())
    group by s.id
  )
  select jsonb_build_object(
    'shoes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'title', p.title, 'brand', p.brand, 'retired', p.retired, 'retired_on', p.retired_on, 'is_default', p.is_default,
      'total_m', p.total_m, 'runs', p.runs, 'last_used', p.last_used, 'target_m', p.target_distance_m,
      'wear_fraction', round(p.total_m / p.target_distance_m, 3),
      'cost_per_km', case when p.purchase_price is not null and p.total_m - p.initial_distance_m > 0
                          then round(p.purchase_price / ((p.total_m - p.initial_distance_m) / 1000), 2) end,
      'currency', p.currency,
      'weekly_rate_m', round(p.last_8w_m / 8),
      -- Projection at the recent 8-week rate; null when idle or already past target.
      'projected_target_on', case when p.last_8w_m > 0 and p.total_m < p.target_distance_m and not p.retired
                                  then p_today + ceil((p.target_distance_m - p.total_m) / (p.last_8w_m / 56.0))::int end,
      'by_kind', (select jsonb_object_agg(k.kind, jsonb_build_object('m', k.m, 'runs', k.n, 'pace_s_per_km', k.pace, 'avg_hr', k.hr))
                  from (select kind, sum(distance_m) m, count(*) n, round(sum(secs) / nullif(sum(distance_m) / 1000, 0)) pace, round(avg(avg_hr)) hr
                        from runs where shoe_id = p.id group by kind) k),
      'monthly', (select jsonb_agg(jsonb_build_object('month', m.mon, 'm', m.m) order by m.mon)
                  from (select to_char(date_trunc('month', started_at), 'YYYY-MM') as mon, sum(distance_m) as m
                        from runs where shoe_id = p.id and started_at > p_today - 365 group by 1) m)
    ) order by p.retired, p.last_used desc nulls last) from per_shoe p), '[]'::jsonb),
    'rotation_30d', coalesce((select jsonb_object_agg(id, last_30d_m) from per_shoe where last_30d_m > 0), '{}'::jsonb),
    'unassigned_runs_90d', (select count(*) from public.activities a where a.user_id = (select auth.uid()) and a.shoe_id is null and a.started_at > p_today - 90)
  )
$$;
revoke all on function public.gear_analytics(date) from public, anon;
grant execute on function public.gear_analytics(date) to authenticated;

-- Bulk reassignment for reconciliation (owner-checked by RLS and the composite shoe FK).
create function public.assign_shoe(p_activity_ids uuid[], p_shoe uuid) returns integer
language sql security invoker set search_path = '' as $$
  with u as (update public.activities set shoe_id = p_shoe where id = any(p_activity_ids) and user_id = (select auth.uid()) returning 1)
  select count(*)::integer from u
$$;
revoke all on function public.assign_shoe(uuid[], uuid) from public, anon;
grant execute on function public.assign_shoe(uuid[], uuid) to authenticated;
