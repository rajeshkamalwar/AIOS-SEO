"""Negative conformance tests; all mutations and Git history stay in temporary copies."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


def copy_snapshot(source_root, target_root):
    paths = set(subprocess.check_output(['git', 'ls-files'], cwd=source_root, text=True).splitlines())
    # Include new checkpoint artifacts before staging, but not unrelated user files.
    allowed = {'vault', 'packages', 'apps', 'workers', 'tests', 'reports', 'docs', 'spec', 'scripts'}
    untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=source_root, text=True).splitlines()
    paths.update(p for p in untracked if Path(p).parts[0] in allowed)
    for relative in paths:
        source, target = source_root / relative, target_root / relative
        if source.is_file() and '__pycache__' not in source.parts:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)


class VaultGuards(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.baseline = tempfile.TemporaryDirectory(prefix='aios-vault-baseline-')
        cls.addClassCleanup(cls.baseline.cleanup)
        cls.source = Path(cls.baseline.name)
        copy_snapshot(ROOT, cls.source)
        subprocess.run([sys.executable, 'vault/refresh.py'], cwd=cls.source, check=True, capture_output=True)
        for command in (['git', 'init', '-q'], ['git', 'add', '.'],
                        ['git', '-c', 'user.name=Vault test', '-c', 'user.email=vault@example.invalid',
                         '-c', 'commit.gpgsign=false', 'commit', '-qm', 'isolated baseline']):
            subprocess.run(command, cwd=cls.source, check=True, capture_output=True)

    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='aios-vault-case-')
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name) / 'repo'
        shutil.copytree(self.source, self.root)

    def run_guard(self, *arguments, expected=0, message=None):
        result = subprocess.run([sys.executable, 'vault/refresh.py', *arguments], cwd=self.root,
                                text=True, capture_output=True)
        if expected == 0:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        if message:
            self.assertIn(message, result.stdout + result.stderr)
        return result

    def edit(self, relative, before, after):
        path = self.root / relative
        original = path.read_text()
        self.assertIn(before, original)
        path.write_text(original.replace(before, after, 1))

    def test_unchanged_and_append_only_history_pass(self):
        self.run_guard('--check', '--base', 'HEAD')
        path = self.root / 'vault/gaps/GAP-101.md'
        with path.open('a') as out:
            out.write('\n- OPEN — isolated test reopening; prior closure retained.\n')
        self.edit('vault/gaps/GAP-101.md', 'status: "CLOSED"', 'status: "OPEN"')
        self.run_guard()
        self.run_guard('--check', '--base', 'HEAD')

    def test_gap_state_must_match_latest_history(self):
        with (self.root / 'vault/gaps/GAP-101.md').open('a') as out:
            out.write('\n- OPEN — reopened in isolated regression.\n')
        self.run_guard(expected=1, message='Gap state/history mismatch')

    def test_snapshot_includes_new_untracked_checkpoint_artifacts(self):
        report = self.root / 'reports/UNTRACKED-FIXTURE.md'
        report.write_text('# New scoped report\n')
        unrelated = self.root / 'UNRELATED-USER-FILE.txt'
        unrelated.write_text('not a project artifact')
        destination = Path(tempfile.mkdtemp(prefix='aios-vault-snapshot-'))
        self.addCleanup(lambda: shutil.rmtree(destination))
        copy_snapshot(self.root, destination)
        self.assertEqual((destination / 'reports/UNTRACKED-FIXTURE.md').read_text(), report.read_text())
        self.assertFalse((destination / 'UNRELATED-USER-FILE.txt').exists())

    def test_source_and_dependency_changes_stale_all_five_views(self):
        for relative in ('scripts/test-render.mjs', 'package-lock.json', 'packages/jobs/index.ts'):
            with self.subTest(path=relative):
                path = self.root / relative
                original = path.read_bytes()
                path.write_bytes(original + b'\n')
                result = self.run_guard('--check', expected=1, message='Stale views')
                for name in ('03-CURRENT-STATE', '04-COVERAGE-MATRIX', '05-GAP-REGISTER',
                             '06-MILESTONE-TRACKER', '08-TEST-TRACEABILITY'):
                    self.assertIn(name, result.stderr)
                path.write_bytes(original)

    def test_missing_capability_is_rejected(self):
        (self.root / 'vault/capabilities/CAP-HTTP-01.md').unlink()
        self.run_guard(expected=1, message='Capability inventory drift')

    def test_broken_link_is_rejected(self):
        with (self.root / 'vault/00-HOME.md').open('a') as out:
            out.write('\n[missing](does-not-exist.md)\n')
        # Refresh first: manual control pages also participate in the digest.
        self.run_guard(expected=1, message='Broken link')

    def test_unbacked_real_world_promotion_is_rejected(self):
        self.edit('vault/capabilities/CAP-HTTP-01.md', 'maturity: "DEFINED"',
                  'maturity: "REAL_WORLD_VERIFIED"')
        self.run_guard(expected=1, message='scoped proof')

    def test_unbacked_complete_is_rejected(self):
        self.edit('vault/capabilities/CAP-HTTP-01.md', 'completion: "INCOMPLETE"',
                  'completion: "COMPLETE"')
        self.run_guard(expected=1, message='Explicit applicable stages required')

    def test_permanent_gap_deletion_is_rejected(self):
        (self.root / 'vault/gaps/GAP-112.md').unlink()
        # Remove inbound navigation to isolate the historical-deletion guard.
        for path in (self.root / 'vault').rglob('*.md'):
            text = path.read_text()
            if 'GAP-112' in text:
                path.write_text(text.replace('[GAP-112](gaps/GAP-112.md)', 'historical gap')
                               .replace('[GAP-112](GAP-112.md)', 'historical gap'))
        self.run_guard()
        self.run_guard('--check', '--base', 'HEAD', expected=1, message='Permanent gap history deleted')

    def test_old_gap_history_rewrite_is_rejected(self):
        self.edit('vault/gaps/GAP-101.md', '- OPEN —', '- OPEN — rewritten ')
        self.run_guard()
        self.run_guard('--check', '--base', 'HEAD', expected=1, message='Gap history must be append-only')


if __name__ == '__main__':
    unittest.main()
