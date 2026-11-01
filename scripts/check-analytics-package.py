"""Build a non-editable wheel and ensure deployment includes the routing package.
Copy sources into a disposable directory so setuptools never writes into the checkout.
"""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from zipfile import ZipFile

root=Path(__file__).resolve().parents[1]/'services/analytics'
with tempfile.TemporaryDirectory(prefix='km-wheel-') as directory:
    target=Path(directory)
    shutil.copytree(root/'km_analytics',target/'km_analytics',ignore=shutil.ignore_patterns('__pycache__'))
    shutil.copy(root/'pyproject.toml',target/'pyproject.toml')
    subprocess.run([sys.executable,'-m','pip','wheel','--no-deps','--wheel-dir',str(target/'wheel'),str(target)],check=True,stdout=subprocess.DEVNULL)
    with ZipFile(next((target/'wheel').glob('*.whl'))) as wheel:
        assert {'km_analytics/api.py','km_analytics/routing/engine.py','km_analytics/routing/network.py','km_analytics/deployment.py'} <= set(wheel.namelist()),'Deployment wheel omits runtime modules'
print('Analytics deployment wheel includes routing and readiness modules.')
