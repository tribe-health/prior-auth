"""Read-only RA-01 evidence gate; stdout is retained by the invoking host."""
import ast
import hashlib
import json
from pathlib import Path
import re
import sys

from jsonschema import Draft7Validator, FormatChecker

HERE = Path(__file__).resolve().parent
ROOT = next(p for p in HERE.parents if (p / "versions.toml").is_file())
SKILL = Path("/Users/gqadonis/.codex/skills/artifact-refiner")
EVIDENCE = ROOT / ".kbd-orchestrator/phases/runtime-architecture/evidence/ra-01-verified-session"
results = []


def read(path):
    return json.loads(path.read_text())


def check(name, condition, detail):
    results.append({"check": name, "result": "Passed" if condition else "Failed", "detail": detail})


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def evidence_path(original):
    path = ROOT / original
    prefix = "openspec/changes/ra-01-verified-session/"
    if not path.exists() and original.startswith(prefix):
        candidates = list((ROOT / "openspec/changes/archive").glob("*-ra-01-verified-session/" + original[len(prefix):]))
        if len(candidates) == 1:
            return candidates[0]
    return path


for local, schema in [
    ("artifact_manifest.json", "artifact-manifest.schema.json"),
    ("constraints.json", "constraints.schema.json"),
    (".refiner/artifacts/ra-01-verified-session/state.json", "refinement-state.schema.json"),
]:
    validator = Draft7Validator(read(SKILL / "references/schemas" / schema), format_checker=FormatChecker())
    errors = [e.message for e in validator.iter_errors(read(HERE / local))]
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
check("manifest:exact-dist-coverage", set(refs) == {str(p.relative_to(HERE)) for p in (HERE / "dist").rglob("*") if p.is_file()}, "No unlisted dist outputs")

for ordinal in [5, 6, 7]:
    acceptance = read(EVIDENCE / f"task-{ordinal}-acceptance.json")
    check(f"acceptance:{ordinal}:recorded-result", acceptance["result"] == "Passed", acceptance["evidence_mode"])
    for item in acceptance["current_hash_verification"]["files"] + acceptance["sources"]:
        resolved = evidence_path(item["path"])
        actual = digest(resolved)
        check(f"acceptance:{ordinal}:hash:{item['path']}", actual == item["sha256"], {"expected": item["sha256"], "actual": actual, "resolved_path": str(resolved.relative_to(ROOT))})

for name, count, responses in [("mounted-session.json", 34, 30), ("context-session.json", 41, 37), ("gateway-session.json", 36, 34)]:
    receipt = read(EVIDENCE / name)
    checks = receipt["checks"]
    good = receipt["result"] == "Passed" and receipt["verification_tier"] == 1
    good = good and len(checks) == count == receipt["check_count"]
    good = good and all(c["result"] == "Passed" for c in checks.values())
    good = good and receipt["app_response_count"] == responses == receipt["no_store_response_count"]
    good = good and bool(receipt["cleanup"]) and all(v is True for v in receipt["cleanup"].values())
    check("recorded-T1:" + name, good, {"checks": len(checks), "responses": receipt["app_response_count"], "no_store": receipt["no_store_response_count"], "commands": receipt["commands"], "completed_at": receipt["completed_at"], "live_rerun": False})

gateway = read(EVIDENCE / "gateway-session.json")
check("recorded-T1:actual-two-identity-backend", gateway["pool_reuse"]["shared_backend_count"] == 1 and gateway["pool_reuse"]["backend_counts"] == {"A": 1, "B": 1}, gateway["pool_reuse"])
for name in ["provider-guard.json", "membership-guard.json", "transaction-context-guard.json", "desktop-context-guard.json", "gateway-identity-guard.json"]:
    guard = read(EVIDENCE / name)
    check("recorded-mutation:" + name, guard.get("exit", guard.get("sabotage_exit")) != 0 and guard["source_restored"] is True and guard["restored_verification"]["exit"] == 0, {"mutation": guard["mutation"], "restored_sha256": guard["restored_sha256"], "note": "Historical mutation proof; earlier task-2 source hash predates task-3 extraction. Currentness uses acceptance hashes above."})

transaction = read(EVIDENCE / "context-session.json")["transaction_test"]
markers = ["explicit_commit", "mounted_repository_success", "mounted_repository_denial", "sql_error_drop_rollback", "explicit_rollback", "in_flight_cancellation_clean_or_discarded"]
check("recorded-T1:six-transaction-exits", transaction["exit"] == 0 and all(any(marker in line for line in transaction["output"]) for marker in markers), transaction["output"])

