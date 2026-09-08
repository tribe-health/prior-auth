"""Read-only deterministic RA-03 artifact and evidence validator."""

import hashlib
import json
from pathlib import Path
import sys
import tomllib

from jsonschema import Draft7Validator, FormatChecker


HERE = Path(__file__).resolve().parent
ROOT = next(parent for parent in HERE.parents if (parent / "versions.toml").is_file())
SCHEMAS = Path(
    "/Users/gqadonis/Projects/travisjames/skills/artifact-refiner/references/schemas"
)
EVIDENCE = (
    ROOT
    / ".kbd-orchestrator/phases/runtime-architecture/evidence/ra-03-clinical-command-parity"
)
results = []


def read(path: Path):
    return json.loads(path.read_text())


def digest(path: Path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check(name, condition, detail):
    results.append(
        {"check": name, "result": "Passed" if condition else "Failed", "detail": detail}
    )


for local, schema in [
    ("artifact_manifest.json", "artifact-manifest.schema.json"),
    ("constraints.json", "constraints.schema.json"),
    (
        ".refiner/artifacts/ra-03-clinical-command-parity/state.json",
        "refinement-state.schema.json",
    ),
]:
    validator = Draft7Validator(
        read(SCHEMAS / schema), format_checker=FormatChecker()
    )
    errors = [error.message for error in validator.iter_errors(read(HERE / local))]
    check("schema:" + local, not errors, errors or "Full Draft-07 validation")

manifest = read(HERE / "artifact_manifest.json")
refs = []
for variant in manifest["variants"]:
    refs.extend([variant["file"]] if "file" in variant else variant["files"])
for ref in refs:
    path = HERE / ref
    valid = (
        path.is_file()
        and path.stat().st_size > 0
        and path.resolve().is_relative_to(HERE / "dist")
    )
    if valid and path.suffix == ".json":
        read(path)
    check("file:" + ref, valid, "Nonempty file under scoped dist")
actual_dist = {
    str(path.relative_to(HERE))
    for path in (HERE / "dist").rglob("*")
    if path.is_file()
}
check(
    "manifest:exact-dist-coverage",
    set(refs) == actual_dist,
    {"manifest": refs, "actual": sorted(actual_dist)},
)

inventory = read(EVIDENCE / "task-8-files.json")
for item in inventory["files"]:
    path = ROOT / item["path"]
    actual = digest(path) if path.is_file() else None
    check(
        "inventory:current:" + item["path"],
        actual == item["sha256"],
        {"expected": item["sha256"], "actual": actual},
    )

for ordinal in [5, 6, 7]:
    acceptance = read(EVIDENCE / f"task-{ordinal}-acceptance.json")
    check(
        f"acceptance:{ordinal}:result",
        acceptance["result"] == "Passed" and acceptance["task"] == ordinal,
        acceptance.get("evidence_mode", "recorded historical acceptance"),
    )

receipt_hashes = {
    "task-8-signing-fresh.json": "61e0b03b5a2cf2f603f3ed3c227faec05c711eec31c4ad177871e8d6cc346663",
    "task-8-signing-upgrade.json": "1d926fccdd5051a15732a61e90f257260e767eab49e8a09db0d0ec7c3b09951d",
    "task-8-reassessment-fresh.json": "363db758de0fd324166e079fb2fa6c6b0c3b8dea603c114e6ece9294b06147bd",
    "task-8-reassessment-upgrade.json": "7cafeeecf42b406ab1eda35803c61cd95546fa96dd90c2b2b0009fabfa47c702",
    "task-8-pem-exclusion.json": "8e005d28f2358890ccd04c5cf0509d56bf2b43dbdefac072f42a68948d1cb880",
    "task-8-http-uncertainty-red-proof.json": "c8dddb9482051ac7ce054995c0462d4a4b70fda05bd501e19521b9918ac8c33c",
    "task-8-publication-identity-red-proof.json": "11fa4aed79580f351e1bd9bc0d05b7d1dc03de791a19c3325ea2e43aae262835",
    "task-8-schema-publication-red-proof.json": "cc24f8d37a81421115015fedddddd4a7ad5c6e5c29cba325f834a1f59df0faf7",
    "task-8-truncate-guard-red-proof.json": "1d78ff6e9c66605cd4fa1b90700af866f0c05c506cb7378bfecf00843b4e5cf7",
    "task-8-unresolved-slot-red-proof.json": "6af8fa21e99a3291883912186cde8fba08c2c61405f2f6c9b383c903ebfc4964",
    "task-8-publication-concurrency-red-proof.json": "ab24673b834268a8cafea9f842c5cd163cea0b0455403d4b33392e11bd469085",
    "task-8-approval-truncate-concurrency-red-proof.json": "f7736883a85e92df0f490eb31d10f99106200167b51d1f54254b51d856088074",
    "task-8-claim-truncate-concurrency-red-proof.json": "3a22c467d002d0b31cf3051c17d7a4fa1e99a5053cc9ed990370a76aaf27fe51",
    "task-8-evidence-practice-red-proof.json": "b8afb4e008de649554f0d0da97976483144f5880e874018ac26dac8d9481b36d",
    "task-8-navigation-command-red-proof.json": "781db783fa8603731e6081b7c073b2e467d67c35649b551b382afd0ace535f4d",
    "task-8-gate-unavailability-red-proof.json": "c6760b1c92c67709f07195f660091e9f9d8fa0c433c8077113c0f4994e1180d8",
}
for name, expected in receipt_hashes.items():
    actual = digest(EVIDENCE / name)
    check(
        "receipt-hash:" + name,
        actual == expected,
        {"expected": expected, "actual": actual},
    )

database_receipts = [
    "task-8-signing-fresh.json",
    "task-8-signing-upgrade.json",
    "task-8-reassessment-fresh.json",
    "task-8-reassessment-upgrade.json",
]
for name in database_receipts:
    receipt = read(EVIDENCE / name)
    source_current = all(
        (ROOT / path).is_file() and digest(ROOT / path) == expected
        for path, expected in receipt["source_sha256"].items()
    )
    checks_passed = receipt["checks"] and all(
        item["result"] == "Passed" for item in receipt["checks"].values()
    )
    cleanup_passed = len(receipt["cleanup"]) == 6 and all(
        item["result"] == "Passed" for item in receipt["cleanup"].values()
    )
    check(
        "database-receipt:" + name,
        receipt["result"] == "Passed"
        and receipt["verification_tier"] == 1
        and source_current
        and checks_passed
        and cleanup_passed,
        {
            "install_mode": receipt["install_mode"],
            "checks": len(receipt["checks"]),
            "cleanup": len(receipt["cleanup"]),
            "source_current": source_current,
        },
    )

signing_fresh = read(EVIDENCE / "task-8-signing-fresh.json")
signing_upgrade = read(EVIDENCE / "task-8-signing-upgrade.json")
for receipt, mode, expected_count in [
    (signing_fresh, "fresh", 25),
    (signing_upgrade, "upgrade", 31),
]:
    check(
        "publication-boundary:" + mode,
        len(receipt["checks"]) == expected_count
        and receipt["checks"]["publication_ddl_guard_refuses_local_command_ledger"]["result"] == "Passed"
        and receipt["checks"]["renamed_local_ledger_remains_excluded_by_relation_identity"]["result"] == "Passed"
        and receipt["checks"]["local_ledger_cannot_move_into_published_schema"]["result"] == "Passed"
        and receipt["checks"]["moved_local_ledger_blocks_schema_publication"]["result"] == "Passed"
        and receipt["checks"]["explicit_local_ledger_publication_is_refused_on_upgrade"]["result"] == "Passed"
        and (
            receipt["checks"]["publication_serialization_installed_before_local_ledgers"]["result"] == "Passed"
            if mode == "fresh"
            else receipt["checks"]["applied_0600_through_0606_receives_additive_repairs"]["result"] == "Passed"
        ),
        {"checks": len(receipt["checks"]), "expected": expected_count},
    )

for name, expected_failure in [
    ("task-8-http-uncertainty-red-proof.json", "ApiError.isCommitOutcomeUncertain always returned false"),
    ("task-8-publication-identity-red-proof.json", "Publication guard was weakened to mutable names and stopped checking ALTER TABLE renames"),
    ("task-8-schema-publication-red-proof.json", "Published-schema membership check for registered relation OIDs was disabled"),
    ("task-8-truncate-guard-red-proof.json", "Migration 2026090606 was removed from the server migration set"),
    ("task-8-unresolved-slot-red-proof.json", "Uncertain commands released their mutation slots before explicit reconciliation"),
    ("task-8-publication-concurrency-red-proof.json", "Migration 2026090607 was omitted from both server migration passes"),
    ("task-8-approval-truncate-concurrency-red-proof.json", "Migration 2026090608 was omitted from the server migration set"),
    ("task-8-claim-truncate-concurrency-red-proof.json", "The 0608 letter_claims relation lock and cited-source revalidation were removed while the prior row-lock-only behavior remained"),
    ("task-8-evidence-practice-red-proof.json", "Evidence reassessment and lookup omitted the selected practice argument"),
    ("task-8-navigation-command-red-proof.json", "Runtime command ownership was deleted when the last scope listener unsubscribed"),
    ("task-8-gate-unavailability-red-proof.json", "Letter and evidence target-read unavailability was converted to policy denial"),
]:
    proof = read(EVIDENCE / name)
    check(
        "negative-control:" + name,
        proof["result"] == "Passed"
        and proof["observed_exit"] != 0
        and proof["source_sha256_before"] == proof["source_sha256_after_restore"]
        and proof["failure_injected"] == expected_failure,
        {"observed_exit": proof["observed_exit"], "restored": proof["source_sha256_before"] == proof["source_sha256_after_restore"]},
    )

all_markers = {
    line
    for name in ["task-8-signing-fresh.json", "task-8-reassessment-fresh.json"]
    for process in read(EVIDENCE / name)["processes"]
    for line in process.get("actual_result_output", [])
}
required_markers = {
    "gate_transaction_check: signing_service_and_database_refuse_stale_letter_qa_and_signature_revisions",
    "gate_transaction_check: signing_service_function_and_trigger_independently_refuse_admin_agent_and_foreign_scope",
    "gate_transaction_check: signing_lost_response_repeat_and_lookup_return_one_signing_effect",
    "gate_transaction_check: reassessment_lost_response_repeat_and_lookup_return_one_persisted_effect",
    "gate_transaction_check: reassessment_authorized_reassessment_preserves_void_to_gap_distinction",
    "gate_transaction_check: reassessment_allowed_transitions_retain_met_gap_void_with_one_audit_and_receipt_each",
    "gate_transaction_check: signing_approved_source_document_content_is_immutable",
    "gate_transaction_check: signing_approved_qa_cannot_move_to_draft_letter",
    "gate_transaction_check: signing_approved_qa_cannot_be_truncated",
    "gate_transaction_check: signing_approved_source_mappings_cannot_be_truncated",
    "gate_transaction_check: signing_approved_letter_cannot_return_to_draft",
    "gate_transaction_check: signing_source_mutation_cannot_commit_after_concurrent_approval",
    "gate_transaction_check: signing_qa_truncate_commits_first_and_concurrent_approval_is_refused",
    "gate_transaction_check: signing_approval_commits_first_and_concurrent_qa_truncate_is_refused",
    "gate_transaction_check: signing_claims_truncate_commits_first_and_concurrent_approval_is_refused",
    "gate_transaction_check: signing_approval_commits_first_and_concurrent_claims_truncate_is_refused",
    "gate_transaction_check: signing_protected_schema_move_commits_first_and_publication_is_refused",
    "gate_transaction_check: signing_publication_commits_first_and_protected_schema_move_is_refused",
    "gate_transaction_check: signing_protected_table_creation_commits_first_and_publication_is_refused",
    "gate_transaction_check: signing_publication_commits_first_and_protected_table_creation_is_refused",
    "gate_transaction_check: signing_incomplete_qa_cannot_be_approved_or_signed",
}
check(
    "database-receipts:key-markers",
    required_markers <= all_markers,
    {"missing": sorted(required_markers - all_markers)},
)

session = read(EVIDENCE / "task-4-session-compatibility.json")
check(
    "recorded-T1:mounted-session-compatibility",
    session["result"] == "Passed"
    and session["verification_tier"] == 1
    and len(session["checks"]) == 34
    and all(item["result"] == "Passed" for item in session["checks"].values())
    and len(session["cleanup"]) == 9
    and all(session["cleanup"].values()),
    {"checks": len(session["checks"]), "cleanup": len(session["cleanup"])},
)

pem = read(EVIDENCE / "task-8-pem-exclusion.json")
check(
    "architecture:no-pem-command-replay",
    pem["result"] == "Passed"
    and len(pem["checks"]) == 8
    and all(item["result"] == "Passed" for item in pem["checks"].values()),
    sorted(pem["checks"]),
)

anchors = {
    "crates/aso-web-server/src/main.rs": [
        "adapters::gate::PgGateRepository::connect",
        "let mut app = api_router(state)",
    ],
    "crates/aso-server-axum/src/lib.rs": [
        ".merge(routes::letters::router())",
        ".merge(routes::evidence::router())",
    ],
    "crates/aso-host/src/signing.rs": [
        "self.authority.may_sign_letter",
        "self.letters.execute_sign_letter",
    ],
    "crates/aso-host/src/reassessment.rs": [
        ".may_reassess_evidence",
        "self.evidence.execute_reassessment",
    ],
    "docker/flint-gate/config.yaml": ["aso_clinical_authorize"],
}
for raw, expected in anchors.items():
    text = (ROOT / raw).read_text()
    missing = [anchor for anchor in expected if anchor not in text]
    check("caller:" + raw, not missing, {"missing": missing})

router_source = (ROOT / "crates/aso-server-axum/src/lib.rs").read_text()
check(
    "composition:actorless-evidence-count-unmounted",
    ".merge(routes::cases::router())" not in router_source
    and ".merge(routes::evidence::router())" in router_source,
    "Production composition excludes the legacy actorless count router",
)

adapters_mod = (ROOT / "crates/aso-web-server/src/adapters/mod.rs").read_text()
check(
    "composition:memory-test-only",
    "#[cfg(test)]\npub mod memory;" in adapters_mod,
    "Memory adapter is excluded from production compilation",
)

evidence_route = (ROOT / "web/src/app/routes/evidence-timeline-route.tsx").read_text()
evidence_component = (
    ROOT / "web/src/features/evidence-timeline/components/evidence-timeline.tsx"
).read_text()
check(
    "caller:web-evidence-read-mounted-mutation-inactive",
    "EvidenceTimeline" in evidence_route and "reassess(" not in evidence_component,
    "Route mounts timeline read; component contains no reassessment invocation",
)

surgeon_refs = []
for path in (ROOT / "web/src").rglob("*.ts*"):
    if "useSurgeonGate" in path.read_text():
        surgeon_refs.append(str(path.relative_to(ROOT)))
surgeon_route = (ROOT / "web/src/app/routes/surgeon-gate-route.tsx").read_text()
check(
    "caller:web-gate-hook-inactive",
    set(surgeon_refs)
    == {
        "web/src/features/surgeon-gate/hooks/use-surgeon-gate.ts",
        "web/src/features/surgeon-gate/hooks/use-surgeon-gate.test.tsx",
    }
    and "RoutePlaceholder" in surgeon_route,
    sorted(surgeon_refs),
)

desktop_source = (ROOT / "desktop/src-tauri/src/lib.rs").read_text()
desktop_manifest = tomllib.loads((ROOT / "desktop/src-tauri/Cargo.toml").read_text())
desktop_dependencies = set(desktop_manifest.get("dependencies", {})) | set(
    desktop_manifest.get("dev-dependencies", {})
)
check(
    "caller:desktop-inactive",
    "NativeAuthenticationUnavailable" in desktop_source
    and "#[tauri::command]" not in desktop_source
    and "tauri" not in desktop_dependencies,
    "No Tauri dependency or command registration; wrappers fail closed",
)

constraints = read(HERE / "constraints.json")["constraints"]
checklist = read(HERE / "dist/checklist.json")["constraints"]
check(
    "constraints:exact-checklist-coverage",
    {item["id"] for item in constraints} == {item["id"] for item in checklist},
    "Every applicable constraint has one checklist result",
)
check(
    "constraints:applicable-satisfaction",
    all(item["status"] == "satisfied" for item in checklist),
    "Unverified delivery surfaces are separate from satisfied RA-03 constraints",
)
state = read(
    HERE / ".refiner/artifacts/ra-03-clinical-command-parity/state.json"
)
check(
    "state:iteration-consistency",
    state["current_iteration"] == 7 and len(state["iteration_history"]) == 7,
    "Initial refinement plus six isolated-review remediation cycles",
)
check(
    "state:completed-phases",
    state["phases_completed"]
    == ["specify", "plan", "execute", "reflect", "persist"],
    state["phases_completed"],
)

failed = [item for item in results if item["result"] != "Passed"]
output = {
    "result": "Passed" if not failed else "Failed",
    "scope": "Scoped deterministic content/evidence gate; current T0, focused T1 and current-hash recorded live receipts; no phase T2 or release T3.",
    "check_count": len(results),
    "issue_count": len(failed),
    "checks": results,
}
print(json.dumps(output, indent=2))
sys.exit(1 if failed else 0)
