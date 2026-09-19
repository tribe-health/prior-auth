#!/usr/bin/env python3
"""Focused Tier 1 synthetic Git checks for one-shot runtime snapshots."""

import json
import io
import os
import stat
import tempfile
import unittest
from pathlib import Path
from contextlib import redirect_stderr
from unittest.mock import patch

import ra06d_snapshot_repository as subject


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "source"
        self.source.mkdir()
        self.destination = self.root / "snapshot"
        self.receipt = self.root / "receipt.json"
        self.rules = self.root / "exclusions.json"
        self.rules.write_text(json.dumps({"schema_version": 1, "rules": [
            {"repository": "fixture", "pattern": "history/*", "reason": "process history"}
        ]}))
        subject.git(self.source, "init")
        subject.git(self.source, "config", "user.name", "Synthetic Test")
        subject.git(self.source, "config", "user.email", "test@example.invalid")
        for name in ("mixed", "deleted", "staged-deleted", "executable"):
            (self.source / name).write_text("committed\n")
        (self.source / ".gitignore").write_text("cache/\n.env\n")
        (self.source / "link").symlink_to("mixed")
        subject.git(self.source, "add", ".")
        subject.git(self.source, "commit", "-m", "Synthetic fixture")

    def run_snapshot(self):
        return subject.snapshot(self.source, self.destination, self.rules,
                                "fixture", self.receipt)

    def test_preserves_independent_index_and_worktree(self):
        (self.source / "mixed").write_text("staged\n")
        (self.source / "staged-new").write_text("new staged\n")
        subject.git(self.source, "add", "mixed", "staged-new")
        (self.source / "mixed").write_text("unstaged\n")
        (self.source / "staged-new").write_text("new unstaged\n")
        (self.source / "deleted").unlink()
        subject.git(self.source, "rm", "staged-deleted")
        (self.source / "executable").chmod(0o751)
        (self.source / "untracked").write_text("runtime input\n")
        (self.source / "link").unlink()
        (self.source / "link").symlink_to("untracked")
        for directory in ("cache", "history"):
            (self.source / directory).mkdir()
            (self.source / directory / "omitted").write_text("omit\n")
        (self.source / ".env").write_text("SYNTHETIC_SECRET=omit\n")
        before = subject.git(self.source, "ls-files", "--stage", "-z")
        result = self.run_snapshot()
        self.assertEqual(result["status"], "Passed")
        self.assertFalse(result["external_symlink_referents_frozen"])
        self.assertEqual(before, subject.git(self.source, "ls-files", "--stage", "-z"))
        self.assertEqual(before, subject.git(self.destination, "ls-files", "--stage", "-z"))
        for revision in ("HEAD", "HEAD^{tree}"):
            self.assertEqual(subject.git(self.source, "rev-parse", revision),
                             subject.git(self.destination, "rev-parse", revision))
        self.assertEqual(subject.git(self.destination, "show", ":mixed"), b"staged\n")
        self.assertEqual((self.destination / "mixed").read_text(), "unstaged\n")
        self.assertEqual(subject.git(self.destination, "show", ":staged-new"), b"new staged\n")
        self.assertEqual((self.destination / "staged-new").read_text(), "new unstaged\n")
        self.assertEqual((self.destination / "untracked").read_text(), "runtime input\n")
        self.assertEqual(os.readlink(self.destination / "link"), "untracked")
        self.assertEqual(stat.S_IMODE((self.destination / "executable").stat().st_mode), 0o751)
        for omitted in ("deleted", "staged-deleted", "cache", "history", ".env"):
            self.assertFalse((self.destination / omitted).exists())
        (self.source / "mixed").write_text("later source change\n")
        self.assertEqual((self.destination / "mixed").read_text(), "unstaged\n")

    def test_refuses_existing_destination(self):
        self.destination.mkdir()
        with self.assertRaises(subject.SnapshotError):
            self.run_snapshot()
        self.assertFalse(self.receipt.exists())

    def test_verifies_destination_without_original_source(self):
        result = self.run_snapshot()
        self.source.rename(self.root / "moved-source")
        self.assertEqual(subject.verify_snapshot(self.receipt, self.rules), result)
        with self.assertRaisesRegex(subject.SnapshotError, "selected root"):
            subject.verify_snapshot(self.receipt, self.rules, self.root / "wrong-root")
        (self.destination / "mixed").write_text("later destination edit\n")
        with self.assertRaisesRegex(subject.SnapshotError, "destination changed"):
            subject.verify_snapshot(self.receipt, self.rules)

    def test_verify_cli(self):
        result = self.run_snapshot()
        arguments = ["snapshot", "--verify-receipt", str(self.receipt),
                     "--exclusions", str(self.rules), "--destination", str(self.destination)]
        with patch.object(subject.sys, "argv", arguments), \
                patch("builtins.print") as output:
            self.assertEqual(subject.main(), 0)
        output.assert_called_once_with("Passed: " + result["content_sha256"])

    def test_cli_preserves_safe_errors_and_hides_arbitrary_details(self):
        arguments = ["snapshot", "--source", str(self.source), "--destination",
                     str(self.destination), "--exclusions", str(self.rules),
                     "--label", "fixture", "--receipt", str(self.receipt)]
        for error, expected in (
            (subject.SnapshotError("Source changed during snapshot capture"),
             "Source changed during snapshot capture"),
            (RuntimeError("SYNTHETIC_SECRET=private"), "snapshot capture refused"),
        ):
            with self.subTest(error=type(error).__name__):
                output = io.StringIO()
                with patch.object(subject.sys, "argv", arguments), \
                        patch.object(subject, "snapshot", side_effect=error), \
                        redirect_stderr(output):
                    self.assertEqual(subject.main(), 1)
                self.assertIn(expected, output.getvalue())
                self.assertNotIn("SYNTHETIC_SECRET", output.getvalue())

    def test_refuses_concurrent_source_change(self):
        original = subject.shutil.copy2

        def changing_copy(*args, **kwargs):
            result = original(*args, **kwargs)
            (self.source / "mixed").write_text("concurrent edit\n")
            return result

        with patch.object(subject.shutil, "copy2", side_effect=changing_copy):
            with self.assertRaises(subject.SnapshotError):
                self.run_snapshot()
        self.assertFalse(self.receipt.exists())


if __name__ == "__main__":
    unittest.main()
