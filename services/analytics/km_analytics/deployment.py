"""Production configuration and bounded, read-only readiness probes. No secrets in errors."""
from __future__ import annotations
import os
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
import psycopg


def configuration_errors(env=None):
    env = os.environ if env is None else env
    errors = []
    if len(env.get("ANALYTICS_SERVICE_TOKEN", "")) < 32:
        errors.append("ANALYTICS_SERVICE_TOKEN must have at least 32 characters")
    try:
        url = urlsplit(env.get("NETWORK_DATABASE_URL", ""))
        if url.scheme not in ("postgres", "postgresql") or not url.hostname or not url.password:
            raise ValueError()
        if not (url.username or "").split(".")[0] == "km_network_reader":
            raise ValueError()
        if parse_qs(url.query).get("sslmode") != ["verify-full"]:
            raise ValueError()
    except ValueError:
        errors.append("NETWORK_DATABASE_URL needs the km_network_reader login and sslmode=verify-full")
    if env.get("FORM_MODEL_PATH") and not Path(env["FORM_MODEL_PATH"]).is_file():
        errors.append("FORM_MODEL_PATH does not exist")
    return errors


def network_ready():
    # No user tables or data are read; empty pilot imports and a privileged role fail closed.
    with psycopg.connect(os.environ["NETWORK_DATABASE_URL"], connect_timeout=3, options="-c statement_timeout=3000 -c default_transaction_read_only=on") as conn:
        row = conn.execute("""select current_user, r.rolsuper, r.rolbypassrls,
          (has_table_privilege(current_user,'public.network_edges','INSERT,UPDATE,DELETE') or has_table_privilege(current_user,'public.network_nodes','INSERT,UPDATE,DELETE') or has_table_privilege(current_user,'public.network_imports','INSERT,UPDATE,DELETE') or has_table_privilege(current_user,'public.profiles','SELECT')),
          exists(select 1 from public.network_edges where region='calgary'),
          extract(epoch from (timestamp '2026-11-02 09:00' at time zone 'America/Edmonton')-(timestamp '2026-11-02 09:00' at time zone 'UTC')),
          extract(epoch from (timestamp '2025-01-15 09:00' at time zone 'America/Edmonton')-(timestamp '2025-01-15 09:00' at time zone 'UTC'))
          from pg_roles r where r.rolname=current_user""").fetchone()
    return bool(row and str(row[0]).split('.')[0]=='km_network_reader' and not any(row[1:4]) and row[4] and row[5]==21600 and row[6]==25200)
