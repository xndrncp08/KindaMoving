"""Disposable PostgreSQL contract test. Never connects to an existing database.
PostGIS columns alone become text when --without-postgis is explicitly supplied.
Supabase auth/storage schemas are minimal test doubles, not the real services.
"""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

parser=argparse.ArgumentParser()
parser.add_argument('--without-postgis',action='store_true')
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
pgbin=os.environ.get('PG_BIN','/opt/homebrew/opt/postgresql@16/bin')
def binary(name):
    return shutil.which(name) or str(Path(pgbin)/name)
with tempfile.TemporaryDirectory(prefix='km-pg-') as tmp:
    data=Path(tmp)/'data'
    subprocess.run([binary('initdb'),'-D',str(data),'-A','trust','--no-locale'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([binary('pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'log'),'-o',f'-k {tmp} -p 55439 -h ""','-w','start'],check=True,stdout=subprocess.DEVNULL)
    def sql(content):
        subprocess.run([binary('psql'),'-h',tmp,'-p','55439','-d','postgres','-v','ON_ERROR_STOP=1','-q'],input=content,text=True,check=True)
    try:
        sql("""
create role authenticated;
create role anon;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
grant usage on schema storage to authenticated;
grant select,insert,delete on storage.objects to authenticated;
""")
        migration=next((root/'supabase/migrations').glob('*foundation.sql')).read_text()
        if args.without_postgis:
            migration=migration.replace('create extension if not exists postgis with schema extensions;','')
            migration=migration.replace('extensions.geometry(LineString,4326)','text').replace('extensions.geography(Point,4326)','text')
            migration=migration.replace('create index routes_path on public.routes using gist(path);','')
            print('EXPLICIT LIMIT: PostGIS installation, geometry types and GiST index excluded.',flush=True)
        sql(migration)
        for extra in sorted((root/'supabase/migrations').glob('*summaries.sql')):
            sql(extra.read_text())
        sql((root/'supabase/tests/ownership.sql').read_text())
        print('Database contract checks passed (disposable cluster).')
    finally:
        subprocess.run([binary('pg_ctl'),'-D',str(data),'-m','immediate','-w','stop'],check=True,stdout=subprocess.DEVNULL)
