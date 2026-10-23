import copy
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import promotion
from promotion import require_candidate, require_forward

SHA = 'a' * 40
RUN = {
    'name': 'CI', 'event': 'push', 'head_branch': 'master', 'status': 'completed',
    'conclusion': 'success', 'head_repository': {'full_name': 'misty-step/liminal'}, 'head_sha': SHA,
}
JOBS = [{'name': 'quality', 'conclusion': 'success'}]


class PromotionBoundary(unittest.TestCase):
    def test_current_success(self):
        require_candidate(RUN, JOBS, SHA)

    def test_moved_run(self):
        with self.assertRaisesRegex(ValueError, 'moved'):
            require_candidate(RUN, JOBS, 'b' * 40)

    def test_invalid_sha(self):
        with self.assertRaisesRegex(ValueError, 'invalid'):
            require_candidate(RUN, JOBS, '../artifact')

    def test_wrong_producer(self):
        for key, value in [('name', 'Publish daily puzzles'), ('event', 'pull_request'),
                           ('head_branch', 'feature'), ('status', 'in_progress'),
                           ('conclusion', 'failure'), ('conclusion', 'skipped'),
                           ('head_repository', {'full_name': 'foreign/liminal'})]:
            with self.subTest(key=key, value=value):
                candidate = copy.deepcopy(RUN)
                candidate[key] = value
                with self.assertRaises(ValueError):
                    require_candidate(candidate, JOBS, SHA)

    def test_real_quality_required(self):
        for jobs in [[], JOBS * 2, [{'name': 'quality', 'conclusion': 'failure'}],
                     [{'name': 'quality', 'conclusion': 'skipped'}],
                     [{'name': 'quality', 'conclusion': None}]]:
            with self.subTest(jobs=jobs):
                with self.assertRaisesRegex(ValueError, 'quality'):
                    require_candidate(RUN, jobs, SHA)


class ForwardPromotion(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.cwd = os.getcwd()
        os.chdir(self.directory.name)
        self.addCleanup(os.chdir, self.cwd)
        self.git('init', '--quiet')
        self.git('config', 'user.name', 'Synthetic promotion test')
        self.git('config', 'user.email', 'promotion@example.invalid')
        self.live = self.commit('live')
        self.candidate = self.commit('candidate')
        self.head = self.commit('newer master')

    def git(self, *args):
        return subprocess.check_output(['git', *args], stderr=subprocess.DEVNULL, text=True).strip()

    def commit(self, message):
        self.git('commit', '--quiet', '--allow-empty', '-m', message)
        return self.git('rev-parse', 'HEAD')

    def test_tested_candidate_is_allowed_after_master_advances(self):
        run = {**RUN, 'head_sha': self.candidate}
        require_candidate(run, JOBS, self.candidate)
        require_forward(self.live, self.candidate)
        self.assertNotEqual(self.head, self.candidate)

    def test_same_serving_revision_is_not_backward(self):
        require_forward(self.live, self.live)

    def test_older_candidate_is_refused(self):
        with self.assertRaisesRegex(ValueError, 'serving revision'):
            require_forward(self.head, self.candidate)

    def test_diverged_candidate_is_refused(self):
        self.git('checkout', '--quiet', '--detach', self.live)
        divergent = self.commit('diverged')
        with self.assertRaisesRegex(ValueError, 'serving revision'):
            require_forward(self.candidate, divergent)

    def test_unknown_serving_revision_is_refused(self):
        with self.assertRaisesRegex(ValueError, 'serving revision'):
            require_forward('f' * 40, self.candidate)

    def test_invalid_serving_revision_is_refused_without_git(self):
        for live in [None, '', '../artifact', 'x' * 40]:
            with self.subTest(live=live), patch.object(promotion.subprocess, 'run') as run:
                with self.assertRaisesRegex(ValueError, 'invalid serving revision'):
                    require_forward(live, self.candidate)
                run.assert_not_called()

    def run_promotion(self, versions, deployment_error=False, environment='production'):
        Path('.open-next').mkdir(exist_ok=True)
        Path('.open-next/SOURCE_SHA').write_text(self.candidate)
        health = {'status': 'ok', 'revision': self.live, 'checks': {'deck': 'ok', 'storage': 'ok'}}
        if environment is not None:
            health['environment'] = environment
        calls = []
        native_run = subprocess.run

        def command(argv, **kwargs):
            calls.append(argv)
            if argv[0] == 'git':
                return native_run(argv, **kwargs)
            if deployment_error and argv[:4] == ['bunx', '--no-install', 'wrangler', 'deploy']:
                raise subprocess.CalledProcessError(1, argv)
            return subprocess.CompletedProcess(argv, 0)

        def github(path):
            if path == 'actions/runs/123':
                return {**RUN, 'head_sha': self.candidate}
            if path == 'actions/runs/123/jobs?per_page=100':
                return {'jobs': JOBS}
            if path == 'git/ref/heads/master':
                return {'object': {'sha': self.head}}
            raise AssertionError(f'unexpected GitHub request: {path}')

        with patch.dict(os.environ, CI_RUN_ID='123'), \
             patch.object(promotion, 'github', side_effect=github), \
             patch.object(promotion, 'active_version', side_effect=versions), \
             patch.object(promotion, 'read_health', return_value=health), \
             patch.object(promotion, 'wait_health', side_effect=lambda expected: expected), \
             patch.object(promotion.subprocess, 'run', side_effect=command):
            try:
                promotion.main()
            finally:
                self.commands = calls

    def test_main_promotes_behind_head_but_ahead_of_serving_revision(self):
        self.run_promotion(['previous', 'previous', 'candidate'])
        self.assertTrue(any(argv[:4] == ['bunx', '--no-install', 'wrangler', 'deploy']
                            for argv in self.commands))
        self.assertIn('promoted', Path('promotion-receipt.json').read_text())

    def test_changed_native_baseline_refuses_without_provider_writes(self):
        with self.assertRaisesRegex(RuntimeError, 'active version changed'):
            self.run_promotion(['previous', 'another-writer'])
        self.assertFalse(any(argv[0] == 'bunx' for argv in self.commands))

    def test_nonproduction_identity_refuses_without_provider_writes(self):
        for environment in [None, 'staging', 'development', 'invalid']:
            with self.subTest(environment=environment):
                with self.assertRaisesRegex(RuntimeError, 'previous release is not healthy'):
                    self.run_promotion(['previous'], environment=environment)
                self.assertFalse(any(argv[0] == 'bunx' for argv in self.commands))

    def test_failed_deployment_retains_prior_version_recovery(self):
        with self.assertRaises(subprocess.CalledProcessError):
            self.run_promotion(['previous', 'previous', 'previous'], deployment_error=True)
        self.assertTrue(any(argv[:5] == ['bunx', '--no-install', 'wrangler', 'rollback', 'previous']
                            for argv in self.commands))
        self.assertIn('rolled-back', Path('promotion-receipt.json').read_text())


if __name__ == '__main__':
    unittest.main()




