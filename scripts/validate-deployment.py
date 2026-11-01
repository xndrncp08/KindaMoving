"""Dependency-free checks for checked-in Vercel settings; no infrastructure mutations."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
web=json.loads((root/'apps/web/vercel.json').read_text())
assert web['framework']=='nextjs'
assert web['functions']['src/app/api/**/*.ts']['maxDuration']==300
schedules={row['path']:row['schedule'] for row in web['crons']}
assert schedules=={'/api/jobs/run':'* * * * *','/api/conditions/official':'*/15 * * * *','/api/form/cleanup':'17 9 * * *'}
assert len(schedules)==3
for path in schedules:
    source=(root/'apps/web/src/app'/path.lstrip('/')/'route.ts').read_text()
    assert 'cronAuthorized(request)' in source
assert 'autoDeployTrigger: \'off\'' in (root/'render.yaml').read_text()
print('Deployment settings and scheduler authentication checks passed (Vercel Pro required).')
