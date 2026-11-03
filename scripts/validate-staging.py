"""Read-only configuration preflight. Consistency is not proof of provisioned isolation."""
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'services/analytics'))
from km_analytics.deployment import configuration_errors


def validate(env):
    errors = configuration_errors({**env, 'KM_DEPLOYMENT': 'staging'})
    if env.get('KM_DEPLOYMENT') != 'staging':
        errors.append('KM_DEPLOYMENT must be staging')
    ref = env.get('KM_STAGING_SUPABASE_REF', '')
    if not re.fullmatch('[a-z0-9]{20}', ref) or ref == 'yqzbsuandpdlvgtgnwln':
        errors.append('Select an approved, separate KindaMoving staging project')
    if env.get('NEXT_PUBLIC_SUPABASE_URL') != f'https://{ref}.supabase.co':
        errors.append('Web and routing database must select the same staging project')
    for key in ('NEXT_PUBLIC_SITE_URL', 'ANALYTICS_URL'):
        try:
            u = urlsplit(env.get(key, ''))
            if u.scheme != 'https' or not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ('', '/'):
                raise ValueError()
        except ValueError:
            errors.append(key + ' must be an HTTPS origin')
    if len(env.get('CRON_SECRET', '')) < 32 or env.get('CRON_SECRET') == env.get('ANALYTICS_SERVICE_TOKEN'):
        errors.append('Use a separate >=32-character scheduler secret')
    return errors


if __name__ == '__main__':
    errors = validate(os.environ)
    for error in errors:
        print(error, file=sys.stderr)
    if not errors:
        print('Configuration consistent. Provisioning, project ownership, secret binding, SSO, SMTP and live isolation still require acceptance.')
    sys.exit(bool(errors))
