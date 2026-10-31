-- Cover every foreign key with an index (Supabase performance advisor, 2026-10-31):
-- cascades such as account or activity deletion otherwise scan whole tables.
-- Composite owner keys get composite indexes; the partial single-column indexes they supersede are dropped.
drop index if exists public.workouts_plan, public.workouts_activity, public.workouts_route,
  public.activity_uploads_activity, public.provider_records_activity, public.sync_jobs_account;
create index activity_splits_activity_fk on public.activity_splits(activity_id, user_id);
create index shoe_assignments_activity_fk on public.shoe_assignments(activity_id, user_id);
create index shoe_assignments_shoe_fk on public.shoe_assignments(shoe_id, user_id);
create index workouts_activity_fk on public.workouts(activity_id, user_id);
create index workouts_plan_fk on public.workouts(plan_id, user_id);
create index workouts_route_fk on public.workouts(route_id, user_id);
create index route_condition_reports_route_fk on public.route_condition_reports(route_id, user_id);
create index sync_jobs_account_fk on public.sync_jobs(account_id, user_id);
create index activity_uploads_activity_fk on public.activity_uploads(activity_id, user_id);
create index activity_streams_activity_fk on public.activity_streams(activity_id, user_id);
create index provider_tokens_user_fk on private.provider_tokens(user_id);
create index provider_records_account_fk on public.provider_records(account_id, user_id);
create index provider_records_activity_fk on public.provider_records(activity_id, user_id);
create index shoe_wear_observations_shoe_fk on public.shoe_wear_observations(shoe_id, user_id);
create index shoe_wear_observations_user_fk on public.shoe_wear_observations(user_id);
