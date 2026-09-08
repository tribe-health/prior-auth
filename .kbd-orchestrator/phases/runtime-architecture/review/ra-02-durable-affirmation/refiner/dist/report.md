# RA-02 scoped refiner gate

Result: **Passed** for the deterministic evidence gate, subject to the retained validator output. Refinement found and corrected one boundary defect: the Gate policy callback reached through `AppServices` into its case repository. It now calls `AppServices::read_verified_gate`, preserving the host contract while keeping the policy check read-only.

The complete-packet adversarial passes then found two critical defects and four warnings. Trusted identities now carry their principal from the identity adapter, and `SessionService` refuses nonhuman principals before membership resolution. A scoped command lookup now precedes target-case authority at the service and database layers, making changed payloads conflict even when the substituted case is missing or outside the practice. The React hook uses a typed practice-options object and clears command correlation after a definitive refusal. Gate reuses one process-wide hardened authorization client. Startup parses and compares the host, port and database for session and gate credentials before composing both adapters.

The uncomfortable limit: complete synthetic PostgreSQL and mounted HTTP campaigns do not establish that a surgeon can reach this capability from the current browser view or a Tauri command. The web route remains a placeholder, and the desktop wrapper is intentionally inactive until native authentication work.

## Behavior and evidence

The fresh and populated-upgrade campaigns apply the checksummed additive migration and exercise the real restricted PostgreSQL repository. They prove that a stable command commits its affirmation, audit row, immutable command result and derived case summary in one transaction. A forced audit failure rolls every effect back. Concurrent duplicate commands produce one result, and same-case commands preserve a complete derived summary.

Authority is checked independently. Gate resolves a fresh session and capability before forwarding. `AppServices` checks the clinical context and authority port. PostgreSQL resolves selected-practice membership and clinical role inside the transaction. Administrator, foreign-practice and nonhuman principals are refused with accepting positive controls at the other layers. The Kratos adapter stamps authenticated application identities as `User`; a trusted provider that stamps `Agent` is refused before even an accepting membership repository runs. Direct owner and restricted-role attempts cannot spoof the derived summary; mutation evidence records that disabling the guard allows the synthetic control and that rollback restores it.

The mounted response-loss proxy disconnects before client headers while Gate and the application finish the command. SQL observes one affirmation, one audit and one command record. Lookup and deliberate retry return the original result without another effect. Reusing the command ID with a changed kind, action or case returns a conflict. Fresh and upgrade fixtures also prove a changed case conflicts before target authorization for both missing and out-of-practice targets. A later legitimate removal changes current gate state without rewriting the historical receipt.

Acceptance receipts 2.1 through 2.4 bind current source and evidence files by SHA-256. The validator recomputes those values and checks all recorded receipt results and cleanup entries. Historical mutation receipts retain their original source hashes and are treated as prior failure evidence, not current source inventories.

## Real callers

The production server path is concrete: `main` constructs `PgGateRepository`, injects it into `AppServices`, mounts `api_router`, and the gate handlers call the service methods. The flint-gate configuration assigns the clinical authorization middleware to the gate routes; its pipeline invokes the callback before forwarding. The mounted T1 campaign launches those binaries and calls every public gate route through Gate.

The React API and `useSurgeonGate` hook have focused test callers. Its practice selection now uses `{ practiceId }`, preventing an old actor string from compiling as a tenant selector. `surgeon-gate-route.tsx` still renders `RoutePlaceholder`, so RA-02 does not claim a mounted browser workflow. Desktop wrappers also have focused accepting-port and refusal tests, but no Tauri dependency, command attribute or runtime registration. Their explicit `NativeAuthenticationUnavailable` result is the current contract.

## Verification

The deterministic refiner command is `python3 .kbd-orchestrator/phases/runtime-architecture/review/ra-02-durable-affirmation/refiner/validate.py`. It checks the canonical artifact-refiner schemas, exact output coverage, current hashes, receipt structure, caller anchors, Python syntax, host-boundary correction and iteration consistency. Its actual stdout is retained in `validation-output.json` after execution.

Applicable completion checks run by the parent task:

| Command | Observed result |
| --- | --- |
| `cargo +1.97.1 check -p aso-host` and scoped clippy | Passed |
| `cargo +1.97.1 check/clippy -p aso-server-axum --tests` | Passed |
| `cargo +1.97.1 test -p aso-server-axum routes::gate::tests` | 11 passed, including trusted Agent-principal refusal before membership |
| `cargo +1.97.1 check/clippy -p aso-web-server --tests` | Passed; two pre-existing unit-struct warnings in memory composition |
| `cargo +1.97.1 check/clippy -p aso-desktop` and session contract tests | Passed; 2 tests passed |
| `pnpm --dir web typecheck`, lint and web tests | Passed; 69 tests passed, including 12 surgeon-gate hook tests |
| flint-gate check, clippy and focused authorization middleware tests | Passed; 8 tests passed; the hardened client is reused process-wide |
| `cargo +1.97.1 test -p aso-web-server deployment_tests` | 1 passed; mismatched database host, port and name refuse |
| `openspec validate ra-02-durable-affirmation --strict` | Change is valid |

The whole-workspace formatting check reports pre-existing formatting differences across touched and untouched Rust files; this one-line correction follows the existing file style and its compile and focused behavior checks pass. No phase T2 or release T3 command ran.

## Scope accounting

This refinement added the requested review bundle and corrected seven findings from the caller and adversarial audits. Evidence hash inventories bind the current sources. The nonhuman-principal, database-target and conflict-order checks trace to existing clinical-authority, tenant and idempotency boundaries. The definitive-refusal hook behavior prevents a stale reconciliation affordance. No real patient data appears in the evidence.

Browser interaction, accessibility for the eventual gate view, Tauri IPC registration, native credential ownership, production secrets and migration execution, deployment, physical devices and arbitrary process failure remain unverified. These limits prevent RA-02 from being read as a release claim while allowing the server capability to close at its assigned tier.
