#!/usr/bin/env python3
"""Verify the frozen synthetic web case-to-letter contract fixtures."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path
from uuid import UUID, uuid5

ROOT = Path(__file__).resolve().parent
FIXTURE_PATH = ROOT / "fixture-manifest.json"
EXPECTED_PATH = ROOT / "expected-output-manifest.json"
LOCK_PATH = ROOT / "manifest-lock.json"
SCHEMA_PATH = ROOT.parents[3] / "docs/design/schema/schema.sql"
CAPABILITY_SCHEMA_PATH = ROOT.parents[3] / "docs/design/schema/schema-web-capabilities.sql"
RESOLUTION_SCHEMA_PATH = ROOT.parents[3] / "docs/design/schema/schema-web-case-to-letter.sql"
UNSUPPORTED_COPY = "This assertion has no source document. It will not be included."
UNRELATED_COPY = "This citation does not support the assertion. It will not be included."
REQUEST_COMMANDS = {
    "create_case", "transition_to_evidence", "upload_policy", "upload_mri",
    "upload_therapy", "process_policy", "process_mri", "process_therapy",
    "resolve_entity", "import_criteria", "select_criteria",
    "assemble_initial_evidence", "record_gap_argument", "request_void_evidence",
    "upload_surgeon_note", "process_surgeon_note", "upload_nicotine_result",
    "process_nicotine_result", "resolve_void_work", "assemble_final_evidence",
    "transition_to_policy_review", "transition_to_awaiting_gate",
    "affirm_policy", "affirm_section", "affirm_pathway", "affirm_plan",
    "generate_letter", "record_letter_qa", "approve_letter", "sign_letter",
    "acknowledge_submission",
}
RESPONSE_COMMANDS = {
    "create_case", "transition_to_evidence", "upload_policy", "upload_case_record",
    "process_policy", "process_case_record", "resolve_entity", "import_criteria",
    "select_criteria", "assemble_evidence", "transition_to_policy_review",
    "transition_to_awaiting_gate", "affirm_policy", "affirm_section",
    "affirm_pathway", "affirm_plan", "generate_letter", "record_initial_qa",
    "approve_initial_letter", "sign_initial_letter", "acknowledge_initial_submission",
    "upload_determination", "process_determination", "record_determination",
    "confirm_classification", "generate_response_letter", "record_response_qa",
    "approve_response_letter", "sign_response_letter", "acknowledge_response_submission",
}
CORRECTED_RESPONSE_COMMANDS = RESPONSE_COMMANDS | {"correct_determination"}
CLINICAL_RESPONSE_COMMANDS = RESPONSE_COMMANDS | {
    "reaffirm_response_policy", "reaffirm_response_section",
    "reaffirm_response_pathway", "reaffirm_response_plan",
}
REVISION_KEYS = {
    "authorizationRevision", "caseInputRevision", "caseStatusRevision",
    "resolutionRevision", "documentSetRevision", "criteriaCatalogRevision",
    "criteriaSelectionRevision", "evidenceWorkRevision", "evidenceRevision",
    "gateRevision", "submissionRevision", "determinationRevision",
    "classificationRevision", "responseGateRevision", "letterRevision",
    "qaRevision", "signatureRevision",
}
ROLE_KEYS = {"admin", "surgeon", "staff"}
CAPABILITY_KEYS = {
    "case:read", "case_write", "document_upload", "document_process",
    "resolve_administering_entity", "configure", "criteria_select",
    "evidence_assemble", "evidence_obtain", "annotate", "affirm_gate",
    "letter_generate", "letter_review", "letter_approve", "sign_letter",
    "submit", "determination_record", "determination_correct",
    "determination_classify",
}
DOCUMENT_TYPE_KEYS = {
    "mri-report", "ct-myelogram-report", "laboratory-result",
    "physical-therapy-note", "injection-procedure-note", "operative-report",
    "office-visit-note", "policy-document", "insurance-card", "payer-determination",
}
SUBMISSION_CHANNEL_KEYS = {
    "payer-portal", "fax", "x12-278-transaction", "secure-email",
}
REQUIRED_ROLE_GRANTS = {
    ("admin", "configure"), ("admin", "view_audit"),
    ("staff", "submit"), ("surgeon", "submit"),
    ("surgeon", "affirm_gate"), ("surgeon", "sign_letter"),
    ("surgeon", "annotate"),
}
FORBIDDEN_ROLE_GRANTS = {
    ("admin", "submit"), ("admin", "affirm_gate"),
    ("admin", "sign_letter"), ("admin", "annotate"),
    ("admin", "letter_approve"), ("staff", "letter_approve"),
    ("staff", "affirm_gate"), ("staff", "sign_letter"),
    ("staff", "annotate"), ("surgeon", "evidence_obtain"),
}
SYNTHETIC_TEXT_FIELDS = {
    "name", "display_name", "case_number", "member_id", "procedure_code",
    "plan_key", "criteria_set_key", "submission_channel_key", "appeal_path_key",
    "label", "requirement", "text", "quote", "argument_quote", "rationale",
    "claim_text", "body_markdown", "reason_text", "source_quote",
}


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def digest_text(value: str) -> str:
    return digest_bytes(value.encode("utf-8"))


def resolve_pointer(value: object, pointer: str) -> object:
    check(pointer.startswith("/"), f"invalid JSON pointer: {pointer}")
    current = value
    for encoded in pointer[1:].split("/"):
        key = encoded.replace("~1", "/").replace("~0", "~")
        if isinstance(current, list):
            current = current[int(key)]
        elif isinstance(current, dict):
            current = current[key]
        else:
            raise AssertionError(f"JSON pointer traverses a scalar: {pointer}")
    return current


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def expected_lookup_anchor(case: dict, command: str) -> str:
    case_id = case["case"]["id"]
    document_indexes = {
        "policy": 0, "mri": 1, "therapy": 2, "surgeon_note": 3,
        "nicotine_result": 4, "case_record": 1, "determination": 2,
    }
    if command == "create_case":
        return "/api/case-commands"
    if command.startswith("upload_"):
        return f"/api/cases/{case_id}/document-commands"
    if command.startswith("process_"):
        suffix = command.removeprefix("process_")
        return f"/api/cases/{case_id}/documents/{case['documents'][document_indexes[suffix]]['id']}/commands"
    if command == "resolve_entity":
        return f"/api/cases/{case_id}/administering-entity/commands"
    if command == "import_criteria":
        return "/api/criteria/catalog/commands"
    if command == "select_criteria":
        return f"/api/cases/{case_id}/criteria-selection/commands"
    if command.startswith("assemble_"):
        return f"/api/cases/{case_id}/evidence-commands"
    if command in {"record_gap_argument", "request_void_evidence", "resolve_void_work"}:
        return f"/api/cases/{case_id}/evidence-work-commands"
    if command.startswith("affirm_"):
        return f"/api/cases/{case_id}/gate/commands"
    if command.startswith("reaffirm_response_"):
        return f"/api/cases/{case_id}/response-gate/commands"
    if command == "generate_letter":
        return f"/api/cases/{case_id}/letter-commands"
    if command == "generate_response_letter":
        return f"/api/cases/{case_id}/response-letter-commands"
    if command == "record_determination":
        return f"/api/cases/{case_id}/determination-commands"
    if command == "correct_determination":
        return f"/api/cases/{case_id}/determinations/{case['determination']['id']}/commands"
    if command == "confirm_classification":
        return f"/api/cases/{case_id}/determinations/{case['determination']['id']}/classification/commands"
    if command in {"record_letter_qa", "approve_letter"}:
        return "/api/letters/80000000-0000-4000-8000-000000000001/commands"
    if command == "sign_letter":
        return "/api/letters/80000000-0000-4000-8000-000000000001/sign/commands"
    if command in {"record_initial_qa", "approve_initial_letter"}:
        return f"/api/letters/{case['original_request']['letter_id']}/commands"
    if command == "sign_initial_letter":
        return f"/api/letters/{case['original_request']['letter_id']}/sign/commands"
    if command in {"record_response_qa", "approve_response_letter", "sign_response_letter"}:
        initial = case["original_request"]["letter_id"]
        response = initial[:-1] + str(int(initial[-1]) + 1)
        suffix = "sign/commands" if command == "sign_response_letter" else "commands"
        return f"/api/letters/{response}/{suffix}"
    if command.startswith("acknowledge_"):
        return f"/api/cases/{case_id}/submission-commands"
    return f"/api/cases/{case_id}/commands"


def expected_mutation_route(case: dict, command: str) -> tuple[str, str]:
    case_id = case["case"]["id"]
    document_indexes = {
        "policy": 0, "mri": 1, "therapy": 2, "surgeon_note": 3,
        "nicotine_result": 4, "case_record": 1, "determination": 2,
    }
    initial_letter = ("80000000-0000-4000-8000-000000000001"
                      if case["fixture_id"] == "request-case"
                      else case["original_request"]["letter_id"])
    response_letter = (None if case["fixture_id"] == "request-case"
                       else initial_letter[:-1] + str(int(initial_letter[-1]) + 1))
    if command == "create_case":
        return "POST", "/api/cases"
    if command.startswith("transition_"):
        return "POST", f"/api/cases/{case_id}/status"
    if command.startswith("upload_"):
        return "POST", f"/api/cases/{case_id}/documents"
    if command.startswith("process_"):
        suffix = command.removeprefix("process_")
        document_id = case["documents"][document_indexes[suffix]]["id"]
        return "POST", f"/api/cases/{case_id}/documents/{document_id}/process"
    if command == "resolve_entity":
        return "POST", f"/api/cases/{case_id}/administering-entity"
    if command == "import_criteria":
        return "POST", "/api/criteria/catalog"
    if command == "select_criteria":
        return "POST", f"/api/cases/{case_id}/criteria-selection"
    if command.startswith("assemble_"):
        return "POST", f"/api/cases/{case_id}/evidence/assemble"
    if command == "record_gap_argument":
        return "POST", f"/api/cases/{case_id}/evidence/gap-arguments"
    if command == "request_void_evidence":
        return "POST", f"/api/cases/{case_id}/evidence/void-work"
    if command == "resolve_void_work":
        return "POST", f"/api/cases/{case_id}/evidence/void-work/{case['evidence_work'][1]['id']}/resolve"
    if command.startswith("affirm_"):
        return "POST", f"/api/cases/{case_id}/gate/affirm"
    if command.startswith("reaffirm_response_"):
        return "POST", f"/api/cases/{case_id}/response-gate/affirmations"
    if command == "generate_letter":
        return "POST", f"/api/cases/{case_id}/letters"
    if command == "generate_response_letter":
        return "POST", f"/api/cases/{case_id}/response-letters"
    if command in {"record_letter_qa", "record_initial_qa"}:
        return "POST", f"/api/letters/{initial_letter}/qa"
    if command == "record_response_qa":
        return "POST", f"/api/letters/{response_letter}/qa"
    if command in {"approve_letter", "approve_initial_letter"}:
        return "POST", f"/api/letters/{initial_letter}/approve"
    if command == "approve_response_letter":
        return "POST", f"/api/letters/{response_letter}/approve"
    if command in {"sign_letter", "sign_initial_letter"}:
        return "POST", f"/api/letters/{initial_letter}/sign"
    if command == "sign_response_letter":
        return "POST", f"/api/letters/{response_letter}/sign"
    if command.startswith("acknowledge_") or command == "acknowledge_submission":
        return "POST", f"/api/cases/{case_id}/submissions/acknowledge"
    if command == "record_determination":
        return "POST", f"/api/cases/{case_id}/determinations"
    if command == "correct_determination":
        return "PATCH", f"/api/cases/{case_id}/determinations/{case['determination']['id']}"
    if command == "confirm_classification":
        return "POST", f"/api/cases/{case_id}/determinations/{case['determination']['id']}/classification"
    raise AssertionError(f"no frozen mutation route for {command}")


def uuid_value(value: str, label: str) -> None:
    try:
        parsed = UUID(value)
    except ValueError as exc:
        raise AssertionError(f"{label} is not a UUID: {value}") from exc
    check(str(parsed) == value, f"{label} is not canonical lowercase UUID text: {value}")


def walk_identifiers(value: object, path: str = "root") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if child is not None and isinstance(child, str) and key not in {
                "fixture_id", "member_id", "source_fixture_id"
            } and (
                key == "id"
                or key.endswith("_id")
                or key in {"affirmed_by", "confirmed_by"}
            ):
                uuid_value(child, child_path)
            walk_identifiers(child, child_path)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            walk_identifiers(child, f"{path}[{index}]")


def collect_uuid_strings(value: object) -> set[str]:
    found: set[str] = set()
    if isinstance(value, dict):
        for child in value.values():
            found.update(collect_uuid_strings(child))
    elif isinstance(value, list):
        for child in value:
            found.update(collect_uuid_strings(child))
    elif isinstance(value, str):
        try:
            parsed = UUID(value)
        except ValueError:
            pass
        else:
            if str(parsed) == value:
                found.add(value)
    return found


def validate_synthetic_content(value: object, path: str = "root") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            is_operation_name = key == "name" and any(
                collection in path
                for collection in (
                    "workflow_commands", "workflow_steps", "precondition_reads",
                    "setup_operations", "tested_command", "tested_read", ".read",
                    "conformance_sample",
                )
            )
            if key in SYNTHETIC_TEXT_FIELDS and not is_operation_name and isinstance(child, str) and child:
                check("synthetic" in child.lower() or child.startswith("SYN-"),
                      f"{child_path} is not explicitly synthetic")
            if key == "email" and isinstance(child, str):
                check(child.endswith("@example.invalid"),
                      f"{child_path} is not a reserved synthetic address")
            validate_synthetic_content(child, child_path)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            validate_synthetic_content(child, f"{path}[{index}]")


def validate_document(document: dict, fixture_id: str) -> None:
    pages = sorted(document["pages"], key=lambda page: page["page_number"])
    check([page["page_number"] for page in pages] == list(range(1, len(pages) + 1)),
          f"{fixture_id}: {document['id']} pages are not contiguous from 1")
    check(document["page_count"] == len(pages),
          f"{fixture_id}: {document['id']} page_count mismatch")
    canonical = "\f".join(page["text"] for page in pages)
    check(document["content_sha256"] == digest_text(canonical),
          f"{fixture_id}: {document['id']} content hash mismatch")
    check(document["name"].startswith("Synthetic "),
          f"{fixture_id}: document name is not explicitly synthetic")
    check(document.get("document_type") in DOCUMENT_TYPE_KEYS,
          f"{fixture_id}: {document['id']} uses an unregistered document type")
    required_data = {
        "mri-report": {"modality", "body_region", "impression"},
        "physical-therapy-note": {"sessions_completed", "start_date"},
        "office-visit-note": {"encounter_date"},
        "laboratory-result": {"loinc_code", "analyte", "value", "units"},
    }.get(document["document_type"], set())
    check(required_data <= set(document.get("data", {})),
          f"{fixture_id}: {document['id']} lacks typed document data")


def validate_claim(claim: dict, documents: dict[str, dict], fixture_id: str) -> None:
    document_id = claim.get("document_id")
    page_number = claim.get("page_number")
    source_date = claim.get("source_date")
    check(document_id in documents, f"{fixture_id}: claim {claim['id']} has no fixture document")
    check(isinstance(page_number, int) and page_number > 0,
          f"{fixture_id}: claim {claim['id']} lacks a positive page")
    document = documents[document_id]
    check(source_date == document["effective_date"],
          f"{fixture_id}: claim {claim['id']} source date mismatch")
    check(claim.get("source_content_sha256") == document["content_sha256"],
          f"{fixture_id}: claim {claim['id']} content hash mismatch")
    pages = {page["page_number"]: page["text"] for page in document["pages"]}
    check(page_number in pages, f"{fixture_id}: claim {claim['id']} page is out of bounds")
    page_bytes = pages[page_number].encode("utf-8")
    start = claim.get("source_span_start")
    end = claim.get("source_span_end")
    check(isinstance(start, int) and isinstance(end, int) and 0 <= start < end <= len(page_bytes),
          f"{fixture_id}: claim {claim['id']} source span is invalid")
    check(page_bytes[start:end].decode("utf-8") == claim.get("source_quote"),
          f"{fixture_id}: claim {claim['id']} quote does not match its exact source span")
    check(claim.get("document_version") == document["document_version"],
          f"{fixture_id}: claim {claim['id']} document version mismatch")
    source_date_kind = claim.get("source_date_kind")
    check(source_date_kind in
          {"effective_date", "service_date", "authored_date", "determination_date"},
          f"{fixture_id}: claim {claim['id']} source date kind is invalid")
    document_type = document.get("document_type")
    if document_type == "payer-determination":
        check(source_date_kind == "determination_date",
              f"{fixture_id}: determination claim does not use determination_date")
    elif document_type == "policy-document":
        check(source_date_kind == "effective_date",
              f"{fixture_id}: policy claim does not use effective_date")
    else:
        check(source_date_kind in {"effective_date", "service_date", "authored_date"},
              f"{fixture_id}: non-determination claim uses determination_date")
    check(claim.get("support_status") == "supported"
          and claim.get("support_reviewed_by")
          and claim.get("support_reviewed_at")
          and claim.get("support_claim_version") == 1,
          f"{fixture_id}: claim {claim['id']} lacks a current human support decision")
    reviewed_on = datetime.fromisoformat(claim["support_reviewed_at"].replace("Z", "+00:00")).date()
    check(reviewed_on >= date.fromisoformat(source_date),
          f"{fixture_id}: claim {claim['id']} was reviewed before its source existed")


def validate_letter(letter: dict, documents: dict[str, dict], fixture_id: str, label: str) -> None:
    check(letter["status"] == "signed", f"{fixture_id}: expected {label} is not signed")
    check(letter["body_sha256"] == digest_text(letter["body_markdown"]),
          f"{fixture_id}: {label} body hash mismatch")
    ordinals = [item["ordinal"] for item in letter["claims"]]
    check(ordinals == list(range(1, len(ordinals) + 1)),
          f"{fixture_id}: {label} claim order is not contiguous")
    for item in letter["claims"]:
        validate_claim(item, documents, fixture_id)
    excluded = set(letter.get("excluded_criterion_ids", []))
    included = {item.get("criterion_id") for item in letter["claims"]
                if item.get("criterion_id") is not None}
    check(excluded.isdisjoint(included),
          f"{fixture_id}: {label} has a criterion both included and excluded")


def validate_submission(
    case: dict,
    output: dict,
    payload_key: str,
    letter: dict,
    documents: dict[str, dict],
) -> None:
    fixture_id = case["fixture_id"]
    payload = case["command_payloads"][payload_key]
    document_ids: list[str] = []
    for claim in letter["claims"]:
        if claim["document_id"] not in document_ids:
            document_ids.append(claim["document_id"])
    ordered = [letter["id"], *document_ids]
    manifest_hash = digest_text("\n".join(ordered) + "\n")
    total_pages = 1 + sum(documents[item]["page_count"] for item in document_ids)
    check(payload["submissionId"] == output["id"]
          and payload["letterId"] == output["letter_id"] == letter["id"]
          and payload["attempt"] == output["attempt"] == 1
          and payload["channelKey"] == output["channel_key"]
          and payload["channelKey"] in SUBMISSION_CHANNEL_KEYS
          and payload["channelData"] == output["channel_data"]
          and payload["submittedAt"] == output["submitted_at"]
          and payload["totalPages"] == output["total_pages"] == total_pages,
          f"{fixture_id}: {payload_key} lacks frozen submission identity/custody fields")
    check(payload["attachmentManifest"] == {
              "orderedAttachmentIds": ordered, "sha256": manifest_hash,
          }
          and output["attachment_manifest"] == {
              "ordered_attachment_ids": ordered, "sha256": manifest_hash,
          }, f"{fixture_id}: {payload_key} attachment manifest is not deterministic")
    custody = payload["receiptCustody"]
    check(output["receipt_custody"] == {
              "receipt_id": custody["receiptId"],
              "kind": custody["kind"],
              "acknowledged_at": custody["acknowledgedAt"],
              "evidence_sha256": custody["evidenceSha256"],
          }
          and custody["acknowledgedAt"] == output["submitted_at"]
          and custody["evidenceSha256"] == digest_text(
              f"{output['id']}|{output['submitted_at']}|{output['status']}"
          ), f"{fixture_id}: {payload_key} receipt custody evidence drifted")


def validate_administering_entity_resolution_fixture(
    fixture: dict,
    expected: dict,
) -> None:
    check(fixture["fixture_id"] == expected["fixture_id"] == "web-03-resolution-rules",
          "administering-entity fixture identity drifted")
    check(fixture["synthetic"] is True,
          "administering-entity fixture is not explicitly synthetic")

    required_states = {"valid", "missing", "ambiguous", "conflicting", "expired"}
    cases = {item["fixture_id"]: item for item in fixture["cases"]}
    outputs = {item["fixture_id"]: item for item in expected["outcomes"]}
    check(set(cases) == required_states,
          "administering-entity fixture cases differ from the required states")
    check(set(outputs) == required_states,
          "administering-entity expected outcomes differ from the required states")

    plan_ids = {item["id"] for item in fixture["plans"]}
    entity_ids = {item["id"] for item in fixture["administering_entities"]}
    check(len(plan_ids) == len(fixture["plans"]),
          "administering-entity fixture reuses a plan identity")
    check(len(entity_ids) == len(fixture["administering_entities"]),
          "administering-entity fixture reuses an entity identity")
    check(len({item["id"] for item in fixture["delegation_rules"]})
          == len(fixture["delegation_rules"]),
          "administering-entity fixture reuses a rule identity")
    check(all(item["payer_plan_id"] in plan_ids
              and item["administering_entity_id"] in entity_ids
              and item["source_document_id"] == fixture["source_document"]["id"]
              for item in fixture["delegation_rules"]),
          "administering-entity rule has an unknown plan, entity, or source")

    def active_on(item: dict, service_date: date) -> bool:
        valid_from = date.fromisoformat(item["valid_from"])
        valid_to = (date.fromisoformat(item["valid_to"])
                    if item["valid_to"] is not None else None)
        return valid_from <= service_date and (valid_to is None or service_date < valid_to)

    plan_by_id = {item["id"]: item for item in fixture["plans"]}
    for fixture_id, case in cases.items():
        service_date = date.fromisoformat(case["date_of_service"])
        plans = [
            item for item in fixture["plans"]
            if item["plan_key"] == case["plan_key"]
        ]
        historical = [
            rule for rule in fixture["delegation_rules"]
            if rule["payer_plan_id"] in {item["id"] for item in plans}
            and rule["procedure_code"] == case["procedure_code"]
        ]
        enrollment = {
            "valid_from": case.get("enrollment_valid_from", plans[0]["valid_from"]),
            "valid_to": case.get("enrollment_valid_to", plans[0]["valid_to"]),
        }
        active = [
            rule for rule in historical
            if active_on(plan_by_id[rule["payer_plan_id"]], service_date)
            and active_on(enrollment, service_date)
            and active_on(rule, service_date)
        ]
        if len(active) == 1:
            state = "resolved"
        elif not active:
            state = "expired" if historical else "missing"
        elif len({item["administering_entity_id"] for item in active}) > 1:
            state = "ambiguous"
        else:
            state = "conflicting"

        output = outputs[fixture_id]
        check(output["state"] == state
              and output["candidate_count"] == len(active)
              and output["historical_candidate_count"] == len(historical)
              and output["downstream_blocked"] == (state != "resolved"),
              f"{fixture_id}: administering-entity outcome is not deterministic")
        if state == "resolved":
            candidate = active[0]
            plan = plan_by_id[candidate["payer_plan_id"]]
            valid_from = max(
                plan["valid_from"], enrollment["valid_from"], candidate["valid_from"]
            )
            valid_to_values = [
                value for value in (
                    plan["valid_to"], enrollment["valid_to"], candidate["valid_to"]
                ) if value is not None
            ]
            valid_to = min(valid_to_values) if valid_to_values else None
            check(output == {
                "fixture_id": fixture_id,
                "state": "resolved",
                "candidate_count": 1,
                "historical_candidate_count": 1,
                "downstream_blocked": False,
                "matched_rule_id": candidate["id"],
                "entity_id": candidate["administering_entity_id"],
                "criteria_set_key": candidate["criteria_set_key"],
                "submission_channel_key": candidate["submission_channel_key"],
                "appeal_path_key": candidate["appeal_path_key"],
                "source_document_id": candidate["source_document_id"],
                "valid_from": valid_from,
                "valid_to": valid_to,
            }, "valid administering-entity output differs from its one rule")

    schema = RESOLUTION_SCHEMA_PATH.read_text(encoding="utf-8")
    check(all(name in schema for name in (
              "CREATE TABLE administering_entities",
              "CREATE TABLE payer_plans",
              "CREATE TABLE plan_delegation_rules",
              "CREATE TABLE administering_entity_resolutions",
              "assert_resolution_source_practice",
          )), "administering-entity fixture is not backed by the design schema")


def main() -> int:
    fixtures = load(FIXTURE_PATH)
    expected = load(EXPECTED_PATH)
    lock = load(LOCK_PATH)

    check(fixtures["schema_version"] == 2, "fixture schema_version must be 2")
    check(expected["schema_version"] == 2, "expected schema_version must be 2")
    check(lock["schema_version"] == 2, "lock schema_version must be 2")
    check(fixtures["contract"] == expected["contract"] == lock["contract"] == "web-case-to-letter-v2",
          "contract identifiers differ")
    check(fixtures["synthetic_only"] is True, "fixture root is not synthetic_only")
    validate_synthetic_content(fixtures, "fixtures")
    validate_synthetic_content(expected, "expected")

    locked = {entry["path"]: entry["sha256"] for entry in lock["files"]}
    for path in (FIXTURE_PATH, EXPECTED_PATH):
        check(locked.get(path.name) == digest_bytes(path.read_bytes()),
              f"lock hash mismatch for {path.name}")
    check(expected["fixture_manifest_sha256"] == digest_bytes(FIXTURE_PATH.read_bytes()),
          "expected outputs target a different fixture manifest")

    validate_administering_entity_resolution_fixture(
        fixtures["administering_entity_resolution_fixture"],
        expected["administering_entity_resolution_fixture"],
    )

    positives = {case["fixture_id"]: case for case in fixtures["positive_cases"]}
    outputs = {case["fixture_id"]: case for case in expected["positive_cases"]}
    required_positive = {"request-case", "corrected-resubmission-case", "clinical-appeal-case"}
    check(set(positives) == required_positive, "positive fixture families differ from the frozen contract")
    check(set(outputs) == required_positive, "expected positive families differ from the frozen contract")
    check(fixtures["actor_role_keys"] == {
        "coordinator": "staff",
        "administrator": "admin",
        "surgeon": "surgeon",
        "processor": "authorized_document_job_only",
        "viewer_principal": "staff",
        "foreign_principal": "staff",
    }, "fixture actor labels do not map deterministically to schema roles")
    schema_text = SCHEMA_PATH.read_text(encoding="utf-8")
    capability_schema_text = CAPABILITY_SCHEMA_PATH.read_text(encoding="utf-8")
    check("UNIQUE (case_id, purpose, version)" in schema_text
          and "letters_original_request_same_case_fkey" in schema_text
          and "letters_challenged_determination_fkey" in schema_text,
          "schema does not namespace letter versions and link responses within one case")
    check("letter_claims_letter_same_case_fkey" in schema_text
          and "letter_claims_document_same_case_fkey" in schema_text
          and "case_id               uuid NOT NULL REFERENCES cases" in schema_text,
          "schema does not bind every cited document to the letter case")
    check("current_verified_practice_id()" in schema_text
          and "aso.selected_practice_id" in schema_text
          and "current_app_practice_ids" in schema_text,
          "schema does not bind tenant access to the verified selected practice")
    check("UNIQUE (letter_id, attempt)" in schema_text
          and "submissions_letter_same_case_fkey" in schema_text
          and "determinations_submission_same_case_fkey" in schema_text,
          "schema does not namespace submission attempts and links within one case")
    check(all(f"('{name}'" in schema_text for name in (
              "MRI Report", "CT Myelogram Report", "Laboratory Result",
              "Physical Therapy Note", "Injection Procedure Note", "Operative Report",
              "Office Visit Note", "Policy Document", "Insurance Card", "Payer Determination",
          )), "fixture verifier accepts a document type absent from the schema registry")
    check(all(f"('{name}'" in schema_text for name in (
              "Payer Portal", "Fax", "X12 278 Transaction", "Secure Email",
          )), "fixture verifier accepts a submission channel absent from the schema registry")
    check("('Medical Policy'" in schema_text,
          "fixture verifier accepts a policy type absent from the schema registry")
    base_capabilities = schema_text.split(
        "INSERT INTO capabilities", 1
    )[1].split("CREATE TABLE roles", 1)[0]
    web_capabilities = capability_schema_text.split(
        "INSERT INTO capabilities", 1
    )[1].split("INSERT INTO role_capabilities", 1)[0]
    registered_capabilities = set(re.findall(
        r"\('([^']+)'\s*,", base_capabilities + "\n" + web_capabilities,
    ))
    registered_roles = set(re.findall(
        r"\('([^']+)',\s*'[^']+',\s*'[^']+',\s*true\)",
        schema_text.split("INSERT INTO roles", 1)[1].split("CREATE TABLE role_capabilities", 1)[0],
    ))
    check(CAPABILITY_KEYS <= registered_capabilities,
          "fixture verifier accepts a capability absent from the schema registry")
    check(ROLE_KEYS == registered_roles,
          "fixture verifier role keys differ from the schema registry")
    base_role_grants = set(re.findall(
        r"\('([^']+)'\s*,\s*'([^']+)'\)",
        schema_text.split("INSERT INTO role_capabilities", 1)[1]
        .split("CREATE TABLE user_roles", 1)[0],
    ))
    web_role_grants = set(re.findall(
        r"\('([^']+)'\s*,\s*'([^']+)'\)",
        capability_schema_text.split("INSERT INTO role_capabilities", 1)[1]
        .split("DELETE FROM role_capabilities", 1)[0],
    ))
    effective_role_grants = base_role_grants | web_role_grants
    check("r.key = 'admin'" in capability_schema_text
          and "rc.capability_key = 'submit'" in capability_schema_text,
          "capability migration does not reconcile the legacy admin submit grant")
    effective_role_grants.discard(("admin", "submit"))
    check(REQUIRED_ROLE_GRANTS <= effective_role_grants,
          "schema registry lacks a required positive role grant")
    check(FORBIDDEN_ROLE_GRANTS.isdisjoint(effective_role_grants),
          "schema registry grants a forbidden action to a role")

    all_case_ids: set[str] = set()
    all_command_ids: set[str] = set()
    denial_determination_ids: set[str] = set()
    response_letter_ids: set[str] = set()

    for fixture_id, case in positives.items():
        check(case["synthetic"] is True, f"{fixture_id}: synthetic flag is not true")
        check(case["patient"]["display_name"].startswith("Synthetic Patient "),
              f"{fixture_id}: patient label is not explicitly synthetic")
        check(case["case"]["case_number"].startswith("SYN-"),
              f"{fixture_id}: case number is not synthetic")
        check(case["practice"]["name"].startswith("Synthetic "),
              f"{fixture_id}: practice name is not explicitly synthetic")
        check(case["payer"]["name"].startswith("Synthetic "),
              f"{fixture_id}: payer name is not explicitly synthetic")
        check(case["administering_entity"]["name"].startswith("Synthetic "),
              f"{fixture_id}: entity name is not explicitly synthetic")
        for principal in case["principals"].values():
            check(principal["display_name"].startswith("Synthetic "),
                  f"{fixture_id}: principal label is not explicitly synthetic")
            check(principal["email"].endswith("@example.invalid"),
                  f"{fixture_id}: contact address is not reserved .invalid data")
        check(all(membership["role"] in ROLE_KEYS for membership in case["memberships"]),
              f"{fixture_id}: membership uses a role absent from the schema registry")
        signature = case["signature"]
        check(signature == {
                  "id": signature["id"],
                  "user_id": case["principals"]["surgeon"]["id"],
                  "version": 1,
                  "image_uri": f"synthetic://{fixture_id}/signature/current",
                  "image_sha256": digest_text("Synthetic signature asset"),
                  "credential_line": "Synthetic Surgeon, MD",
                  "is_current": True,
                  "revision": f"{fixture_id}:signatureRevision:r1",
              }, f"{fixture_id}: standalone signature asset is incomplete or inconsistent")

        case_id = case["case"]["id"]
        check(case_id not in all_case_ids, f"duplicate positive case id: {case_id}")
        all_case_ids.add(case_id)
        for command_id in case["commands"].values():
            check(command_id not in all_command_ids, f"command id reused across fixtures: {command_id}")
            all_command_ids.add(command_id)
        workflow = case["workflow_commands"]
        check(case["workflow_start"] == "empty_case_workflow",
              f"{fixture_id}: fixture does not start from an empty workflow")
        check([step["ordinal"] for step in workflow] == list(range(1, len(workflow) + 1)),
              f"{fixture_id}: workflow command order is not contiguous")
        check({step["name"] for step in workflow} == set(case["commands"]),
              f"{fixture_id}: workflow commands and command identities differ")
        required_commands = (REQUEST_COMMANDS if fixture_id == "request-case"
                             else CLINICAL_RESPONSE_COMMANDS if fixture_id == "clinical-appeal-case"
                             else CORRECTED_RESPONSE_COMMANDS)
        check(set(case["commands"]) == required_commands,
              f"{fixture_id}: standalone command sequence is incomplete")
        check(all(step["lookup_anchor"] == expected_lookup_anchor(case, step["name"])
                  and (step["method"], step["route"])
                      == expected_mutation_route(case, step["name"])
                  and step["payload_refs"]
                  and step["expected_input_tokens"] and step["expected_result_tokens"]
                  and step["actor"] in case["principals"]
                  and step["required_capability"] in CAPABILITY_KEYS
                  for step in workflow),
              f"{fixture_id}: a command lacks its actor, capability, lookup anchor, or exact revision tokens")
        for step in workflow:
            payloads = [resolve_pointer(case, pointer) for pointer in step["payload_refs"]]
            check(len(payloads) == 1
                  and payloads[0]["commandId"] == step["command_id"]
                  and payloads[0]["expectedRevisions"] == step["expected_input_tokens"],
                  f"{fixture_id}: {step['name']} lacks a complete request body")
            token_keys = set(step["expected_input_tokens"])
            check("workflow" not in token_keys
                  and token_keys <= REVISION_KEYS,
                  f"{fixture_id}: {step['name']} uses a generic or unknown input token")
            check(set(step["expected_result_tokens"]) - {"commandResultRevision"} <= REVISION_KEYS,
                  f"{fixture_id}: {step['name']} uses an unknown result token")
            if step["name"] == "import_criteria":
                check(step["actor"] == "administrator" and step["required_capability"] == "configure",
                      f"{fixture_id}: catalog import lacks administrator authority")
            if step["name"].startswith("process_"):
                check(step["actor"] == "processor"
                      and case["principals"]["processor"].get("job_grant") == "authorized_document_job_only",
                      f"{fixture_id}: processing lacks a narrow internal job grant")
            if step["name"] in {"record_letter_qa", "record_initial_qa", "record_response_qa"}:
                check("qaRevision" in step["expected_result_tokens"],
                      f"{fixture_id}: QA command does not publish qaRevision")
            if step["name"].startswith("approve_") or step["name"] == "approve_letter":
                check("qaRevision" in step["expected_input_tokens"],
                      f"{fixture_id}: approval is not bound to qaRevision")
            if step["name"].startswith("sign_") or step["name"] == "sign_letter":
                check({"letterRevision", "qaRevision", "signatureRevision"}
                      <= set(step["expected_input_tokens"]),
                      f"{fixture_id}: signing is not bound to letter, QA, and signature revisions")
                check(payloads[0].get("signatureRevision")
                      == step["expected_input_tokens"]["signatureRevision"],
                      f"{fixture_id}: {step['name']} payload contradicts signatureRevision")
                check(payloads[0].get("signatureId") == signature["id"]
                      and signature["revision"]
                          == step["expected_input_tokens"]["signatureRevision"],
                      f"{fixture_id}: {step['name']} does not bind the standalone signature")
            if fixture_id == "clinical-appeal-case" and step["name"] in {
                "approve_response_letter", "sign_response_letter"
            }:
                check(step["expected_input_tokens"].get("responseGateRevision")
                      == case["revision_ledger"]["responseGateRevision"],
                      f"{fixture_id}: clinical response approval/signing lacks gate freshness")
            if step["name"] == "create_case":
                created = payloads[0]["case"]
                check(created == case["case"]
                      and all(created.get(key) for key in (
                          "practice_id", "patient_id", "surgeon_id", "coordinator_id", "payer_id"
                      )), f"{fixture_id}: create_case lacks required relationship inputs")
            if step["name"].startswith("upload_"):
                uploaded = payloads[0]["document"]
                check(uploaded in case["documents"]
                      and uploaded.get("case_id") == case_id
                      and uploaded.get("patient_id") == case["patient"]["id"],
                      f"{fixture_id}: {step['name']} is not directly loadable")
            if step["name"] == "import_criteria":
                imported = payloads[0]
                check(imported["policy"] == case["policy"]
                      and imported["criteria"] == case["criteria"],
                      f"{fixture_id}: criteria import differs from its policy/catalog objects")
                check(imported["policy"]["policy_type_key"] == "medical-policy",
                      f"{fixture_id}: criteria import uses an unregistered policy type")
                check(all(item["payer_id"] == case["payer"]["id"]
                          and item["policy_id"] == case["policy"]["id"]
                          and item["section"]
                          and item["content_sha256"] == digest_text(item["requirement"])
                          for item in imported["criteria"]),
                      f"{fixture_id}: published criteria import lacks payer/policy/section/hash")
        current_tokens: dict[str, str] = {}
        for step in workflow:
            for key, value in step["expected_input_tokens"].items():
                if key in current_tokens:
                    check(current_tokens[key] == value,
                          f"{fixture_id}: {step['name']} consumes unowned {key} revision {value}")
                else:
                    current_tokens[key] = value
            for key, value in step["expected_result_tokens"].items():
                if key != "commandResultRevision":
                    current_tokens[key] = value
        check(set(case["revision_ledger"]) == REVISION_KEYS,
              f"{fixture_id}: revision ledger is incomplete")
        signing_steps = [step for step in workflow
                         if step["name"].startswith("sign_") or step["name"] == "sign_letter"]
        check(len(case["precondition_reads"]) == len(signing_steps),
              f"{fixture_id}: a signing command lacks a precondition read")
        for read, signing_step in zip(case["precondition_reads"], signing_steps):
            check(read == {
                "name": "read_signing_target",
                "lookup_anchor": signing_step["lookup_anchor"],
                "expected_tokens": {
                    key: value for key, value in signing_step["expected_input_tokens"].items()
                    if key in {"letterRevision", "qaRevision", "signatureRevision", "responseGateRevision"}
                },
            }, f"{fixture_id}: signing precondition read does not match the command tokens")

        documents = {document["id"]: document for document in case["documents"]}
        for document in case["documents"]:
            validate_document(document, fixture_id)
            check(document["case_id"] == case_id
                  and document["patient_id"] == case["patient"]["id"],
                  f"{fixture_id}: document is not bound to its case and patient")
        for criterion in case["criteria"]:
            check(criterion["document_id"] in documents,
                  f"{fixture_id}: criterion {criterion['id']} lacks a fixture source document")
            page_count = documents[criterion["document_id"]]["page_count"]
            check(1 <= criterion["source_page_number"] <= page_count,
                  f"{fixture_id}: criterion {criterion['id']} page is out of bounds")

        evidence_sets = ([case["initial_evidence_inputs"], case["final_evidence_inputs"]]
                         if fixture_id == "request-case" else [case["evidence_inputs"]])
        for evidence in [item for group in evidence_sets for item in group]:
            state = evidence["expected_state"]
            check(state in {"met", "gap", "void"}, f"{fixture_id}: invalid evidence state {state}")
            if state == "void":
                check(evidence["document_id"] is None and evidence["page_number"] is None and evidence["quote"] is None,
                      f"{fixture_id}: void evidence fabricated a citation")
            else:
                check(evidence["document_id"] in documents and isinstance(evidence["page_number"], int),
                      f"{fixture_id}: {state} evidence lacks document/page")
                page = next((page for page in documents[evidence["document_id"]]["pages"]
                             if page["page_number"] == evidence["page_number"]), None)
                check(page is not None and evidence["quote"] in page["text"],
                      f"{fixture_id}: evidence quote does not occur on its source page")

        output = outputs[fixture_id]
        check(output["workflow_steps"] == case["workflow_commands"]
              and all(step["expected_result_tokens"] for step in output["workflow_steps"]),
              f"{fixture_id}: expected workflow output tokens are incomplete")
        check(output["precondition_reads"] == case["precondition_reads"],
              f"{fixture_id}: expected signing preconditions differ from the fixture")
        lifecycle = output["lifecycle"]
        transitions = output["lifecycle_transitions"]
        check([(item["from"], item["to"]) for item in transitions]
              == list(zip(lifecycle, lifecycle[1:])),
              f"{fixture_id}: lifecycle transitions are not completely owned")
        check(all(item["owned_by_command"] in case["commands"] for item in transitions),
              f"{fixture_id}: lifecycle transition names a missing command")
        if fixture_id == "request-case":
            letter = output["letter"]
            validate_letter(letter, documents, fixture_id, "initial request letter")
            check(output["initial_evidence_counts"] == {"met": 1, "gap": 1, "void": 1},
                  "request-case does not preserve all three evidence states")
            check(output["final_evidence_counts"] == {"met": 2, "gap": 1, "void": 0},
                  "request-case does not resolve mandatory void work before signing")
            work = {item["kind"]: item["status"] for item in output["evidence_work"]}
            check(work == {"surgeon_argument": "accepted", "obtain_evidence": "completed"},
                  "request-case lacks completed surgeon/coordinator evidence work")
            check(letter["purpose"] == "prior_authorization_request",
                  "request-case has wrong letter purpose")
            check(output["submission"]["status"] == "acknowledged",
                  "request-case lacks acknowledged local submission")
            validate_submission(case, output["submission"], "acknowledge_submission",
                                letter, documents)
        else:
            initial_letter = output["initial_request_letter"]
            letter = output["response_letter"]
            validate_letter(initial_letter, documents, fixture_id, "initial request letter")
            validate_letter(letter, documents, fixture_id, "response letter")
            check(initial_letter["id"] == case["original_request"]["letter_id"]
                  and initial_letter["body_sha256"] == case["original_request"]["body_sha256"],
                  f"{fixture_id}: initial request output differs from the executed request")
            original_summary = output["original_request"]
            check(original_summary == {
                "letter_id": initial_letter["id"],
                "purpose": initial_letter["purpose"],
                "status": initial_letter["status"],
                "version": initial_letter["version"],
                "body_markdown": initial_letter["body_markdown"],
                "body_sha256": initial_letter["body_sha256"],
                "submission_id": output["initial_submission"]["id"],
                "submission_status": output["initial_submission"]["status"],
            }, f"{fixture_id}: duplicate original-request representation drifted")
            determination_id = case["determination"]["id"]
            denial_determination_ids.add(determination_id)
            response_letter_ids.add(letter["id"])
            check(letter["challenged_determination_id"] == determination_id,
                  f"{fixture_id}: response does not link its determination")
            check(letter["original_request_letter_id"] == case["original_request"]["letter_id"],
                  f"{fixture_id}: response does not link its original request")
            check(case["case"]["status"] == "intake"
                  and case["original_request"]["seeded"] is False
                  and case["determination"]["seeded"] is False,
                  f"{fixture_id}: denial workflow starts from pre-seeded product state")
            check(output["signed_status_before_acknowledgement"] == "response_ready"
                  and output["response_submission"]["status"] == "acknowledged"
                  and output["response_submission"]["letter_id"] == letter["id"],
                  f"{fixture_id}: response transition lacks an acknowledged submission")
            validate_submission(case, output["initial_submission"],
                                "acknowledge_initial_submission", initial_letter, documents)
            validate_submission(case, output["response_submission"],
                                "acknowledge_response_submission", letter, documents)

    corrected = outputs["corrected-resubmission-case"]
    check(corrected["classification"]["response_type"] == "administrative_corrected_resubmission",
          "corrected-resubmission classification mismatch")
    corrected_input = positives["corrected-resubmission-case"]
    correction_step = next(step for step in corrected_input["workflow_commands"]
                           if step["name"] == "correct_determination")
    check(correction_step["required_capability"] == "determination_correct"
          and correction_step["expected_input_tokens"]["determinationRevision"].endswith(":r1")
          and correction_step["expected_result_tokens"]["determinationRevision"].endswith(":r2")
          and corrected["determination"]["reviewed_correction"]
              == corrected_input["determination_correction"],
          "corrected-resubmission does not exercise reviewed determination correction")
    check(corrected["response_letter"]["purpose"] == "corrected_resubmission",
          "corrected-resubmission purpose mismatch")
    clinical = outputs["clinical-appeal-case"]
    check(clinical["classification"]["response_type"] == "clinical_appeal",
          "clinical-appeal classification mismatch")
    check(clinical["response_letter"]["purpose"] == "clinical_appeal",
          "clinical-appeal purpose mismatch")
    check(clinical["required_gate"]["fresh_for_response"] is True,
          "clinical appeal lacks a fresh response gate")
    check({"reaffirm_response_policy", "reaffirm_response_section",
           "reaffirm_response_pathway", "reaffirm_response_plan"}
          <= set(positives["clinical-appeal-case"]["commands"]),
          "clinical appeal does not execute post-classification four-part affirmation")
    response_gate = positives["clinical-appeal-case"]["response_gate"]
    check(response_gate["bound_resolution_revision"] == clinical["required_gate"]["resolution_revision"]
          and response_gate["bound_criteria_selection_revision"] == clinical["required_gate"]["criteria_selection_revision"]
          and response_gate["bound_evidence_revision"] == clinical["required_gate"]["evidence_revision"]
          and response_gate["bound_determination_revision"] == clinical["required_gate"]["determination_revision"]
          and response_gate["bound_classification_revision"] == clinical["required_gate"]["classification_revision"]
          and response_gate["response_gate_revision"] == clinical["required_gate"]["response_gate_revision"],
          "clinical response gate is not bound to every upstream revision")

    negative_inputs = {item["fixture_id"]: item for item in fixtures["negative_controls"]}
    negative_outputs = {item["fixture_id"]: item for item in expected["negative_controls"]}
    required_negative = {"low-confidence-denial", "missing-citation-claim",
                         "unrelated-page-claim", "foreign-practice-case"}
    check(set(negative_inputs) == required_negative, "negative fixture families differ from the frozen contract")
    check(set(negative_outputs) == required_negative, "negative expected families differ from the frozen contract")
    check(all(item["synthetic"] is True for item in negative_inputs.values()),
          "a negative control is not explicitly synthetic")
    negative_case_ids = {item["case"]["id"] for item in negative_inputs.values()}
    check(len(negative_case_ids) == len(negative_inputs)
          and negative_case_ids.isdisjoint(all_case_ids),
          "negative controls do not own disjoint case identities")
    negative_command_ids = {command_id for item in negative_inputs.values()
                            for command_id in item.get("commands", {}).values()}
    check(len(negative_command_ids) == len(negative_inputs) - 1
          and negative_command_ids.isdisjoint(all_command_ids),
          "negative controls do not own disjoint command identities")
    check(all(item.get("reset") for item in negative_inputs.values()),
          "a negative control lacks deterministic reset semantics")
    check(all(item.get("loadable_state") for item in negative_inputs.values()),
          "a negative control lacks a loadable aggregate state")
    expected_negative_anchors = {
        "low-confidence-denial": lambda item: (
            f"/api/cases/{item['case']['id']}/determinations/"
            f"{item['determination']['id']}/classification/commands"
        ),
        "missing-citation-claim": lambda item: f"/api/cases/{item['case']['id']}/letter-commands",
        "unrelated-page-claim": lambda item: (
            f"/api/letters/{item['loadable_state']['ready_assertions']['letter']['id']}/commands"
        ),
        "foreign-practice-case": lambda item: f"/api/cases/{item['case']['id']}",
    }
    expected_negative_routes = {
        "low-confidence-denial": lambda item: (
            f"/api/cases/{item['case']['id']}/determinations/"
            f"{item['determination']['id']}/classification"
        ),
        "missing-citation-claim": lambda item: f"/api/cases/{item['case']['id']}/letters",
        "unrelated-page-claim": lambda item: (
            f"/api/letters/{item['loadable_state']['ready_assertions']['letter']['id']}/qa"
        ),
        "foreign-practice-case": lambda item: f"/api/cases/{item['case']['id']}",
    }
    namespaces: set[str] = set()
    for fixture_id, item in negative_inputs.items():
        loadable = item["loadable_state"]
        source = positives[loadable["source_fixture_id"]]
        source_names = [operation["name"] for operation in source["workflow_commands"]]
        check(loadable["loader"] == "derived_positive_workflow_v1"
              and source["workflow_start"] == "empty_case_workflow"
              and loadable["stop_after_command"] in source_names,
              f"{fixture_id}: negative control lacks a complete replayable source workflow")
        identity = loadable["identity_transform"]
        uuid_value(identity["namespace_uuid"], f"{fixture_id}.identity namespace")
        check(identity["algorithm"] == "uuid5"
              and identity["namespace_uuid"] not in namespaces
              and identity["explicit_overrides"],
              f"{fixture_id}: identity transform is not deterministic and isolated")
        template = "web-case-to-letter-v2|{source_fixture_id}|{target_fixture_id}|{source_uuid_lowercase}"
        sample = identity["conformance_sample"]
        canonical_source = str(UUID(sample["source_uuid"]))
        expected_name = template.format(
            source_fixture_id=loadable["source_fixture_id"],
            target_fixture_id=fixture_id,
            source_uuid_lowercase=canonical_source,
        )
        check(identity.get("standard") == "RFC 4122 UUIDv5"
              and identity.get("hash") == "SHA-1"
              and identity.get("name_encoding") == "UTF-8"
              and identity.get("name_template") == template
              and identity.get("source_uuid_format") == "RFC 4122 canonical lowercase"
              and identity.get("output_format") == "RFC 4122 canonical lowercase"
              and sample["name"] == expected_name
              and sample["transformed_uuid"]
                  == str(uuid5(UUID(identity["namespace_uuid"]), expected_name)),
              f"{fixture_id}: UUIDv5 byte/name encoding is not reproducible")
        check(identity.get("revision_transform") == {
                  "algorithm": "fixture_prefix_v1",
                  "source_prefix": f"{loadable['source_fixture_id']}:",
                  "target_prefix": f"{fixture_id}:",
              }, f"{fixture_id}: derived loader lacks an explicit revision-prefix transform")
        revision_probe = json.loads(json.dumps(loadable))
        revision_probe["identity_transform"].pop("revision_transform")
        check(f'"{loadable["source_fixture_id"]}:' not in json.dumps(revision_probe, sort_keys=True),
              f"{fixture_id}: derived loader retains a source-fixture revision token")
        namespaces.add(identity["namespace_uuid"])
        for overlay in loadable["overlays"]:
            resolve_pointer(source, overlay["target_pointer"])
            resolve_pointer(item, overlay["value_ref"])
        tested = loadable.get("tested_command") or loadable.get("tested_read")
        is_read = fixture_id == "foreign-practice-case"
        check(tested["actor_role"]
              and tested["required_capability"] in CAPABILITY_KEYS
              and tested.get("lookup_anchor", tested.get("route"))
                  == expected_negative_anchors[fixture_id](item)
              and tested["route"] == expected_negative_routes[fixture_id](item)
              and tested["expected_result"],
              f"{fixture_id}: tested action contract is incomplete")
        if is_read:
            check("tested_command" not in loadable
                  and "command_id" not in tested
                  and "expected_input_tokens" not in tested
                  and item["read"]["route"] == tested["route"],
                  f"{fixture_id}: read incorrectly creates command-receipt semantics")
        else:
            check(tested["command_id"] in item["commands"].values()
                  and tested["method"] in {"POST", "PATCH"}
                  and tested["expected_input_tokens"],
                  f"{fixture_id}: tested mutation lacks command identity or revisions")
        check(all(negative_outputs[fixture_id].get(key) == value
                  for key, value in tested["expected_result"].items()),
              f"{fixture_id}: tested action result differs from expected output")
        check(is_read or set(tested["expected_input_tokens"]) <= REVISION_KEYS,
              f"{fixture_id}: tested mutation uses an unknown revision token")
        for pointer in tested.get("payload_refs", tested.get("context_refs", [])):
            resolve_pointer(item, pointer)
        if fixture_id == "unrelated-page-claim":
            result_fixture = loadable["command_result_fixture"]
            check(result_fixture["at_command"] == loadable["stop_after_command"] == "generate_letter"
                  and result_fixture["adapter"] == "deterministic_fixture_inference"
                  and result_fixture["letter_status"] == "draft"
                  and result_fixture["letter_revision"]
                      == tested["expected_input_tokens"]["letterRevision"]
                  and resolve_pointer(item, result_fixture["claim_ref"])["id"]
                      == loadable["ready_assertions"]["letter"]["claim_id"],
                  f"{fixture_id}: generation result does not create the QA target")
        if fixture_id == "missing-citation-claim":
            result_fixture = loadable["command_result_fixture"]
            payload = resolve_pointer(item, tested["payload_refs"][0])
            check(tested["payload_refs"] == ["/tested_payload"]
                  and payload == {
                      "commandId": tested["command_id"],
                      "expectedRevisions": tested["expected_input_tokens"],
                      "purpose": "prior_authorization_request",
                  }
                  and all("claim" not in key.lower() for key in payload),
                  f"{fixture_id}: client payload supplies a generated claim")
            check(result_fixture == {
                      "at_command": "generate_letter",
                      "adapter": "deterministic_fixture_inference",
                      "outcome": "citation_incomplete",
                      "candidate_claim_ref": "/candidate_claim",
                      "persisted_claim": False,
                  }
                  and resolve_pointer(item, result_fixture["candidate_claim_ref"])["document_id"] is None,
                  f"{fixture_id}: deterministic inference adapter does not own the claim seam")
        check(any(key in item for key in {"practice", "viewer_practice"}),
              f"{fixture_id}: negative control lacks practice state")
        check(any("membership" in key for key in item),
              f"{fixture_id}: negative control lacks membership state")
        check(all(value["role"] in ROLE_KEYS
                  for key, value in item.items()
                  if "membership" in key),
              f"{fixture_id}: negative membership uses a role absent from the schema registry")
        check(any("principal" in key for key in item),
              f"{fixture_id}: negative control lacks principal state")
        check(any(key in item for key in {"document", "documents"}),
              f"{fixture_id}: negative control lacks source state")
    positive_ids = collect_uuid_strings(fixtures["positive_cases"])
    seen_negative_ids: set[str] = set()
    for fixture_id, item in negative_inputs.items():
        item_ids = collect_uuid_strings(item)
        check(item_ids.isdisjoint(positive_ids),
              f"{fixture_id}: negative control reuses a positive fixture identity")
        check(item_ids.isdisjoint(seen_negative_ids),
              f"{fixture_id}: negative control reuses another negative fixture identity")
        seen_negative_ids.update(item_ids)
    check(negative_inputs["low-confidence-denial"]["loadable_state"]["ready_assertions"]["submission"]["status"] == "acknowledged",
          "low-confidence denial lacks an acknowledged submission prerequisite")
    check(negative_inputs["missing-citation-claim"]["case"]["status"] == "awaiting_gate"
          and negative_inputs["missing-citation-claim"]["loadable_state"]["ready_assertions"]["gate"]["status"] == "affirmed",
          "missing-citation control lacks generation prerequisites")
    check(negative_inputs["unrelated-page-claim"]["case"]["status"] == "drafting"
          and negative_inputs["unrelated-page-claim"]["loadable_state"]["ready_assertions"]["letter"]["status"] == "draft"
          and negative_inputs["unrelated-page-claim"]["loadable_state"]["ready_assertions"]["revision_tokens"]["letterRevision"].endswith(":r1"),
          "unrelated-page control is not positioned immediately before first QA")
    check(negative_outputs["low-confidence-denial"]["classification_state"] == "needs_review"
          and negative_outputs["low-confidence-denial"]["response_letter_created"] is False,
          "low-confidence denial does not block response generation")
    missing = negative_outputs["missing-citation-claim"]
    check(missing["browser_copy"] == UNSUPPORTED_COPY
          and missing["persisted_claim"] is False
          and missing["included_in_prose"] is False,
          "missing-citation behavior differs from the frozen contract")
    unrelated = negative_outputs["unrelated-page-claim"]
    check(unrelated["browser_copy"] == UNRELATED_COPY
          and unrelated["support_status"] == "unsupported"
          and unrelated["approval_allowed"] is False
          and unrelated["included_in_prose"] is False,
          "unrelated-page behavior differs from the frozen contract")
    foreign = negative_outputs["foreign-practice-case"]
    check(foreign["http_status"] == 404
          and foreign["gateway"] == foreign["app_services"] == foreign["postgres"] == "refused"
          and foreign["replica_materialized"] is False
          and foreign["browser_route"] == "unavailable",
          "foreign-practice control does not refuse every boundary")
    foreign_input = negative_inputs["foreign-practice-case"]
    check(foreign_input["foreign_membership"]["principal_id"]
              == foreign_input["foreign_principal"]["id"]
          and foreign_input["foreign_membership"]["practice_id"]
              == foreign_input["practice"]["id"]
          and foreign_input["viewer_membership"]["principal_id"]
              == foreign_input["viewer_principal"]["id"]
          and foreign_input["viewer_membership"]["practice_id"]
              == foreign_input["viewer_practice"]["id"],
          "foreign-practice control memberships do not bind principals to practices")

    isolation = expected["isolation"]
    check(len(denial_determination_ids) == 2 and len(response_letter_ids) == 2,
          "denial fixtures reuse determination or response-letter identity")
    check(isolation == {
        "case_ids_distinct": True,
        "determination_ids_distinct": True,
        "response_letter_ids_distinct": True,
        "command_ids_disjoint": True,
        "mutation_of_one_denial_fixture_changes_other": False,
    }, "isolation expectations changed")

    walk_identifiers(fixtures)
    walk_identifiers(expected)
    print("Passed: 3 standalone positive fixture families and 4 isolated negative controls")
    print(f"Passed: {len(all_command_ids)} command UUIDs are disjoint across positive fixtures")
    print("Passed: every lifecycle transition has an owning command with actor, capability, lookup anchor, and named revision tokens")
    print("Passed: every positive command has directly dispatchable relationships and continuous revision ownership")
    print("Passed: initial and response submissions freeze attempt, ordered manifest, page count, and receipt custody evidence")
    print("Passed: clinical appeal executes a post-classification four-part response gate")
    print("Passed: every expected letter claim has exact span/version/date/hash provenance and human support review")
    print("Passed: every negative control has disjoint loadable state and reset semantics")
    print("Passed: administering-entity fixtures classify valid, missing, ambiguous, conflicting, and expired rules deterministically")
    print("Passed: manifests contain explicit synthetic labels and reserved .invalid contacts")
    print("Passed: manifest lock hashes match")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, KeyError, TypeError) as exc:
        print(f"Failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
