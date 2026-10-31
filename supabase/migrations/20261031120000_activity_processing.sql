-- Phase 2: timestamped activities, processed streams, idempotent imports and a
-- leased job queue with an enforced state machine.

-- ---------------------------------------------------------------- activities
alter table public.activities
  add column start_time timestamptz,
  add column utc_offset_s integer check (utc_offset_s between -50400 and 50400),
  add column moving_s integer check (moving_s >= 0 and moving_s <= 604800),
  add column elevation_gain_m numeric check (elevation_gain_m >= 0),
  add column elevation_loss_m numeric check (elevation_loss_m >= 0),
  add column avg_hr numeric check (avg_hr between 20 and 260),
  add column max_hr numeric check (max_hr between 20 and 260),
  add column avg_cadence numeric check (avg_cadence between 0 and 400),
  add column sport text not null default 'running' check (length(sport) between 1 and 40),
  add column source text not null default 'manual' check (source in ('manual', 'file', 'coros')),
  add column source_ref text check (length(source_ref) <= 200),
  add column device jsonb not null default '{}',
  add column metrics jsonb not null default '{}',
  add column weather jsonb,
  add column track extensions.geometry(LineString, 4326),
  add column analytics_version text;
comment on column public.activities.started_at is 'Local calendar date of the start (athlete time zone).';
comment on column public.activities.start_time is 'Exact UTC start instant; null for manual entries.';
-- One record per provider object: the idempotency key for COROS label IDs and file hashes.
create unique index activities_source_ref on public.activities(user_id, source, source_ref) where source_ref is not null;
create index activities_start_time on public.activities(user_id, start_time desc) where start_time is not null;
create index activities_track on public.activities using gist(track);

create table public.activity_streams (
  activity_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  point_count integer not null check (point_count between 2 and 20001),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (activity_id, user_id) references public.activities(id, user_id) on delete cascade
);
alter table public.activity_streams enable row level security;
create policy own_records on public.activity_streams to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.activity_streams from anon, authenticated;
grant select, delete on public.activity_streams to authenticated;
create index activity_streams_owner on public.activity_streams(user_id);
create trigger updated_at before update on public.activity_streams for each row execute function public.touch_updated_at();

alter table public.activity_splits
  add column kind text not null default 'km' check (kind in ('km', 'lap')),
  add column moving_s integer check (moving_s >= 0),
  add column avg_hr numeric,
  add column elevation_gain_m numeric,
  add column start_offset_s numeric;
alter table public.activity_splits drop constraint activity_splits_activity_id_split_index_key;
alter table public.activity_splits add constraint activity_splits_unique unique (activity_id, kind, split_index);
alter table public.activity_splits drop constraint activity_splits_elapsed_s_check;
alter table public.activity_splits add constraint activity_splits_elapsed_s_check check (elapsed_s >= 0);

-- ------------------------------------------------------------------- uploads
alter table public.activity_uploads
  add column sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  add column activity_id uuid,
  add column error text check (length(error) <= 500),
  add constraint activity_uploads_activity foreign key (activity_id, user_id) references public.activities(id, user_id) on delete set null (activity_id);
alter table public.activity_uploads drop constraint activity_uploads_status_check;
alter table public.activity_uploads add constraint activity_uploads_status_check check (status in ('pending', 'processing', 'complete', 'duplicate', 'failed'));
create unique index activity_uploads_hash on public.activity_uploads(user_id, sha256) where sha256 is not null;
create index activity_uploads_activity on public.activity_uploads(activity_id) where activity_id is not null;

-- The hash makes repeat uploads idempotent: the caller deletes its new object on a duplicate.
drop function public.register_upload(text, text, integer, text);
create function public.register_upload(filename text, format text, size_bytes integer, object_path text, sha256 text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing uuid; result uuid;
begin
  if auth.uid() is null or split_part(object_path, '/', 1) <> auth.uid()::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'activity-files' and o.name = object_path) then
    raise exception 'Invalid upload';
  end if;
  select u.id into existing from public.activity_uploads u where u.user_id = auth.uid() and u.sha256 = register_upload.sha256;
  if existing is not null then
    return jsonb_build_object('id', existing, 'duplicate', true);
  end if;
  insert into public.activity_uploads(user_id, filename, format, size_bytes, object_path, sha256)
  values (auth.uid(), filename, format, size_bytes, object_path, register_upload.sha256) returning id into result;
  return jsonb_build_object('id', result, 'duplicate', false);
