# web-01 task 1.2 durable case-command migration

Date: 2026-09-16
Phase: `runtime-architecture › web-case-to-letter`
Change: `web-01-case-command-core`
Task: `1.2`
Result: **Passed**

## Delivered boundary

- Added additive server migration `2026090617_durable_case_commands.sql` and
  registered its immutable checksum with the Rust server migrator.
- Added a local command ledger, case revisions, frozen lifecycle transitions,
  verified-context case reads, stable create/update/transition command
  functions, and atomic audit writes.
- Added `aso_case_owner` and `aso_case_executor` as NOLOGIN roles. The executor
  can call approved functions and cannot write cases directly or read the
  local command ledger. The owner has no members.
- Added capabilities for case reads and case writes while retaining Kratos
  identity plus selected practice as the authority source.
- Kept the command ledger out of publication and made schema/all-table
  publication a migration refusal.
- Extended the existing populated-upgrade harness and added a focused web-01
  disposable-PostgreSQL probe for fresh and upgrade installs.

## Observed behavior

Both install modes ran the actual `aso-web-server --migrate-server` path,
verified unchanged reruns, deliberately corrupted a migration checksum and
observed refusal, restored it, and exercised the case-command boundary.

The fresh receipt passed every check and cleanup action. The upgrade receipt
passed 34 checks and all cleanup actions. Observed negative controls were:

- reused command with different payload: SQLSTATE `23505`
- stale expected revision: SQLSTATE `40001`
- invalid lifecycle transition: SQLSTATE `23514`
- foreign-practice case access: SQLSTATE `42501`
- direct executor insert and update: SQLSTATE `42501`
- executor command-ledger read: SQLSTATE `42501`

The initial upgrade fixture failed before migration because a historical
affirmation crossed the current verified-actor trigger. The retained failure
record explains the fixture correction. The final upgrade run restored the
trigger before running the migrator.

## Commands and observed outputs

```text
python3 scripts/test-web01-case-migration.py --install-mode fresh \
  --output .../task-2-fresh.json
result: Passed
cleanup: Passed
```

```text
python3 scripts/test-web01-case-migration.py --install-mode upgrade \
  --output .../task-2-upgrade.json
result: Passed
checks: 34 Passed
cleanup: Passed
```

```text
python3 -m py_compile scripts/test-web01-case-migration.py \
  scripts/test-gate-transaction.py
exit 0

rustfmt --edition 2024 --check crates/aso-web-server/src/migrations.rs
exit 0

cargo check -p aso-web-server
Finished dev profile

cargo clippy -p aso-web-server --no-deps
Finished dev profile; one pre-existing chunks_exact warning in gate.rs:184

openspec validate web-01-case-command-core --strict
Change 'web-01-case-command-core' is valid

git diff --check -- <task 1.2 implementation files>
exit 0
```

Standalone `rustfmt --check` first failed because it defaulted to Rust 2015 and
could not parse the crate's Rust 2024 syntax. The edition-correct command above
passed; no source correction was required.

## Task boundary

No AppServices, HTTP route, replica, PGlite, Zustand, React, Tauri, or mobile
claim is made by task 1.2. Those browser service and UI layers remain pending.
The guards added here trace to the selected-practice authority boundary,
tenant isolation, command idempotency, lifecycle validity, append-only audit,
local-ledger confidentiality, and unsafe-publication refusal specified by
web-00 and web-01.
