-- KM Conditions: crowdsourced + official runnability reports with votes, moderation and
-- reporter masking. Confidence is computed by the documented model in the web tier.

create table public.condition_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,  -- null only for official sources; deleting an account removes its reports
  kind text not null check (kind in ('ice', 'snow', 'wet', 'flooding', 'construction', 'obstruction', 'lighting', 'surface', 'closure', 'other')),
  severity smallint not null default 2 check (severity between 1 and 3),
  location extensions.geography(Point, 4326) not null,
  observed_at timestamptz not null,
  ends_at timestamptz,
  description text not null default '' check (length(description) <= 500),
  status text not null default 'active' check (status in ('active', 'hidden', 'removed')),
  source text not null default 'user' check (source in ('user', 'official')),
  source_ref text check (length(source_ref) <= 300),
  source_name text check (length(source_name) <= 120),
  client_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source = 'user') = (user_id is not null)),
  unique (user_id, client_id),
  unique (source, source_ref)
);
create index condition_reports_location on public.condition_reports using gist(location);
create index condition_reports_active on public.condition_reports(observed_at desc) where status = 'active';
create index condition_reports_owner on public.condition_reports(user_id, created_at desc);
create trigger updated_at before update on public.condition_reports for each row execute function public.touch_updated_at();

create table public.condition_votes (
  report_id uuid not null references public.condition_reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote text not null check (vote in ('confirm', 'clear', 'flag')),
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);
create index condition_votes_user on public.condition_votes(user_id, created_at desc);

alter table public.condition_reports enable row level security;
alter table public.condition_votes enable row level security;
-- Reporters see and delete their own rows; everyone else reads through conditions_near(), which masks identity.
create policy own_reports on public.condition_reports for select to authenticated using ((select auth.uid()) = user_id);
create policy own_reports_delete on public.condition_reports for delete to authenticated using ((select auth.uid()) = user_id);
create policy own_votes on public.condition_votes for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.condition_reports, public.condition_votes from anon, authenticated;
grant select, delete on public.condition_reports to authenticated;
grant select on public.condition_votes to authenticated;

