"""Metadata may only be generated from verified current source with a known baseline."""
import json
import os
from pathlib import Path
import re
import subprocess

assert os.environ['GATE_RESULT'] == 'success', 'CI did not pass'
baseline = json.loads(Path('release-please-config.json').read_text())['bootstrap-sha']
assert re.fullmatch('[0-9a-f]{40}', baseline), 'Missing immutable baseline'
source = os.environ['SOURCE_SHA']
subprocess.run(['git', 'merge-base', '--is-ancestor', baseline, source], check=True)
current = subprocess.check_output([
    'gh', 'api', f"repos/{os.environ['GITHUB_REPOSITORY']}/git/ref/heads/master", '--jq', '.object.sha',
], text=True).strip()
if current == source:
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        output.write('current=true\n')
else:
    print('Superseded source; no release metadata publication')
