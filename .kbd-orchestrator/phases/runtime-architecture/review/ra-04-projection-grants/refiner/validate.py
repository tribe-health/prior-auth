#!/usr/bin/env python3
"""Deterministic RA04 artifact-refiner validation."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

from jsonschema import Draft7Validator


ROOT = Path("/Users/gqadonis/Projects/TribeHealth/kevin/prior-auth")
GATE = Path("/Users/gqadonis/Projects/prometheus/flint-gate")
FRF = Path("/Users/gqadonis/Projects/prometheus/flint-realtime-fabric")
BASE = ROOT / ".kbd-orchestrator/phases/runtime-architecture/review/ra-04-projection-grants/refiner"
EVIDENCE = ROOT / ".kbd-orchestrator/phases/runtime-architecture/evidence/ra-04-projection-grants"
SCHEMAS = Path("/Users/gqadonis/.codex/skills/artifact-refiner/references/schemas")


checks: list[dict[str, str]] = []


def record(name: str, condition: bool, detail: str) -> None:
    checks.append({"name": name, "result": "Passed" if condition else "Failed", "detail": detail})


def load(path: Path):
    return json.loads(path.read_text())


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_schema(instance_name: str, schema_name: str) -> None:
    errors = list(Draft7Validator(load(SCHEMAS / schema_name)).iter_errors(load(BASE / instance_name)))
    record(f"schema:{instance_name}", not errors, "Draft-07 valid" if not errors else errors[0].message)


def validate_acceptance_receipts() -> None:
    all_current = True
    details: list[str] = []
    for task in range(5, 10):
        name = f"task-{task}-acceptance.json"
        receipt = load(EVIDENCE / name)
        if receipt.get("result") != "Passed":
            all_current = False
            details.append(f"{name}: result is not Passed")

        def visit(value) -> None:
            nonlocal all_current
            if isinstance(value, dict):
                raw = value.get("raw_output")
                expected = value.get("raw_output_sha256")
                if raw and expected:
                    path = Path(raw) if Path(raw).is_absolute() else EVIDENCE / raw
                    if not path.exists() or sha256(path) != expected:
                        all_current = False
                        details.append(f"{name}: stale or missing {raw}")
                for child in value.values():
                    visit(child)
            elif isinstance(value, list):
                for child in value:
                    visit(child)

        visit(receipt)
    record("behavioral-acceptance-receipts", all_current, "; ".join(details) or "tasks 2.1 through 2.5 are Passed and their cited raw outputs retain recorded hashes")


validate_schema("artifact_manifest.json", "artifact-manifest.schema.json")
validate_schema("constraints.json", "constraints.schema.json")
validate_schema(".refiner/artifacts/ra-04-projection-grants/state.json", "refinement-state.schema.json")

manifest = load(BASE / "artifact_manifest.json")
declared = {item["file"] for item in manifest["variants"]}
actual = {str(path.relative_to(BASE)) for path in (BASE / "dist").iterdir() if path.is_file()}
record("manifest-dist-coverage", declared == actual == {"dist/report.md", "dist/checklist.json"}, f"declared={sorted(declared)} actual={sorted(actual)}")

constraint_doc = load(BASE / "constraints.json")
checklist = load(BASE / "dist/checklist.json")
constraint_ids = {item["id"] for item in constraint_doc["constraints"]}
check_ids = {item["id"] for item in checklist["constraints"] if item.get("result") == "Passed"}
record("constraint-coverage", len(constraint_ids) == 10 and constraint_ids == check_ids and checklist.get("result") == "Passed", f"{len(check_ids)}/{len(constraint_ids)} constraints Passed")

inventory = load(EVIDENCE / "task-10-files.json")
source_errors = []
for item in inventory["sources"]:
    path = Path(item["root"]) / item["path"]
    if not path.exists() or sha256(path) != item["sha256"]:
        source_errors.append(str(path))
record("current-source-inventory", not source_errors and len(inventory["sources"]) == 29, "29 source hashes current" if not source_errors else f"stale: {source_errors}")

receipt_errors = []
for item in inventory["receipts"]:
    path = EVIDENCE / item["path"]
    if not path.exists() or sha256(path) != item["sha256"]:
        receipt_errors.append(str(path))
record("final-receipt-inventory", not receipt_errors and len(inventory["receipts"]) == 34, "34 receipt hashes current" if not receipt_errors else f"stale: {receipt_errors}")

validate_acceptance_receipts()

mounted = load(EVIDENCE / "task-10-private-error-restored.json")
mounted_ok = (
    mounted.get("result") == "Passed"
    and len(mounted.get("checks", {})) == 19
    and mounted.get("observed_counts") == {"whoami": 2, "grant": 4, "downstream": 1}
    and all(value == "Passed" for value in mounted.get("cleanup", {}).values())
)
record("mounted-gate", mounted_ok, "19 checks, private typed failure responses, expected caller counts and all synthetic process cleanup Passed")

database_ok = True
database_detail = []
for mode, expected in (("fresh", 16), ("upgrade", 22)):
    receipt = load(EVIDENCE / f"task-10-gate-{mode}.json")
    lifecycle = receipt.get("checks", {}).get("actual_appservices_pg_repository_lifecycle", {})
    cleanup = receipt.get("cleanup", {})
    ok = (
        receipt.get("result") == "Passed"
        and len(receipt.get("checks", {})) == expected
        and lifecycle.get("result") == "Passed"
        and lifecycle.get("assertion_count") == 18
        and len(cleanup) == 6
        and all(value.get("result") == "Passed" for value in cleanup.values())
    )
    database_ok &= ok
    database_detail.append(f"{mode}={len(receipt.get('checks', {}))} checks/18 lifecycle assertions/cleanup {len(cleanup)}")
record("gate-database-fixtures", database_ok, "; ".join(database_detail))

derivation = load(EVIDENCE / "task-10-practice-derivation.json")
derivation_ok = derivation.get("result") == "Passed" and all(
    mode.get("result") == "Passed"
    and len(mode.get("checks", {})) == 10
    and all(check.get("result") == "Passed" for check in mode.get("checks", {}).values())
    for mode in derivation.get("modes", {}).values()
) and len(derivation.get("cleanup", {})) == 3 and all(value == "Passed" for value in derivation.get("cleanup", {}).values())
record("practice-derivation", derivation_ok, "fresh 10/10, upgrade 10/10 and three cleanup entries Passed")

log_expectations = {
    "task-10-primary-t0-t1.txt": ["3 passed; 0 failed", "4 passed; 0 failed", "session_contract_tests"],
    "task-10-gate-t0-t1.txt": ["2 passed; 0 failed", "1 passed; 0 failed", "Finished `dev` profile"],
    "task-10-frf-t0-t1.txt": ["2 passed; 0 failed", "7 passed; 0 failed", "3 passed; 0 failed", "a_client_cannot_widen_the_shape", "a_param_outside_the_allow_list"],
    "task-10-web-t0.txt": ["$ tsc --noEmit", "$ oxlint"],
    "task-10-primary-t0-t1-restored.txt": ["4 passed; 0 failed", "mounted_registry_refuses_failed_or_expired_membership_resolution"],
    "task-10-primary-t0-t1-final.txt": ["6 passed; 0 failed", "mounted_current_session_refuses_expired_or_nonhuman_port_results"],
    "task-10-gate-t0-t1-final.txt": ["2 passed; 0 failed", "1 passed; 0 failed", "Finished `dev` profile"],
}
logs_ok = True
for name, needles in log_expectations.items():
    text = (EVIDENCE / name).read_text()
    logs_ok &= all(needle in text for needle in needles) and "test result: FAILED" not in text and "error: could not compile" not in text
record("applicable-t0-t1", logs_ok, "primary, Gate, FRF and web final logs contain expected passing checks and no failed test result")

principal_red = (EVIDENCE / "task-10-principal-guard-red.txt").read_text()
principal_green = (EVIDENCE / "task-10-principal-guard-restored.txt").read_text()
principal_guard_ok = (
    "left: 200" in principal_red
    and "right: 403" in principal_red
    and "test result: FAILED" in principal_red
    and "1 passed; 0 failed" in principal_green
)
record("nonhuman-principal-negative-control", principal_guard_ok, "injected non-human session failed at HTTP 200 before the handler guard and passed at HTTP 403 after restoration")

current_session_red = (EVIDENCE / "task-10-current-session-guard-red.txt").read_text()
current_session_green = (EVIDENCE / "task-10-current-session-guard-restored.txt").read_text()
current_session_ok = (
    "left: 200" in current_session_red
    and "right: 401" in current_session_red
    and "test result: FAILED" in current_session_red
    and "1 passed; 0 failed" in current_session_green
)
record("current-session-negative-control", current_session_ok, "injected expired/non-human session failed at HTTP 200 before independent route guards and passed after restoration")

credential_red = (EVIDENCE / "task-10-credential-hygiene-red.txt").read_text()
credential_green = (EVIDENCE / "task-10-credential-hygiene-restored.txt").read_text()
credential_guard_ok = "test result: FAILED" in credential_red and "1 passed; 0 failed" in credential_green
record("credential-ambiguity-negative-control", credential_guard_ok, "whitespace-confusable duplicate cookie and blank native token failed before parsing fixes and passed after restoration")

jti_red = (EVIDENCE / "task-10-frf-nonreplica-jti-red.txt").read_text()
jti_green = (EVIDENCE / "task-10-frf-jti-restored.txt").read_text()
jti_scope_ok = (
    "missing field `jti`" in jti_red
    and "non_replica_tokens_keep_legacy_optional_token_ids ... ok" in jti_green
    and "malformed_token_and_origin_ids_are_not_invented ... ok" in jti_green
    and "3 passed; 0 failed" in jti_green
    and "7 passed; 0 failed" in jti_green
)
record("replica-only-jti-strictness", jti_scope_ok, "strict UUID token ID remains mandatory for ASO replica claims while missing or legacy non-UUID IDs remain compatible on non-replica lanes")

issuer_failed_attempt = (EVIDENCE / "task-10-frf-production-issuer.txt").read_text()
issuer_restored = (EVIDENCE / "task-10-frf-production-issuer-restored.txt").read_text()
issuer_config_ok = (
    "shape_projection_grant.rs" in issuer_failed_attempt
    and "feature" in issuer_failed_attempt
    and "production_config_without_jwt_issuer_fails_validation ... ok" in issuer_restored
    and "1 passed; 0 failed" in issuer_restored
)
record("production-issuer-config", issuer_config_ok, "corrected --lib command proves production configuration refuses a missing issuer; initial feature-mismatched command remains excluded evidence")

private_red = load(EVIDENCE / "task-10-private-error-red.json")
private_green = load(EVIDENCE / "task-10-private-error-restored.json")
private_error_ok = (
    private_red.get("result") == "Failed"
    and private_green.get("result") == "Passed"
    and private_green.get("checks", {}).get("membership_denial_response_is_private", {}).get("result") == "Passed"
    and private_green.get("checks", {}).get("mint_failure_response_is_private", {}).get("result") == "Passed"
    and len(private_green.get("checks", {})) == 19
)
record("private-grant-errors", private_error_ok, "mounted Gate fixture failed before private typed replica errors and passed 19 checks after no-store/Vary responses were restored")

projection = (ROOT / "crates/aso-host/src/projection.rs").read_text()
projection_ok = all(relation in projection for relation in [
    'relation: "aso.cases"', 'relation: "aso.case_evidence"', 'relation: "aso.evidence_states"',
    'relation: "aso.evidence_citations"', 'relation: "aso.documents"', 'primary_key: "key"',
    'approval: "adr-003-three-evidence-states"', '"gate_affirmed_at"'
]) and "PROJECTION_REVISION: u32 = 1" in projection
record("fixed-projection-source", projection_ok, "revision 1 contains the five approved relations, evidence_states key approval and gate_affirmed_at")

aso_lib = (ROOT / "crates/aso-server-axum/src/lib.rs").read_text()
aso_session = (ROOT / "crates/aso-server-axum/src/session.rs").read_text()
gate_pipeline = (GATE / "crates/flint-gate-core/src/middleware/pipeline.rs").read_text()
frf_lib = (FRF / "crates/frf-gateway/src/lib.rs").read_text()
frf_shape = (FRF / "crates/frf-gateway/src/routes/shape.rs").read_text()
frf_claims = (FRF / "crates/frf-identity-ory/src/claims.rs").read_text()
desktop = (ROOT / "desktop/src-tauri/src/lib.rs").read_text()
web = (ROOT / "web/src/app/shell/app-shell.tsx").read_text()
deployment = (ROOT / "docker/flint-gate/config.yaml").read_text()
cases_route = (ROOT / "crates/aso-server-axum/src/routes/cases.rs").read_text()
frf_config = (FRF / "crates/frf-gateway/src/config/mod.rs").read_text()
frf_main = (FRF / "crates/frf-gateway/src/main.rs").read_text()
clinical_hook = (GATE / "crates/flint-gate-core/src/middleware/aso_clinical_authorize.rs").read_text()
caller_ok = (
    ".merge(session::router())" in aso_lib
    and '.route("/api/session/replica-grant", get(replica_grant))' in aso_session
    and "super::aso_replica_grant::mint(" in gate_pipeline
    and '"/v1/shape"' in frf_lib
    and '#[cfg(feature = "shape-facade")]' in frf_lib
    and "state.identity.verify(&token)" in frf_shape
    and "every continuation" in frf_shape
    and "pub async fn replica_grant" in desktop
    and "invoke_handler" not in desktop
    and "generate_handler" not in desktop
    and "RA14 replaces this with a graph selector" in web
    and "aso_replica_grant:" not in deployment
    and "/api/session/replica-grant is deliberately absent" in deployment
    and cases_route.count(".route(") == 1
    and '"/api/cases/{case_id}/evidence"' in cases_route
    and "JWT_ISSUER must be set in production" in frf_config
    and "OryIdentityVerifier::with_issuer" in frf_main
    and "pub(super) fn credential_headers" in clinical_hook
    and "pub jti: Option<String>" in frf_claims
    and "None if carries_replica_contract" in frf_claims
    and "fn aso_replica_error" in gate_pipeline
)
record("caller-and-deployment-truth", caller_ok, "ASO mounted; removed cases router had one actor-less route; Gate hook present but deployment disabled; production FRF requires issuer and shape remains feature-gated; desktop IPC inactive; web graph selector deferred")

tasks = (ROOT / "openspec/changes/ra-04-projection-grants/tasks.md").read_text()
first_nine_checked = sum(1 for line in tasks.splitlines() if line.startswith("- [x]")) >= 9
record("openspec-task-state", first_nine_checked and "Complete applicable T0/T1" in tasks, "nine prior tasks checked and final review task present")

report = (BASE / "dist/report.md").read_text()
limits_ok = all(needle in report for needle in [
    "does not enable `aso_replica_grant`", "belong to RA05", "without active Tauri command registration",
    "RA14 owns the consuming selector", "The uncomfortable constraint", "G-DATA approval", "Broad phase T2"
    , "real Gate-minted asymmetric token"
])
record("bounded-reporting", limits_ok, "report preserves deployment, live Electric, desktop, web, G-DATA and tier limits")

diff_ok = True
diff_details = []
for repo in (ROOT, GATE, FRF):
    completed = subprocess.run(["git", "diff", "--check"], cwd=repo, text=True, capture_output=True)
    diff_ok &= completed.returncode == 0
    diff_details.append(f"{repo.name}={completed.returncode}")
record("git-diff-check", diff_ok, ", ".join(diff_details))

result = "Passed" if all(item["result"] == "Passed" for item in checks) else "Failed"
output = {"result": result, "checks": checks, "passed": sum(item["result"] == "Passed" for item in checks), "failed": sum(item["result"] == "Failed" for item in checks)}
(BASE / "validation-output.json").write_text(json.dumps(output, indent=2) + "\n")
print(json.dumps(output, indent=2))
sys.exit(0 if result == "Passed" else 1)
