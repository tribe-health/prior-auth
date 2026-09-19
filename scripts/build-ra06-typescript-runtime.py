#!/usr/bin/env python3
"""Build the deterministic TypeScript runtime used by the RA06 AST scanner."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import platform
import stat
import tarfile
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = REPOSITORY_ROOT / ".runtime/ra06d02/typescript-runtime.tar.gz"


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def platform_package_name() -> str:
    systems = {"Darwin": "darwin", "Linux": "linux", "Windows": "win32"}
    machines = {"arm64": "arm64", "aarch64": "arm64", "x86_64": "x64", "AMD64": "x64"}
    try:
        return f"typescript-{systems[platform.system()]}-{machines[platform.machine()]}"
    except KeyError as error:
        raise RuntimeError(f"unsupported TypeScript runtime platform: {platform.system()} {platform.machine()}") from error


def runtime_roots() -> tuple[tuple[str, Path], ...]:
    typescript = (REPOSITORY_ROOT / "web/node_modules/typescript").resolve(strict=True)
    native_name = platform_package_name()
    native = (typescript.parent / "@typescript" / native_name).resolve(strict=True)
    return (
        ("node_modules/typescript", typescript),
        (f"node_modules/@typescript/{native_name}", native),
    )


def source_files() -> list[tuple[str, Path, bytes, int]]:
    files: list[tuple[str, Path, bytes, int]] = []
    for archive_root, source_root in runtime_roots():
        for source in sorted(item for item in source_root.rglob("*") if item.is_file()):
            relative = source.relative_to(source_root).as_posix()
            content = source.read_bytes()
            mode = 0o755 if source.stat().st_mode & stat.S_IXUSR else 0o644
            files.append((f"{archive_root}/{relative}", source, content, mode))
    return files


def build_bytes() -> bytes:
    files = source_files()
    manifest = {
        "schema_version": 1,
        "platform_package": platform_package_name(),
        "files": [
            {"path": name, "size": len(content), "sha256": sha256(content), "mode": f"{mode:04o}"}
            for name, _source, content, mode in files
        ],
    }
    output = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=output, compresslevel=9, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w", format=tarfile.PAX_FORMAT) as archive:
            entries = [("runtime-manifest.json", (json.dumps(manifest, sort_keys=True, indent=2) + "\n").encode(), 0o644)]
            entries.extend((name, content, mode) for name, _source, content, mode in files)
            for name, content, mode in entries:
                info = tarfile.TarInfo(name)
                info.size = len(content)
                info.mode = mode
                info.uid = 0
                info.gid = 0
                info.uname = ""
                info.gname = ""
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
            print(f"Failed: deterministic runtime archive drifted: {args.output}")
            return 1
        print(f"Passed: deterministic runtime archive {sha256(built)}")
        return 0
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary.write_bytes(built)
    temporary.replace(args.output)
    print(f"Passed: wrote {args.output} ({len(built)} bytes, sha256:{sha256(built)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
