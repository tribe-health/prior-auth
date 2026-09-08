# RA-02 eligibility — durable gate affirmation

2026-09-06. Runtime-architecture Execute. Task 1.1, driver 1 of 9.
Result: **Passed** for eligibility. Implementation and behavioral acceptance remain pending.

## Dependency and decision

RA-01 is canonically `complete`, with eight completed tasks, an archived change
and promoted specification. Its refiner, independent critic and distinct native
fallback judge passed; the configured REST judge timeout is retained in its
transport receipt. Current verification matched all 18 implementation/design
hashes and two evidence hashes, resolving the original design path to its archive.
See [eligibility.json](eligibility.json) and the
[RA-01 completion report](../ra-01-verified-session/task-8.md).

RA-02 is eligible for the next bounded implementation task. No new operator
decision is needed to implement its authorized server path with synthetic fixtures.
The approved [plan](../../plan.md), [assessment](../../assessment.md), mandatory
[assessment supplement](../../review/assess/review.md) and
[execution contract](../../execution.md) govern the work. Source observations
below identify work to do; they do not establish durable clinical behavior.

The canonical store retains two unresolved historical boundary entries: an
abbreviated RA-01 task subject and a prior child-phase start receipt. Their text
does not concern RA-02's current eligibility. RA-01's canonical completion and
the successful RA-02 start boundary are observed separately; this task does not
erase those entries or declare them resolved. Publication remains blocked.

## Assigned ownership and observed starting point

All paths are relative to the ASO repository root. Independent read-only source
inspection found no ownership conflict.

| Assigned surface | Current files and implementation gap |
| --- | --- |
| Shared service and ports | `crates/aso-host/src/lib.rs`, `src/ports/mod.rs`, `src/domain/mod.rs`, `src/session.rs`: affirmation takes an `ActorId`; it lacks verified principal/practice and command-result reconciliation. A returned session summary is not authority for a later command. |
| HTTP gate operation | `crates/aso-server-axum/src/routes/gate.rs`, `src/session.rs`, `src/lib.rs`: GET reads the existing repository; debug POST accepts body actor, release POST refuses. Add verified command handling, authoritative reads and result lookup within the assigned route/service boundary. |
| PostgreSQL adapter/composition | `crates/aso-web-server/src/adapters/memory.rs`, `src/adapters/mod.rs`, `src/adapters/session.rs`, `src/main.rs`: clinical paths still use memory repositories/authority. The only current PostgreSQL adapter is the session reader. A clinical adapter is new work, not an existing facility. |
| Fresh and upgrade migrations | `docker/bootstrap/10-aso-schema.sh`, `25-session-authority.sql`, `docker-compose.yaml`: fresh initialization exists; RA-01 SQL is additive/rerunnable. No checksummed migration registry/runner was found under crates/docker/scripts. Task 1.2 owns that missing infrastructure and command ledger. |
| Database controls and gate summary | `docs/design/schema/schema.sql`: `gate_affirmations`, `enforce_gate_authority`, `refresh_case_gate`, `gate_readiness` and case summary columns are existing contracts. The current authority trigger checks supplied `affirmed_by` capability; independent verified principal/practice binding and direct summary-column write refusal need implementation and proof. Preserve summary updates/clears on affirmation changes in both fresh and upgrade paths. |
| Desktop counterpart | `desktop/src-tauri/src/lib.rs`: `commands::affirm_gate` accepts actor; session counterpart is inactive. Replace actor authority with the equivalent typed refusal/command contract without activating credentials before RA-17. |
| Gate clinical policy | `docker/flint-gate/config.yaml`: deployed ASO policy belongs to this repository; the current exact ASO route is session GET. Clinical affirmation policy is missing. Companion Gate edits, if required by observed policy limitations, remain restricted to its assigned ASO policy support and require its local instructions first. |
| Synthetic harness precedents | `scripts/test-session-boundary.py`, `test-session-context.py`, `test-session-gateway.py`, `docs/design/schema/schema-checks.sql`: provisioning and session checks are reusable precedents, not RA-02 clinical acceptance evidence. |

Forge remains the PostgreSQL substrate. Do not move ASO clinical logic into its
generic gateway. No companion source change is needed for eligibility.
Before implementation, name exact new source/migration paths and reopen their
surrounding code. Do not widen `aso_session_reader` to perform clinical writes;
its read-only contract and RA-01 evidence remain prerequisites.

## Phase gate disposition

| Gate | RA-02 disposition |
| --- | --- |
| G-PIN | No PEM adoption or operator-owned pin change. Preserve exact 4.0.0 pins. |
| G-REV | No active-stream deadline or bounded revocation certification. Fresh command authority remains required independently. |
| G-DATA | Synthetic server fixtures only for implementation proof. Real clinical data, browser/native private persistence and release approval are not inferred. Assign the new ledger's lane/privacy contract in task 1.2. |
| G-SYNC | No Electric/materializer adoption in this change. |
| G-NATIVE | Typed desktop parity/refusal is required; credential/IPC activation waits for RA-17. |
| G-MEASURE | No browser/device/performance certification is claimed. Required supported-surface budgets remain later gates. |

Gate, AppServices and PostgreSQL must each reject administrator, agent and
foreign-practice attempts when the other two controls are bypassed by the test
harness. Stable command IDs bind identity, practice and payload; a lost response
must reconcile one committed effect, and changed payload must conflict. Clinical
commands never enter automatic PEM/local SQL/Zustand replay. These are explicit
implementation criteria, not new speculative guards.

## Verification and scope

Actual read-only commands: `prometheus kbd status --json`, OpenSpec apply
instructions JSON, SHA-256 comparisons against the RA-01 acceptance inventory,
and source/path inspection with `rg`, `cat` and `sed`. Observed output:

```text
Passed: RA01 canonical complete 8/8, 20 hashes match, nine RA02 task definitions, eligibility JSON round-trip
```

The driver initially registered only the current task. The remaining eight
definitions were registered as pending through the typed task CLI so the ledger
tracks the full nine-task change before eligibility completes. Registration is
not execution. Generated projections were not hand-edited.

Only this report and its JSON receipt are authored eligibility evidence.
OpenSpec task status, generated KBD projections and append-only session memory
record the boundary. No application code, schema, dependencies, guards or
unrelated implementation changed. No live services or patient data were accessed.
No Cargo, T1, T2 or T3 checks are due for this documentation-only eligibility task.

T0 JSON/local-link/whitespace checks passed. `openspec validate
ra-02-durable-affirmation --strict --json --no-interactive` returned `valid: true`,
zero issues, one passed and zero failed. The independent artifact critic found
no actionable eligibility, ownership or gate findings. Its review compared the
artifacts with plan/design/task/assessment excerpts, RA-01 completion report and
waypoint; canonical querying and hash verification were performed by the root,
not independently repeated by the critic. Full implementation review remains
the change's final task.

The uncomfortable limit: RA-01's verified session read does not make the current
memory affirmation path durable or independently authorized. Fresh/upgrade
migrations, atomic command results, independent refusals, lost-response conflicts,
gate-summary maintenance and direct-column refusal all remain unverified for RA-02.
