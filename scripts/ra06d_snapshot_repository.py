#!/usr/bin/env python3
"""Capture a new local runtime checkout; never refresh a passed snapshot.

Ignored files and exclusion-contract paths are omitted from the worktree.
Git history and the complete logical index are preserved, so exclusions do not
erase secrets already committed to Git. The caller must supply a clean history
and an exclusion contract covering any nonignored private runtime inputs.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import stat
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from ra06c_candidate_manifest import (
    canonical, collect_repository, comparable_repository, load_rules,
    sha256_bytes, sha256_file,
)


class SnapshotError(RuntimeError):
    """Capture cannot establish an unchanged source and equivalent destination."""


def git(root: Path, *args: str, data: bytes | None = None) -> bytes:
    result = subprocess.run(
        ["git", "-C", str(root), *args], input=data, capture_output=True,
        env={**os.environ, "GIT_OPTIONAL_LOCKS": "0"}, check=False,
    )
    if result.returncode:
        # Git diagnostics can contain source content, credentials, or paths.
        raise SnapshotError("Git operation failed during snapshot capture")
    return result.stdout


def capture(label: str, root: Path, rules: list[dict]) -> tuple[dict, bytes]:
    repository = comparable_repository(collect_repository(label, root, rules))
    index = git(root, "ls-files", "--stage", "-z")
    for record in index.split(b"\0"):
        if record and (record.split(b"\t", 1)[0].split()[2] != b"0"
                       or record.startswith(b"160000 ")):
            raise SnapshotError("Unmerged indexes and submodules require separate capture")
    exact = []
    for entry in repository["files"]:
        path = root / entry["path"]
        if entry["kind"] == "file":
            metadata = path.lstat()
            if not stat.S_ISREG(metadata.st_mode):
                raise SnapshotError("Source file changed type during capture")
            exact.append({"path": entry["path"], "mode": stat.S_IMODE(metadata.st_mode),
                          "sha256": sha256_file(path)})
        elif entry["kind"] not in ("symlink", "deleted"):
            raise SnapshotError("Unsupported runtime input type")
    return {"repository": repository, "exact_files": exact,
            "index_sha256": sha256_bytes(index)}, index


def snapshot(source: Path, destination: Path, exclusions: Path,
             label: str, receipt: Path) -> dict:
    source = source.resolve(strict=True)
    destination = destination.absolute()
    receipt = receipt.absolute()
    if os.path.lexists(destination) or os.path.lexists(receipt):
        raise SnapshotError("Destination and receipt must both be new")
    for output in (destination.resolve(), receipt.resolve()):
        if output.is_relative_to(source):
            raise SnapshotError("Snapshot outputs must be outside the source")
    if receipt.resolve().is_relative_to(destination.resolve()):
        raise SnapshotError("Receipt must be outside the runtime snapshot")
    rules, rules_digest = load_rules(exclusions)
    before, index = capture(label, source, rules)
    destination.mkdir(parents=False)
    git(source, "clone", "--no-hardlinks", "--no-checkout", "--",
        str(source), str(destination))
    # Set detached HEAD without checking out committed files or running filters.
    (destination / ".git" / "HEAD").write_text(
        before["repository"]["head"] + "\n")
    # Local clones normally copy staged objects too; transfer only missing blobs.
    oids = sorted({record.split(b"\t", 1)[0].split()[1]
                   for record in index.split(b"\0") if record})
    objects = git(destination, "cat-file", "--batch-check",
                  data=b"".join(oid + b"\n" for oid in oids)).splitlines()
    if len(objects) != len(oids):
        raise SnapshotError("Staged object inventory mismatch")
    for oid, record in zip(oids, objects):
        fields = record.split()
        if fields[:2] == [oid, b"blob"]:
            continue
        if fields != [oid, b"missing"]:
            raise SnapshotError("Staged object inventory mismatch")
        blob = git(source, "cat-file", "blob", oid.decode("ascii"))
        if git(destination, "hash-object", "-w", "--stdin", data=blob).strip() != oid:
            raise SnapshotError("Staged object identity mismatch")
    git(destination, "update-index", "-z", "--index-info", data=index)
    for entry in before["repository"]["files"]:
        if entry["kind"] == "deleted":
            continue
        original = source / entry["path"]
        target = destination / entry["path"]
        target.parent.mkdir(parents=True, exist_ok=True)
        if entry["kind"] == "symlink":
            target.symlink_to(os.readlink(original))
        else:
            shutil.copy2(original, target, follow_symlinks=False)
    after, _ = capture(label, source, rules)
    copied, _ = capture(label, destination, rules)
    if before != after:
        raise SnapshotError("Source changed during snapshot capture; retry with a new destination")
    if before != copied:
        raise SnapshotError("Destination does not match captured source")
    result = {
        "schema_version": 1, "status": "Passed", "label": label,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": str(source), "destination": str(destination),
        "head": before["repository"]["head"],
        "head_tree": before["repository"]["head_tree"],
        "index_sha256": before["index_sha256"],
        "content_sha256": sha256_bytes(canonical(before)),
        "exclusion_contract_sha256": rules_digest,
        "source_before_equals_after": True, "destination_matches_source": True,
        "external_symlink_referents_frozen": False,
    }
    with receipt.open("x") as output:
        json.dump(result, output, indent=2)
        output.write("\n")
    return result


def verify_snapshot(receipt: Path, exclusions: Path,
                    destination: Path | None = None) -> dict:
    """Verify the retained destination against its receipt, without the source."""
    result = json.loads(receipt.read_text())
    if result.get("schema_version") != 1 or result.get("status") != "Passed":
        raise SnapshotError("Snapshot receipt is not a passed supported capture")
    if destination is not None and Path(result["destination"]).resolve() != destination.resolve():
        raise SnapshotError("Snapshot receipt destination does not match selected root")
    rules, rules_digest = load_rules(exclusions)
    if result.get("exclusion_contract_sha256") != rules_digest:
        raise SnapshotError("Snapshot exclusion contract changed")
    current, _ = capture(result["label"], Path(result["destination"]), rules)
    if (
        result.get("content_sha256") != sha256_bytes(canonical(current))
        or result.get("head") != current["repository"]["head"]
        or result.get("head_tree") != current["repository"]["head_tree"]
        or result.get("index_sha256") != current["index_sha256"]
    ):
        raise SnapshotError("Snapshot destination changed after capture")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-receipt")
    parser.add_argument("--exclusions", required=True)
    for name in ("source", "destination", "label", "receipt"):
        parser.add_argument("--" + name)
    args = parser.parse_args()
    capture_arguments = (args.source, args.destination, args.label, args.receipt)
    if args.verify_receipt and any((args.source, args.label, args.receipt)):
        parser.error("--verify-receipt cannot be combined with capture arguments")
    if not args.verify_receipt and not all(capture_arguments):
        parser.error("capture requires --source, --destination, --label and --receipt")
    try:
        if args.verify_receipt:
            result = verify_snapshot(Path(args.verify_receipt), Path(args.exclusions),
                                     Path(args.destination) if args.destination else None)
        else:
            result = snapshot(Path(args.source), Path(args.destination),
                              Path(args.exclusions), args.label, Path(args.receipt))
    except SnapshotError as error:
        print(f"Failed: {error}", file=sys.stderr)
        return 1
    except Exception:
        print("Failed: snapshot capture refused or verification could not complete", file=sys.stderr)
        return 1
    print("Passed: " + result["content_sha256"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
