# RA-01 task 1.2 — mounted verified session

Date: 2026-09-06. Phase: runtime-architecture / Execute. Driver task: 2 of 8.
Result: **Passed** for task 1.2; the change and phase remain in progress.

`GET /api/session` now verifies a raw browser cookie or native harness token
against self-hosted Kratos, then reads current ASO membership and capabilities
from Postgres. It returns a sanitized summary and `Cache-Control: no-store`.
The caller cannot select a practice without current membership. Separate browser
and native sessions retain their own verified expiry, with equal identity,
authorization scope and revision when authority has not changed.

The uncomfortable limit: this proves the direct mounted HTTP application with
synthetic data. It does not establish Gate routing, two-identity pool cleanup,
native credential ownership, clinical command authorization or UI readiness.

## File-by-file delivery

| File | Change |
| --- | --- |
| `Cargo.toml` | Exact SQLx 0.8.3 and reqwest 0.12.28 with required PostgreSQL/TLS support. |
| `Cargo.lock` | Resolve required dependencies; 164 package versions added, no previously locked package versions removed. |
| `crates/aso-host/src/lib.rs` | Expose session module and inject its port through AppServices. |
| `crates/aso-host/src/session.rs` | Shell-neutral credential, verified identity, membership, summary, error and service contracts; fresh authority resolution. |
| `crates/aso-server-axum/src/lib.rs` | Mount the session router. |
| `crates/aso-server-axum/src/session.rs` | Parse unambiguous credentials and selected practice; return sanitized summaries/errors with no-store; preserve existing public principal exports. |
| `crates/aso-web-server/Cargo.toml` | Consume verified workspace HTTP/database dependencies. |
| `crates/aso-web-server/src/main.rs` | Configure and inject the real session service, with explicit unavailable state when unconfigured. |
| `crates/aso-web-server/src/adapters/mod.rs` | Expose session adapters. |
| `crates/aso-web-server/src/adapters/session.rs` | Kratos verification, fresh transactional membership lookup, runtime-role checks and targeted provider tests. |
| `desktop/src-tauri/src/lib.rs` | Add typed inactive current-session counterpart; native authentication remains unavailable until ra-17. |
| `docker/bootstrap/25-session-authority.sql` | Add rerunnable authorization revision, atomic statement triggers and restricted session-reader role. |
| `scripts/test-session-boundary.py` | Reproducible mounted test using disposable Kratos identity, database and restricted password-authenticated login. |
| `openspec/changes/ra-01-verified-session/design.md` | Record transport, expiry, revision, role, configuration and deployment decisions. |
| `openspec/changes/ra-01-verified-session/tasks.md` | Task 1.2 completion through the KBD driver only. |

Final implementation hashes: [task-2-files.json](task-2-files.json).
Review and execution receipts accompany this document. KBD projections are
updated by its driver; memory entries are append-only. No unrelated code,
query cache, UI work or dependency refresh was added. Operator-owned PEM pins
and existing clinical implementations were preserved.

## Observed verification

| Tier | Actual command / artifact | Observed result |
| --- | --- | --- |
| T0 | `cargo +1.97.1 check -p aso-host` and `cargo +1.97.1 clippy -p aso-host --no-deps` | Passed; exit 0. |
| T0 | `cargo +1.97.1 check -p aso-server-axum` and `cargo +1.97.1 clippy -p aso-server-axum --no-deps` | Passed; exit 0. |
| T0 | `cargo +1.97.1 check -p aso-web-server` and `cargo +1.97.1 clippy -p aso-web-server --no-deps` | Passed; exit 0, including after restoration. Three preexisting unit-struct-default warnings in unchanged memory composition. |
| T0 | `cargo +1.97.1 check -p aso-desktop` and `cargo +1.97.1 clippy -p aso-desktop --no-deps` | Passed; exit 0. Native runtime status remains Build-only. |
| T1 | `cargo +1.97.1 test -p aso-web-server adapters::session::tests` | Passed; 3 passed, 0 failed, 0 ignored. |
| T1 | [transport-probe.json](transport-probe.json) / [transport-probe.py](transport-probe.py) | Passed; pinned Kratos v26.2.0 accepts Cookie, Bearer and X-Session-Token; missing/invalid/revoked credentials return 401. |
| T1 | [session-schema.json](session-schema.json), recorded psql commands | Passed; 12 checks including all 16 table/statement combinations, rollback, non-reused revision, idempotence, restricted reads and refused writes. |
| T1 | `RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-session-boundary.py` | Passed; 34 checks, 30/30 responses no-store. See [mounted-session.json](mounted-session.json). |
| T1 | Controlled removal of provider active-state check | Failed as intended: targeted provider test exit 101. Restored source; all 3 provider tests passed. [provider-guard.json](provider-guard.json). |
| T1 | Controlled removal of selected-practice membership predicate | Failed as intended: foreign practice returned 200, expected 403; probe exit 1. Source restored byte-for-byte; T0 and all 34 mounted checks passed. [membership-guard.json](membership-guard.json). |

The mounted checks compare exact summary keys, verified expiry and current DB
revision; exercise live capability/membership/user-status changes and revocation;
reject spoofed hints, ambiguous credentials, foreign practices, runtime column
write grants and table ownership. No credentials or raw identity responses are
retained in the evidence. All owned resources were cleaned after each attempt.

Initial `cargo check -p aso-host` could not run under the default stable toolchain
because its cargo component was unavailable. Installed 1.97.1 was used explicitly;
the repository has no toolchain-file change. The first mounted fixture assumed
port 5432 and failed before HTTP readiness. Docker publishes 55432. The fixture
now discovers that port; the failed attempt and successful runs are preserved.

T0 also checked Python syntax, evidence JSON, source restoration hashes, exact
PEM pins, the shell-neutral host manifest, scoped `git diff --check`, and
`openspec validate ra-01-verified-session --strict --json --no-interactive`
(valid=true, zero issues). No T2/T3, full workspace or release claim is made.

## Independent review and guard rationale

The isolated source critic found one P2: checking schema ownership alone left
runtime credentials with ASO relation ownership or effective write grants
acceptable. The runtime role check now covers both the login and reader role,
effective ownership, table/column writes and elevated role flags. Independent
recheck found that defect resolved. Live grant/ownership tests returned 503 and
returned to 200 after restoration. See [critic receipt](../../review/ra-01-task-2/critic.md).

New guards sit at actual credential and database authority boundaries: provider
origin/transport/status/body limits, credential-source disambiguation, active
identity and expiry, practice membership, active ASO user, nonprivileged reader
and revision integrity. The write/ownership guard also addresses the observed
critic defect. No speculative business fallback or unrelated guard was added.

## Deployment and remaining evidence

Existing application databases were not migrated. Apply the additive SQL file
administratively and provide a dedicated restricted login via deployment secrets
before enabling `ASO_DATABASE_URL` and `ASO_KRATOS_PUBLIC_URL`. Local plaintext
Kratos requires explicit `ASO_ALLOW_INSECURE_KRATOS=true`.

The coarse global revision intentionally invalidates other users on an authority
statement, including a no-op. Restoring an old backup requires a new incarnation
before serving it; the stored value alone cannot detect restoration. No active
stream revocation deadline is certified here.

Task 1.3 still owns complete transaction-context cleanup and desktop contract
evidence. Task 1.4 owns Gate integration and two-identity pooled-connection
conformance. Native credentials, physical UI, production migration/secrets,
full-change artifact-refiner/adversarial review and phase acceptance remain
unverified. Publication stays Blocked; no change archive or commit was made.
