-- KM Analyze: comparable-run candidates with simplified tracks, computed in SQL so the
-- analytics service receives a bounded payload instead of every full-resolution track.
create function public.comparable_candidates(p_activity uuid)
returns table (id uuid, title text, sport text, start_time timestamptz, distance_m numeric, moving_s integer,
               elapsed_s integer, elevation_gain_m numeric, avg_hr numeric, avg_cadence numeric, metrics jsonb,
               weather jsonb, track_coords json)
language sql stable security invoker set search_path = '' as $$
  with t as (select a.start_time, a.distance_m from public.activities a where a.id = p_activity and a.user_id = (select auth.uid()))
  select a.id, a.title, a.sport, a.start_time, a.distance_m, a.moving_s, a.elapsed_s, a.elevation_gain_m, a.avg_hr,
         a.avg_cadence, a.metrics - 'hr_histogram' - 'stoppages' - 'quality' - 'warnings', a.weather,
         -- ~10 m tolerance is ample for 50 m route-overlap tests and caps payload size.
         (extensions.st_asgeojson(extensions.st_simplify(a.track, 0.0001))::json)->'coordinates'
  from public.activities a, t
  where a.user_id = (select auth.uid()) and a.start_time is not null
    and a.start_time between t.start_time - interval '365 days' and t.start_time + interval '1 second'
    and a.distance_m between t.distance_m * 0.75 and t.distance_m * 1.33
  order by abs(ln(a.distance_m / t.distance_m)), a.start_time desc
  limit 60
$$;
revoke all on function public.comparable_candidates(uuid) from public, anon;
grant execute on function public.comparable_candidates(uuid) to authenticated;
