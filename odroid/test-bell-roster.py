#!/usr/bin/env python3
"""Offline roster export tests using disposable repositories and a local bare remote."""
import contextlib
import copy
import fcntl
import importlib.machinery
import importlib.util
import io
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

loader = importlib.machinery.SourceFileLoader('bell_roster_command', str(Path(__file__).with_name('bell-roster')))
spec = importlib.util.spec_from_loader(loader.name, loader)
b = importlib.util.module_from_spec(spec)
loader.exec_module(b)


class RosterPushTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.base = Path(directory.name)
        self.repo = self.base / 'repo'
        self.remote = self.base / 'remote.git'
        self.repo.mkdir()
        self.command('init', '--bare', str(self.remote))
        self.command('init', '--initial-branch=main')
        self.command('config', 'user.name', 'Roster test')
        self.command('config', 'user.email', 'roster-test@example.invalid')
        self.command('config', 'commit.gpgsign', 'false')
        self.command('remote', 'add', 'origin', str(self.remote))
        self.defaults = json.loads(Path(__file__).with_name('bell-defaults.json').read_text())
        self.target = self.repo / b.ROSTER_PATH
        self.target.parent.mkdir()
        self.target.write_text(json.dumps(self.defaults, indent=2) + '\n')
        (self.repo / 'README.md').write_text('Original deployment content\n')
        self.command('add', '.')
        self.command('commit', '-m', 'Fixture defaults')
        self.command('push', 'origin', 'main')
        self.initial_head = self.command('rev-parse', 'HEAD')
        self.live = copy.deepcopy(self.defaults)
        self.live.update(paused=False, active_profile='short', gap_seconds=2, bell_duration_seconds=3)
        self.live['profiles']['short'] = ['08:20x2', '12:00']
        self.live['relays'] = [{'id': 'a8032abc4265'}, {'id': '08b61fd8993d'}]
        for name, value in [('REPO', self.repo), ('DEFAULTS_FILE', self.target), ('UPDATE_LOCK', self.base / 'update.lock')]:
            replacement = patch.object(b, name, value)
            replacement.start()
            self.addCleanup(replacement.stop)
        replacement = patch.object(b, 'load_live_config', side_effect=lambda: (7, copy.deepcopy(self.live)))
        replacement.start()
        self.addCleanup(replacement.stop)

    def command(self, *args, cwd=None):
        return subprocess.run(['git', *args], cwd=cwd or self.repo, capture_output=True, text=True, check=True).stdout.strip()

    def run_push(self):
        with contextlib.redirect_stdout(io.StringIO()):
            return b.push()

    def remote_defaults(self):
        return json.loads(self.command('--git-dir', str(self.remote), 'show', 'main:' + b.ROSTER_PATH))

    def test_exports_only_schedule_and_preserves_checkout_and_staging(self):
        (self.repo / 'README.md').write_text('Uncommitted maintainer edit\n')
        self.command('add', 'README.md')
        staged = self.command('diff', '--cached')
        original_defaults = self.target.read_bytes()
        self.assertEqual(self.run_push(), 0)
        remote = self.remote_defaults()
        for field in b.SCHEDULE_FIELDS:
            self.assertEqual(remote[field], self.live[field])
        self.assertEqual(remote['paused'], self.defaults['paused'])
        self.assertEqual(remote['active_profile'], self.defaults['active_profile'])
        self.assertEqual(remote['relays'], self.defaults['relays'])
        self.assertEqual(self.command('rev-parse', 'HEAD'), self.initial_head)
        self.assertEqual(self.command('diff', '--cached'), staged)
        self.assertEqual(self.target.read_bytes(), original_defaults)
        self.assertEqual(self.command('--git-dir', str(self.remote), 'show', 'main:README.md'), 'Original deployment content')
        self.assertEqual(self.command('worktree', 'list', '--porcelain').count('worktree '), 1)
        self.assertEqual(self.command('for-each-ref', 'refs/kennemer/bell-roster-pending'), '')

    def test_no_commit_for_mode_or_relay_changes_only(self):
        for field in b.SCHEDULE_FIELDS:
            self.live[field] = copy.deepcopy(self.defaults[field])
        self.assertEqual(self.run_push(), 0)
        self.assertEqual(self.command('--git-dir', str(self.remote), 'rev-parse', 'main'), self.initial_head)

    def test_failed_push_retains_commit_without_force_or_checkout_change(self):
        original_git = b.git
        pushes = []
        def failing_push(*args, **kwargs):
            if args[0] == 'push':
                pushes.append(args)
                raise b.GitCommandError('Push rejected')
            return original_git(*args, **kwargs)
        with patch.object(b, 'git', side_effect=failing_push):
            with self.assertRaises(b.GitCommandError):
                self.run_push()
        self.assertEqual(pushes, [('push', 'origin', 'HEAD:refs/heads/main')])
        retained = self.command('for-each-ref', '--format=%(objectname)', 'refs/kennemer/bell-roster-pending')
        self.assertTrue(retained)
        self.assertEqual(self.command('rev-parse', 'HEAD'), self.initial_head)
        self.assertEqual(self.command('--git-dir', str(self.remote), 'rev-parse', 'main'), self.initial_head)
        self.assertEqual(self.command('worktree', 'list', '--porcelain').count('worktree '), 1)

    def test_shared_update_lock_prevents_concurrent_export(self):
        with b.UPDATE_LOCK.open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(RuntimeError, 'Another Kennemer update'):
                self.run_push()
        self.assertEqual(self.command('--git-dir', str(self.remote), 'rev-parse', 'main'), self.initial_head)

    def test_invalid_saved_schedule_never_commits(self):
        self.live['bell_duration_seconds'] = 0
        with self.assertRaises(ValueError):
            self.run_push()
        self.assertEqual(self.command('--git-dir', str(self.remote), 'rev-parse', 'main'), self.initial_head)


if __name__ == '__main__':
    unittest.main()
