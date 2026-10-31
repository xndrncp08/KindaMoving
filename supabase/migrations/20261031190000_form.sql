-- KM Form: private video uploads, short retention, analysis results.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('form-videos', 'form-videos', false, 52428800, array['video/mp4', 'video/quicktime', 'video/x-m4v']),
       ('form-results', 'form-results', false, 52428800, array['video/mp4']);
-- Owners upload and read their own originals; results are written by the worker, readable by the owner.
create policy form_video_insert on storage.objects for insert to authenticated with check (bucket_id = 'form-videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy form_video_read on storage.objects for select to authenticated using (bucket_id in ('form-videos', 'form-results') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy form_video_delete on storage.objects for delete to authenticated using (bucket_id in ('form-videos', 'form-results') and (storage.foldername(name))[1] = (select auth.uid())::text);

create table public.form_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default '' check (length(label) <= 120),
  status text not null default 'queued' check (status in ('queued', 'processing', 'complete', 'failed')),
  video_path text,
  annotated_path text,
  result jsonb,
  error text check (length(error) <= 500),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
alter table public.form_analyses enable row level security;
create policy own_records on public.form_analyses for select to authenticated using ((select auth.uid()) = user_id);
create policy own_delete on public.form_analyses for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.form_analyses from anon, authenticated;
grant select, delete on public.form_analyses to authenticated;
create index form_analyses_owner on public.form_analyses(user_id, created_at desc);
create index form_analyses_expiry on public.form_analyses(expires_at);
create trigger updated_at before update on public.form_analyses for each row execute function public.touch_updated_at();

-- Registers an uploaded original and queues analysis in one transaction.
create function public.request_form_analysis(p_path text, p_label text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a uuid;
begin
  if auth.uid() is null or split_part(p_path, '/', 1) <> auth.uid()::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'form-videos' and o.name = p_path) then
    raise exception 'Invalid upload';
  end if;
  if (select count(*) from public.form_analyses where user_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Daily form analysis limit reached' using errcode = 'check_violation';
  end if;
  insert into public.form_analyses(user_id, label, video_path) values (auth.uid(), left(coalesce(p_label, ''), 120), p_path) returning id into a;
  insert into public.sync_jobs(user_id, kind, payload, idempotency_key, max_attempts) values (auth.uid(), 'form_analysis', jsonb_build_object('analysis_id', a), a::text, 3);
  return a;
end $$;
revoke all on function public.request_form_analysis(text, text) from public, anon;
grant execute on function public.request_form_analysis(text, text) to authenticated;