anchors = {
    "crates/aso-web-server/src/main.rs": ["adapters::session::configured_sessions(", "let mut app = api_router(state)", "axum::serve(listener, app)"],
    "crates/aso-server-axum/src/lib.rs": [".merge(session::router())"],
    "crates/aso-server-axum/src/session.rs": ['route("/api/session", get(current_session))', "state.services.sessions.resolve(&credential, query.practice_id).await", '"no-store"'],
    "crates/aso-host/src/session.rs": ["self.identities.authenticate(credential).await?", "self.memberships.resolve(&identity, practice).await?", "principal: Principal::User", "expires_at: identity.expires_at"],
    "crates/aso-web-server/src/adapters/session.rs": ["SET LOCAL ROLE aso_session_reader", "SELECT set_config('aso.kratos_identity_id', $1, true)", "let mut tx = self.begin_scoped(identity).await?", "u.status = 'active'", "ur.practice_id = COALESCE($2, u.practice_id)", "tx.commit().await"],
    "scripts/test-session-boundary.py": ['"cargo", "run", "-p", "aso-web-server"'],
    "scripts/test-session-gateway.py": ['r["id"] == "aso-session"', 'self.trace_pids["A"] & self.trace_pids["B"]', 'role == "aso_session_reader"'],
}
for filename, required in anchors.items():
    source = (ROOT / filename).read_text()
    found = [{"anchor": a, "line": source[:source.index(a)].count("\n") + 1} for a in required if a in source]
    check("source-call-path:" + filename, len(found) == len(required), {"anchors": found, "missing": [a for a in required if a not in source], "scope": "Static caller corroboration of recorded runtime campaign, not a new runtime proof"})

desktop = (ROOT / "desktop/src-tauri/src/lib.rs").read_text()
wrapper = desktop.split("pub async fn current_session(", 1)[1].split("pub async fn gate_state", 1)[0]
check("desktop:typed-inactive-boundary", "Result<aso_host::session::SessionSummary, aso_host::session::SessionError>" in wrapper and "Err(aso_host::session::SessionError::NativeAuthenticationUnavailable)" in wrapper and ".resolve(" not in wrapper, "Wrapper signature and body read; recorded accepting-port test plus failed bypass mutation provide behavioral proof. Native UI/IPC remains Build-only.")

host_manifest = (ROOT / "crates/aso-host/Cargo.toml").read_text().split("[dependencies]", 1)[1]
dependencies = re.findall(r"^([\w-]+)\.workspace", host_manifest, re.M)
check("architecture:host-dependency-allowlist", set(dependencies) == {"serde", "serde_json", "uuid", "thiserror", "async-trait", "chrono"}, {"dependencies": dependencies, "scope": "Actual manifest dependency inventory; no broad architecture-audit execution claimed"})
sql = (ROOT / "docker/bootstrap/25-session-authority.sql").read_text()
check("architecture:revision-classification", "server-authoritative relational" in sql and "Privacy: trusted" in sql and "Excluded from Electric/entity replication" in sql, "Explicit lane/privacy declaration in additive revision migration")

for script in ["scripts/test-session-boundary.py", "scripts/test-session-context.py", "scripts/test-session-gateway.py"]:
    ast.parse((ROOT / script).read_text(), filename=script)
    check("T0:python-syntax:" + script, True, "ast.parse completed")

checklist = read(HERE / "dist/checklist.json")
constraints = read(HERE / "constraints.json")["constraints"]
check("constraints:exact-checklist-coverage", {c["id"] for c in constraints} == {c["id"] for c in checklist["constraints"]}, "Every applicable constraint has an explicit evidence evaluation")
check("constraints:applicable-satisfaction", all(c["status"] == "satisfied" and c["evidence"] for c in checklist["constraints"]), "Applicable constraints have affirmative evidence; out-of-scope checks are separately deferred, never assigned Passed")
state = read(HERE / ".refiner/artifacts/ra-01-verified-session/state.json")
log = (HERE / "refinement_log.md").read_text()
decisions = (HERE / "decisions.md").read_text()
check("state:iteration-consistency", state["current_iteration"] == 1 and len(re.findall(r"^## Iteration 1", log, re.M)) == 1 and len(re.findall(r"^### Iteration 1 Decision", decisions, re.M)) == 1 and len(state["iteration_history"]) == 1, "One log iteration, one convergence decision, one state history entry")
check("state:completed-phases", state["phases_completed"] == ["specify", "plan", "execute", "reflect", "persist"], state["phases_completed"])
issues = [r for r in results if r["result"] == "Failed"]
print(json.dumps({"result": "Failed" if issues else "Passed", "scope": "Scoped deterministic content/evidence gate. Reused T0/T1 receipts; no live service, Cargo, phase T2 or release T3 execution.", "check_count": len(results), "issue_count": len(issues), "checks": results}, indent=2))
sys.exit(bool(issues))
