"""Walk existing stories using only the retained bundle and disposable local D1."""
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import tempfile
import time
import urllib.request

out = Path('evidence/artifact-qa')
out.mkdir(parents=True, exist_ok=True)
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
base = f'http://127.0.0.1:{port}'
# Neither a deploy credential nor a paid judge belongs in an artifact rehearsal.
env = {key: value for key, value in os.environ.items() if key not in (
    'CLOUDFLARE_API_TOKEN', 'OPENROUTER_API_KEY', 'TYPESAFE_API_KEY',
    'LIMINAL_GENERATOR_API_KEY', 'SENTRY_DSN', 'SENTRY_AUTH_TOKEN',
)}
with tempfile.TemporaryDirectory(prefix='liminal-artifact-', dir=os.environ.get('TMPDIR')) as state:
    subprocess.run([
        'bunx', '--no-install', 'wrangler', 'd1', 'migrations', 'apply', 'LIMINAL_DB',
        '--env', 'production', '--local', '--persist-to', state,
    ], env=env, check=True)
    with (out / 'worker.log').open('w') as log:
        worker = subprocess.Popen([
            'bunx', '--no-install', 'wrangler', 'dev', '.open-next/bundle/worker.js',
            '--env', 'production', '--no-bundle', '--local', '--persist-to', state,
            '--port', str(port), '--inspector-port', '0',
        ], env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            for attempt in range(90):
                if worker.poll() is not None:
                    raise RuntimeError('bundled Worker exited; see artifact-qa/worker.log')
                try:
                    with urllib.request.urlopen(base + '/api/health', timeout=2) as response:
                        health = json.load(response)
                    if health['checks'] == {'deck': 'ok', 'storage': 'ok'} and health['environment'] == 'production':
                        break
                except (OSError, json.JSONDecodeError):
                    pass
                time.sleep(1)
            else:
                raise RuntimeError('isolated bundled Worker failed readiness')
            source = Path('.open-next/SOURCE_SHA').read_text().strip()
            if health['revision'] != source:
                raise RuntimeError('bundle does not report its retained source identity')
            (out / 'health.json').write_text(json.dumps(health, indent=2) + '\n')
            qa_env = env | {'BASE': base, 'OUTAGE_BASE': base, 'OUT': str(out.resolve())}
            subprocess.run(['bun', 'e2e/qa-journeys.ts'], env=qa_env, check=True, timeout=240)
        finally:
            if worker.poll() is None:
                os.killpg(worker.pid, signal.SIGTERM)
                worker.wait(timeout=20)
