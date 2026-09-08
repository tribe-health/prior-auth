# RA-03 task 1.4 — production composition and rollback proof

2026-09-06. Runtime-architecture / Execute. Driver task 4 of 8.
Result: **Passed** for this implementation unit. RA-03 remains in progress.

## Delivered behavior

The mounted web server now refuses startup unless `ASO_DATABASE_URL`,
`ASO_GATE_DATABASE_URL` and `ASO_KRATOS_PUBLIC_URL` are present. The two
database URLs must name the same host, port and database. One restricted
`PgGateRepository` supplies the case, evidence, letter and authority ports used
by mounted clinical commands. Production compilation contains no memory
authority, case, evidence or letter repository path. Memory adapters compile
only for focused tests. The unmounted criteria port uses a stateless unavailable
adapter rather than synthetic application state.

Signing and reassessment integration tests now prove the independent clinical
controls with real synthetic PostgreSQL records. Administrator, agent and
foreign-practice requests are refused by `AppServices`, the restricted
repository and the direct database trigger. Direct trigger refusal requires
SQLSTATE `42501`, preventing an unrelated constraint failure from satisfying
the authority assertion.

Both command transactions inject a failure at the final immutable receipt
insert. Signing retains the approved unsigned letter pre-image; reassessment
retains the exact evidence state, rationale and attribution pre-image. Neither
failure leaves an audit row, receipt or lookup result. Removing the injected
constraint allows the same command ID to commit once, which proves the failed
transaction did not consume its correlation identity.

The reassessment lifecycle applies legal `void` to `gap`, `gap` to `met` and
`met` to `void` changes. The final database contains three distinct audit events
and three command receipts with the surgeon attribution. This preserves all
three evidence states as identities rather than collapsing `gap` and `void`.

The reusable mounted session fixture now supplies the required restricted gate
credential and proves its disposable login is a non-owner, non-BYPASSRLS member
of both reader and executor roles. A real Kratos v26.2.0 session campaign started
the actual web-server binary and passed all 34 authentication, scope, authority,
membership and revocation checks. All synthetic resources and any roles created
by the fixture were removed.

ADR-002, ADR-009, the application runtime architecture and the Rust operating
rule now describe the same fail-closed production composition, transaction
rollback guarantees and test-only memory boundary.

## Verification and observed output

Tier 0 and focused Tier 1 used `RUSTUP_TOOLCHAIN=1.97.1` because the project's
stated 1.94 toolchain is not installed on this host.

| Command or campaign | Observed result |
| --- | --- |
| `cargo check -p aso-web-server` | Finished successfully, exit 0 |
| `cargo clippy -p aso-web-server --no-deps` | Finished successfully, exit 0, no warnings |
| `cargo test -p aso-web-server deployment_tests` | 2 passed, 0 failed |
| `cargo test -p aso-host signing::tests` | 5 passed, 0 failed |
| `cargo test -p aso-host reassessment::tests` | 4 passed, 0 failed |
| Fresh PostgreSQL signing campaign | Passed; 16 fixture checks, 10 lifecycle markers and all cleanup checks passed |
| Populated-upgrade PostgreSQL signing campaign | Passed; 22 fixture checks, 10 lifecycle markers, legacy-data preservation and all cleanup checks passed |
| Fresh PostgreSQL reassessment campaign | Passed; 16 fixture checks, 7 lifecycle markers and all cleanup checks passed |
| Populated-upgrade PostgreSQL reassessment campaign | Passed; 22 fixture checks, 7 lifecycle markers, legacy-data preservation and all cleanup checks passed |
| Mounted session compatibility campaign | Passed; 34 checks, 30/30 application responses carried `no-store`, and 9 cleanup checks passed |
| Python source compilation for five affected fixture scripts | Passed |
| Production-memory static exclusion | Passed; mounted `main.rs` has no memory adapter reference and `memory` is `cfg(test)` |
| Local links in the three changed architecture documents | Passed |
| `git diff --check` | Passed with no output |

The five machine-readable receipts are `task-4-signing-fresh.json`,
`task-4-signing-upgrade.json`, `task-4-reassessment-fresh.json`,
`task-4-reassessment-upgrade.json` and `task-4-session-compatibility.json` in
this directory. Receipt validation observed `Passed` in every campaign and no
failed cleanup member. `task-4-files.json` records the reviewed source hashes.

## Review findings and corrections

Three independent read-only reviews separated production composition, shell
compatibility and database authority. They found the production memory fallback,
an incomplete mounted-session environment, broad direct-trigger `.is_err()`
assertions, absent reassessment three-layer denial proof and missing final-ledger
rollback evidence. The implementation above closes each finding. Formal
artifact refinement and isolated completion review remain task 3.1.

## Scope and remaining risk

The legacy `GET /api/cases/{caseId}/evidence` count route has no verified actor
context. The PostgreSQL adapter returns unavailable for that actor-less read.
Restoring memory counts would create a second, synthetic production authority;
RA-14 must convert the route to a verified-context read before claiming live
timeline behavior. The criteria adapter is also unavailable because no mounted
route currently consumes it.

No T2/T3, workspace-wide build/test, release build, Tauri bundle, physical-device
run, deployed Gate image, production migration, dependency change, commit or
real patient data was used. These checks prove the service/repository/database
command boundary and mounted session compatibility; they do not certify the
native shell or the full realtime path.

Nothing outside the requested unit was added. The operating-rule correction is
required to prevent future work from treating the removed production memory
authority as current architecture. Every new guard traces to a configured
production trust boundary, an administrator/agent/foreign-practice refusal, an
observed transaction rollback requirement, exact SQLSTATE proof, or preservation
of `met` / `gap` / `void` with audit records.
