"""Read-only diagnostics tests: subprocess and remote calls are fixtures only."""
import importlib.machinery
import importlib.util
import pathlib
import subprocess
import unittest
from unittest.mock import patch

loader = importlib.machinery.SourceFileLoader("maintenance", str(pathlib.Path(__file__).with_name("maintenance-api")))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)


class DiagnosticsTest(unittest.TestCase):
    def setUp(self):
        module._REMOTE_DIAGNOSTICS.update(remoteCommit=None, remoteCheckedAt=None,
                                          remoteError=None, attemptedAt=None)

    def test_remote_cache_and_offline_preserve_verified_hash(self):
        commit = "a" * 40
        def run(command, timeout):
            self.assertNotIn("fetch", command)
            if "ls-remote" in command:
                return subprocess.CompletedProcess(command, 0, commit + "\trefs/heads/main\n", "")
            return subprocess.CompletedProcess(command, 0, "b" * 40, "")
        with patch.object(module, "run", side_effect=run) as runner, patch.object(module.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "ActiveState=inactive\n", "")), patch.object(module.time, "time", return_value=100):
            first = module.diagnostics_status()
            second = module.diagnostics_status()
            self.assertEqual(first["remoteCommit"], commit)
            self.assertEqual(first["remoteCheckedAt"], 100000)
            self.assertEqual(len([call for call in runner.call_args_list if "ls-remote" in call.args[0]]), 1)
            self.assertEqual(second["remoteCommit"], commit)
        with patch.object(module, "run", side_effect=subprocess.TimeoutExpired("https://secret@remote", 5)), patch.object(module.subprocess, "run", side_effect=OSError("secret")), patch.object(module.time, "time", return_value=161):
            failed = module.diagnostics_status()
            self.assertEqual(failed["remoteCommit"], commit)
            self.assertEqual(failed["remoteCheckedAt"], 100000)
            self.assertNotIn("secret", str(failed))
            self.assertIsNotNone(failed["remoteError"])


if __name__ == "__main__":
    unittest.main()
