"""Exercise the real doctor CLI, including its persisted failure diagnostics."""
from datetime import date, datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import unittest


REPO = Path(__file__).resolve().parents[1]
HELPER = Path(os.environ.get('VERIFY_LIMINAL_HELPER', REPO / '.agents/skills/verify-liminal/scripts/verify-liminal'))


class DoctorTests(unittest.TestCase):
    def run_doctor(self, target, extra_env=None):
        with tempfile.TemporaryDirectory(prefix='liminal-doctor-') as out:
            result = subprocess.run([str(HELPER), 'doctor', target], cwd=REPO,
                                    env=os.environ | {'OUT': out} | (extra_env or {}),
                                    capture_output=True, text=True, timeout=30)
            receipt = Path(out, 'doctor.txt').read_text()
            self.assertIn('doctor output saved to ', result.stderr)
            self.assertEqual(result.stdout, receipt)
            self.assertNotIn('Traceback', receipt)
            return result.returncode, receipt

    def test_unreachable_target_keeps_failure_evidence(self):
        with socket.socket() as reserved:
            reserved.bind(('127.0.0.1', 0))
            code, receipt = self.run_doctor(f'http://127.0.0.1:{reserved.getsockname()[1]}')
        self.assertNotEqual(code, 0)
        self.assertIn('FAIL  GET /api/health:', receipt)
        self.assertIn('Connection refused', receipt)
        self.assertIn('/api/today', receipt)

    def test_failed_git_lookup_keeps_revision_failure(self):
        with tempfile.TemporaryDirectory(prefix='liminal-git-') as commands:
            git = Path(commands, 'git')
            # Fail only the remote read; repository discovery still uses real git.
            git.write_text('#!/bin/sh\nfor arg do\n  if [ "$arg" = ls-remote ]; then exit 128; fi\ndone\nexec ' + shutil.which('git') + ' "$@"\n')
            git.chmod(0o755)
            code, receipt = self.run_doctor('prod', {'PATH': commands + os.pathsep + os.environ['PATH']})
        self.assertNotEqual(code, 0)
        self.assertIn('FAIL  revision=', receipt)
        self.assertIn('expected=unreadable: git ls-remote origin master failed', receipt)

    def test_http_and_json_failures_keep_evidence(self):
        for mode in ('http-error', 'invalid-json'):
            with self.subTest(mode=mode), self.server(mode) as base:
                code, receipt = self.run_doctor(base)
                self.assertNotEqual(code, 0)
                self.assertIn('FAIL', receipt)
                self.assertIn('/api/health', receipt)

    def test_healthy_target_saves_success(self):
        with self.server('healthy') as base:
            code, receipt = self.run_doctor(base)
        self.assertEqual(code, 0, receipt)
        self.assertNotIn('FAIL', receipt)
        self.assertIn('ok    /api/health 200 status=ok', receipt)

    @staticmethod
    def server(mode):
        from contextlib import contextmanager

        @contextmanager
        def running():
            class Handler(BaseHTTPRequestHandler):
                def log_message(self, *_):
                    pass

                def do_GET(self):
                    today = datetime.now(timezone.utc).date()
                    number = (today - date(2026, 9, 23)).days + 1
                    status = 200
                    if mode == 'http-error':
                        status, payload = 503, {}
                    elif self.path == '/api/health':
                        payload = {'status': 'ok', 'environment': 'production', 'checks': {'deck': 'ok', 'storage': 'ok'}}
                    elif self.path == '/api/today':
                        payload = {'date': str(today), 'number': number, 'puzzle': {'conditions': [{'text': label} for label in ('one', 'two', 'three')], 'judgeStatus': 'calibrated'}}
                    else:
                        status, payload = 404, {}
                    self.send_response(status)
                    self.end_headers()
                    self.wfile.write(b'not json' if mode == 'invalid-json' else json.dumps(payload).encode())

            server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                yield f'http://127.0.0.1:{server.server_port}'
            finally:
                server.shutdown()
                server.server_close()
                thread.join()
        return running()


if __name__ == '__main__':
    unittest.main()
