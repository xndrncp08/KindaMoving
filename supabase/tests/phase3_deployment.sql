-- Disposable harness only: the production network login must remain read-only.
set role km_network_reader;
select count(*) from public.network_imports;
do $$begin
 assert not has_table_privilege(current_user,'public.network_edges','INSERT,UPDATE,DELETE');
 assert not has_table_privilege(current_user,'public.network_nodes','INSERT,UPDATE,DELETE');
 assert not has_table_privilege(current_user,'public.network_imports','INSERT,UPDATE,DELETE');
 assert not has_table_privilege(current_user,'public.profiles','SELECT');
 begin insert into public.network_imports(region) values('forbidden'); raise exception 'Write was allowed'; exception when insufficient_privilege then null; end;
end$$;
reset role;
