#!/usr/bin/env python3
"""Focused local tests for the RA06-to-RA11c open-obligation verifier."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
VERIFIER = REPOSITORY_ROOT / "scripts/verify-ra06-open-obligation.py"
SCANNER_RUNNER = REPOSITORY_ROOT / "scripts/run-ra06-materializer-scan.py"
DIGEST = "sha256:" + "a" * 64
COPIED_PATHS = (
    "web/tsconfig.json",
    "web/src/shared/sync/electric-shapes.ts",
    "openspec/changes/ra-06-bounded-revocation/design.md",
    "openspec/changes/ra-06-bounded-revocation/tasks.md",
    "openspec/changes/ra-11c-sql-materialization/tasks.md",
    "openspec/changes/ra-11c-sql-materialization/specs/ra-11c-sql-materialization/spec.md",
)


def prepare_fixture(root: Path) -> None:
    for relative in COPIED_PATHS:
        source = REPOSITORY_ROOT / relative
        destination = root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    harmless = root / "web/src/app/obligation-reference.ts"
    harmless.parent.mkdir(parents=True, exist_ok=True)
    harmless.write_text(
        "import { createEvidenceSyncAdapter } from '../shared/sync/electric-shapes';\n"
        "// createEvidenceSyncAdapter({ comment: true });\n"
        "const description = 'createEvidenceSyncAdapter({ string: true })';\n"
        "export { createEvidenceSyncAdapter };\n"
    )
    test_only = root / "web/src/app/obligation-reference.test.ts"
    test_only.write_text("createEvidenceSyncAdapter({ testOnly: true });\n")


def run_verifier(root: Path, label: str) -> tuple[subprocess.CompletedProcess[str], dict[str, object]]:
    output = root / "evidence" / f"{label}.json"
    completed = subprocess.run(
        (
            sys.executable,
            str(VERIFIER),
            "--root",
            str(root),
            "--candidate-digest",
            DIGEST,
            "--candidate-status",
            "provisional-working-tree",
            "--output",
            str(output),
        ),
        capture_output=True,
        text=True,
        check=False,
    )
    return completed, json.loads(output.read_text())


def assert_failed(receipt: dict[str, object], expected: str) -> None:
    assert receipt["result"] == "Failed", receipt
    errors = receipt["errors"]
    assert isinstance(errors, list)
    assert any(expected in str(error) for error in errors), errors


def assert_caller_rejected(root: Path, label: str, source: str) -> None:
    caller = root / "web/src/app/runtime.ts"
    caller.write_text(source)
    completed, receipt = run_verifier(root, label)
    assert completed.returncode == 1, completed.stdout + completed.stderr
    assert_failed(receipt, "production createEvidenceSyncAdapter construction site exists")
    sites = receipt["adapter"]["production_construction_sites"]
    assert isinstance(sites, list) and sites, receipt
    caller.unlink()
    print(f"Passed: {label} production caller rejected")


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="ra06-open-obligation-") as directory:
        root = Path(directory)
        prepare_fixture(root)

        missing_runtime = subprocess.run(
            (
                sys.executable,
                str(SCANNER_RUNNER),
                "--runtime",
                str(root / "missing-typescript-runtime.tar.gz"),
                "--scanner",
                str(REPOSITORY_ROOT / "scripts/detect-ra06-materializer-calls.mjs"),
                "--",
                "--root",
                str(root),
                "--symbol",
                "createEvidenceSyncAdapter",
                "--definition",
                "web/src/shared/sync/electric-shapes.ts",
            ),
            capture_output=True,
            text=True,
            check=False,
        )
        assert missing_runtime.returncode != 0
        assert "frozen TypeScript runtime is absent" in missing_runtime.stderr
        print("Passed: absent frozen TypeScript runtime rejected")

        positive, positive_receipt = run_verifier(root, "positive")
        assert positive.returncode == 0, (
            positive.stdout + positive.stderr + json.dumps(positive_receipt["errors"], indent=2)
        )
        assert positive_receipt["result"] == "Passed"
        adapter = positive_receipt["adapter"]
        assert isinstance(adapter, dict)
        assert adapter["symbol_definition_count"] == 1
        assert adapter["production_construction_site_count"] == 0
        assert len(adapter["imports"]) == 1
        assert positive_receipt["obligation"] == {
            "id": "ra06-to-ra11c-materializer-producer",
            "owner": "ra-11c-sql-materialization",
            "dependency": "ra-11b-worker-ownership",
            "status": "Blocked",
            "reason": "The production Electric/PGLite materializer caller is absent and RA11c is unchecked.",
        }
        print("Passed: open definition with imports, comments, strings and test-only calls")

        module_path = "../shared/sync/electric-shapes"
        assert_caller_rejected(
            root,
            "direct-call",
            f'import {{ createEvidenceSyncAdapter }} from "{module_path}";\n'
            "const sync = createEvidenceSyncAdapter(options);\n",
        )
        assert_caller_rejected(
            root,
            "named-import-alias",
            f'import {{ createEvidenceSyncAdapter as buildAdapter }} from "{module_path}";\n'
            "const sync = buildAdapter(options);\n",
        )
        assert_caller_rejected(
            root,
            "namespace-access",
            f'import * as electricShapes from "{module_path}";\n'
            "const sync = electricShapes.createEvidenceSyncAdapter(options);\n",
        )
        assert_caller_rejected(
            root,
            "assigned-reference",
            f'import {{ createEvidenceSyncAdapter }} from "{module_path}";\n'
            "const buildAdapter = createEvidenceSyncAdapter;\n"
            "const sync = buildAdapter(options);\n",
        )
        assert_caller_rejected(
            root,
            "object-indirect-call",
            f'import {{ createEvidenceSyncAdapter }} from "{module_path}";\n'
            "const builders = { evidence: createEvidenceSyncAdapter };\n"
            "const sync = builders.evidence(options);\n",
        )
        assert_caller_rejected(
            root,
            "template-expression-call",
            f'import {{ createEvidenceSyncAdapter as buildAdapter }} from "{module_path}";\n'
            "const description = `adapter ${buildAdapter(options)}`;\n",
        )
        assert_caller_rejected(
            root,
            "call-indirection",
            f'import {{ createEvidenceSyncAdapter as buildAdapter }} from "{module_path}";\n'
            "const sync = buildAdapter.call(undefined, options);\n",
        )

        tasks = root / "openspec/changes/ra-11c-sql-materialization/tasks.md"
        original_tasks = tasks.read_text()
        tasks.write_text(original_tasks.replace("- [ ] 1.1", "- [x] 1.1", 1))
        checked, receipt = run_verifier(root, "checked-without-evidence")
        assert checked.returncode == 1
        assert_failed(receipt, "checked RA11c tasks lack evidence: 1.1")
        tasks.write_text(original_tasks)
        print("Passed: checked RA11c task without evidence rejected")

        adapter_path = root / "web/src/shared/sync/electric-shapes.ts"
        original_adapter = adapter_path.read_text()
        adapter_path.write_text(
            original_adapter.replace(
                "function createEvidenceSyncAdapter(",
                "function removedEvidenceSyncAdapter(",
                1,
            )
        )
        missing_seam, receipt = run_verifier(root, "missing-seam")
        assert missing_seam.returncode == 1
        assert_failed(receipt, "expected exactly one createEvidenceSyncAdapter definition")
        adapter_path.write_text(original_adapter)
        print("Passed: missing adapter seam rejected")

        design = root / "openspec/changes/ra-06-bounded-revocation/design.md"
        original_design = design.read_text()
        design.write_text(original_design.replace("makes no producer claim", "claims the producer complete", 1))
        claim_drift, receipt = run_verifier(root, "claim-drift")
        assert claim_drift.returncode == 1
        assert_failed(receipt, "RA06 design open-obligation ownership text drifted")
        print("Passed: RA06 producer-claim drift rejected")

    print(
        "Passed: open-obligation verifier accepts the open seam and rejects direct, aliased, "
        "namespace, assigned, object-indirect, template-expression and call-indirect production callers, "
        "checked-without-evidence RA11c task, missing adapter seam and RA06 claim drift"
    )


if __name__ == "__main__":
    main()
