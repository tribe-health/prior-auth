#!/usr/bin/env python3
"""Verify and record RA06's candidate-bound open RA11c obligation."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_VERSION = 1
SYMBOL = "createEvidenceSyncAdapter"
SCRIPT_ROOT = Path(__file__).resolve().parent
SCANNER_PATH = SCRIPT_ROOT / "detect-ra06-materializer-calls.mjs"
SCANNER_RUNNER_PATH = SCRIPT_ROOT / "run-ra06-materializer-scan.py"
SCANNER_RUNTIME_PATH = SCRIPT_ROOT.parent / ".runtime/ra06d02/typescript-runtime.tar.gz"
ADAPTER_PATH = Path("web/src/shared/sync/electric-shapes.ts")
RA06_DESIGN_PATH = Path("openspec/changes/ra-06-bounded-revocation/design.md")
RA06_TASKS_PATH = Path("openspec/changes/ra-06-bounded-revocation/tasks.md")
RA11C_TASKS_PATH = Path("openspec/changes/ra-11c-sql-materialization/tasks.md")
RA11C_SPEC_PATH = Path(
    "openspec/changes/ra-11c-sql-materialization/specs/ra-11c-sql-materialization/spec.md"
)
CANDIDATE_DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
CHECKED_TASK = re.compile(r"^-[ \t]*\[[xX]\][ \t]+(?P<id>[0-9]+(?:\.[0-9]+)?)\b", re.MULTILINE)
SAFE_DESIGN_TEXT = (
    "RA06 certifies the server revocation path and synchronous consumer fence. "
    "RA11c owns construction of the Electric/PGLite materializer and publication into that fence; "
    "the RA06 candidate records that dependency as open and makes no producer claim."
)
SAFE_TASK_TEXT = (
    "Confirm durable ASO events, the distributed Gate fence, nonempty FRF final-frame cancellation, "
    "the responsive React/Zustand fence, and the candidate-bound open-obligation receipt proving "
    "the real RA11c materializer caller remains visibly open and assigned. Do not claim the RA11c "
    "producer; mark only actually satisfied RA06 work complete."
)
RA11C_SPEC_TEXT = (
    "The real materializer publishes replica authority failure",
    "fence the captured generation before committing SQL",
)


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def file_identity(root: Path, relative: Path) -> dict[str, object]:
    path = root / relative
    if not path.is_file():
        return {"path": relative.as_posix(), "exists": False, "sha256": None, "size": None}
    content = path.read_bytes()
    return {
        "path": relative.as_posix(),
        "exists": True,
        "sha256": sha256_bytes(content),
        "size": len(content),
    }


def scan_typescript(root: Path) -> dict[str, object]:
    completed = subprocess.run(
        (
            sys.executable,
            str(SCANNER_RUNNER_PATH),
            "--runtime",
            str(SCANNER_RUNTIME_PATH),
            "--scanner",
            str(SCANNER_PATH),
            "--",
            "--root",
            str(root),
            "--symbol",
            SYMBOL,
            "--definition",
            ADAPTER_PATH.as_posix(),
        ),
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode:
        raise RuntimeError(
            "TypeScript materializer scan failed: "
            + (completed.stderr.strip() or completed.stdout.strip())
        )
    value = json.loads(completed.stdout)
    if not isinstance(value, dict):
        raise RuntimeError("TypeScript materializer scan did not return an object")
    return value


def load_evidence(path: Path | None) -> set[str]:
    if path is None:
        return set()
    value = json.loads(path.read_text())
    if isinstance(value, dict) and isinstance(value.get("task_evidence"), dict):
        return set(value["task_evidence"])
    if isinstance(value, dict):
        return set(value)
    raise ValueError("RA11c evidence must be a JSON object")


def parser() -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(description=__doc__)
    command.add_argument("--root", default=".")
    command.add_argument("--candidate-digest")
    command.add_argument(
        "--candidate-status",
        choices=("frozen", "provisional-working-tree"),
        default="frozen",
    )
    command.add_argument("--ra11c-evidence")
    command.add_argument("--output", required=True)
    return command


def main() -> int:
    args = parser().parse_args()
    root = Path(args.root).resolve()
    output = Path(args.output)
    digest = args.candidate_digest or os.environ.get("RA06_CANDIDATE_DIGEST", "")
    errors: list[str] = []
    if not CANDIDATE_DIGEST.fullmatch(digest):
        errors.append("candidate digest must use sha256:<64 lowercase hexadecimal characters>")

    identities = {
        "adapter": file_identity(root, ADAPTER_PATH),
        "ra06_design": file_identity(root, RA06_DESIGN_PATH),
        "ra06_tasks": file_identity(root, RA06_TASKS_PATH),
        "ra11c_tasks": file_identity(root, RA11C_TASKS_PATH),
        "ra11c_spec": file_identity(root, RA11C_SPEC_PATH),
        "scanner": file_identity(SCRIPT_ROOT.parent, SCANNER_PATH.relative_to(SCRIPT_ROOT.parent)),
        "scanner_runner": file_identity(
            SCRIPT_ROOT.parent, SCANNER_RUNNER_PATH.relative_to(SCRIPT_ROOT.parent)
        ),
        "scanner_runtime": file_identity(
            SCRIPT_ROOT.parent, SCANNER_RUNTIME_PATH.relative_to(SCRIPT_ROOT.parent)
        ),
    }
    try:
        scan = scan_typescript(root)
    except (OSError, json.JSONDecodeError, RuntimeError) as error:
        scan = {
            "definitions": [],
            "construction_sites": [],
            "imports": [],
            "references": [],
            "source_root_exists": (root / "web/src").is_dir(),
        }
        errors.append(str(error))
    expected_definition = {
        "path": ADAPTER_PATH.as_posix(),
        "line": 131,
    }
    if scan["definitions"] != [expected_definition]:
        errors.append(
            f"expected exactly one {SYMBOL} definition at {ADAPTER_PATH.as_posix()}:131"
        )
    if scan["construction_sites"]:
        errors.append(f"production {SYMBOL} construction site exists")

    ra06_design = (root / RA06_DESIGN_PATH).read_text() if identities["ra06_design"]["exists"] else ""
    ra06_tasks = (root / RA06_TASKS_PATH).read_text() if identities["ra06_tasks"]["exists"] else ""
    ra11c_tasks = (root / RA11C_TASKS_PATH).read_text() if identities["ra11c_tasks"]["exists"] else ""
    ra11c_spec = (root / RA11C_SPEC_PATH).read_text() if identities["ra11c_spec"]["exists"] else ""
    if ra06_design.count(SAFE_DESIGN_TEXT) != 1:
        errors.append("RA06 design open-obligation ownership text drifted")
    if ra06_tasks.count(SAFE_TASK_TEXT) != 1:
        errors.append("RA06 final task open-obligation text drifted")
    for required in RA11C_SPEC_TEXT:
        if required not in ra11c_spec:
            errors.append(f"RA11c specification ownership text missing: {required}")

    checked_tasks = CHECKED_TASK.findall(ra11c_tasks)
    try:
        evidenced_tasks = load_evidence(Path(args.ra11c_evidence) if args.ra11c_evidence else None)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        evidenced_tasks = set()
        errors.append(str(error))
    missing_evidence = sorted(set(checked_tasks) - evidenced_tasks)
    if missing_evidence:
        errors.append(f"checked RA11c tasks lack evidence: {', '.join(missing_evidence)}")
    if checked_tasks:
        errors.append(f"RA11c obligation is no longer wholly open: {', '.join(checked_tasks)}")

    passed = not errors
    receipt: dict[str, object] = {
        "schema_version": SCHEMA_VERSION,
        "candidate_digest": digest or None,
        "candidate_status": args.candidate_status,
        "created_at": timestamp(),
        "result": "Passed" if passed else "Failed",
        "errors": errors,
        "obligation": {
            "id": "ra06-to-ra11c-materializer-producer",
            "owner": "ra-11c-sql-materialization",
            "dependency": "ra-11b-worker-ownership",
            "status": "Blocked",
            "reason": "The production Electric/PGLite materializer caller is absent and RA11c is unchecked.",
        },
        "adapter": {
            "symbol": SYMBOL,
            "expected_definition": expected_definition,
            "symbol_definition_count": len(scan["definitions"]),
            "definitions": scan["definitions"],
            "production_construction_site_count": len(scan["construction_sites"]),
            "production_construction_sites": scan["construction_sites"],
            "imports": scan["imports"],
            "code_references": scan["references"],
        },
        "contracts": {
            "ra06_safe_design_text_present": ra06_design.count(SAFE_DESIGN_TEXT) == 1,
            "ra06_safe_task_text_present": ra06_tasks.count(SAFE_TASK_TEXT) == 1,
            "ra11c_checked_tasks": checked_tasks,
            "ra11c_evidenced_tasks": sorted(evidenced_tasks),
            "ra11c_missing_evidence": missing_evidence,
            "ra11c_required_spec_text_present": {
                required: required in ra11c_spec for required in RA11C_SPEC_TEXT
            },
        },
        "files": identities,
        "command": [Path(sys.executable).name, Path(__file__).name, *sys.argv[1:]],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.write_text(json.dumps(receipt, indent=2) + "\n")
    temporary.replace(output)
    print(f"{receipt['result']}: {digest or 'missing-candidate-digest'}")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
