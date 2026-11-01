"""Read-only deployment checks. URLs and bearer credentials are supplied via env only.
Never follows redirects with credentials, schedules jobs, imports data or deletes records.
"""
import argparse
import json
import os
import sys
import urllib.request
import urllib.error
from urllib.parse import urlsplit

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def origin(value, local=False):
    url=urlsplit(value)
    if url.username or url.password or url.query or url.fragment or url.path not in ('','/'):
        raise ValueError('Use an origin without credentials, path, or query')
    if url.scheme!='https' and not(local and url.scheme=='http' and url.hostname in ('127.0.0.1','localhost')):
        raise ValueError('HTTPS is required outside explicit local checks')
    if not url.hostname:
        raise ValueError('Missing host')
    return value.rstrip('/')


def request(base,path,token=None,method="GET"):
    headers={'Authorization':'Bearer '+token} if token else {}
    req=urllib.request.Request(base+path,headers=headers,method=method)
    try:
        with urllib.request.build_opener(NoRedirect).open(req,timeout=20) as response:
            body=response.read(65536)
            return response.status,response.headers,body
    except urllib.error.HTTPError as error:
        return error.code,error.headers,b''


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--local',action='store_true')
    args=parser.parse_args()
    try:
        web=origin(os.environ['WEB_BASE_URL'],args.local)
        analytics=origin(os.environ['ANALYTICS_URL'],args.local)
        for base in (web,analytics):
            status,_,body=request(base,'/api/healthz' if base==web else '/healthz')
            assert status==200 and json.loads(body)['ok'] is True,'Liveness failed'
        status,headers,_=request(web,'/')
        assert status==200 and "'strict-dynamic'" in headers.get('Content-Security-Policy',''),'Web CSP missing'
        for path in ('/api/jobs/run','/api/conditions/official','/api/form/cleanup'):
            assert request(web,path)[0]==401,'Scheduler endpoint allowed anonymous access'
        assert request(analytics,'/v1/activities/parse?format=gpx',method='POST')[0]==401,'Unexpected analytics boundary'
        for base,path,key in ((web,'/api/readyz','CRON_SECRET'),(analytics,'/readyz','ANALYTICS_SERVICE_TOKEN')):
            token=os.environ[key]
            assert request(base,path,token)[0]==200,'Dependency readiness failed'
        print('Read-only production smoke checks passed.')
    except Exception:
        # Do not print HTTP exceptions or URLs, which may contain private deployment info.
        print('Smoke checks failed. Check readiness, credentials, CSP and scheduler access privately.',file=sys.stderr)
        return 1
    return 0

if __name__=='__main__':
    sys.exit(main())
