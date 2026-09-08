# RA-01 scoped refiner gate

Result: **Passed** for the deterministic evidence gate, subject to the accompanying actual validator output. No implementation refinement was required by this review. The plan-to-delivery delta is a scoped content report plus reproducible validation; source code and live resources were read only.

The uncomfortable limit: green historical synthetic campaigns do not establish current service availability, native credential ownership, clinical command authorization, production deployment, arbitrary concurrency or browser readiness.

## Evidence and callers

Acceptance receipts 2.1, 2.2 and 2.3 bind the implementation and underlying receipts by SHA-256. The validator recomputes those hashes. Earlier task-2 mutation hashes are historical, preceding the task-3 transaction-owner extraction; they are not presented as current source hashes. The latest acceptance inventory is authoritative for evidence reuse. After the parent driver archives OpenSpec, the validator may resolve an absent active design path to one unique dated archive path; the original path inventory and expected hash stay unchanged.

The mounted caller chain is the web binary's configured session service, api_router, session::router, GET /api/session, AppServices.sessions.resolve, SessionService, Kratos whoami and PgMembershipRepository. The production repository opens its transaction through begin_scoped, binds the verified identity with transaction-local set_config, adopts aso_session_reader and resolves active membership from PostgreSQL. The Gate harness launches the real application and checked-in session route; its successful A/B requests verify database context and one shared backend. Static anchors in validator output locate each caller; recorded mounted tests establish exercised behavior.

The real callers exercised here are the mounted HTTP/Gate harnesses. Browser application session consumption is not delivered or certified by RA-01.

The desktop current_session wrapper has the matching typed summary/error contract and immediately returns NativeAuthenticationUnavailable. Its recorded accepting-port test proves it does not consult authority, and bypass mutation failed. This is an inactive contract; native UI/IPC remains **Build-only** until the later native transport work.

The host dependency inventory contains serde, serde_json, uuid, thiserror, async-trait and chrono. The revision migration declares server-authoritative relational metadata, privacy trusted, excluded from replication. The returned summary is a noncredential projection. No clinical command authority or replica capability is newly certified by it.

## Verification

The deterministic command is `python3 .kbd-orchestrator/phases/runtime-architecture/review/ra-01-verified-session/refiner/validate.py`. Actual output is retained in `validation-output.json`; the invoking host records exit status. It performs full Draft-07 manifest/constraints/state schema checks with format validation, nonempty file checks, exact dist coverage, current hashes, recorded receipt consistency, source caller anchors, Python AST parsing and iteration consistency.

Prior T0/T1 is reused after current-hash validation. Task-2, task-3 and task-4 reports record touched-crate check/clippy exit 0; web-server clippy retained three preexisting memory-composition warnings. Recorded T1 commands and outcomes:

| Command | Observed receipt result |
| --- | --- |
| RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-session-boundary.py | 34 checks, 30/30 responses no-store |
| RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-session-context.py | 41 checks, 37/37 responses no-store; explicit DB test 1 passed with six exit markers |
| RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-session-gateway.py | 36 checks, 34/34 responses no-store; A/B backend counts 1/1, intersection 1 |
| cargo +1.97.1 test -p aso-desktop session_contract_tests | 1 passed; 0 failed; 0 ignored |

Five guard mutation receipts retain nonzero failures and successful restoration. Provider and membership mutation evidence predates the extraction; later transaction/Gate campaigns bind the final adapter. Recorded disposable-resource cleanup is complete; this gate does not re-query live resources. Root's task-8-checks.json separately records current scoped T0 and OpenSpec validation.

## Constraints and limitations

The checklist covers every applicable blocking/high refiner constraint. The canonical constraints schema admits content and does not admit code; content/direct:content describes this evidence artifact accurately. Source implementation remains its input. No schema was weakened. Validation outcomes live in the checklist, because the canonical constraints schema rejects ad hoc validated/last_checked fields suggested by the generic persistence prose.

The scoped filesystem provider resolves from this directory. State, registry, checkpoints and history stay underneath it. No global/root refiner state is created. No workflow triggers launch external or broad checks.

Phase execution.md and AGENTS reserve workspace, web production, Flutter and broad architecture checks for phase T2. They remain deferred despite the stale blanket commands in constraints.md. No T2/T3, commit, archive, publication, live service or Cargo execution occurred in this stage. Independent adversarial review remains the next parent-owned gate.

Gate collapses repeated same-name credential headers; mixed distinct sources are tested, duplicate-header refusal parity is unverified. Separate browser/native logins can legitimately have different verified expiries. Successful Gate requests observe DB identity; denied requests assert refusal, not a separate DB trace. Sequential two-identity reuse and separate single-identity cancellation do not prove arbitrary concurrency or HTTP-disconnect propagation. Cancellation may wait for the five-second timeout and replace the backend. Production migrations/secrets, full Gate configuration and native device evidence remain unverified.

## Change and guard accounting

Only scoped refiner metadata, report, checklist, deterministic validator and its output were added. These are requested gate artifacts; no unrelated changes were added. No application guard was added by this gate. Existing guards trace to the credential/tenant authority boundary, explicit inactive native contract, and the recorded privileged-reader defect. Existing clinical implementations and later query-cache work were outside scope.