-- Abuse limits: 8 reports/hour, 30/day; 60 votes/hour. Enforced in SQL so every client path is covered.
create function public.report_condition(p_kind text, p_severity smallint, p_lat double precision, p_lon double precision,
  p_observed_at timestamptz, p_description text, p_client_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into result from public.condition_reports where user_id = auth.uid() and client_id = p_client_id;
  if result is not null then return result; end if;  -- offline retry of the same report
  if p_observed_at > now() + interval '5 minutes' or p_observed_at < now() - interval '72 hours' then
    raise exception 'Observation time must be within the last 72 hours' using errcode = 'check_violation';
  end if;
  if p_lat not between -90 and 90 or p_lon not between -180 and 180 then raise exception 'Invalid location' using errcode = 'check_violation'; end if;
  if (select count(*) from public.condition_reports where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 8
     or (select count(*) from public.condition_reports where user_id = auth.uid() and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Report limit reached; try again later' using errcode = 'check_violation';
  end if;
  insert into public.condition_reports(user_id, kind, severity, location, observed_at, description, client_id)
  values (auth.uid(), p_kind, p_severity, extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography,
          p_observed_at, left(trim(coalesce(p_description, '')), 500), p_client_id)
  returning id into result;
  return result;
end $$;

create function public.vote_condition(p_report uuid, p_vote text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.condition_reports;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into r from public.condition_reports where id = p_report and status = 'active';
  if r.id is null then raise exception 'Report not found'; end if;
  if r.user_id = auth.uid() then raise exception 'You cannot vote on your own report' using errcode = 'check_violation'; end if;
  if (select count(*) from public.condition_votes where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Vote limit reached; try again later' using errcode = 'check_violation';
  end if;
  insert into public.condition_votes(report_id, user_id, vote) values (p_report, auth.uid(), p_vote)
  on conflict (report_id, user_id) do update set vote = excluded.vote, created_at = now();
  -- Automatic moderation: hidden once at least 3 users flag it and flags outnumber confirmations.
  if p_vote = 'flag' and r.source = 'user' then
    update public.condition_reports set status = 'hidden'
    where id = p_report and (select count(*) from public.condition_votes where report_id = p_report and vote = 'flag') >= 3
      and (select count(*) from public.condition_votes where report_id = p_report and vote = 'flag')
          > (select count(*) from public.condition_votes where report_id = p_report and vote = 'confirm');
  end if;
end $$;

-- Masked read model. Reporter identity never leaves the database; reliability is a Beta(2,2)
-- posterior over the votes other users cast on that reporter's reports in the last 180 days.
create function public.conditions_near(p_lat double precision, p_lon double precision, p_radius_m double precision, p_since interval default interval '30 days')
returns table (id uuid, kind text, severity smallint, lat double precision, lon double precision, observed_at timestamptz,
  ends_at timestamptz, description text, source text, source_name text, own boolean, reporter_reliability double precision,
  reporter_key text, votes jsonb)
language sql stable security definer set search_path = '' as $$
  with nearby as (
    select r.* from public.condition_reports r
    where r.status = 'active' and r.observed_at > now() - p_since
      and extensions.st_dwithin(r.location, extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography, least(p_radius_m, 25000))
    limit 1000
  ), reliability as (
    select n.user_id,
      (2 + count(*) filter (where v.vote = 'confirm'))::double precision
        / (4 + count(*) filter (where v.vote = 'confirm') + count(*) filter (where v.vote = 'clear') + 2 * count(*) filter (where v.vote = 'flag')) as score
    from (select distinct user_id from nearby where user_id is not null) n
    left join public.condition_reports mine on mine.user_id = n.user_id and mine.created_at > now() - interval '180 days'
    left join public.condition_votes v on v.report_id = mine.id and v.user_id <> n.user_id
    group by n.user_id
  )
  select r.id, r.kind, r.severity, extensions.st_y(r.location::extensions.geometry), extensions.st_x(r.location::extensions.geometry),
    r.observed_at, r.ends_at, r.description, r.source, r.source_name, r.user_id = auth.uid(),
    case when r.source = 'official' then 0.95 else rel.score end,
    -- Stable per-request pseudonym so the model can treat one person's reports as one source.
    case when r.user_id is null then 'official:' || coalesce(r.source_name, '') else md5(r.user_id::text || current_date::text) end,
    coalesce((select jsonb_agg(jsonb_build_object('vote', v.vote, 'at', v.created_at,
      'voter', md5(v.user_id::text || current_date::text))) from public.condition_votes v where v.report_id = r.id), '[]')
  from nearby r left join reliability rel on rel.user_id = r.user_id
$$;
revoke all on function public.report_condition(text, smallint, double precision, double precision, timestamptz, text, uuid),
  public.vote_condition(uuid, text), public.conditions_near(double precision, double precision, double precision, interval) from public, anon;
grant execute on function public.report_condition(text, smallint, double precision, double precision, timestamptz, text, uuid),
  public.vote_condition(uuid, text), public.conditions_near(double precision, double precision, double precision, interval) to authenticated;

-- Reports near an owned route's path (40 m corridor), for suitability recalculation.
create function public.route_condition_points(p_route uuid) returns table (lat double precision, lon double precision, radius_m double precision)
language sql stable security invoker set search_path = '' as $$
  select extensions.st_y(c), extensions.st_x(c),
         (select max(extensions.st_distance(c::extensions.geography, (dp).geom::extensions.geography)) from extensions.st_dumppoints(r.path) dp) + 100
  from public.routes r, lateral (select extensions.st_centroid(r.path) as c) x
  where r.id = p_route and r.user_id = (select auth.uid()) and r.path is not null
$$;
create function public.route_corridor_ids(p_route uuid, p_ids uuid[]) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.condition_reports c, public.routes r
  where r.id = p_route and r.user_id = (select auth.uid()) and c.id = any(p_ids)
    and extensions.st_dwithin(c.location, r.path::extensions.geography, 40)
$$;
revoke all on function public.route_condition_points(uuid), public.route_corridor_ids(uuid, uuid[]) from public, anon;
grant execute on function public.route_condition_points(uuid), public.route_corridor_ids(uuid, uuid[]) to authenticated;

-- Official imports (service role): upsert by source reference, never touching user reports.
create function public.upsert_official_condition(p_source_name text, p_ref text, p_kind text, p_severity smallint, p_lat double precision,
  p_lon double precision, p_observed_at timestamptz, p_ends_at timestamptz, p_description text) returns void
language sql security definer set search_path = '' as $$
  insert into public.condition_reports(user_id, kind, severity, location, observed_at, ends_at, description, source, source_ref, source_name)
  values (null, p_kind, p_severity, extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography,
          p_observed_at, p_ends_at, left(p_description, 500), 'official', p_ref, p_source_name)
  on conflict (source, source_ref) do update set kind = excluded.kind, severity = excluded.severity, location = excluded.location,
    observed_at = excluded.observed_at, ends_at = excluded.ends_at, description = excluded.description, status = 'active';
$$;
revoke all on function public.upsert_official_condition(text, text, text, smallint, double precision, double precision, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.upsert_official_condition(text, text, text, smallint, double precision, double precision, timestamptz, timestamptz, text) to service_role;
