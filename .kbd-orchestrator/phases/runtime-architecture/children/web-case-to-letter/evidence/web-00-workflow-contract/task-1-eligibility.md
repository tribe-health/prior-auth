# web-00 task 1 eligibility

Date: 2026-09-16  
Phase: `runtime-architecture › web-case-to-letter`  
Change: `web-00-workflow-contract`  
Task: `1.1`

## Decision

**Eligible.** `web-00-workflow-contract` has no predecessor. The canonical KBD runtime places it first in the active web child, its OpenSpec package is valid, and this task authorizes contract evidence only. It does not authorize application behavior.

## Canonical state observed

- KBD source revision at task start: `1503`.
- Active phase: `runtime-architecture::web-case-to-letter`.
- Active change status: `web-00-workflow-contract` is `in_progress`.
- Active task status: task `1` is `in_progress`; tasks `2` through `6` are `pending`.
- Exact next work: `/kbd-apply web-00-workflow-contract`.
- OpenSpec: `openspec validate web-00-workflow-contract --strict` returned `Change 'web-00-workflow-contract' is valid`.

The compatibility `activePath.changeId` and `activePath.taskId` fields remained null at revision 1503 even though the typed change/task states were in progress. The change/task records are the evidence used here; this projection defect does not authorize editing a generated waypoint by hand.

## Dependency and ownership

- Dependency: none.
- Root agent owns this serial change, KBD transitions, OpenSpec verification, architecture consistency, and retained evidence.
- No application source is owned or edited by `web-00`.
- Contract work is confined to the web child evidence, the `web-00` OpenSpec package, `docs/architecture/**`, `docs/plan/**`, `docs/design/schema/**`, and deterministic synthetic fixture manifests.
- Tauri configuration, Tauri capabilities, Flutter/mobile, native SQLite evaluation, native runtime activation, payer transport, production deployment, and external inference are outside this change.
- Later command changes reserve thin typed Tauri wrapper names required by the repository parity contract. Plan revision 10 assigns wrapper implementation to RA19 and RA21 after web-17. Browser behavior remains the sole acceptance surface for this child.

## Frozen gates confirmed before edits

1. The browser workflow is delivered before native work resumes. `ra-19` and `ra-21` remain pending; child Tier 2 runs only in `web-17`.
2. `criteria` is the canonical criterion relation. Legacy `policy_criteria` data migrates into it as published data; new legacy writes are refused and only a read-compatible bridge remains.
3. Evidence retains `met`, `gap`, and `void` as distinct states with their distinct coordinator/surgeon actions.
4. Every assertion included in an external letter requires a backing document, page, and effective or service date. Documentless annotations, verbal statements, derived statements, peer statements, or criteria text can guide work but are excluded as assertions.
5. Clinical authority remains independently enforced at Gate policy, shell-neutral `AppServices`, and PostgreSQL. Request-body identity does not grant authority; administrator and agent principals cannot inherit surgeon authority.
6. Durable domain state remains in Postgres and the authorized PEM projection. Scoped Zustand stores hold transient interaction state. No query cache is introduced.
7. Every new replicated relation requires an explicit lane, privacy class, exact column allowlist, tenant predicate, revocation behavior, migration, and rollback decision before publication. Unknown remains local and is structurally refused.
8. New effects use additive migrations, least-privilege functions, stable command identity, retry reconciliation, and typed HTTP/Tauri refusal parity while keeping `aso-host` shell-neutral.
9. Fixtures contain synthetic data only. Real patient data is forbidden from fixtures, tests, logs, and commits.
10. This change runs documentation/OpenSpec checks only. Focused implementation checks belong to their implementation changes; the complete local stack and actual browser run wait for `web-17`; CI is never test evidence.

## Commands and observed output

```text
cat .kbd-orchestrator/current-waypoint.json
sourceRevision=1501; active child=web-case-to-letter; exactNextCommand=/kbd-apply web-00-workflow-contract

prometheus kbd status --json
revision=1503; web-00 status=in_progress; task 1=in_progress; tasks 2-6=pending

openspec validate web-00-workflow-contract --strict
Change 'web-00-workflow-contract' is valid

rg -n "RoutePlaceholder|route-placeholder|Placeholder" web/src/app/routes --glob '*.tsx'
case queue, intake, policy, pathway, surgeon gate, submission, receipt, and peer-to-peer routes still resolve through RoutePlaceholder
```

## Exit

Task 1.1 may close. Task 1.2 must define the exact matrices and downstream inputs/outputs before architecture documents or fixture manifests are written.
