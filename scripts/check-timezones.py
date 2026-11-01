"""Read-only native PostgreSQL tzdata acceptance; use the network reader DSN in env.
Application compatibility tests are separate: this verifies the actual database rules.
"""
import os
import sys
import psycopg

try:
    with psycopg.connect(os.environ['NETWORK_DATABASE_URL'],connect_timeout=5,options='-c default_transaction_read_only=on -c statement_timeout=5000') as conn:
        for wall,hours in [('2026-11-01 09:00',6),('2026-11-02 09:00',6),('2027-01-15 09:00',6),('2025-01-15 09:00',7),('2025-07-15 09:00',6),('2025-03-09 01:30',7),('2025-03-09 03:30',6)]:
            offset=conn.execute("select extract(epoch from (%s::timestamp at time zone 'America/Edmonton')-(%s::timestamp at time zone 'UTC'))",(wall,wall)).fetchone()[0]
            if offset!=hours*3600:
                raise ValueError('Outdated native timezone database')
    print('PostgreSQL Alberta UTC-6 and historical DST checks passed.')
except Exception:
    print('Native database time-zone check failed; verify connection and update Supabase tzdata before launch.',file=sys.stderr)
    sys.exit(1)
