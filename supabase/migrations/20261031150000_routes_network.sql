-- KM Routes: runnable network (OpenStreetMap, ODbL) for routing, and geometry-aware routes.

create table public.network_nodes (
  id bigint primary key,
  region text not null,
  geom extensions.geometry(Point, 4326) not null,
  ele real,
  crossing text,
  signals boolean not null default false
);
create table public.network_edges (
  id bigint generated always as identity primary key,
  region text not null,
  source bigint not null references public.network_nodes(id) on delete cascade,
  target bigint not null references public.network_nodes(id) on delete cascade,
  osm_way_id bigint not null,
  geom extensions.geometry(LineString, 4326) not null,
  length_m real not null check (length_m > 0),
  highway text not null,
  name text,
  surface text,
  lit boolean,
  traversable boolean not null,
  road_class smallint not null default 0 check (road_class between 0 and 2),
  climb_fwd real not null default 0,
  climb_back real not null default 0
);
create index network_nodes_geom on public.network_nodes using gist(geom);
create index network_edges_geom on public.network_edges using gist(geom);
create index network_edges_source on public.network_edges(source);
create index network_edges_target on public.network_edges(target);
create index network_edges_region on public.network_edges(region);
create table public.network_imports (
  id bigint generated always as identity primary key,
  region text not null,
  bbox extensions.geometry(Polygon, 4326) not null,
  source text not null,
  license text not null,
  nodes integer not null,
  edges integer not null,
  elevation_source text,
  imported_at timestamptz not null default now()
);
comment on table public.network_edges is 'Runnable network derived from OpenStreetMap (c) OpenStreetMap contributors, ODbL 1.0.';
-- Reference data: read by the routing service through its own read-only role, never by browsers.
alter table public.network_nodes enable row level security;
alter table public.network_edges enable row level security;
alter table public.network_imports enable row level security;
revoke all on public.network_nodes, public.network_edges, public.network_imports from anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'km_network_reader') then
    create role km_network_reader nologin; -- operator enables login with a password outside migrations
  end if;
end $$;
grant usage on schema public, extensions to km_network_reader;
grant select on public.network_nodes, public.network_edges, public.network_imports to km_network_reader;
create policy network_read on public.network_nodes for select to km_network_reader using (true);
create policy network_read on public.network_edges for select to km_network_reader using (true);
create policy network_read on public.network_imports for select to km_network_reader using (true);

-- --------------------------------------------------------------- routes
alter table public.routes
  add column source text not null default 'manual' check (source in ('manual', 'generated', 'drawn')),
  add column waypoints jsonb not null default '[]',
  add column generation jsonb,
  add column validation jsonb;
alter table public.routes drop constraint routes_distance_m_check;
alter table public.routes add constraint routes_distance_m_check check (distance_m between 0 and 500000);

-- Geometry writes go through this function: it validates the line and derives the
-- distance geodesically, so a stored route can never claim a length its path lacks.
-- Definer (clients have no column grant on path/source/...); ownership is pinned to auth.uid().
create function public.save_route(p_id uuid, p_title text, p_description text, p_geojson jsonb, p_source text, p_waypoints jsonb, p_generation jsonb, p_validation jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare g extensions.geometry; result uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_source not in ('generated', 'drawn') then raise exception 'Invalid source' using errcode = 'check_violation'; end if;
  begin
    g := extensions.st_setsrid(extensions.st_geomfromgeojson(p_geojson), 4326);
  exception when others then
    raise exception 'Invalid route geometry' using errcode = 'check_violation';
  end;
  if extensions.geometrytype(g) <> 'LINESTRING' or extensions.st_npoints(g) < 2 or extensions.st_npoints(g) > 20000
     or not extensions.st_isvalid(g) or extensions.st_xmin(g) < -180 or extensions.st_xmax(g) > 180
     or extensions.st_ymin(g) < -90 or extensions.st_ymax(g) > 90 then
    raise exception 'Invalid route geometry' using errcode = 'check_violation';
  end if;
  if p_id is null then
    insert into public.routes(user_id, title, description, distance_m, path, source, waypoints, generation, validation)
    values (auth.uid(), left(p_title, 120), left(coalesce(p_description, ''), 2000), extensions.st_length(g::extensions.geography), g, p_source,
            coalesce(p_waypoints, '[]'), p_generation, p_validation)
    returning id into result;
  else
    update public.routes set path = g, distance_m = extensions.st_length(g::extensions.geography), source = p_source,
      waypoints = coalesce(p_waypoints, '[]'), generation = coalesce(p_generation, generation), validation = p_validation,
      title = coalesce(nullif(left(p_title, 120), ''), title)
    where id = p_id and user_id = auth.uid() returning id into result;
    if result is null then raise exception 'Route not found'; end if;
  end if;
  return result;
end $$;
revoke all on function public.save_route(uuid, text, text, jsonb, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_route(uuid, text, text, jsonb, text, jsonb, jsonb, jsonb) to authenticated;
-- Clients cannot write geometry or derived fields directly.
revoke insert, update on public.routes from anon, authenticated;
grant insert (id, user_id, title, description, distance_m) on public.routes to authenticated;
grant update (title, description, distance_m) on public.routes to authenticated;
create function private.protect_route_distance() returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and old.path is not null and new.distance_m is distinct from old.distance_m then
    raise exception 'Distance of a mapped route is derived from its path' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function private.protect_route_distance() from public;
create trigger protect_route_distance before update on public.routes for each row execute function private.protect_route_distance();

-- ----------------------------------------------------------- rate limiting
-- Fixed-window counters keyed by caller and action; shared by every server instance.
create table private.rate_limits (
  user_id uuid not null,
  action text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (user_id, action, window_start)
);
create function public.hit_rate_limit(p_action text, p_limit integer, p_window_s integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_s) * p_window_s); n integer;
begin
  if auth.uid() is null then return false; end if;
  insert into private.rate_limits(user_id, action, window_start, hits) values (auth.uid(), left(p_action, 40), w, 1)
  on conflict (user_id, action, window_start) do update set hits = private.rate_limits.hits + 1
  returning hits into n;
  delete from private.rate_limits where window_start < now() - interval '1 day' and random() < 0.01; -- lazy cleanup
  return n <= p_limit;
end $$;
revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.hit_rate_limit(text, integer, integer) to authenticated;
