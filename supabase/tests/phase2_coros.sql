-- Token vault isolation and provider record ownership.
insert into auth.users values ('a1000000-0000-4000-8000-0000000000aa'), ('b1000000-0000-4000-8000-0000000000bb') on conflict do nothing;
reset role;
set role service_role;
insert into connected_provider_accounts(id, user_id, provider, status, issuer, mcp_url)
values ('a1100000-0000-4000-8000-0000000000aa', 'a1000000-0000-4000-8000-0000000000aa', 'coros', 'connected', 'https://mcpus.coros.com', 'https://mcpus.coros.com/mcp');
select public.vault_put('a1100000-0000-4000-8000-0000000000aa', 'a1000000-0000-4000-8000-0000000000aa', 'client', 'v1.cipher', 'v1.refresh', now() + interval '30 days');
insert into provider_records(user_id, account_id, label_id, sport_type, status)
values ('a1000000-0000-4000-8000-0000000000aa', 'a1100000-0000-4000-8000-0000000000aa', '476000001', 100, 'seen');
do $$ begin
  assert public.vault_client('https://mcpus.coros.com', 'https://km.test/cb', 'c1') = 'c1';
  assert public.vault_client('https://mcpus.coros.com', 'https://km.test/cb', 'c2') = 'c1', 'First registration wins';
  assert (select count(*) from public.vault_get('a1100000-0000-4000-8000-0000000000aa', 'b1000000-0000-4000-8000-0000000000bb')) = 0, 'Vault is owner-scoped';
  begin insert into connected_provider_accounts(user_id, provider, issuer) values ('b1000000-0000-4000-8000-0000000000bb', 'coros', 'https://evil.example');
    raise exception 'Expected issuer check'; exception when check_violation then null; end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-0000000000aa', false);
do $$ begin
  assert (select count(*) from provider_records) = 1, 'Owner reads own records';
  assert (select status from connected_provider_accounts) = 'connected';
  begin perform public.vault_get('a1100000-0000-4000-8000-0000000000aa', auth.uid()); raise exception 'Clients must not read tokens';
  exception when insufficient_privilege then null; end;
  begin perform * from private.provider_tokens; raise exception 'Private schema must be closed';
  exception when insufficient_privilege then null; end;
  begin update provider_records set status = 'imported'; raise exception 'Records are worker-written';
  exception when insufficient_privilege then null; end;
  begin update connected_provider_accounts set status = 'connected'; raise exception 'Account state is worker-written';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-0000000000bb', false);
do $$ begin
  assert (select count(*) from provider_records) = 0 and (select count(*) from connected_provider_accounts) = 0, 'Cross-user leak';
end $$;
reset role;
