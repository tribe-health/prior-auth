#!/usr/bin/env python3
"""Verify the RA11a blocked-candidate receipt and non-adoption boundary."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
import tomllib
from urllib.parse import parse_qs, urlsplit


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = (
    ROOT
    / ".kbd-orchestrator/phases/runtime-architecture/evidence/ra-11a-sync-conformance"
)
DEFAULT_OUTPUT = EVIDENCE / "task-7-blocked-candidate-verification.json"
LOCAL_INPUT_PATHS = (
    "conformance/ra11a-sync/package.json",
    "conformance/ra11a-sync/pnpm-lock.yaml",
    "conformance/ra11a-sync/pnpm-workspace.yaml",
    "conformance/ra11a-sync/report-gate.ts",
    "conformance/ra11a-sync/run.ts",
    "docker-compose.ra05.yaml",
    "docker-compose.yaml",
    "docker/flint-gate/config.ra05.yaml",
    "docker/frf/shape-catalog.json",
    "scripts/ra05-stack.sh",
    "scripts/ra06c_campaign_config.py",
    "scripts/test-authorized-shape-composition.py",
    "scripts/test-ra11a-sync-conformance.py",
    "versions.toml",
    "web/src/shared/sync/pglite-schema.ts",
    "web/package.json",
)
EXPECTED_DECISION = (
    "Blocked: @electric-sql/pglite-sync 0.6.9 with @electric-sql/pglite 0.5.8, "
    "@electric-sql/client 1.0.14, and @electric-sql/experimental 1.0.14 received "
    "HTTP 400 for unsupported log=full at the authorized FRF facade before "
    "materialization and has not proved crash-safe coordinated commits; adoption "
    "is prohibited. A future candidate must still pass the 512 MiB incremental "
    "RSS gate."
)


def load_json(path: Path):
    return json.loads(path.read_text())


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def installed_package_artifacts(
    selected_candidate: dict[str, str],
) -> dict[str, dict[str, str]]:
    store = ROOT / "conformance/ra11a-sync/node_modules/.pnpm"
    artifacts: dict[str, dict[str, str]] = {}
    for name, version in selected_candidate.items():
        scope, leaf = name.split("/", 1)
        matches: dict[Path, tuple[Path, dict[str, object]]] = {}
        for package_path in store.glob(f"*/node_modules/{scope}/{leaf}/package.json"):
            metadata = load_json(package_path)
            if metadata.get("name") == name and metadata.get("version") == version:
                matches[package_path.resolve()] = (package_path.resolve(), metadata)
        if len(matches) != 1:
            raise ValueError(
                f"expected one installed {name}@{version}, found {len(matches)}"
            )
        package_path, metadata = next(iter(matches.values()))
        export = metadata.get("exports", {}).get(".", {}).get("import", {})
        relative_entry = export.get("default") if isinstance(export, dict) else None
        if not isinstance(relative_entry, str):
            raise ValueError(f"installed {name}@{version} has no ESM export entry")
        artifacts[name] = {
            "entrySha256": sha256(package_path.parent / relative_entry),
            "version": version,
        }
    return artifacts


def check(name: str, condition: bool, **details):
    return {
        "name": name,
        "result": "Passed" if condition else "Failed",
        **details,
    }


def ra11a_decision_is_exact(versions: dict[str, object]) -> bool:
    return versions.get("decisions", {}).get("ra11a_sql_materializer") == EXPECTED_DECISION


def verify() -> dict[str, object]:
    live = load_json(EVIDENCE / "task-5-real-facade.json")
    restart = load_json(EVIDENCE / "task-6-restart-refetch.json")
    conformance_package = load_json(ROOT / "conformance/ra11a-sync/package.json")
    web_package = load_json(ROOT / "web/package.json")
    with (ROOT / "versions.toml").open("rb") as source:
        versions = tomllib.load(source)
    materializer = live.get("materializer", {})
    observations = materializer.get("http") or []
    failed_observations = [
        item
        for item in observations
        if isinstance(item, dict) and item.get("status", 0) >= 400
    ]
    observation = failed_observations[0] if len(failed_observations) == 1 else {}
    materializer_failure = materializer.get("failure")
    failure_url = None
    failure_prefix = "HTTP Error 400 at "
    failure_suffix = ": parameter not allowed: log"
    if (
        isinstance(materializer_failure, str)
        and materializer_failure.startswith(failure_prefix)
        and materializer_failure.endswith(failure_suffix)
    ):
        failure_url = urlsplit(
            materializer_failure[len(failure_prefix) : -len(failure_suffix)]
        )
    exact_failure_binding = (
        isinstance(materializer_failure, str)
        and bool(materializer_failure)
        and len(failed_observations) == 1
        and observation.get("status") == 400
        and observation.get("path") == "/v1/shape"
        and observation.get("query", {}).get("log") == ["full"]
        and observation.get("bodyPreview") == "parameter not allowed: log"
        and failure_url is not None
        and failure_url.path == observation.get("path")
        and parse_qs(failure_url.query, keep_blank_values=True)
        == observation.get("query")
    )
    execution = live.get("materializer", {}).get("execution", {})
    role_state = live.get("role_state", {})
    service_state = live.get("service_state", {})
    data_dir_value = live.get("isolated_data_dir")
    recorded_data_dir = (
        (ROOT / data_dir_value).resolve()
        if isinstance(data_dir_value, str)
        else ROOT
    )
    allowed_data_root = (ROOT / ".runtime/ra11a-data").resolve()
    selected_candidate = {
        "@electric-sql/client": "1.0.14",
        "@electric-sql/experimental": "1.0.14",
        "@electric-sql/pglite": "0.5.8",
        "@electric-sql/pglite-sync": "0.6.9",
    }
    direct_candidate = {
        name: version
        for name, version in selected_candidate.items()
        if name != "@electric-sql/experimental"
    }
    expected_execution = {
        "coordinatorSha256": sha256(ROOT / "scripts/test-ra11a-sync-conformance.py"),
        "executableSha256": sha256(ROOT / "conformance/ra11a-sync/run.ts"),
        "localInputs": {
            path: sha256(ROOT / path) for path in LOCAL_INPUT_PATHS
        },
        "lockfileSha256": sha256(ROOT / "conformance/ra11a-sync/pnpm-lock.yaml"),
        "packageArtifacts": installed_package_artifacts(selected_candidate),
    }
    cleanup = live.get("cleanup", {})
    required_cleanup = {
        "campaign_services",
        "grant_callback",
        "isolated_pglite_store",
        "synthetic_identities",
        "synthetic_relational_rows",
    }
    required_relational_tables = {
        "case_evidence",
        "cases",
        "document_types",
        "documents",
        "evidence_citations",
        "patients",
        "payers",
        "policies",
        "policy_criteria",
        "policy_types",
        "practices",
        "users",
    }
    restart_claims = restart.get("claims", {})
    remaining_relational_rows = live.get("remaining_relational_rows", {})
    checks = [
        check(
            "exact_candidate_closure",
            conformance_package.get("dependencies") == direct_candidate,
            selected_candidate=selected_candidate,
        ),
        check(
            "live_receipt_matches_selected_candidate",
            live.get("materializer", {}).get("candidate") == selected_candidate,
            observed_candidate=live.get("materializer", {}).get("candidate"),
        ),
        check(
            "live_receipt_matches_final_executables_and_lock",
            execution == expected_execution,
            expected_execution=expected_execution,
            observed_execution=execution,
        ),
        check("real_run_is_blocked", live.get("result") == "Blocked"),
        check(
            "blocked_receipt_has_clean_finalization",
            materializer.get("result") == "Blocked"
            and live.get("materializer_exit_code") == 2
            and materializer.get("failureClass")
            == "authorized-shape-facade-protocol-incompatibility"
            and materializer.get("checks", {}).get("finalTeardown") is True
            and materializer.get("checks", {}).get(
                "noUnexpectedUnhandledRejections"
            )
            is True
            and isinstance(materializer.get("unhandledRejections"), list)
            and len(materializer.get("unhandledRejections")) == 1
            and materializer.get("unhandledRejections")[0]
            == materializer_failure
            and exact_failure_binding,
            observed_result=materializer.get("result"),
            observed_exit_code=live.get("materializer_exit_code"),
            observed_failure_class=materializer.get("failureClass"),
            observed_checks=materializer.get("checks"),
            observed_unhandled_rejections=materializer.get("unhandledRejections"),
        ),
        check(
            "real_facade_rejected_mandatory_log_parameter",
            observation.get("status") == 400
            and observation.get("query", {}).get("log") == ["full"]
            and observation.get("bodyPreview") == "parameter not allowed: log",
            status=observation.get("status"),
        ),
        check(
            "no_committed_boundary_was_claimed",
            live.get("materializer", {}).get("committedBoundary") is None,
        ),
        check(
            "memory_measurement_was_recorded",
            isinstance(
                live.get("materializer", {})
                .get("memory", {})
                .get("incrementalPeak", {})
                .get("rssBytes"),
                int,
            )
            and live.get("materializer", {})
            .get("memory", {})
            .get("incrementalPeak", {})
            .get("rssBytes", -1)
            >= 0,
            incremental_rss_bytes=live.get("materializer", {})
            .get("memory", {})
            .get("incrementalPeak", {})
            .get("rssBytes"),
        ),
        check(
            "restart_claims_remain_unverified",
            restart.get("result") == "Blocked"
            and restart_claims.get("processRestartExecuted") is False
            and restart_claims.get("resumeIsIdempotent") == "Unverified"
            and restart_claims.get("rowsAreNotSkipped") == "Unverified"
            and restart_claims.get("obsoleteRefetchRowsRemovedCoherently")
            == "Unverified",
            observed_claims=restart_claims,
        ),
        check(
            "production_manifest_does_not_adopt_candidate",
            "@electric-sql/pglite-sync"
            not in {
                **web_package.get("dependencies", {}),
                **web_package.get("devDependencies", {}),
            },
        ),
        check(
            "versions_authority_records_block",
            ra11a_decision_is_exact(versions),
        ),
        check(
            "all_live_fixture_cleanup_passed",
            isinstance(cleanup, dict)
            and required_cleanup.issubset(cleanup)
            and all(cleanup.get(name) == "Passed" for name in required_cleanup)
            and cleanup.get("deleted_identity_count") == 1,
            required_cleanup=sorted(required_cleanup),
            observed_cleanup=cleanup,
        ),
        check(
            "managed_service_state_was_restored",
            service_state.get("restored") is True
            and service_state.get("preExisting")
            == service_state.get("postExisting")
            and service_state.get("preRunning") == service_state.get("postRunning")
            and service_state.get("preContainers")
            == service_state.get("postContainers"),
            observed_service_state=service_state,
        ),
        check(
            "campaign_role_state_was_restored",
            role_state.get("restored") is True
            and role_state.get("pre") == role_state.get("post"),
            observed_role_state=role_state,
        ),
        check(
            "all_seeded_relational_tables_are_empty",
            isinstance(remaining_relational_rows, dict)
            and required_relational_tables.issubset(remaining_relational_rows)
            and all(
                remaining_relational_rows.get(table) == 0
                for table in required_relational_tables
            ),
            required_tables=sorted(required_relational_tables),
            observed_rows=remaining_relational_rows,
        ),
        check(
            "isolated_store_is_absent",
            recorded_data_dir != allowed_data_root
            and allowed_data_root in recorded_data_dir.parents
            and not recorded_data_dir.exists(),
            recorded_data_dir=str(recorded_data_dir),
        ),
    ]
    passed = all(item["result"] == "Passed" for item in checks)
    return {
        "result": "Passed" if passed else "Failed",
        "verifiedOutcome": "Blocked" if passed else "Failed",
        "checks": checks,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        result = verify()
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Failed: {error}", file=sys.stderr)
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(f"{result['result']}: RA11a candidate outcome is {result['verifiedOutcome']}")
    return 0 if result["result"] == "Passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
