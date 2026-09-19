#!/usr/bin/env python3
"""Build the deterministic OpenSpec CLI runtime used by RA06 validation."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import shutil
import stat
import tarfile
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = REPOSITORY_ROOT / ".runtime/ra06d02/openspec-runtime.tar.gz"
EXPECTED_PACKAGE = "@fission-ai/openspec"
EXPECTED_VERSION = "1.10.0"


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def package_root() -> Path:
    executable = shutil.which("openspec")
    if executable is None:
        raise RuntimeError("OpenSpec CLI is absent")
    root = Path(executable).resolve(strict=True).parent.parent
    package = json.loads((root / "package.json").read_text())
    if package.get("name") != EXPECTED_PACKAGE or package.get("version") != EXPECTED_VERSION:
        raise RuntimeError(
            f"expected {EXPECTED_PACKAGE} {EXPECTED_VERSION}, found "
            f"{package.get('name')} {package.get('version')}"
        )
    return root


def build_bytes() -> bytes:
    root = package_root()
    files = []
    for path in sorted(item for item in root.rglob("*") if item.is_file()):
        relative = path.relative_to(root).as_posix()
        content = path.read_bytes()
        mode = 0o755 if path.stat().st_mode & stat.S_IXUSR else 0o644
        files.append((f"package/{relative}", content, mode))
    manifest = {
        "schema_version": 1,
        "package": EXPECTED_PACKAGE,
        "version": EXPECTED_VERSION,
        "entrypoint": "package/bin/openspec.js",
        "files": [
            {"path": name, "size": len(content), "sha256": sha256(content), "mode": f"{mode:04o}"}
            for name, content, mode in files
        ],
    }
    output = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=output, compresslevel=9, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w", format=tarfile.PAX_FORMAT) as archive:
            entries = [("runtime-manifest.json", (json.dumps(manifest, sort_keys=True, indent=2) + "\n").encode(), 0o644), *files]
            for name, content, mode in entries:
                info = tarfile.TarInfo(name)
                info.size = len(content)
                info.mode = mode
                info.uid = info.gid = 0
                info.uname = info.gname = ""
                info.mtime = 0
                archive.addfile(info, io.BytesIO(content))
    return output.getvalue()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    built = build_bytes()
    if args.verify:
        if not args.output.is_file() or args.output.read_bytes() != built:
            print(f"Failed: deterministic OpenSpec runtime archive drifted: {args.output}")
            return 1
        print(f"Passed: deterministic OpenSpec runtime archive {sha256(built)}")
        return 0
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary.write_bytes(built)
    temporary.replace(args.output)
    print(f"Passed: wrote {args.output} ({len(built)} bytes, sha256:{sha256(built)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
