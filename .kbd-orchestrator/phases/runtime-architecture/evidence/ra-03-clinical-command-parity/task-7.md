# RA-03 task 2.3 — independent clinical refusal and three-state proof

2026-09-07. Runtime-architecture / Execute. Driver task 7 of 8.
Result: **Passed**. RA-03 remains in progress.

## Requirement and observed result

Unauthorized signing is refused independently at every implemented clinical
control. The Gate policy callback requires current `sign_letter` capability and
letter scope without invoking the command. `AppServices` refuses agent and
denied user contexts before the repository write. The restricted PostgreSQL
function repeats identity, practice, principal and capability checks. A direct
trigger probe bypasses both higher layers and still returns authority SQLSTATE
`42501` for administrator, agent and foreign-practice contexts. An authorized
surgeon control reaches the trigger and affects one row inside a rolled-back
probe, proving the denial is an authority decision rather than an unusable test
path.

The current signing database receipt records
`signing_service_function_and_trigger_independently_refuse_admin_agent_and_foreign_scope`.
It uses the actual `AppServices` and restricted `PgGateRepository` against a
disposable PostgreSQL database.

Authorized reassessment preserves the domain identities. The live campaign
observes `void → gap`, `gap → met`, and `met → void`. Its final row is `void`,
attributed to the verified surgeon, with three `evidence.reassess` audit events
and three immutable command receipts. The marker is
`reassessment_allowed_transitions_retain_met_gap_void_with_one_audit_and_receipt_each`.

## Actual commands and prerequisites

| Command | Observed result |
| --- | --- |
| `RUSTUP_TOOLCHAIN=1.97.1 cargo test -p aso-host signing::tests` | Passed: 5 passed, 0 failed |
| `RUSTUP_TOOLCHAIN=1.97.1 cargo test -p aso-host reassessment::tests` | Passed: 4 passed, 0 failed |
| `RUSTUP_TOOLCHAIN=1.97.1 cargo test -p aso-server-axum routes::letters::tests` | Passed: 5 passed, 0 failed |
| `RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-signing-transaction.py --install-mode fresh` | Current receipt Passed: 16 fixture checks, 10 lifecycle markers and 6 cleanup checks |
| `RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-reassessment-transaction.py --install-mode fresh` | Current receipt Passed: 16 fixture checks, 7 lifecycle markers and 6 cleanup checks |
| Inline current-hash, lifecycle-marker and source-assertion validation | Passed: 2 receipt hashes, 9 source hashes and 6 boundary assertions |

The disposable campaign prerequisites were available when those immediately
preceding live commands ran: Docker Compose PostgreSQL with schema extensions, a
configured administrator credential retained only in memory, Rust 1.97.1, an
idle Cargo build directory and an exclusive fixture lock. Both receipts still
match every current source hash, so this proof does not repeat identical
database campaigns. All twelve cleanup checks remain `Passed`.

Machine-readable evidence is `task-7-acceptance.json`. Its live sources are
`task-5-signing-proof.json` and `task-6-reassessment-proof.json`. It records the
exact commands, prerequisite contract, receipt hashes, selected markers, source
assertions and current hashes.

## Scope and remaining risk

No application source, migration, dependency, architecture document or
companion repository changed. Only task evidence and append-only learning were
added. No new guard was introduced. The proof exercises the existing Gate,
service, restricted-function, trigger, three-state, attribution, audit and
immutable-receipt guards.

No T0 was required because no application source changed. No T2/T3,
workspace-wide build/test, production Gate image, browser UI, native credential
owner, Tauri window, physical device, production database, deployment, commit or
real patient data was used. Source and focused policy tests establish the Gate
control; deployed Gate certification remains outside this task.

The uncomfortable limit is that an authorized direct-trigger control is rolled
back deliberately and does not represent a supported application command path.
Its purpose is narrow: prove the trigger can accept proper clinical authority
while independently refusing administrator and agent contexts. Production
signing must still pass through Gate and `AppServices`.

The KBD task-begin hook reported `kbd-memory-log: mirror write failed; lifecycle
continues`. Canonical task state advanced normally. This receipt and the
append-only session log provide the required local fallback.
