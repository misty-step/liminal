"""Promote CI's retained Worker artifact; never build or change data/secrets."""
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.request

ACCOUNT = 'b069014f6a46558ea9146fb6c4ff8f6c'
REPOSITORY = 'misty-step/liminal'


def github(path):
    return json.loads(subprocess.check_output(['gh', 'api', f'repos/{REPOSITORY}/{path}']))


def require_candidate(run, jobs, source):
    if not re.fullmatch(r'[0-9a-f]{40}', source):
        raise ValueError('invalid candidate SHA')
    if (run['name'], run['event'], run['head_branch'], run['status'], run['conclusion']) != (
        'CI', 'push', 'master', 'completed', 'success'
    ):
        raise ValueError('candidate is not a successful default-branch CI run')
    if run['head_repository']['full_name'] != REPOSITORY:
        raise ValueError('foreign candidate repository')
    if run['head_sha'] != source:
        raise ValueError('candidate producer moved')
    quality = [job for job in jobs if job['name'] == 'quality']
    if len(quality) != 1 or quality[0]['conclusion'] != 'success':
        raise ValueError('real quality job did not succeed')


def require_forward(live, source):
    if not isinstance(live, str) or not re.fullmatch(r'[0-9a-f]{40}', live):
        raise ValueError('invalid serving revision')
    if subprocess.run(['git', 'merge-base', '--is-ancestor', live, source]).returncode != 0:
        raise ValueError('candidate does not descend from the serving revision')


def cloudflare(path):
    request = urllib.request.Request(
        f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/scripts/liminal/{path}',
        headers={'Authorization': 'Bearer ' + os.environ['CLOUDFLARE_API_TOKEN']},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        data = json.load(response)
    if not data['success']:
        raise RuntimeError('provider read failed')
    return data['result']


def active_version():
    latest = cloudflare('deployments')['deployments'][0]
    versions = latest['versions']
    if len(versions) != 1 or versions[0]['percentage'] != 100:
        raise RuntimeError('no single stable Worker version')
    return versions[0]['version_id']


def read_health():
    return json.loads(subprocess.check_output([
        'curl', '--fail', '--silent', '--show-error', '--max-time', '20',
        'https://liminal.mistystep.io/api/health',
    ]))


def wait_health(expected):
    for attempt in range(12):
        try:
            actual = read_health()
            if all(actual.get(key) == value for key, value in expected.items()):
                return actual
        except (subprocess.CalledProcessError, json.JSONDecodeError):
            pass
        if attempt < 11:
            time.sleep(5)
    raise RuntimeError('live identity/health readback failed')


def main():
    run_id = os.environ['CI_RUN_ID']
    source = Path('.open-next/SOURCE_SHA').read_text().strip()
    # Validate the producer and fresh source before exposing any provider writes.
    run = github(f'actions/runs/{run_id}')
    jobs = github(f'actions/runs/{run_id}/jobs?per_page=100')['jobs']
    require_candidate(run, jobs, source)
    subprocess.run(['sha256sum', '--check', 'worker-artifact.sha256'], check=True)
    previous = active_version()
    previous_health = read_health()
    if (previous_health.get('status') != 'ok' or previous_health.get('environment') != 'production'
            or previous_health.get('checks') != {'deck': 'ok', 'storage': 'ok'}):
        raise RuntimeError('previous release is not healthy')
    # The serialized production workflow owns normal promotions. Trunk may
    # advance during CI; only ancestry from the serving revision matters.
    require_forward(previous_health.get('revision'), source)
    if active_version() != previous:
        raise RuntimeError('active version changed before promotion')
    receipt = {'source': source, 'ci_run': run_id, 'previous_version': previous, 'previous_health': previous_health}
    try:
        subprocess.run([
            'bunx', '--no-install', 'wrangler', 'deploy', '.open-next/bundle/worker.js',
            '--env', 'production', '--no-bundle', '--keep-vars', '--tag', source,
        ], check=True)
        current = active_version()
        if current == previous:
            raise RuntimeError('provider did not activate a new version')
        receipt.update(version=current, health=wait_health({
            'status': 'ok', 'environment': 'production', 'revision': source,
            'checks': {'deck': 'ok', 'storage': 'ok'},
        }))
        subprocess.run(['curl', '-fsS', '--max-time', '20', '-o', '/dev/null', 'https://liminal.mistystep.io/'], check=True)
        receipt['outcome'] = 'promoted'
    except Exception:
        # A deploy can fail after activation (for example while applying routes).
        # Restore exactly the previously observed native version, not data.
        subprocess.run([
            'bunx', '--no-install', 'wrangler', 'rollback', previous,
            '--env', 'production', '--yes', '--message', 'Failed CI promotion; restore prior stable code',
        ], check=True)
        if active_version() != previous:
            raise RuntimeError('native rollback provider readback failed')
        receipt.update(outcome='rolled-back', rollback_health=wait_health(previous_health))
        raise
    finally:
        Path('promotion-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')


if __name__ == '__main__':
    main()

