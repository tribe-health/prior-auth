# RA-03 eligibility — clinical command parity

2026-09-06. Runtime-architecture Execute. Task 1.1, driver 1 of 8.
Result: **Passed** for eligibility. Implementation and behavioral acceptance remain pending.

## Dependency and decision

RA-02 is canonically `complete`, with nine completed tasks, an archived change
and promoted specification. Its final artifact refiner and adversarial review
passed. Current verification matched all seven files referenced by its final
acceptance receipt. The [canonical status receipt](canonical-status.json)
preserves revision 196 and the dependency's 9/9 completion. The archive and
promoted specification paths were also checked directly. See
[eligibility.json](eligibility.json), the
[RA-02 acceptance receipt](../ra-02-durable-affirmation/task-9-acceptance.json)
the [archived RA-02 tasks](../../../../../openspec/changes/archive/2026-09-06-ra-02-durable-affirmation/tasks.md)
and the [promoted RA-02 specification](../../../../../openspec/specs/ra-02-durable-affirmation/spec.md).

RA-03 is eligible for its next bounded implementation task. No operator decision
blocks the approved synthetic server implementation. The approved
[plan](../../plan.md), [assessment](../../assessment.md), mandatory
[assessment review](../../review/assess/review.md) and
[execution contract](../../execution.md) govern the work. Source observations
below identify work to do; they do not establish safe signing or reassessment.

The retained RA-02 warning is relevant to RA-03 Gate policy work: the Gate
authorization callback currently permits a configured plaintext HTTP endpoint
while forwarding session credentials. RA-03 must not claim production transport
safety from the existing callback. This eligibility task does not widen scope to
repair that separate transport control.

## Assigned ownership and observed starting point

All ASO paths are relative to this repository root. The five-repository boundary
is explicit so later implementation does not move clinical authority into shared
infrastructure.

| Owner | Current files and implementation gap |
| --- | --- |
| ASO shared service and ports | `crates/aso-host/src/lib.rs` and `src/ports/mod.rs`: the legacy signing service accepts an `ActorId`, checks an in-process authority port and signs after gate/retrieval checks. It lacks verified principal/practice context, stable command-result reconciliation, expected letter revision and complete QA/source preconditions. |
| ASO HTTP signing route | `crates/aso-server-axum/src/routes/letters.rs`: `SignRequest` accepts a body-selected actor and passes it to the legacy service. Task 1.2 owns removal of that authority input plus matching Gate/service/database refusals. |
| ASO reassessment route | `web/src/features/evidence-timeline/api/timeline-api.ts` posts to `/api/cases/{caseId}/evidence/{entryId}/state`; no matching mounted server route was found. `use-evidence-timeline.ts` already treats capability denials as an interaction result. Task 1.3 owns the authoritative operation contract. |
| ASO PostgreSQL composition | `crates/aso-web-server/src/main.rs` mounts PostgreSQL case and authority/session facilities when configured, while evidence, criteria and letters still use memory adapters from `src/adapters/memory.rs`. Tasks 1.2–1.4 own the minimum durable clinical path and removal of memory authority from those mounted operations. |
| ASO database controls | `docs/design/schema/schema.sql`: letters carry version, approval and signature fields; the current signing trigger checks an affirmed gate and signer capability. Verified practice/principal binding, selected/current revision, QA/source completeness and durable command-result behavior remain to implement and prove. |
| ASO desktop counterpart | `desktop/src-tauri/src/lib.rs`: `sign_letter` accepts actor and calls the legacy service. RA-03 requires a shell-parity typed refusal/operation contract; native credential activation remains assigned to RA-17. |
| Deployed Gate policy | `docker/flint-gate/config.yaml`: the RA-02 clinical authorization middleware protects affirmation routes. Matching signing/reassessment policy is absent. This ASO deployment configuration is owned here; any companion `flint-gate` edit is limited to an observed generic route-hook limitation. |
| `flint-gate` | Generic Gate route-policy substrate only. It may support a matching clinical route hook, but it must not own ASO signing, revision, QA or reassessment rules. Its existing dirty work is preserved. |
| `flint-forge` | PostgreSQL substrate only. No RA-03 source edit or ASO clinical logic is assigned. Its existing dirty work is preserved. |
| `flint-realtime-fabric` | No RA-03 write. Signing and affirmation never enter realtime replay; reassessment becomes durable server state before later authorized projection work. |
| `prometheus-entity-management` | No RA-03 write, business-state ownership or dependency-pin change. PEM receives no clinical command replay responsibility. Its existing dirty work is preserved. |

