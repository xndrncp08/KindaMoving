-- Calculate totals in PostgreSQL so a bounded activity list cannot undercount shoes.
create function public.running_summary(week_start date) returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
 'count',(select count(*) from public.activities where user_id=auth.uid()),
 'distance_m',(select coalesce(sum(distance_m),0) from public.activities where user_id=auth.uid()),
 'weekly_distance_m',(select coalesce(sum(distance_m),0) from public.activities where user_id=auth.uid() and started_at>=week_start and started_at<week_start+7),
 'shoes',(select coalesce(jsonb_object_agg(s.id,s.initial_distance_m+coalesce((select sum(a.distance_m) from public.activities a where a.shoe_id=s.id and a.user_id=auth.uid()),0)),'{}'::jsonb) from public.shoes s where s.user_id=auth.uid())
)
$$;
revoke all on function public.running_summary(date) from public;
grant execute on function public.running_summary(date) to authenticated;
