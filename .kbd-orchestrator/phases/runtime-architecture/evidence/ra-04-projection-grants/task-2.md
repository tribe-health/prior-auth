# RA-04 task 1.2 — projection contract and mounted grant boundary

**Phase:** runtime-architecture / Execute  
**Outcome:** Passed

## Implemented contract

`aso-host` now owns projection revision 1. `ReplicaGrant::for_practice` receives
only a practice ID and membership authorization revision already resolved by
the session boundary. It returns these exact projections:

| Projection | Relation | Primary key | Scope | Approved columns |
|---|---|---|---|---|
| `cases` | `aso.cases` | `id` | `practice_id = verified practice` | `id`, `practice_id`, `status`, `gate_affirmed_at`, `created_at`, `updated_at` |
| `case_evidence` | `aso.case_evidence` | `id` | `practice_id = verified practice` | `id`, `practice_id`, `case_id`, `policy_criterion_id`, `state`, `assessed_at`, `created_at`, `updated_at` |
| `evidence_states` | `aso.evidence_states` | `key` | approved ADR-003 reference set | `key`, `label`, `meaning` |
| `evidence_citations` | `aso.evidence_citations` | `id` | `practice_id = verified practice` | `id`, `practice_id`, `case_evidence_id`, `document_id`, `page_number`, `relevance`, `created_at` |
| `documents` | `aso.documents` | `id` | `practice_id = verified practice` | `id`, `practice_id`, `document_type_id`, `case_id`, `name`, `effective_date`, `page_count`, `content_sha256` |

Everything absent from those lists is denied. The focused negative fixtures
cover patient, surgeon, payer and case identifiers; clinical rationale and
JSON; citation quotes; document authors, locations and JSON; and
`gate_affirmed_by`. `aso.policy_criteria` remains absent, so criterion-label
expansion is deferred.

`GET /api/session/replica-grant` is mounted beside `GET /api/session`. Its
strict query DTO accepts only `practiceId`; the membership resolver must approve
that selection. Unknown `table`, `where`, and `columns` parameters return HTTP
400 before session resolution. An expired resolved session returns HTTP 401.
The response is `no-store` and varies on all supported credential headers.

The Tauri command surface declares the matching `replica_grant` operation. It
returns `NativeAuthenticationUnavailable` without consulting an injected
session port because native credential ownership remains assigned to RA-17.

## Verification

- `cargo check -p aso-host` — Passed.
- `cargo clippy -p aso-host --no-deps` — Passed without warnings.
- `cargo check -p aso-server-axum` — Passed.
- `cargo clippy -p aso-server-axum --no-deps` — Passed with ten existing
  `result_large_err` warnings in untouched evidence, gate and letter handlers.
- `cargo check -p aso-desktop` — Passed.
- `cargo clippy -p aso-desktop --no-deps` — Passed without warnings.
- `cargo test -p aso-host projection::tests -- --nocapture` — Passed 2/2.
- `cargo test -p aso-server-axum session::tests::mounted_registry -- --nocapture`
  — Passed 2/2. Two practices received distinct practice scopes; three
  caller-controlled projection parameters were rejected before session lookup.
- `cargo test -p aso-desktop session_contract_tests::current_session_refuses_even_when_injected_port_can_return_authority -- --nocapture`
  — Passed 1/1.
- `openspec validate ra-04-projection-grants --strict` — Passed: `Change
  'ra-04-projection-grants' is valid`.
- `rustfmt --edition 2024 --check ...` and `git diff --check -- ...` — Passed.

The PHI guard red proof temporarily added `gate_affirmed_by` to the `cases`
allowlist. The protected-column test failed at its denial assertion with exit
101. The source was restored, and the final host tests passed 2/2. Raw outputs
and hashes are listed in [task-2-files.json](task-2-files.json).

## Limits

The uncomfortable part is that `documents.name` remains in the inherited
approved projection even though document names can carry identifying text. This
task preserves the reviewed projection as directed; G-DATA still blocks real
clinical persistence until privacy approval is recorded.

This task did not mint an FRF token, modify Gate or FRF claims, run a live
Electric stream, or prove revocation. Those are owned by RA-04 tasks 1.3–2.5 and
RA-05–RA-06. No database, dependency, T2, T3, native runtime or real clinical
data operation ran.
