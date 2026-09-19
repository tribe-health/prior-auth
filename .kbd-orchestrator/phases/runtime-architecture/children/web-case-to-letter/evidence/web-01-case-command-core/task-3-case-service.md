# web-01 task 1.3 case service and PostgreSQL adapter

Date: 2026-09-16
Phase: `runtime-architecture › web-case-to-letter`
Change: `web-01-case-command-core`
Task: `1.3`
Result: **Passed**

## Delivered boundary

- Added shell-neutral case status, input, record, command, result, and error
  types in `aso-host`.
- Added `AppServices` operations for create, update, transition, detail, list,
  create-command lookup, and case-command lookup.
- Required a live verified human context before repository access. Actor,
  principal, and selected practice remain absent from command payloads.
- Extended `CaseRepository` with default-deny verified case operations so
  legacy adapters cannot silently accept durable commands.
- Implemented the production PostgreSQL adapter through a separate
  `aso_case_executor` transaction role and the task-1.2 security-definer
  functions.
- Mapped tenant denial, missing records, command conflict, stale revision,
  invalid input, invalid transition, and service failure to typed errors.
- Added focused unit tests and an ignored disposable-PostgreSQL lifecycle test
  driven by the existing local probe.

## Observed behavior

The host unit covered exact retry, changed-payload conflict, create/detail/list,
update, stale revision, transition, invalid transition, command lookup, and
pre-repository refusal for agent, expired, and invalid requests.

The disposable PostgreSQL run created a restricted login with only gate and
case executor membership. The actual `AppServices → PgGateRepository →
PostgreSQL` path passed five named checks:

1. create, exact retry, lost-response lookup, and changed-payload conflict
2. tenant-scoped detail and list
3. update retry and stale-revision refusal
4. transition lookup and invalid-transition refusal
5. agent, expired-session, and foreign-practice refusal

The first service receipt recorded `1 passed` but failed its marker-count check
because the shared output sanitizer discarded the new case marker prefix. That
receipt remains as `task-3-service-first-failure.json`. After adding the exact
synthetic marker and test-name patterns, the same full probe passed all 30
checks and all cleanup actions in `task-3-service.json`.

## Commands and observed outputs

```text
cargo test -p aso-host case_management::tests
test result: ok. 2 passed; 0 failed
```

```text
python3 scripts/test-web01-case-migration.py --install-mode fresh \
  --include-service --output .../task-3-service.json
result: Passed
checks: 30 Passed
actual case lifecycle: 1 passed, 5 named assertions
cleanup: Passed
```

```text
cargo check -p aso-host
cargo clippy -p aso-host --no-deps
cargo check -p aso-web-server
cargo clippy -p aso-web-server --no-deps
exit 0; one pre-existing chunks_exact warning in gate.rs

python3 -m py_compile scripts/test-gate-transaction.py \
  scripts/test-web01-case-migration.py
exit 0

openspec validate web-01-case-command-core --strict
Change 'web-01-case-command-core' is valid

git diff --check -- <task 1.3 implementation files>
exit 0
```

## Task boundary

No HTTP route, browser, replica, PGLite, Zustand, React, Tauri, or mobile claim
is made. Browser HTTP mounting and transport error mapping remain task 1.4.
The full browser scenario remains uncertified until web-17.
