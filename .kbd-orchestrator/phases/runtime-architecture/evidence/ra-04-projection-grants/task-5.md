# RA04 task 2.1 — projection registry acceptance

2026-09-08. Runtime-architecture / Execute. Driver task 5 of 10.  
Result: **Passed**. RA04 remains in progress.

## Requirement and observed result

The current `ReplicaGrant::for_session` registry was evaluated for two
synthetic practices. Both grants contained exactly five projections. `cases`,
`case_evidence`, `evidence_citations`, and `documents` each used
`practice_id = <verified practice>` and differed between the two sessions.
`evidence_states` used primary key `key` and the explicit
`adr-003-three-evidence-states` approved-reference scope.

The denial fixture confirmed that patient, surgeon, payer and case identifiers;
gate actor identity; clinical rationale and JSON; assessor identity; citation
quotes; document patient, author, location and JSON metadata; and the deferred
`policy_criteria` relation remain absent. Because the registry constructs output
only from its fixed definitions, absence is the deny rule.

The mounted route returned distinct scopes for both practices and rejected
caller `table`, `where`, and `columns` controls with HTTP 400 before invoking
the session resolver.

## Actual commands and prerequisites

| Command | Observed result |
| --- | --- |
| `cargo test -p aso-host projection::tests -- --nocapture` | Passed: 2 passed, 0 failed |
| `cargo test -p aso-server-axum session::tests::mounted_registry -- --nocapture` | Passed: 2 passed, 0 failed |

Prerequisites were available: the current ASO Rust workspace, existing Cargo
dependencies, the debug test profile, and the completed RA04 implementation
tasks 1.2–1.4. These focused tests require no database, network service,
credential, or patient record.

Raw command output is in `task-5-host.txt` and `task-5-http.txt`. The
machine-readable result and current source hashes are in
`task-5-acceptance.json`.

## Scope and limit

No application source, migration, dependency, architecture document, or
companion repository changed. No new guard was added; this task reran the
existing registry and mounted-boundary guards. No T0 was required because no
application source changed. No T2/T3 or real clinical data operation ran.

The uncomfortable limit remains `documents.name`: the inherited approved
projection includes it even though a document name can carry identifying text.
G-DATA still blocks persistent real clinical data until the practice owner
approves the device and projection policy. This acceptance result therefore
proves the current synthetic allowlist contract, not that broader private-data
persistence has been approved.
