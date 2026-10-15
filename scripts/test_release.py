"""Real release boundary scripts; local Git plus explicitly fixture-only GitHub I/O."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parent


class ReleaseSafety(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='liminal-release-', dir=os.environ.get('TMPDIR'))
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.env = dict(os.environ, PATH=str(self.bin) + os.pathsep + os.environ['PATH'],
                        GATE_RESULT='success', GITHUB_REPOSITORY='fixture/liminal',
                        GITHUB_OUTPUT=str(self.root / 'output'), FIXTURE=str(self.root))
        self.run_cmd('git', 'init', '-q')
        self.run_cmd('git', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                     'commit', '--allow-empty', '-qm', 'fixture')
        self.sha = self.run_cmd('git', 'rev-parse', 'HEAD').stdout.strip()
        self.env.update(SOURCE_SHA=self.sha, CURRENT_SHA=self.sha)
        self.config(self.sha)
        self.stub('import os; print(os.environ["CURRENT_SHA"])')

    def run_cmd(self, *args, **env):
        return subprocess.run(args, cwd=self.root, env=dict(self.env, **env), text=True, capture_output=True)

    def config(self, baseline):
        (self.root / 'release-please-config.json').write_text(json.dumps({'bootstrap-sha': baseline}))

    def stub(self, code):
        gh = self.bin / 'gh'
        gh.write_text('#!/usr/bin/env python3\n' + code + '\n')
        gh.chmod(0o755)

    def test_gate_source_and_baseline_refusals(self):
        script = str(SOURCE / 'release-current.py')
        self.assertEqual(self.run_cmd('python3', script).returncode, 0)
        self.assertEqual((self.root / 'output').read_text(), 'current=true\n')
        (self.root / 'output').unlink()
        self.assertEqual(self.run_cmd('python3', script, CURRENT_SHA='a' * 40).returncode, 0)
        self.assertFalse((self.root / 'output').exists())
        for result in ['failure', 'skipped', 'cancelled', '']:
            self.assertNotEqual(self.run_cmd('python3', script, GATE_RESULT=result).returncode, 0)
            self.assertFalse((self.root / 'output').exists())
        for baseline in [None, 'master', 'b' * 40]:
            self.config(baseline)
            self.assertNotEqual(self.run_cmd('python3', script).returncode, 0)
            self.assertFalse((self.root / 'output').exists())

    def test_title_is_data(self):
        for title, valid in [('feat: read notes', True), ('fix(api)!: change shape', True),
                             ('chore(master): release 1.0.0', True), ('not conventional', False),
                             ('feat: two\nlines', False), ('feat: $(touch injected)', True)]:
            self.assertEqual(self.run_cmd('python3', str(SOURCE / 'check-title.py'), PR_TITLE=title).returncode == 0, valid)
        self.assertFalse((self.root / 'injected').exists())

    def test_native_approval_is_exact_and_never_restarts_running_ci(self):
        generated = {'number':7, 'headBranchName':'release-please--branches--master--components--liminal'}
        pr = {'state':'open', 'base':{'ref':'master'}, 'head':{'sha':self.sha,
              'ref':generated['headBranchName'], 'repo':{'full_name':'fixture/liminal'}},
              'user':{'login':'github-actions[bot]'}}
        run = {'id':123, 'head_sha':self.sha, 'head_repository':{'full_name':'fixture/liminal'},
               'path':'.github/workflows/ci.yml', 'event':'pull_request', 'status':'completed',
               'conclusion':'action_required'}
        self.stub('''import json, os, pathlib, sys
root=pathlib.Path(os.environ['FIXTURE'])
endpoint=sys.argv[-1]
if endpoint.endswith('/approve'):
    (root/'approved').write_text(endpoint); print('{}')
elif '/pulls/' in endpoint: print((root/'pr.json').read_text())
else: print((root/'runs.json').read_text())''')
        (self.root / 'pr.json').write_text(json.dumps(pr))
        def execute():
            (self.root / 'runs.json').write_text(json.dumps({'workflow_runs':[run]}))
            return self.run_cmd('python3', '-c', 'import runpy,time; time.sleep=lambda _:None; runpy.run_path(' + repr(str(SOURCE / 'approve-release-ci.py')) + ",run_name='__main__')", RELEASE_PR=json.dumps(generated))
        self.assertEqual(execute().returncode, 0)
        self.assertTrue((self.root / 'approved').exists())
        (self.root / 'approved').unlink()
        pr['head']['ref'] = 'release-please--branches--master'
        (self.root / 'pr.json').write_text(json.dumps(pr))
        self.assertNotEqual(execute().returncode, 0)
        self.assertFalse((self.root / 'approved').exists())
        pr['head']['ref'] = generated['headBranchName']
        (self.root / 'pr.json').write_text(json.dumps(pr))
        run.update(status='in_progress', conclusion=None)
        self.assertEqual(execute().returncode, 0)
        self.assertFalse((self.root / 'approved').exists())
        for invalid in [{'head_sha':'a'*40}, {'head_repository':{'full_name':'foreign/liminal'}}]:
            original = dict(run)
            run.update(invalid)
            self.assertNotEqual(execute().returncode, 0)
            self.assertFalse((self.root / 'approved').exists())
            run = original
        pr['head']['repo']['full_name'] = 'foreign/liminal'
        (self.root / 'pr.json').write_text(json.dumps(pr))
        self.assertNotEqual(execute().returncode, 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
