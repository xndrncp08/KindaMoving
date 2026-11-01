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
