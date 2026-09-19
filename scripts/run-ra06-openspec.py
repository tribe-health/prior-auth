#!/usr/bin/env python3
"""Run OpenSpec from the frozen RA06 CLI runtime archive."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_RUNTIME = REPOSITORY_ROOT / ".runtime/ra06d02/openspec-runtime.tar.gz"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_runtime(root: Path) -> dict:
    manifest_path = root / "runtime-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    files = manifest.get("files")
    if (
        manifest.get("schema_version") != 1
        or manifest.get("package") != "@fission-ai/openspec"
        or manifest.get("version") != "1.10.0"
        or not isinstance(files, list)
        or not files
    ):
        raise RuntimeError("OpenSpec runtime manifest is invalid")
    expected = set()
    for entry in files:
        relative = entry["path"]
        expected.add(relative)
        path = root / relative
        if not path.is_file() or path.stat().st_size != entry["size"] or sha256(path) != entry["sha256"]:
            raise RuntimeError(f"OpenSpec runtime file failed validation: {relative}")
        path.chmod(int(entry["mode"], 8))
    actual = {
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_file() and path != manifest_path
    }
    if actual != expected:
        raise RuntimeError("OpenSpec runtime archive contains an unmanifested or absent file")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, default=DEFAULT_RUNTIME)
    parser.add_argument("openspec_args", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if not args.runtime.is_file():
        raise RuntimeError("frozen OpenSpec runtime is absent")
    openspec_args = args.openspec_args[1:] if args.openspec_args[:1] == ["--"] else args.openspec_args
    with tempfile.TemporaryDirectory(prefix="ra06-openspec-runtime-") as directory:
        root = Path(directory)
        with tarfile.open(args.runtime, mode="r:gz") as archive:
            archive.extractall(root, filter="data")
        manifest = validate_runtime(root)
        completed = subprocess.run(
            (
                os.environ.get("RA06_TOOL_NODE", "node"),
                str(root / manifest["entrypoint"]),
                *openspec_args,
            ),
            capture_output=True,
            text=True,
            check=False,
        )
        sys.stdout.write(completed.stdout)
        sys.stderr.write(completed.stderr)
        return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
