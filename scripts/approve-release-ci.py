"""Approve only the generator's current, same-repository native CI run."""
import json
import os
import subprocess
import time

repo = os.environ['GITHUB_REPOSITORY']
number = int(json.loads(os.environ['RELEASE_PR'])['number'])


def api(path, method='GET'):
    return json.loads(subprocess.check_output([
        'gh', 'api', '--method', method, f'repos/{repo}/{path}',
    ], text=True) or 'null')


pr = api(f'pulls/{number}')
assert pr['state'] == 'open' and pr['base']['ref'] == 'master'
assert pr['head']['repo']['full_name'] == repo
assert pr['user']['login'] == 'github-actions[bot]'
assert pr['head']['ref'] == 'release-please--branches--master'
sha = pr['head']['sha']
# Bounded discovery of GitHub's delayed native run, not CI-success polling.
for _ in range(24):
    assert api(f'pulls/{number}')['head']['sha'] == sha, 'Release PR moved'
    runs = api(f'actions/workflows/ci.yml/runs?event=pull_request&head_sha={sha}')['workflow_runs']
    runs = [r for r in runs if r['head_sha'] == sha and r['head_repository']['full_name'] == repo]
    if runs:
        for run in runs:
            assert run['path'] == '.github/workflows/ci.yml' and run['event'] == 'pull_request'
            if run['conclusion'] == 'action_required':
                assert api(f'pulls/{number}')['head']['sha'] == sha, 'Release PR moved'
                api(f"actions/runs/{run['id']}/approve", 'POST')
                print(f"Approved native CI {run['id']} for PR {number} at {sha}")
            else:
                print(f"Native CI {run['id']} already {run['status']}; not restarted")
        break
    time.sleep(5)
else:
    raise SystemExit('Missing exact-head native CI run; nothing approved')
