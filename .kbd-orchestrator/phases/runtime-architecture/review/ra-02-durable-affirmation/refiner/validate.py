"""Read-only deterministic RA-02 artifact and evidence validator."""
import ast
import hashlib
import json
from pathlib import Path
import sys

from jsonschema import Draft7Validator, FormatChecker

HERE = Path(__file__).resolve().parent
ROOT = next(parent for parent in HERE.parents if (parent / "versions.toml").is_file())
SKILL = Path("/Users/gqadonis/.codex/skills/artifact-refiner")
EVIDENCE = ROOT / ".kbd-orchestrator/phases/runtime-architecture/evidence/ra-02-durable-affirmation"
results = []


def read(path):
    return json.loads(path.read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def resolve_evidence_path(path):
    if path.exists():
        return path
    active = ROOT / "openspec/changes/ra-02-durable-affirmation"
    try:
        relative = path.relative_to(active)
    except ValueError:
        return path
    archives = sorted((ROOT / "openspec/changes/archive").glob("*-ra-02-durable-affirmation"))
    if len(archives) == 1:
        return archives[0] / relative
    return path


def check(name, condition, detail):
    results.append({"check": name, "result": "Passed" if condition else "Failed", "detail": detail})


for local, schema in [
    ("artifact_manifest.json", "artifact-manifest.schema.json"),
    ("constraints.json", "constraints.schema.json"),
    (".refiner/artifacts/ra-02-durable-affirmation/state.json", "refinement-state.schema.json"),
]:
    validator = Draft7Validator(read(SKILL / "references/schemas" / schema), format_checker=FormatChecker())
    errors = [error.message for error in validator.iter_errors(read(HERE / local))]
    check("schema:" + local, not errors, errors or "Full Draft-07 validation, including formats")

manifest = read(HERE / "artifact_manifest.json")
refs = []
for variant in manifest["variants"]:
    refs.extend([variant["file"]] if "file" in variant else variant["files"])
for ref in refs:
    path = HERE / ref
    good = path.is_file() and path.stat().st_size > 0 and path.resolve().is_relative_to(HERE / "dist")
    if good and path.suffix == ".json":
        read(path)
    check("file:" + ref, good, "Required nonempty file under scoped dist; JSON parsed where applicable")
actual_dist = {str(path.relative_to(HERE)) for path in (HERE / "dist").rglob("*") if path.is_file()}
check("manifest:exact-dist-coverage", set(refs) == actual_dist, {"manifest": refs, "actual": sorted(actual_dist)})

for ordinal in [5, 6, 7, 8]:
    acceptance = read(EVIDENCE / f"task-{ordinal}-acceptance.json")
    check(f"acceptance:{ordinal}:result", acceptance["result"] == "Passed" and acceptance["task"] == ordinal, acceptance["evidence_mode"])
    for source in acceptance["sources"]:
        path = Path(source["path"])
        if not path.is_absolute():
            path = ROOT / path
        path = resolve_evidence_path(path)
        actual = digest(path)
        check(f"acceptance:{ordinal}:source:{path.name}", actual == source["sha256"], {"expected": source["sha256"], "actual": actual})
    for item in acceptance.get("current_hash_verification", {}).get("files", []):
        path = Path(item["path"])
        if not path.is_absolute():
            path = ROOT / path
        path = resolve_evidence_path(path)
        actual = digest(path)
        check(f"acceptance:{ordinal}:current:{path}", actual == item["sha256"], {"expected": item["sha256"], "actual": actual})

inventory_path = EVIDENCE / "task-4-files.json"
acceptance8 = read(EVIDENCE / "task-8-acceptance.json")
expected_inventory = acceptance8["current_source_inventory"]["sha256"]
check("inventory:receipt-hash", digest(inventory_path) == expected_inventory, {"expected": expected_inventory, "actual": digest(inventory_path)})
for item in read(inventory_path)["files"]:
    path = resolve_evidence_path(Path(item["path"]))
    actual = digest(path)
    check("inventory:current:" + str(path), actual == item["sha256"], {"expected": item["sha256"], "actual": actual})

for name, expected_checks, expected_cleanup in [
    ("task-4-mounted.json", 96, 18),
    ("task-4-fresh.json", 16, 6),
    ("task-4-upgrade.json", 22, 6),
]:
    receipt = read(EVIDENCE / name)
    checks = receipt["checks"]
    cleanup = receipt["cleanup"]
    good = receipt["result"] == "Passed" and receipt["verification_tier"] == 1
    good = good and len(checks) == expected_checks and all(value["result"] == "Passed" for value in checks.values())
    good = good and len(cleanup) == expected_cleanup and all(value["result"] == "Passed" for value in cleanup.values())
    check("recorded-T1:" + name, good, {"checks": len(checks), "cleanup": len(cleanup), "completed_at": receipt["completed_at"], "live_rerun": False})

mounted_checks = read(EVIDENCE / "task-4-mounted.json")["checks"]
required_mounted = [
    "mounted_affirm_durable_sql",
    "gateway_admin_denied_independently",
    "lost_response_client_received_no_headers",
    "lost_response_lookup_recovers_original",
    "lost_response_all_payload_conflicts_have_no_effect",
    "lost_response_historical_receipt_does_not_replace_current_gate",
]
check("recorded-T1:mounted-key-behaviors", all(name in mounted_checks for name in required_mounted), required_mounted)
for name in ["task-4-fresh.json", "task-4-upgrade.json"]:
    receipt = read(EVIDENCE / name)
    actual_output = [
        line
        for process in receipt["processes"]
        if process["label"] == "actual_gate_transaction_lifecycle"
        for line in process["actual_result_output"]
    ]
    marker = "gate_transaction_check: out_of_scope_and_missing_changed_payload_conflict_before_target_authority"
    check("recorded-T1:conflict-before-authority:" + name, marker in actual_output, marker)

anchors = {
    "crates/aso-web-server/src/main.rs": ["PgGateRepository::connect", "let mut app = api_router(state)"],
    "crates/aso-server-axum/src/lib.rs": [".merge(routes::gate::router())"],
    "crates/aso-server-axum/src/routes/gate.rs": ["state.services.execute_gate_command", "state.services.read_verified_gate", "/internal/gate/authorize"],
    "crates/aso-host/src/affirmation.rs": ["self.authority.may_affirm_gate", "self.cases.execute_gate_command"],
    "crates/aso-web-server/src/adapters/gate.rs": ["impl CaseRepository for PgGateRepository", "execute_gate_command"],
    "docker/flint-gate/config.yaml": ["aso_clinical_authorize"],
    "/Users/gqadonis/Projects/prometheus/flint-gate/crates/flint-gate-core/src/middleware/pipeline.rs": ["aso_clinical_authorize"],
}
for raw, expected in anchors.items():
    path = Path(raw) if raw.startswith("/") else ROOT / raw
    text = path.read_text()
    missing = [anchor for anchor in expected if anchor not in text]
    check("caller:" + raw, not missing, {"anchors": expected, "missing": missing})

gate_route = (ROOT / "crates/aso-server-axum/src/routes/gate.rs").read_text()
check("architecture:host-boundary", "state.services.cases" not in gate_route and gate_route.count("state.services.read_verified_gate") >= 1, "Gate shell reads through AppServices")

hook_files = []
for path in (ROOT / "web/src").rglob("*.ts*"):
    if "useSurgeonGate" in path.read_text():
        hook_files.append(str(path.relative_to(ROOT)))
check("caller:web-hook-test-only", set(hook_files) == {"web/src/features/surgeon-gate/hooks/use-surgeon-gate.ts", "web/src/features/surgeon-gate/hooks/use-surgeon-gate.test.tsx"}, sorted(hook_files))
route_text = (ROOT / "web/src/app/routes/surgeon-gate-route.tsx").read_text()
check("caller:web-route-placeholder", "RoutePlaceholder" in route_text and "useSurgeonGate" not in route_text, "Browser view is explicitly unmounted")
desktop = (ROOT / "desktop/src-tauri/src/lib.rs").read_text()
check("caller:desktop-inactive", "NativeAuthenticationUnavailable" in desktop and "#[tauri::command]" not in desktop, "Typed wrappers are test-only and have no Tauri command registration")

for script in ["scripts/test-gate-mounted.py", "scripts/test-gate-transaction.py"]:
    ast.parse((ROOT / script).read_text())
    check("T0:python-syntax:" + script, True, "ast.parse completed")

constraints = read(HERE / "constraints.json")["constraints"]
check("constraints:exact-checklist-coverage", {item["id"] for item in constraints} == {item["id"] for item in read(HERE / "dist/checklist.json")["constraints"]}, "Every applicable constraint has one checklist result")
check("constraints:applicable-satisfaction", all(item["status"] == "satisfied" for item in read(HERE / "dist/checklist.json")["constraints"]), "Deferred items are separate and receive no Passed claim")
state = read(HERE / ".refiner/artifacts/ra-02-durable-affirmation/state.json")
check("state:iteration-consistency", state["current_iteration"] == 3 and len(state["iteration_history"]) == 3, "Three iterations and three history entries")
check("state:completed-phases", state["phases_completed"] == ["specify", "plan", "execute", "reflect", "persist"], state["phases_completed"])

failed = [item for item in results if item["result"] != "Passed"]
output = {
    "result": "Passed" if not failed else "Failed",
    "scope": "Scoped deterministic content/evidence gate; recorded T1 plus current T0/caller checks, no phase T2 or release T3.",
    "check_count": len(results),
    "issue_count": len(failed),
    "checks": results,
}
print(json.dumps(output, indent=2))
sys.exit(1 if failed else 0)
