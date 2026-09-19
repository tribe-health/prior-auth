#!/usr/bin/env python3
"""Run the RA06 AST scanner from its frozen TypeScript runtime archive."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_RUNTIME = REPOSITORY_ROOT / ".runtime/ra06d02/typescript-runtime.tar.gz"
DEFAULT_SCANNER = REPOSITORY_ROOT / "scripts/detect-ra06-materializer-calls.mjs"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_runtime(root: Path) -> None:
    manifest_path = root / "runtime-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    expected = manifest.get("files")
    if manifest.get("schema_version") != 1 or not isinstance(expected, list) or not expected:
        raise RuntimeError("TypeScript runtime manifest is invalid")
    expected_paths = set()
    for entry in expected:
        relative = entry["path"]
        expected_paths.add(relative)
        path = root / relative
        if not path.is_file() or path.stat().st_size != entry["size"] or sha256(path) != entry["sha256"]:
            raise RuntimeError(f"TypeScript runtime file failed validation: {relative}")
        path.chmod(int(entry["mode"], 8))
    actual_paths = {
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_file() and path != manifest_path
    }
    if actual_paths != expected_paths:
        raise RuntimeError("TypeScript runtime archive contains an unmanifested or absent file")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, default=DEFAULT_RUNTIME)
    parser.add_argument("--scanner", type=Path, default=DEFAULT_SCANNER)
    parser.add_argument("scanner_args", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    scanner_args = args.scanner_args[1:] if args.scanner_args[:1] == ["--"] else args.scanner_args
    if not args.runtime.is_file() or not args.scanner.is_file():
        raise RuntimeError("RA06 scanner or frozen TypeScript runtime is absent")
    with tempfile.TemporaryDirectory(prefix="ra06-typescript-runtime-") as directory:
        root = Path(directory)
        with tarfile.open(args.runtime, mode="r:gz") as archive:
            archive.extractall(root, filter="data")
        validate_runtime(root)
        scanner = root / "scan.mjs"
        shutil.copyfile(args.scanner, scanner)
        completed = subprocess.run(
            (os.environ.get("RA06_TOOL_NODE", "node"), str(scanner), *scanner_args),
            capture_output=True,
            text=True,
            check=False,
        )
        sys.stdout.write(completed.stdout)
        sys.stderr.write(completed.stderr)
        return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
