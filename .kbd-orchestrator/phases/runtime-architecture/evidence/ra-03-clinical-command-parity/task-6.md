# RA-03 task 2.2 — lost-response reconciliation and PEM exclusion

2026-09-07. Runtime-architecture / Execute. Driver task 6 of 8.
Result: **Passed**. RA-03 remains in progress.

## Requirement and observed result

Signing and evidence reassessment each persist an immutable command result in
the same transaction as the clinical effect and audit event. On exact repeat,
`AppServices` resolves that result before reading mutable target state. Explicit
lookup returns the same stored result. Fresh PostgreSQL evidence observes one
receipt and one audit after repeat and lookup, so a response lost after commit
does not create a second clinical effect.

The current signing database receipt contains
`signing_lost_response_repeat_and_lookup_return_one_signing_effect`. The fresh
reassessment campaign contains
`reassessment_lost_response_repeat_and_lookup_return_one_persisted_effect`.
Both receipts' source hashes match the current worktree and every disposable
database/login/role cleanup check passed.

The web hooks retain a command ID when transport outcome is uncertain and offer
explicit lookup. They do not automatically invoke the mutation again.
Affirmation calls `gateApi`, which calls the HTTP client; the hook has no graph,
PEM or shared-sync import. No production web signing mutation caller exists.
Production shared-sync sources contain none of the signing, gate-mutation or
reassessment command contracts. Reassessment reads its timeline from local SQL
but sends mutations and receipt lookup through its feature HTTP API.

## Actual commands and prerequisites

| Command | Observed result |
| --- | --- |
| `RUSTUP_TOOLCHAIN=1.97.1 cargo test -p aso-host signing::tests` | Passed: 5 passed, 0 failed |
| `RUSTUP_TOOLCHAIN=1.97.1 cargo test -p aso-host reassessment::tests` | Passed: 4 passed, 0 failed |
| `RUSTUP_TOOLCHAIN=1.97.1 cargo test -p aso-server-axum routes::letters::tests` | Passed: 5 passed, 0 failed |
| `RUSTUP_TOOLCHAIN=1.97.1 cargo test -p aso-server-axum routes::evidence::tests` | Passed: 4 passed, 0 failed |
| `pnpm --dir web exec vitest run src/features/surgeon-gate/hooks/use-surgeon-gate.test.tsx src/features/evidence-timeline/hooks/use-evidence-timeline.test.tsx` | Passed: 2 files, 14 tests, 0 failed |
| `RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-reassessment-transaction.py --install-mode fresh --output .kbd-orchestrator/phases/runtime-architecture/evidence/ra-03-clinical-command-parity/task-6-reassessment-proof.json` | Passed: 16 fixture checks, 7 lifecycle markers and 6 cleanup checks |
| Inline production TypeScript call-path check | Passed: 5 PEM/shared-sync exclusion checks |

The database prerequisite contract was available: Docker Compose PostgreSQL
with schema extensions, a configured administrator credential kept out of
evidence, Rust 1.97.1, an idle Cargo build directory and an exclusive fixture
lock. `task-5-signing-proof.json` supplies the current signing run; it was not
repeated redundantly after its source hashes and result were revalidated.

Machine-readable evidence is in `task-6-acceptance.json`,
`task-6-reassessment-proof.json`, and `task-6-pem-exclusion.json`. The
acceptance receipt records exact commands, prerequisites, receipt hashes,
selected lifecycle markers and 15 current source hashes.

## Scope and remaining risk

No application source, migration, dependency, architecture document or
companion repository changed. Only task evidence and append-only learning were
added. No new guard was introduced; this task exercises the existing scoped
receipt, exact-payload, one-effect and HTTP-only clinical-command boundaries.

No T0 was required because no application source changed. No T2/T3,
workspace-wide build/test, production Gate image, browser rendering, native
credential owner, Tauri window, physical device, production database,
deployment, commit or real patient data was used. Task 8 must repeat the static
PEM exclusion check against the final artifact so a later source change cannot
silently introduce another command path.

The uncomfortable limit is that the hooks retain command correlation but do not
yet receive the authoritative realtime projection. A successful receipt proves
the server result; the rendered record must still wait for the later Electric to
local-SQL to PEM delivery work before it can show convergence.

The KBD task-end hook reported `kbd-memory-log: mirror write failed; lifecycle
continues`. Canonical completion advanced normally. This receipt and the
append-only session log retain the local fallback required by the project rule.
