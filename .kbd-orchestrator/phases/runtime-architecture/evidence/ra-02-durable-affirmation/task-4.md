# RA-02 task 1.4 — fresh, upgrade and response-loss verification

2026-09-06. Runtime-architecture / Execute. Driver task 4 of 9. **Passed**.

The earlier implementation receipts proved populated upgrade and ordinary replay.
This task adds migration-before-seeding and a real connection loss after commit.
No production implementation or applied migration changed.

## Changes

| File | Delivery |
| --- | --- |
| `scripts/test-gate-transaction.py` | Explicit fresh/upgrade installation modes; fresh clinical emptiness assertions; migration before data seeding; independent output paths and source hashes. |
| `scripts/test-gate-mounted.py` | Proxy drops the first response after Gate returns a committed result; lookup and deliberate retry, exact affirmation/audit/command counts, kind/action/case conflicts and historical-vs-current reads; separate output path. |
| `crates/aso-web-server/src/adapters/gate/transaction_tests.rs` | Real PostgreSQL authority plus accepting write repository independently refuses administrator, foreign-practice and Agent contexts for affirm/remove, with authorized positive controls. |

Evidence, inventory and append-only session memory accompany these three files.
No unrequested production guard, dependency, schema, deployment or UI change was
added. Existing dirty work is preserved. [Current source inventory](task-4-files.json)
includes prerequisite and companion sources; earlier inventories remain historical.

## Commands and observed results

- T0: `cargo +1.97.1 check -p aso-web-server --tests` exited 0.
- T0: `cargo +1.97.1 clippy -p aso-web-server --tests --no-deps` exited 0, with two existing unit-struct-default warnings in main.
- T0: Python AST parsing and scoped `git diff --check` exited 0.
- T1: `RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-gate-transaction.py --install-mode fresh --output .kbd-orchestrator/phases/runtime-architecture/evidence/ra-02-durable-affirmation/task-4-fresh.json` exited 0: **Passed**, 16 fixture checks, 17 lifecycle markers, six cleanup checks.
- T1: the same command with `--install-mode upgrade` and `task-4-upgrade.json` exited 0: **Passed**, 22 fixture checks, 17 lifecycle markers, six cleanup checks.
- T1: `RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-gate-mounted.py --gate-binary /Users/gqadonis/Projects/prometheus/flint-gate/target/debug/flint-gate --output .kbd-orchestrator/phases/runtime-architecture/evidence/ra-02-durable-affirmation/task-4-mounted.json` exited 0: **Passed**, 96 checks and 18 cleanup checks.

Both transaction campaigns ran the actual command
`cargo test -p aso-web-server gate_transaction_lifecycle -- --ignored --nocapture`.
Each printed `1 passed; 0 failed; 0 ignored; 0 measured; 4 filtered out`.
Actual Compose PostgreSQL and self-hosted Kratos prerequisites were available.
Fixtures used synthetic data, restricted runtime roles and disposable stores.
The migration, checksum-mismatch refusal and restoration ran against each store.

The [fresh receipt](task-4-fresh.json) records zero rows in 25 clinical/actor
tables before migration and those tables plus the ledger afterward. Data is
seeded only after migration. The [upgrade receipt](task-4-upgrade.json) proves
original cases and affirmations survive, valid timestamps remain unchanged,
stale empty/complete summaries are repaired and reruns preserve the ledger.

The [mounted receipt](task-4-mounted.json) proves Gate returned success before
the client received `RemoteDisconnected`, with no response headers. Exactly one
affirmation, audit and command result exist. Lookup recovers the original receipt;
the same proxy delivers the deliberate retry normally and counts remain fixed.
Changed kind, action and case return 409 without another effect. After a later
removal, the original receipt remains historical and a current read is empty.
No automatic clinical retry was introduced.

Independent refusal uses a Gate accepting sink and disabled-hook positive
control, actual service authority with an accepting write port, and direct
database trigger tests bypassing the service/command function. Controlled
trigger disablement and rollback remain in both transaction campaigns; existing
callback/service/desktop/lookup mutation receipts retain their red/restored proof.

The [independent critic](task-4-review.json) reported no actionable candidate
findings. Root checked the live results and current source hashes separately.
The fixture checks trace to explicit installation, independent-authority and
lost-response requirements. No speculative product guard was added.

The uncomfortable limit: Gate's live agent negative uses a non-Kratos token;
trusted Agent principal refusal is tested through the callback/service seams and
database context, not a provisioned delegated-agent provider. Production image,
browser UI, native credentials and devices remain uncertified. No T2/T3 ran.
Behavioral acceptance and full-change review are the next tasks.
