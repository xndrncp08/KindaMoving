-- COROS (official MCP server, OAuth 2.1 + PKCE) connection, encrypted token vault,
-- per-activity provider records for dedupe/quota deferral.

alter table public.connected_provider_accounts drop constraint connected_provider_accounts_status_check;
alter table public.connected_provider_accounts
  add constraint connected_provider_accounts_status_check check (status in ('disconnected', 'connected', 'error', 'reauth_required')),
  add column issuer text check (issuer ~ '^https://[a-z0-9.-]+\.coros\.com$'),
  add column mcp_url text check (mcp_url ~ '^https://[a-z0-9.-]+\.coros\.com/mcp$'),
  add column scopes text,
  add column capabilities jsonb not null default '[]',
  add column connected_at timestamptz,
  add column last_sync_at timestamptz,
  add column sync_cursor date,
  add column fit_quota jsonb not null default '{}',
  add column last_error text check (length(last_error) <= 500);
comment on column public.connected_provider_accounts.capabilities is 'Tool names reported by tools/list at connection time (capability detection).';

-- Dynamic client registrations, one public (PKCE) client per issuer + redirect URI.
create table private.provider_clients (
  issuer text not null,
  redirect_uri text not null,
  client_id text not null,
  created_at timestamptz not null default now(),
  primary key (issuer, redirect_uri)
);
-- Ciphertext only (AES-256-GCM, key held by the web server). Not reachable through the Data API.
create table private.provider_tokens (
  account_id uuid primary key references public.connected_provider_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  access_token text not null,
  refresh_token text,
  access_expires_at timestamptz,
  updated_at timestamptz not null default now()
);
revoke all on private.provider_clients, private.provider_tokens from public, anon, authenticated;

create table public.provider_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  label_id text not null check (length(label_id) <= 64),
  sport_type integer,
  start_time timestamptz,
  distance_m numeric,
  status text not null default 'seen' check (status in ('seen', 'imported', 'duplicate', 'skipped', 'deferred_quota', 'failed')),
  activity_id uuid,
  detail text check (length(detail) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, label_id),
  foreign key (account_id, user_id) references public.connected_provider_accounts(id, user_id) on delete cascade,
  foreign key (activity_id, user_id) references public.activities(id, user_id) on delete set null (activity_id)
);
alter table public.provider_records enable row level security;
create policy own_records on public.provider_records for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.provider_records from anon, authenticated;
grant select on public.provider_records to authenticated;
create index provider_records_owner on public.provider_records(user_id, start_time desc);
create index provider_records_pending on public.provider_records(account_id, status) where status in ('seen', 'deferred_quota', 'failed');
create index provider_records_activity on public.provider_records(activity_id) where activity_id is not null;
create trigger updated_at before update on public.provider_records for each row execute function public.touch_updated_at();

-- Vault RPCs: service_role only.
create function public.vault_client(p_issuer text, p_redirect text, p_client text) returns text
language plpgsql security definer set search_path = '' as $$
declare existing text;
begin
  if p_client is null then
    select client_id into existing from private.provider_clients where issuer = p_issuer and redirect_uri = p_redirect;
    return existing;
  end if;
  insert into private.provider_clients(issuer, redirect_uri, client_id) values (p_issuer, p_redirect, p_client)
  on conflict (issuer, redirect_uri) do nothing;
  select client_id into existing from private.provider_clients where issuer = p_issuer and redirect_uri = p_redirect;
  return existing;
end $$;

create function public.vault_put(p_account uuid, p_user uuid, p_client text, p_access text, p_refresh text, p_expires timestamptz)
returns void language sql security definer set search_path = '' as $$
  insert into private.provider_tokens(account_id, user_id, client_id, access_token, refresh_token, access_expires_at)
  values (p_account, p_user, p_client, p_access, p_refresh, p_expires)
  on conflict (account_id) do update set client_id = excluded.client_id, access_token = excluded.access_token,
    refresh_token = excluded.refresh_token, access_expires_at = excluded.access_expires_at, updated_at = now();
$$;

create function public.vault_get(p_account uuid, p_user uuid)
returns table (client_id text, access_token text, refresh_token text, access_expires_at timestamptz, updated_at timestamptz)
language sql security definer set search_path = '' as $$
  select client_id, access_token, refresh_token, access_expires_at, updated_at
  from private.provider_tokens where account_id = p_account and user_id = p_user;
$$;

create function public.vault_delete(p_account uuid, p_user uuid) returns void
language sql security definer set search_path = '' as $$
  delete from private.provider_tokens where account_id = p_account and user_id = p_user;
$$;
revoke all on function public.vault_client(text, text, text), public.vault_put(uuid, uuid, text, text, text, timestamptz),
  public.vault_get(uuid, uuid), public.vault_delete(uuid, uuid) from public, anon, authenticated;
grant execute on function public.vault_client(text, text, text), public.vault_put(uuid, uuid, text, text, text, timestamptz),
  public.vault_get(uuid, uuid), public.vault_delete(uuid, uuid) to service_role;
