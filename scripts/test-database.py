"""Disposable PostgreSQL contract test. Never connects to an existing database.
PostGIS columns alone become text when --without-postgis is explicitly supplied.
Supabase auth/storage schemas are minimal test doubles, not the real services.
"""
import argparse
import os
import re
from pathlib import Path
import shutil
import subprocess
import tempfile

parser=argparse.ArgumentParser()
parser.add_argument('--without-postgis',action='store_true')
parser.add_argument('--then',help='Command to run against the migrated database (KM_TEST_DATABASE_URL) before teardown')
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
pgbin=os.environ.get('PG_BIN','/opt/homebrew/opt/postgresql@17/bin')
def binary(name):
    explicit=Path(pgbin)/name
    return str(explicit) if explicit.exists() else shutil.which(name)
with tempfile.TemporaryDirectory(prefix='km-pg-') as tmp:
    data=Path(tmp)/'data'
    subprocess.run([binary('initdb'),'-D',str(data),'-A','trust','--no-locale','-E','UTF8'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([binary('pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'log'),'-o',f'-k {tmp} -p 55439 -h ""','-w','start'],check=True,stdout=subprocess.DEVNULL)
    def sql(content):
        subprocess.run([binary('psql'),'-h',tmp,'-p','55439','-d','postgres','-v','ON_ERROR_STOP=1','-q'],input=content,text=True,check=True)
    try:
        sql("""
create role authenticated;
create role anon;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth to authenticated,anon,service_role;
grant execute on function auth.uid() to authenticated,anon;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
grant usage on schema storage to authenticated,service_role;
grant select,insert,delete on storage.objects to service_role;
grant select,insert,delete on storage.objects to authenticated;
""")
        for path in sorted((root/'supabase/migrations').glob('*.sql')):
            migration=path.read_text()
            if args.without_postgis:
                migration=migration.replace('create extension if not exists postgis with schema extensions;','')
                migration=re.sub(r'extensions\.geometry\([A-Za-z]+, ?4326\)|extensions\.geography\([A-Za-z]+, ?4326\)','text',migration)
                migration=re.sub(r'create index [^;]*using gist[^;]*;','',migration)
            sql(migration)
        if args.without_postgis:
            print('EXPLICIT LIMIT: PostGIS installation, geometry types, GiST indexes and spatial functions excluded.',flush=True)
        # Mirrors Supabase defaults: API roles may use extension functions (PostGIS).
        grants="grant usage on schema extensions to anon,authenticated,service_role; grant all on all tables in schema public to service_role;"
        sql(grants)
        for test in sorted((root/'supabase/tests').glob('*.sql')):
            sql(test.read_text())
            print(f'passed {test.name}',flush=True)
        print('Database contract checks passed (disposable cluster).')
        if args.then:
            env={**os.environ,'KM_TEST_DATABASE_URL':f'postgresql:///postgres?host={tmp}&port=55439'}
            subprocess.run(args.then,shell=True,check=True,env=env)
    finally:
        subprocess.run([binary('pg_ctl'),'-D',str(data),'-m','immediate','-w','stop'],check=True,stdout=subprocess.DEVNULL)
