# RA-01 acceptance 2.3 — pooled identity isolation and membership refusal

2026-09-06. Runtime-architecture Execute, driver task 7 of 8.
Result: **Passed** for acceptance 2.3. RA-01 remains in progress.

The recorded mounted campaign proves sequential reuse of one PostgreSQL backend
by two verified identities without cross-identity results. All 18 tracked source
and design hashes and both source evidence hashes match the previous acceptance
receipt. This task accepts prior T1 evidence; it does not rerun live services or
assert their current availability.

## Acceptance mapping

| Scenario | Observed result and assertion boundary |
| --- | --- |
| Two identities reuse pooled connections | Gate → actual ASO binary → Kratos/Postgres: A and B each used one backend, with exactly one shared backend. |
| Repeated identity changes | Twelve requests in sequence `A A B B B A A A B B B A` returned 200. At each successful database read the probe asserted the expected identity GUC and `aso_session_reader` role, then checked the complete sanitized summary against that identity's fixture and current database authority. |
| B loses practice membership | `B_membership_removed` returned 403 `practice_denied`; A still returned 200 with A's context. Restoring B's membership restored B's 200 response and context. |
| A is deactivated | `A_deactivated` returned 403 `practice_denied`; B still returned 200 with B's context. |
| Transaction context ends | A separate production transaction-owner test checked six exit paths. Commit, repository success, repository denial, SQL error/drop rollback and explicit rollback preserved the same backend PID and restored the baseline settings. Cancellation discarded the old backend and supplied a clean replacement in this run. |

All 17 selected Gate responses are no-store. The probe wraps the original
`aso.current_app_user_id()` in its disposable database, calls its unchanged
implementation, and captures only fixture-prefixed backend/identity-label/role
markers. Successful requests assert those markers; denied requests assert the
exact refusal body, without a per-denial database identity trace assertion.
[Acceptance JSON](task-7-acceptance.json) binds observations to source hashes.

## Actual commands and prerequisites

Prior primary T1 run, completed `2026-09-06T17:54:05.039223+00:00`:

```text
RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-session-gateway.py
exit 0; result Passed; 36 checks; 34/34 responses no-store
pool_reuse: backend_counts A=1 B=1; shared_backend_count=1
```

This used real Kratos v26.2.0, PostgreSQL on detected port 55432, a restricted
disposable login, the actual ASO binary and an existing Gate image. The receipt
records the image ID and prerequisite results. The campaign mounted the checked-in
session route in a disposable Gate; its response count includes 33 Gate requests
and one direct application readiness request. [Gate evidence](gateway-session.json).

Prior supporting T1 run, completed `2026-09-06T16:28:18.894660+00:00`:

```text
RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-session-context.py
exit 0; result Passed; 41 checks; 37/37 responses no-store
cargo test -p aso-web-server session_transaction_context_lifecycle -- --ignored --nocapture
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 3 filtered out; finished in 5.14s
context check passed: in_flight_cancellation_clean_or_discarded (replaced=true)
```

The script explicitly ran the otherwise ignored test with its disposable database
environment and Rust 1.97.1. Baseline comparisons cover identity GUC, role reset,
search path, timeout, read-only mode and isolation. For cancellation, the test
first observed an active `pg_sleep` query, aborted its owning future, then verified
clean settings and removal of the discarded backend. Both campaigns recorded
successful cleanup of owned resources. [Context evidence](context-session.json).

The existing [mutation proof](transaction-context-guard.json) changed the identity
GUC from transaction-local to session-persistent. The lifecycle test failed with
`connection context leaked after explicit_commit`; byte restoration and the
context campaign then passed. No mutation was repeated in this acceptance task.

T0 for this task checks source/evidence hashes, the selected observations, JSON,
local links and scoped whitespace, plus OpenSpec strict validation. Current
acceptance checks are distinct from those prior T1 executions. T2/T3 are not due.

Observed T0 output: `Passed: 18 source/design hashes, 2 evidence hashes, 17 Gate
observations, six lifecycle exits, local links and whitespace`.
`openspec validate ra-01-verified-session --strict` returned
`Change 'ra-01-verified-session' is valid`; scoped `git diff --check` exited 0.
Independent artifact-critic review found no substantive acceptance evidence gaps.
Its progress-record finding was resolved by completing task 7 through KBD and
checking the resulting 7/8 in-progress ledger before reporting completion.

## Changes and remaining limits

Added `task-7.md` and `task-7-acceptance.json`. KBD records acceptance 2.3 in
`openspec/changes/ra-01-verified-session/tasks.md` and generated projections;
the append-only session log records this boundary. No application code, tests,
dependencies, unrelated implementation or guards are added. Existing context and
membership guards trace to the explicit identity and tenant boundary requirements.

The uncomfortable limit: sequential two-identity reuse and separate single-identity
cleanup tests do not prove general concurrency or two-identity HTTP cancellation.
HTTP-disconnect propagation, native UI/IPC, full production configuration and
deployment remain unverified. Gate's repeated same-name credential header collapse
also remains outside certified refusal parity. Full-change QA is task 3.1; this
task does not archive, commit or publish the change.
