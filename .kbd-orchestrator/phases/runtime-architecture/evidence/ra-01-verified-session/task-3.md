# RA-01 task 1.3 — transaction context and desktop contract

2026-09-06. Execute phase, driver task 3 of 8. Result: **Passed** for task 1.3.

Most required production behavior was already introduced as a prerequisite of
task 1.2. This task extracts its transaction owner and adds evidence for cleanup,
provider error/trait handling and inactive desktop refusal. It does not activate
native authentication or complete RA-01.

## File-by-file changes

| File | Delivery |
| --- | --- |
| `crates/aso-web-server/src/adapters/session.rs` | Extract `begin_scoped` from the real membership resolver; preserve bound, transaction-local identity, restricted role and read-only snapshot behavior. |
| `crates/aso-web-server/src/adapters/session/transaction_tests.rs` | Six real PostgreSQL exit checks using the production transaction owner; same backend on normal exits, clean reuse or verified discard on cancellation. |
| `scripts/test-session-context.py` | Reuse disposable resource provisioning; explicitly run DB test and mounted authority/trait/outage checks. Preserve earlier failed attempts. |
| `desktop/src-tauri/src/lib.rs` | Test the actual wrapper against an accepting session port; absent and selected practice both remain refused without consulting that port. Production wrapper unchanged. |
| `openspec/changes/ra-01-verified-session/design.md` | Document ownership, cancellation behavior, wrapper and remaining limits. |
| `openspec/changes/ra-01-verified-session/tasks.md` | Complete only task 1.3 through KBD. |

Implementation hashes: [task-3-files.json](task-3-files.json). This receipt,
review evidence, KBD projections and append-only memory complete the task record.
No unrelated implementation, dependencies, schema changes or new production
guards were added. Existing guards enforce the actual credential/tenant boundary;
the tests trace directly to task 1.3's explicit requirements.

## Actual checks

- T0: `cargo +1.97.1 check -p aso-web-server --tests` and
  `cargo +1.97.1 clippy -p aso-web-server --tests --no-deps`: exit 0.
  Three preexisting unit-struct-default warnings in unchanged memory composition.
- T0: `cargo +1.97.1 check -p aso-desktop --tests` and
  `cargo +1.97.1 clippy -p aso-desktop --tests --no-deps`: exit 0.
- T1: `cargo +1.97.1 test -p aso-desktop session_contract_tests`:
  `1 passed; 0 failed; 0 ignored`.
- T1: `RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-session-context.py`:
  exit 0, **41 checks Passed**, **37/37 responses no-store**. Its explicit
  `cargo test -p aso-web-server session_transaction_context_lifecycle -- --ignored --nocapture`
  printed `1 passed; 0 failed; 0 ignored` and all six exit markers.
  [Full mounted/transaction evidence](context-session.json).
- T1 mutation: changing identity `set_config` from local=true to false produced
  `connection context leaked after explicit_commit`, test exit 101. Source
  restored byte-for-byte; T0 and all final checks passed.
  [Transaction mutation evidence](transaction-context-guard.json).
- T1 mutation: bypassing the desktop refusal and invoking its accepting session
  port produced `1 failed`, exit 101. Restored source; T0 and the desktop test
  passed. [Desktop mutation evidence](desktop-context-guard.json).
- T0: Python syntax, evidence JSON, receipt links, source hashes, exact installed
  PEM 4.0.0 pins, shell-neutral host manifest and scoped `git diff --check`
  passed. OpenSpec strict validation returned `valid: true`, `issues: []`.

The six DB exit checks are explicit commit, real resolver success, real resolver
practice denial, SQL error with Drop rollback, explicit rollback, and cancellation
after PostgreSQL reports an active sleeping query. The normal exits reuse the
same backend with original role/search path/timeout/isolation and empty identity.
Cancellation returned a clean replacement and the old backend was absent.

Mounted checks include fresh real Kratos/Postgres authority, forged headers,
foreign practice refusal, injected provider traits that cannot change principal
or membership, 503 provider failure, 401 anonymous/invalid session and exact
403 reauthentication semantics. All disposable databases, roles, identities,
sessions, app processes/logs and the controlled provider were cleaned up.

## Review and observed corrections

An isolated artifact-critic reviewed source artifacts without generation history.
It found one P2 in the new runner: the reused 403 helper expected practice denial
even for provider reauthentication and marked its individual check passed before
validating the body. The runner now checks status, exact reauthentication code
and no-store before assigning Passed. Independent source recheck confirmed the
finding resolved and no other concrete scoped findings.

The initial cancellation test incorrectly demanded the original backend survive.
Actual SQLx behavior discarded it after the interrupted query's timeout; settings
on the replacement were clean. The corrected test verifies old-backend removal
as well as clean next-borrower state. Failed attempts are preserved in
[fixture evidence](context-fixture-failure.json) and the mounted receipt history.
This was a test assumption defect, not a demonstrated application context leak.

Context7 documentation and installed SQLx 0.8.3 source confirm Drop queues
rollback and pool release flushes it or discards an unusable connection:
[Transaction source](https://docs.rs/sqlx-core/0.8.3/src/sqlx_core/transaction.rs.html),
[pool connection source](https://docs.rs/sqlx-core/0.8.3/src/sqlx_core/pool/connection.rs.html).

## Remaining limits

The uncomfortable limit: cancellation can wait for the five-second statement
timeout. This proves cancellation of the transaction owner, not HTTP-disconnect
propagation. The mounted Gate hop and two-identity pooled-connection campaign
remain task 1.4. Native UI/IPC and credentials remain Build-only/inactive until
ra-17. Production migrations/secrets, full-change review gates and phase acceptance
remain unverified. No T2/T3, commit, archive or publication was performed.
