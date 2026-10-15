import copy
import unittest
from promotion import require_candidate

SHA = 'a' * 40
RUN = {
    'name': 'CI', 'event': 'push', 'head_branch': 'master', 'status': 'completed',
    'conclusion': 'success', 'head_repository': {'full_name': 'misty-step/liminal'}, 'head_sha': SHA,
}
JOBS = [{'name': 'quality', 'conclusion': 'success'}]


class PromotionBoundary(unittest.TestCase):
    def test_current_success(self):
        require_candidate(RUN, JOBS, SHA, SHA)

    def test_stale_head(self):
        with self.assertRaisesRegex(ValueError, 'stale'):
            require_candidate(RUN, JOBS, 'b' * 40, SHA)

    def test_moved_run(self):
        with self.assertRaisesRegex(ValueError, 'moved'):
            require_candidate(RUN, JOBS, SHA, 'b' * 40)

    def test_invalid_sha(self):
        with self.assertRaisesRegex(ValueError, 'invalid'):
            require_candidate(RUN, JOBS, SHA, '../artifact')

    def test_wrong_producer(self):
        for key, value in [('name', 'Publish daily puzzles'), ('event', 'pull_request'),
                           ('head_branch', 'feature'), ('status', 'in_progress'),
                           ('conclusion', 'failure'), ('conclusion', 'skipped'),
                           ('head_repository', {'full_name': 'foreign/liminal'})]:
            with self.subTest(key=key, value=value):
                candidate = copy.deepcopy(RUN)
                candidate[key] = value
                with self.assertRaises(ValueError):
                    require_candidate(candidate, JOBS, SHA, SHA)

    def test_real_quality_required(self):
        for jobs in [[], JOBS * 2, [{'name': 'quality', 'conclusion': 'failure'}],
                     [{'name': 'quality', 'conclusion': 'skipped'}],
                     [{'name': 'quality', 'conclusion': None}]]:
            with self.subTest(jobs=jobs):
                with self.assertRaisesRegex(ValueError, 'quality'):
                    require_candidate(RUN, jobs, SHA, SHA)


if __name__ == '__main__':
    unittest.main()
