# Safe Calgary network import

`services/analytics/scripts/import_network.py` is an operator tool, never a deployment hook. It downloads/validates by default and performs **no database writes without --apply**. It only accepts the `calgary` region, a finite ordered bbox within the Calgary safety envelope, <=0.02 square degrees, bounded JSON <=100 MiB/one million elements, and local Calgary node coordinates. Empty/unroutable graphs are rejected. Overpass uses a fixed HTTPS host, identifying User-Agent and timeout. Optional elevation fetching remains explicitly requested and aborts on incomplete coverage. Requests consume external quotas even during dry-run.

```sh
# Start with a reviewed pilot, not the whole city. Prefer a saved, licensed extract.
services/analytics/.venv/bin/python services/analytics/scripts/import_network.py   --region calgary --bbox=-114.13,51.035,-114.03,51.070   --from-file reviewed-calgary.json
# After reviewing counts, source/license, coverage and a backup of existing reference data:
# Set NETWORK_ADMIN_DATABASE_URL using private shell/provider secret storage.
# Re-run with --apply; replacement ALSO needs explicit --replace-existing.
```

The store uses a single transaction, a global import advisory lock, lock/statement timeouts and rollback on failure. It refuses existing-region replacement unless explicitly opted in and refuses to overwrite nodes owned by another region. Credentials are read from env rather than CLI arguments and DB exceptions are redacted. Do not assemble Calgary by repeatedly importing tiles into the same region: replacement semantics delete that region's previous edges. Whole-city data assembly is a separate reviewed preparation step, not silently added here. Keep the source extract/checksum and import provenance, then restart the analytics service after an approved replacement; its other processes cannot see an in-process cache clear.

## Read-only service role

The existing migration creates `km_network_reader` NOLOGIN and grants SELECT only on network_nodes, network_edges and network_imports, with RLS policies for those reference tables. The operator separately enables LOGIN and sets a generated password through a secure SQL session. Do not paste passwords into checked-in SQL or use the admin/service-role DSN in Render. Use Supabase's documented custom-role pooler username (typically `km_network_reader.<project-ref>`), the project's verified host/port, `sslmode=verify-full` and the provider-supported CA trust configuration. For Render/Linux a supported system CA bundle can be passed via sslrootcert; verify the chosen libpq/pooler configuration instead of disabling certificate verification.

Readiness verifies current_user, rejects superuser/BYPASSRLS/write privileges, checks Calgary rows and native tzdata. The SQL regression suite also asserts the role cannot write reference tables or select profiles. Credentials for the import writer and runtime reader must remain separate. RLS is not a substitute for withholding admin credentials from compute.

For native database timezone acceptance, set NETWORK_DATABASE_URL privately and run `services/analytics/.venv/bin/python scripts/check-timezones.py`. It runs only constant timestamp conversions inside a read-only transaction. Failure is a launch blocker requiring connection review or a supported Supabase tzdata upgrade; it never rewrites stored timestamps.

## Operator-only reader activation (Phase 5)

Target **only** Supabase project `yqzbsuandpdlvgtgnwln` after confirming it in
Project Settings and the connection host. Management API/SQL access to this
project was denied on 2026-11-02; another accessible project is not a substitute.
These are operator instructions, **not executed changes**.

1. Open a private TLS-verified `psql` session as the project's database administrator.
   Obtain the connection details from that project's dashboard; keep the DSN out of
   shell history, process arguments, screenshots and issue comments.
2. Run the following **read-only inspection** before enabling a login:

```sql
SELECT rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication
FROM pg_roles WHERE rolname = 'km_network_reader';
SELECT parent.rolname AS inherited_role, m.admin_option
FROM pg_auth_members m
JOIN pg_roles child ON child.oid = m.member
JOIN pg_roles parent ON parent.oid = m.roleid
WHERE child.rolname = 'km_network_reader';
SELECT c.relname,
       has_table_privilege('km_network_reader', c.oid, 'SELECT') AS can_read,
       has_table_privilege('km_network_reader', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS can_write
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname;
SELECT nspname, has_schema_privilege('km_network_reader', oid, 'CREATE') AS can_create
FROM pg_namespace WHERE nspname IN ('public', 'extensions');
```

Expect one role with superuser/BYPASSRLS/create-role/create-db all false,
replication false, no inherited roles or schema CREATE, SELECT on the three network tables only, and **no writes**.
Stop and investigate unexpected privileges or a missing role; do not replay
migrations or blanket-revoke grants on a shared database. 3. In the same private interactive `psql` session, generate/store a unique password
in the operator's secret manager, then enter it through the hidden prompt:

```text
\password km_network_reader
```

Only after the inspection and password setup succeed, the operator may run:

```sql
ALTER ROLE km_network_reader LOGIN;
```

4. Put the reader's custom-role pooler connection into Render's
   `NETWORK_DATABASE_URL` secret, with `sslmode=verify-full` and a verified CA.
   Put the same >=32-character `ANALYTICS_SERVICE_TOKEN` in Vercel and Render via
   their secret interfaces. Never put the writer/admin DSN in analytics.
5. Run native timezone acceptance and authenticated `/readyz`. An empty network
   correctly keeps readiness at 503; reader activation does not authorize an import.
   Set the Render health-check path to `/readyz` after reviewing its deployment
   configuration. Retain the existing protected staging boundary.

## Dry-run diagnostics

The JSON report distinguishes geometry nodes from stored edge endpoints and
traversable nodes. It includes connected-component counts, largest component,
dangling endpoints, invalid lengths and endpoint elevation coverage. Components
are a coverage warning, not a route-confidence score. No connectivity repair or
routing algorithm is added. Invalid endpoints/lengths abort before any write.
See [the Phase 5 release report](release/PHASE5_MOBILE_READINESS.md) for the
reviewed archived extract, exact counts, coverage and proposed changes.