end $$;
revoke all on function public.register_upload(text, text, integer, text, text) from public, anon;
grant execute on function public.register_upload(text, text, integer, text, text) to authenticated;

-- ----------------------------------------------------------------- job queue
-- sync_jobs becomes the general durable job queue (name kept for compatibility).
alter table public.sync_jobs drop constraint sync_jobs_status_check;
update public.sync_jobs set status = case status when 'pending' then 'queued' when 'processing' then 'running' when 'complete' then 'succeeded' else status end;
alter table public.sync_jobs
  alter column status set default 'queued',
  add constraint sync_jobs_status_check check (status in ('queued', 'running', 'retry_wait', 'succeeded', 'failed', 'cancelled')),
  add column kind text not null default 'coros_sync' check (kind in ('activity_import', 'coros_sync', 'coros_fit_import', 'coros_workout_push', 'coros_route_push', 'conditions_official', 'form_analysis')),
  add column payload jsonb not null default '{}',
  add column result jsonb,
  add column error_message text check (length(error_message) <= 500),
  add column progress jsonb not null default '{}',
  add column attempts integer not null default 0 check (attempts >= 0),
  add column max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  add column run_after timestamptz not null default now(),
  add column lease_until timestamptz,
  add column locked_by text,
  add column cancel_requested boolean not null default false,
  add column idempotency_key text check (length(idempotency_key) <= 200),
  add column started_at timestamptz,
  add column finished_at timestamptz;
alter table public.sync_jobs alter column kind drop default;
create unique index sync_jobs_idempotency on public.sync_jobs(user_id, kind, idempotency_key) where idempotency_key is not null;
create index sync_jobs_ready on public.sync_jobs(run_after) where status in ('queued', 'retry_wait');
create index sync_jobs_leased on public.sync_jobs(lease_until) where status = 'running';
create index sync_jobs_account on public.sync_jobs(account_id) where account_id is not null;

create table public.sync_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.sync_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  from_status text,
  to_status text not null,
  detail text check (length(detail) <= 500),
  created_at timestamptz not null default now()
);
alter table public.sync_job_events enable row level security;
create policy own_records on public.sync_job_events for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.sync_job_events from anon, authenticated;
grant select on public.sync_job_events to authenticated;
create index sync_job_events_job on public.sync_job_events(job_id, id);
create index sync_job_events_owner on public.sync_job_events(user_id, created_at desc);

-- Explicit state machine. Any transition not listed here is rejected, whoever attempts it.
create function private.job_transition() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.sync_job_events(job_id, user_id, to_status) values (new.id, new.user_id, new.status);
    return new;
  end if;
  if new.status is distinct from old.status then
    if not (old.status, new.status) in (
      ('queued', 'running'), ('queued', 'cancelled'),
      ('running', 'succeeded'), ('running', 'failed'), ('running', 'retry_wait'), ('running', 'queued'), ('running', 'cancelled'),
      ('retry_wait', 'running'), ('retry_wait', 'cancelled'),
      ('failed', 'queued')
    ) then
      raise exception 'Invalid job transition % -> %', old.status, new.status using errcode = 'check_violation';
    end if;
    if new.status in ('succeeded', 'failed', 'cancelled') then
      new.finished_at = now(); new.lease_until = null; new.locked_by = null;
    elsif new.status in ('queued', 'retry_wait') then
      new.lease_until = null; new.locked_by = null; new.finished_at = null;
    end if;
    insert into public.sync_job_events(job_id, user_id, from_status, to_status, detail)
    values (new.id, new.user_id, old.status, new.status, coalesce(new.error_code, ''));
  end if;
  return new;
