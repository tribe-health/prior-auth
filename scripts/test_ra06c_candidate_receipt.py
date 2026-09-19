#!/usr/bin/env python3
"""Local boundary tests for candidate-bound RA06 command receipts."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
MANIFEST_MODULE_PATH = SCRIPT_DIR / "ra06c_candidate_manifest.py"
RECEIPT_SCRIPT = SCRIPT_DIR / "ra06c_candidate_receipt.py"
SPEC = importlib.util.spec_from_file_location(
    "ra06c_candidate_manifest", MANIFEST_MODULE_PATH
)
assert SPEC and SPEC.loader
manifest_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(manifest_module)


def git(root: Path, *args: str) -> None:
    subprocess.run(("git", "-C", str(root), *args), check=True, capture_output=True)


def candidate_manifest(repo: Path, fixture: Path, contract: Path) -> dict[str, object]:
    rules = [
        {"repository": "fixture", "pattern": "evidence/**", "reason": "test evidence"}
    ]
    toolchains = manifest_module.collect_toolchains()
    candidate = {
        "exclusion_contract": {
            "rules": rules,
            "sha256": manifest_module.sha256_bytes(
                manifest_module.canonical({"schema_version": 1, "rules": rules})
            ),
        },
        "repositories": [manifest_module.collect_repository("fixture", repo, rules)],
        "configurations": [],
        "locks": [],
        "fixtures": [manifest_module.path_identity("contract", fixture)],
        "openspec_contracts": [
            manifest_module.openspec_contract_identity("repair", contract)
        ],
        "secret_inputs": [],
        "clocks": [],
        "images": [],
        "toolchains": toolchains,
        "host_build_inputs": manifest_module.collect_host_build_inputs(
            redaction_key=b"ra06c-candidate-receipt-test-key",
            paths=manifest_module.toolchain_paths(),
            toolchains=toolchains,
        ),
    }
    return {
        "schema_version": 1,
        "candidate": candidate,
        "candidate_digest": manifest_module.candidate_digest(candidate),
    }


def run_receipt(
    repo: Path,
    manifest_path: Path,
    receipt_path: Path,
    log_path: Path,
    command: list[str],
    result_outputs: dict[str, Path] | None = None,
    redaction_key_path: Path | None = None,
    fixture: Path | None = None,
    openspec_contract: Path | None = None,
) -> subprocess.CompletedProcess[str]:
    assert redaction_key_path is not None
    assert fixture is not None
    assert openspec_contract is not None
    output_arguments = [
        argument
        for label, path in (result_outputs or {}).items()
        for argument in ("--result-output", f"{label}={path}")
    ]
    return subprocess.run(
        (
            sys.executable,
            str(RECEIPT_SCRIPT),
            "--manifest",
            str(manifest_path),
            "--repo",
            f"fixture={repo}",
            "--fixture",
            f"contract={fixture}",
            "--openspec-contract",
            f"repair={openspec_contract}",
            "--redaction-key",
            str(redaction_key_path),
            "--receipt",
            str(receipt_path),
            "--log",
            str(log_path),
            "--cwd",
            str(repo),
            *output_arguments,
            "--",
            *command,
        ),
        capture_output=True,
        text=True,
        check=False,
    )


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="ra06c-receipt-") as directory:
        repo = Path(directory) / "repo"
        repo.mkdir()
        git(repo, "init", "-q")
        git(repo, "config", "user.email", "receipt@example.invalid")
        git(repo, "config", "user.name", "Receipt Test")
        (repo / "tracked.txt").write_text("frozen\n")
        git(repo, "add", ".")
        git(repo, "commit", "-qm", "fixture")

        evidence = repo / "evidence"
        evidence.mkdir()
        redaction_key_path = evidence / "manifest-hmac.key"
        redaction_key_path.write_bytes(b"ra06c-candidate-receipt-test-key")
        contract_fixture = Path(directory) / "contract-fixture.json"
        contract_fixture.write_text('{"contract":"v1"}\n')
        openspec_contract = Path(directory) / "openspec-change"
        (openspec_contract / "specs" / "repair").mkdir(parents=True)
        (openspec_contract / ".openspec.yaml").write_text("schema: spec-driven\n")
        (openspec_contract / "proposal.md").write_text("# Proposal\n")
        (openspec_contract / "design.md").write_text("# Design\n")
        (openspec_contract / "tasks.md").write_text("- [ ] 1.1 Test\n")
        (openspec_contract / "specs" / "repair" / "spec.md").write_text(
            "# Requirement\n"
        )
        manifest = candidate_manifest(repo, contract_fixture, openspec_contract)
        manifest_path = evidence / "manifest.json"
        manifest_path.write_text(json.dumps(manifest))

        receipt_path = evidence / "success.json"
        log_path = evidence / "success.log"
        result_path = evidence / "result.json"
        success = run_receipt(
            repo,
            manifest_path,
            receipt_path,
            log_path,
            [
                sys.executable,
                "-c",
                (
                    "import json, os, pathlib; "
                    "digest=os.environ['RA06_CANDIDATE_DIGEST']; "
                    f"pathlib.Path({str(result_path)!r}).write_text(json.dumps({{'candidate_digest': digest}})); "
                    "print(digest)"
                ),
                "--api-token",
                "secret-value-must-not-appear",
            ],
            {"campaign": result_path},
            redaction_key_path,
            contract_fixture,
            openspec_contract,
        )
        assert success.returncode == 0, (
            success.stdout + success.stderr + receipt_path.read_text()
        )
        receipt = json.loads(receipt_path.read_text())
        assert receipt["result"] == "Passed"
        assert receipt["candidate_digest"] == manifest["candidate_digest"]
        assert log_path.read_text().strip() == manifest["candidate_digest"]
        assert "secret-value-must-not-appear" not in receipt_path.read_text()
        assert "<redacted-present>" in receipt["command"]
        assert receipt["output_validation_errors"] == []
        assert receipt["outputs"] == [
            {
                "label": "campaign",
                "name": "result.json",
                "sha256": manifest_module.sha256_file(result_path),
                "size": result_path.stat().st_size,
            }
        ]

        mismatch_path = evidence / "mismatch-result.json"
        mismatch = run_receipt(
            repo,
            manifest_path,
            evidence / "mismatch.json",
            evidence / "mismatch.log",
            [
                sys.executable,
                "-c",
                (
                    "import json, pathlib; "
                    f"pathlib.Path({str(mismatch_path)!r}).write_text(json.dumps({{'candidate_digest': 'wrong'}}))"
                ),
            ],
            {"campaign": mismatch_path},
            redaction_key_path,
            contract_fixture,
            openspec_contract,
        )
        assert mismatch.returncode == 1
        mismatch_receipt = json.loads((evidence / "mismatch.json").read_text())
        assert mismatch_receipt["output_validation_errors"] == [
            "result output candidate digest mismatch: campaign"
        ]

        drift_receipt = evidence / "drift.json"
        drift_log = evidence / "drift.log"
        drift = run_receipt(
            repo,
            manifest_path,
            drift_receipt,
            drift_log,
            [
                sys.executable,
                "-c",
                "from pathlib import Path; Path('tracked.txt').write_text('changed\\n')",
            ],
            redaction_key_path=redaction_key_path,
            fixture=contract_fixture,
            openspec_contract=openspec_contract,
        )
        assert drift.returncode == 1
        drift_result = json.loads(drift_receipt.read_text())
        assert drift_result["result"] == "Failed"
        assert drift_result["post_validation_errors"] == [
            "repository changed after manifest capture: fixture"
        ]
        (repo / "tracked.txt").write_text("frozen\n")
        fixture_drift_receipt = evidence / "fixture-drift.json"
        fixture_drift = run_receipt(
            repo,
            manifest_path,
            fixture_drift_receipt,
            evidence / "fixture-drift.log",
            [
                sys.executable,
                "-c",
                (
                    "from pathlib import Path; "
                    f"Path({str(contract_fixture)!r}).write_text('{{\"contract\":\"v2\"}}\\n')"
                ),
            ],
            redaction_key_path=redaction_key_path,
            fixture=contract_fixture,
            openspec_contract=openspec_contract,
        )
        assert fixture_drift.returncode == 1
        fixture_drift_result = json.loads(fixture_drift_receipt.read_text())
        assert fixture_drift_result["post_validation_errors"] == [
            "fixture changed after manifest capture: contract"
        ]
        contract_fixture.write_text('{"contract":"v1"}\n')
        contract_drift_receipt = evidence / "contract-drift.json"
        contract_drift = run_receipt(
            repo,
            manifest_path,
            contract_drift_receipt,
            evidence / "contract-drift.log",
            [
                sys.executable,
                "-c",
                (
                    "from pathlib import Path; "
                    f"Path({str(openspec_contract / 'design.md')!r}).write_text('# Changed design\\n')"
                ),
            ],
            redaction_key_path=redaction_key_path,
            fixture=contract_fixture,
            openspec_contract=openspec_contract,
        )
        assert contract_drift.returncode == 1
        contract_drift_result = json.loads(contract_drift_receipt.read_text())
        assert contract_drift_result["post_validation_errors"] == [
            "OpenSpec contract changed after manifest capture: repair"
        ]
    print(
        "Passed: receipts bind commands, logs, locks, and logical fixtures to an "
        "unchanged candidate digest"
    )


if __name__ == "__main__":
    main()