The existing repository state contains extensive authorized RA-01/RA-02 work
and unrelated companion-repository work. Eligibility inspection made no source,
schema, dependency or companion-repository edits and did not reset or reformat
those changes.

## Phase gate disposition

| Gate | RA-03 disposition |
| --- | --- |
| G-PIN | No PEM adoption or pin change. Preserve the exact 4.0.0 core/react pins in `versions.toml`. |
| G-REV | No active-stream revocation deadline is certified. A letter's expected/current revision is a clinical command precondition and remains required independently. |
| G-DATA | Synthetic server fixtures only. Real PHI, persistent client data and release approval remain blocked by their later gates. |
| G-SYNC | No Electric/materializer adoption. Clinical commands commit authoritatively before later projection work. |
| G-NATIVE | Typed desktop parity/refusal is required. Credential and IPC activation waits for RA-17. |
| G-MEASURE | No browser, physical-device or performance certification is claimed. |

Gate, AppServices and PostgreSQL must each reject forged surgeon, administrator,
agent and foreign-practice attempts when the other controls are bypassed by a
synthetic harness. Signing must bind the verified principal/practice, command
payload and current approved letter revision, and require satisfied QA/source
preconditions. Reassessment must preserve exactly `met`, `gap` or `void`, write
an audit record and reconcile a lost response through the existing command
ledger without a second clinical effect. These are approved implementation and
acceptance criteria, not new speculative guards.

## Verification and scope

Actual read-only commands included `prometheus kbd status --json`, the kbd apply
driver's `list` and `progress`, SHA-256 verification of the RA-02 acceptance
inventory, repository status inspection and focused source inspection with
`rg`, `cat` and `sed`. Observed dependency output:

```text
revision=196
dependency.status=complete
dependency.implementationStatus=complete
dependency.task_count=9
dependency.completed=9
RA02 final receipt result=Passed
RA02 referenced hashes=7/7 matched
```

The driver initially registered the current task. Tasks 2 through 8 were then
registered as pending with the typed task CLI so the canonical ledger tracks the
full eight-task change. Registration is not execution. Generated projections
were not hand-edited.

The driver completed task 1 at canonical revision 198. Its progress projection
set the unfinished change to `pending`; the typed change transition restored
`in_progress` at revision 199. RA-03 is now 1/8 complete with tasks 2 through 8
pending.

This report, its JSON receipt and `canonical-status.json` are the only authored
eligibility evidence.
OpenSpec task status, generated KBD projections and append-only session memory
record the boundary. No application code, database schema, dependency, guard or
companion-repository source changed. No live services or patient data were used.
No Cargo, T1, T2 or T3 check is due for this documentation-only eligibility task.

T0 ran `python3` JSON round-trip checks across both JSON receipts and local link
checks across the Markdown report, plus `git diff --check` for whitespace. The
observed results were
`eligibility JSON round-trip: PASS`, `local Markdown links: PASS (0 missing)`
and no whitespace output. `openspec validate ra-03-clinical-command-parity
--strict --json --no-interactive` returned one passed item, zero failed items and
no issues. The first independent artifact critique found the missing retained
canonical receipt, incomplete hash inventory and omitted T0 record; this revision
corrected those findings. Its follow-up found one inaccurate evidence-file count;
that sentence was corrected, T0 was rerun and the final artifact-only critique
returned `PASS` with no actionable findings.

The uncomfortable limit: RA-02 supplies verified context, a durable command
ledger and three-layer affirmation controls, but none of those makes the current
body-selected signing path or missing reassessment endpoint safe. Revision,
QA/source, authoritative mounted storage, independent refusals, idempotent
reconciliation and the exact three evidence states remain unverified for RA-03.