end $$;
revoke all on function private.job_transition() from public;
create trigger job_transition after insert on public.sync_jobs for each row execute function private.job_transition();
create trigger job_transition_update before update on public.sync_jobs for each row execute function private.job_transition();

-- User-facing queue operations. Kinds that mutate external accounts are only enqueued
-- after an explicit confirmation step in the API, never implicitly.
create function public.enqueue_job(p_kind text, p_payload jsonb, p_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_job uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_kind not in ('activity_import', 'coros_sync', 'coros_workout_push', 'coros_route_push', 'form_analysis') then
    raise exception 'Unsupported job kind' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.sync_jobs j where j.user_id = auth.uid() and j.status in ('queued', 'running', 'retry_wait')) >= 25 then
    raise exception 'Too many pending jobs' using errcode = 'check_violation';
  end if;
  insert into public.sync_jobs(user_id, kind, payload, idempotency_key, account_id)
  values (auth.uid(), p_kind, coalesce(p_payload, '{}'), p_key,
          (select a.id from public.connected_provider_accounts a where a.user_id = auth.uid() and a.provider = 'coros' and p_kind like 'coros%'))
  on conflict (user_id, kind, idempotency_key) where idempotency_key is not null do nothing
  returning id into v_job;
  if v_job is null then
    select j.id into v_job from public.sync_jobs j where j.user_id = auth.uid() and j.kind = p_kind and j.idempotency_key = p_key;
    -- A failed job with the same key is retried rather than duplicated.
    update public.sync_jobs set status = 'queued', attempts = 0, run_after = now(), error_code = null, error_message = null
    where id = v_job and status = 'failed';
  end if;
  return v_job;
end $$;

