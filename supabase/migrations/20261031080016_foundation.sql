create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at=now(); return new; end $$;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 preferred_name text not null check(length(preferred_name) between 1 and 120),
 country text not null default '' check(length(country)<=80), city text not null default '' check(length(city)<=100),
 experience text not null check(experience in ('new','regular','experienced')),
 weekly_distance_m numeric not null default 0 check(weekly_distance_m between 0 and 500000),
 race_distance text not null check(race_distance in ('5k','10k','half','marathon','other')),
 goals text not null default '' check(length(goals)<=2000), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_preferences (
 id uuid primary key references public.profiles(id) on delete cascade,
 units text not null default 'metric' check(units in ('metric','imperial')),
 private_profile boolean not null default true, notifications boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.shoes (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, title text not null check(length(title) between 1 and 120), brand text not null default '' check(length(brand)<=80), initial_distance_m numeric not null default 0 check(initial_distance_m between 0 and 10000000), retired boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id));
create table public.activities (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, title text not null check(length(title) between 1 and 120), started_at date not null, distance_m numeric not null check(distance_m>0 and distance_m<=500000), elapsed_s integer not null check(elapsed_s>0 and elapsed_s<=604800), shoe_id uuid, foreign key (shoe_id,user_id) references public.shoes(id,user_id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id));
create table public.activity_splits (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, activity_id uuid not null, split_index integer not null check(split_index>=0), distance_m numeric not null check(distance_m>0), elapsed_s integer not null check(elapsed_s>0), foreign key(activity_id,user_id) references public.activities(id,user_id) on delete cascade, unique(activity_id,split_index), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id));
create table public.routes (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, title text not null check(length(title) between 1 and 120), description text not null default '' check(length(description)<=2000), distance_m numeric not null default 0 check(distance_m between 0 and 500000), path extensions.geometry(LineString,4326), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id));
create table public.saved_routes (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, route_id uuid not null, foreign key(route_id,user_id) references public.routes(id,user_id) on delete cascade, unique(user_id,route_id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id));
create table public.shoe_assignments (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, activity_id uuid not null, shoe_id uuid not null, foreign key(activity_id,user_id) references public.activities(id,user_id) on delete cascade, foreign key(shoe_id,user_id) references public.shoes(id,user_id), unique(activity_id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id));
create table public.workouts (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, title text not null check(length(title) between 1 and 120), scheduled_on date not null, description text not null default '' check(length(description)<=2000), completed boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id));
create table public.training_plans (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, title text not null check(length(title) between 1 and 120), starts_on date not null, ends_on date not null check(ends_on>=starts_on), goal text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id));
create table public.route_condition_reports (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, route_id uuid not null, observed_at timestamptz not null, description text not null check(length(description) between 1 and 2000), location extensions.geography(Point,4326), foreign key(route_id,user_id) references public.routes(id,user_id) on delete cascade, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id));
create table public.connected_provider_accounts (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, provider text not null check(provider='coros'), status text not null default 'disconnected' check(status in ('disconnected','connected','error')), unique(user_id,provider), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id));
create table public.sync_jobs (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, account_id uuid, status text not null default 'pending' check(status in ('pending','processing','complete','failed')), error_code text, foreign key(account_id,user_id) references public.connected_provider_accounts(id,user_id) on delete cascade, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id));
create table public.activity_uploads (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, filename text not null check(length(filename)<=180), format text not null check(format in ('gpx','fit')), size_bytes integer not null check(size_bytes between 1 and 5242880), status text not null default 'pending' check(status in ('pending','processing','complete','failed')), object_path text not null unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id));
alter table public.profiles enable row level security;
create policy own_records on public.profiles to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);
grant select,insert,update,delete on public.profiles to authenticated;
create trigger updated_at before update on public.profiles for each row execute function public.touch_updated_at();
alter table public.user_preferences enable row level security;
create policy own_records on public.user_preferences to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);
grant select,insert,update,delete on public.user_preferences to authenticated;
create trigger updated_at before update on public.user_preferences for each row execute function public.touch_updated_at();
alter table public.shoes enable row level security;
create policy own_records on public.shoes to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.shoes to authenticated;
create trigger updated_at before update on public.shoes for each row execute function public.touch_updated_at();
create index shoes_owner_created on public.shoes(user_id,created_at desc);
alter table public.activities enable row level security;
create policy own_records on public.activities to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.activities to authenticated;
create trigger updated_at before update on public.activities for each row execute function public.touch_updated_at();
create index activities_owner_created on public.activities(user_id,created_at desc);
alter table public.activity_splits enable row level security;
create policy own_records on public.activity_splits to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.activity_splits to authenticated;
create trigger updated_at before update on public.activity_splits for each row execute function public.touch_updated_at();
create index activity_splits_owner_created on public.activity_splits(user_id,created_at desc);
alter table public.routes enable row level security;
create policy own_records on public.routes to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.routes to authenticated;
create trigger updated_at before update on public.routes for each row execute function public.touch_updated_at();
create index routes_owner_created on public.routes(user_id,created_at desc);
alter table public.saved_routes enable row level security;
create policy own_records on public.saved_routes to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.saved_routes to authenticated;
create trigger updated_at before update on public.saved_routes for each row execute function public.touch_updated_at();
create index saved_routes_owner_created on public.saved_routes(user_id,created_at desc);
alter table public.shoe_assignments enable row level security;
create policy own_records on public.shoe_assignments to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.shoe_assignments to authenticated;
create trigger updated_at before update on public.shoe_assignments for each row execute function public.touch_updated_at();
create index shoe_assignments_owner_created on public.shoe_assignments(user_id,created_at desc);
alter table public.workouts enable row level security;
create policy own_records on public.workouts to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.workouts to authenticated;
create trigger updated_at before update on public.workouts for each row execute function public.touch_updated_at();
create index workouts_owner_created on public.workouts(user_id,created_at desc);
alter table public.training_plans enable row level security;
create policy own_records on public.training_plans to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.training_plans to authenticated;
create trigger updated_at before update on public.training_plans for each row execute function public.touch_updated_at();
create index training_plans_owner_created on public.training_plans(user_id,created_at desc);
alter table public.route_condition_reports enable row level security;
create policy own_records on public.route_condition_reports to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.route_condition_reports to authenticated;
create trigger updated_at before update on public.route_condition_reports for each row execute function public.touch_updated_at();
create index route_condition_reports_owner_created on public.route_condition_reports(user_id,created_at desc);
alter table public.connected_provider_accounts enable row level security;
create policy own_records on public.connected_provider_accounts to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.connected_provider_accounts to authenticated;
create trigger updated_at before update on public.connected_provider_accounts for each row execute function public.touch_updated_at();
create index connected_provider_accounts_owner_created on public.connected_provider_accounts(user_id,created_at desc);
alter table public.sync_jobs enable row level security;
create policy own_records on public.sync_jobs to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.sync_jobs to authenticated;
create trigger updated_at before update on public.sync_jobs for each row execute function public.touch_updated_at();
create index sync_jobs_owner_created on public.sync_jobs(user_id,created_at desc);
alter table public.activity_uploads enable row level security;
create policy own_records on public.activity_uploads to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.activity_uploads to authenticated;
create trigger updated_at before update on public.activity_uploads for each row execute function public.touch_updated_at();
create index activity_uploads_owner_created on public.activity_uploads(user_id,created_at desc);
-- Provider states and ingestion results are written only by a future trusted worker.
revoke insert,update,delete on public.connected_provider_accounts, public.sync_jobs, public.activity_uploads, public.shoe_assignments from authenticated;
create index activities_date on public.activities(user_id,started_at desc);
create index activities_shoe on public.activities(shoe_id,user_id);
create index routes_path on public.routes using gist(path);
create index workouts_date on public.workouts(user_id,scheduled_on);
create function public.save_profile(input jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 insert into public.profiles(id,preferred_name,country,city,experience,weekly_distance_m,race_distance,goals)
 values(auth.uid(),input->>'preferred_name',input->>'country',input->>'city',input->>'experience',(input->>'weekly_distance_m')::numeric,input->>'race_distance',input->>'goals')
 on conflict(id) do update set preferred_name=excluded.preferred_name,country=excluded.country,city=excluded.city,experience=excluded.experience,weekly_distance_m=excluded.weekly_distance_m,race_distance=excluded.race_distance,goals=excluded.goals;
 insert into public.user_preferences(id,units,private_profile,notifications)
 values(auth.uid(),input->>'units',(input->>'private_profile')::boolean,(input->>'notifications')::boolean)
 on conflict(id) do update set units=excluded.units,private_profile=excluded.private_profile,notifications=excluded.notifications;
end $$;
revoke all on function public.save_profile(jsonb) from public;
grant execute on function public.save_profile(jsonb) to authenticated;
-- Assignment is a mirror of the canonical activity shoe_id; clients cannot forge it.
create schema if not exists private;
create function private.mirror_assignment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from public.shoe_assignments where activity_id=new.id;
 if new.shoe_id is not null then insert into public.shoe_assignments(user_id,activity_id,shoe_id) values(new.user_id,new.id,new.shoe_id); end if;
 return new;
end $$;
revoke all on function private.mirror_assignment() from public;
create trigger mirror_assignment after insert or update of shoe_id on public.activities for each row execute function private.mirror_assignment();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('activity-files','activity-files',false,5242880,array['application/octet-stream','application/gpx+xml','application/xml','text/xml']);
create policy own_upload_read on storage.objects for select to authenticated using(bucket_id='activity-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy own_upload_insert on storage.objects for insert to authenticated with check(bucket_id='activity-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy own_upload_delete on storage.objects for delete to authenticated using(bucket_id='activity-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- An invoker transaction registers only caller-owned objects; no worker success is simulated.
create function public.register_upload(filename text,format text,size_bytes integer,object_path text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null or split_part(object_path,'/',1)<>auth.uid()::text or not exists(select 1 from storage.objects o where o.bucket_id='activity-files' and o.name=object_path) then raise exception 'Invalid upload'; end if;
 insert into public.activity_uploads(user_id,filename,format,size_bytes,object_path) values(auth.uid(),filename,format,size_bytes,object_path) returning id into result;
 return result;
end $$;
revoke all on function public.register_upload(text,text,integer,text) from public;
grant execute on function public.register_upload(text,text,integer,text) to authenticated;