create function public.cancel_job(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare s text;
begin
  select status into s from public.sync_jobs where id = p_id and user_id = auth.uid() for update;
  if s is null then raise exception 'Job not found'; end if;
  if s in ('queued', 'retry_wait') then
    update public.sync_jobs set status = 'cancelled' where id = p_id;
    return 'cancelled';
  elsif s = 'running' then
    update public.sync_jobs set cancel_requested = true where id = p_id;
    return 'cancel_requested';
  end if;
  return s;
end $$;
revoke all on function public.enqueue_job(text, jsonb, text), public.cancel_job(uuid) from public, anon;
grant execute on function public.enqueue_job(text, jsonb, text), public.cancel_job(uuid) to authenticated;

-- Worker operations: service_role only. Leases make crashed workers recoverable;
-- SKIP LOCKED lets several workers claim disjoint jobs without blocking.
create function public.claim_jobs(p_worker text, p_limit integer, p_lease_s integer, p_kinds text[] default null)
returns setof public.sync_jobs language plpgsql security definer set search_path = '' as $$
begin
  update public.sync_jobs
  set status = case when attempts >= max_attempts then 'failed' else 'queued' end,
      error_code = 'lease_expired', error_message = 'Worker stopped before finishing; resumed automatically.'
  where status = 'running' and lease_until < now();
  return query
  update public.sync_jobs j
  set status = 'running', attempts = j.attempts + 1, lease_until = now() + make_interval(secs => p_lease_s),
      locked_by = p_worker, started_at = coalesce(j.started_at, now())
  where j.id in (
    select q.id from public.sync_jobs q
    where q.status in ('queued', 'retry_wait') and q.run_after <= now() and (p_kinds is null or q.kind = any(p_kinds))
    order by q.run_after limit least(p_limit, 20) for update skip locked
  )
  returning j.*;
end $$;

create function public.heartbeat_job(p_id uuid, p_worker text, p_lease_s integer, p_progress jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare cancel boolean;
begin
  update public.sync_jobs set lease_until = now() + make_interval(secs => p_lease_s), progress = coalesce(p_progress, progress)
  where id = p_id and locked_by = p_worker and status = 'running' returning cancel_requested into cancel;
  if cancel is null then raise exception 'Lease lost' using errcode = 'lock_not_available'; end if;
  return cancel;
end $$;

create function public.finish_job(p_id uuid, p_worker text, p_status text, p_result jsonb, p_code text, p_message text, p_retry_after_s integer)
returns text language plpgsql security definer set search_path = '' as $$
declare j public.sync_jobs; next_status text;
begin
  select * into j from public.sync_jobs where id = p_id and locked_by = p_worker and status = 'running' for update;
  if j.id is null then raise exception 'Lease lost' using errcode = 'lock_not_available'; end if;
  next_status := case
    when p_status = 'succeeded' then 'succeeded'
    when p_status = 'cancelled' then 'cancelled'
    when p_retry_after_s is not null and j.attempts < j.max_attempts then 'retry_wait'
    else 'failed' end;
  update public.sync_jobs
  set status = next_status, result = coalesce(p_result, result), error_code = p_code, error_message = left(p_message, 500),
      run_after = case when next_status = 'retry_wait' then now() + make_interval(secs => p_retry_after_s) else run_after end
  where id = p_id;
  return next_status;
end $$;
revoke all on function public.claim_jobs(text, integer, integer, text[]), public.heartbeat_job(uuid, text, integer, jsonb),
  public.finish_job(uuid, text, text, jsonb, text, text, integer) from public, anon, authenticated;
grant execute on function public.claim_jobs(text, integer, integer, text[]), public.heartbeat_job(uuid, text, integer, jsonb),
  public.finish_job(uuid, text, text, jsonb, text, text, integer) to service_role;

-- --------------------------------------------------------------- import RPC
-- One transaction: dedupe/reconcile, activity row, splits/laps, streams, upload status.
-- Outcomes: created | existing (same source object) | duplicate (another device record
-- of the same run) | merged (a manual entry upgraded with device data).
create function public.import_activity(p_user uuid, p_source text, p_source_ref text, p_upload uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s jsonb := p->'summary';
  t_start timestamptz := (p->>'start_time')::timestamptz;
  dist numeric := (s->>'distance_m')::numeric;
  local_date date := (p->>'local_date')::date;
  v_id uuid; outcome text; title text;
begin
  if p_source not in ('file', 'coros') or dist is null or dist <= 0 then raise exception 'Invalid import payload'; end if;
  select id into v_id from public.activities where user_id = p_user and source = p_source and source_ref = p_source_ref;
  if v_id is not null then
    outcome := 'existing';
  else
    -- The same run recorded through another channel (e.g. COROS sync and a manual FIT upload).
    select id into v_id from public.activities
    where user_id = p_user and start_time between t_start - interval '2 minutes' and t_start + interval '2 minutes'
      and abs(distance_m - dist) <= 0.05 * dist
    order by abs(extract(epoch from start_time - t_start)) limit 1;
    if v_id is not null then
      outcome := 'duplicate';
    else
      -- Reconcile exactly one same-day manual entry within 10 % distance; ambiguity creates a new record.
      select id into v_id from public.activities
      where user_id = p_user and source = 'manual' and start_time is null and started_at = local_date
        and abs(distance_m - dist) <= 0.10 * dist;
      if v_id is not null and (select count(*) from public.activities where user_id = p_user and source = 'manual' and start_time is null and started_at = local_date and abs(distance_m - dist) <= 0.10 * dist) = 1 then
        outcome := 'merged';
      else
        v_id := null;
        outcome := 'created';
      end if;
    end if;
  end if;

  if outcome in ('created', 'merged') then
    title := coalesce(nullif(left(p->>'name', 120), ''), initcap(replace(p->>'sport', '_', ' ')) || ' · ' || to_char(local_date, 'Mon DD'));
    if outcome = 'created' then
      insert into public.activities(user_id, title, started_at, distance_m, elapsed_s, source, source_ref)
      values (p_user, title, local_date, dist, greatest(1, round((s->>'elapsed_s')::numeric)), p_source, p_source_ref)
      returning id into v_id;
    end if;
    update public.activities set
      started_at = local_date, start_time = t_start, utc_offset_s = (p->>'utc_offset_s')::integer,
      distance_m = dist, elapsed_s = greatest(1, round((s->>'elapsed_s')::numeric)), moving_s = round((s->>'moving_s')::numeric),
      elevation_gain_m = (s->>'elevation_gain_m')::numeric, elevation_loss_m = (s->>'elevation_loss_m')::numeric,
      avg_hr = (s->>'avg_hr')::numeric, max_hr = (s->>'max_hr')::numeric, avg_cadence = (s->>'avg_cadence')::numeric,
      sport = coalesce(p->>'sport', 'running'), source = p_source, source_ref = p_source_ref,
      device = coalesce(p->'device', '{}'),
      metrics = (s - 'splits' - 'laps') || jsonb_build_object('stoppages', p->'stoppages', 'quality', p->'quality', 'warnings', p->'warnings',
                 'distance_source', p->>'distance_source', 'timezone_assumed', (p->>'timezone_assumed')::boolean, 'crosses_midnight', (p->>'crosses_midnight')::boolean),
      track = case when p->'track' is null or jsonb_typeof(p->'track') = 'null' then null
                   else extensions.st_setsrid(extensions.st_geomfromgeojson(p->'track'), 4326) end,
      analytics_version = p->>'version'
    where id = v_id;
    delete from public.activity_splits where activity_id = v_id;
    insert into public.activity_splits(user_id, activity_id, kind, split_index, distance_m, elapsed_s, moving_s, avg_hr, elevation_gain_m, start_offset_s)
    select p_user, v_id, 'km', (x->>'index')::int, (x->>'distance_m')::numeric, round((x->>'elapsed_s')::numeric), round((x->>'moving_s')::numeric),
           (x->>'avg_hr')::numeric, (x->>'elevation_gain_m')::numeric, null
    from jsonb_array_elements(coalesce(s->'splits', '[]')) x where (x->>'distance_m')::numeric > 0
    union all
    select p_user, v_id, 'lap', (x->>'index')::int, greatest((x->>'distance_m')::numeric, 0.1), round((x->>'elapsed_s')::numeric), round((x->>'moving_s')::numeric),
           (x->>'avg_hr')::numeric, null, (x->>'start_offset_s')::numeric
    from jsonb_array_elements(coalesce(s->'laps', '[]')) x;
    insert into public.activity_streams(activity_id, user_id, point_count, data)
    values (v_id, p_user, jsonb_array_length(p->'streams'->'t'), p->'streams')
    on conflict (activity_id) do update set point_count = excluded.point_count, data = excluded.data;
  end if;

  if p_upload is not null then
    update public.activity_uploads set status = case when outcome = 'duplicate' then 'duplicate' else 'complete' end, activity_id = v_id, error = null
    where id = p_upload and user_id = p_user;
  end if;
  return jsonb_build_object('activity_id', v_id, 'outcome', outcome);
end $$;
revoke all on function public.import_activity(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_activity(uuid, text, text, uuid, jsonb) to service_role;

create function public.mark_upload(p_user uuid, p_upload uuid, p_status text, p_error text)
returns void language sql security definer set search_path = '' as $$
  update public.activity_uploads set status = p_status, error = left(p_error, 500) where id = p_upload and user_id = p_user;
$$;
revoke all on function public.mark_upload(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.mark_upload(uuid, uuid, text, text) to service_role;

-- ------------------------------------------------- client write boundaries
-- Clients may write only manual-entry fields; provenance, metrics and geometry are worker-owned.
revoke insert, update on public.activities from anon, authenticated;
grant insert (id, user_id, title, started_at, distance_m, elapsed_s, shoe_id) on public.activities to authenticated;
grant update (title, started_at, distance_m, elapsed_s, shoe_id) on public.activities to authenticated;
-- Imported measurements stay consistent with their streams and splits: only title and shoe are editable.
create function private.protect_imported() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.source <> 'manual' and current_user = 'authenticated'
     and (new.distance_m, new.elapsed_s, new.started_at) is distinct from (old.distance_m, old.elapsed_s, old.started_at) then
    raise exception 'Imported measurements are read-only' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function private.protect_imported() from public;
create trigger protect_imported before update on public.activities for each row execute function private.protect_imported();
