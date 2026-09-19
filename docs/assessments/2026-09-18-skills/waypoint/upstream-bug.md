# kbd-runtime: `exactNextCommand` is stored, not derived, and goes stale at every change boundary

**Component:** `prometheus-skill-pack/substrate/kbd-runtime` (`src/lib.rs`)
**Observed in:** Prior Authorization Workbench, project `0e0821e7-baa6-41b2-9b15-beaa40e0f40b`, revisions 1530–1699
**Severity:** Medium. No data loss. Misdirects any agent or operator that trusts the waypoint.

## Symptom

`current-waypoint.json`, `position.json` and `position-reminder.txt` are regenerated on every transition and report:

```json
"change": null, "currentTask": null, "status": "ready",
"exactNextCommand": "/kbd-apply web-01-case-command-core"
```

At the same revision, `phases/runtime-architecture/children/web-case-to-letter/progress.json` reports web-00…web-05 DONE and `web-06-criteria-catalog-core` IN_PROGRESS at 5/7 tasks. Both files carry the same `sourceRevision` and `derivedRevision`.

## Cause

`src/lib.rs:5118` writes `"exactNextCommand": state.exact_next_work`, a stored `Option<String>`. `self.exact_next_work` is assigned only at L1803 (`RunInitialized`), L1816 and L1828 (`CheckpointCreated`, `PauseCheckpointed`), L1845 (`PlanRevised`) and L2022 (`ActivePathChanged`). The `ChangeTransitioned` (L1959) and `TaskTransitioned` (L1993) folds never touch it.

Change status is derived on every fold (`recalculate_change`, L2435). The next-command field is the one projection value that is not, so it freezes at whatever the last plan revision or path change set. In this project it was last written at revision 1530 (`plan_revised`, 9→10) and has replayed unchanged for 169 revisions. `change` and `currentTask` are null because the last `active_path_changed` (rev 1499) carried `changeId: null`.

The canonical log is healthy: replaying `task_transitioned` events alone reproduces `progress.json` exactly.

## Second instance of the same pattern

`boundary_receipt_recorded` obligations close only on an explicit matching `after` edge. 13 of 14 open obligations in this project are leaked `before` edges; three are phase-level and can never close under normal operation. `shared/scripts/kbd-harness-adapter.sh:83` (`render_reanchor`) prints all of them at every session start.

## Consumers affected

- `kbd-apply` SKILL.md:38 — `CHANGE="<active change id from the waypoint>"`. Followed literally, this re-applies a DONE change. Highest risk.
- `kbd-status` SKILL.md:185 — narrates the next step from `exactNextCommand`.
- `kbd-harness-adapter.sh` `render_reanchor()` — prints `Exact next work:` and the phantom boundaries.
- Generated project hook `.claude/hooks/reanchor.sh:17` selects `{phase, task, waypoint}`. `task` and `waypoint` do not exist in waypoint schemaVersion 5, so it prints nulls. This is a separate, smaller defect in the `prometheus-context-bootstrap` template.

## Proposed fix

1. At L5118, and L5161–5164 for the reminder, derive the value: the first change in plan order for the active phase whose `implementation_status != Complete`, rendered as `/kbd-apply <id>`. Fall back to the stored string only when the active phase has no registered changes. Derive `change` and `currentTask` the same way from the in-progress task.
2. Boundary obligations: close a `before` edge when a later `before` edge is recorded for a sibling subject at the same scope, or filter obligations older than the active change in `render_reanchor()`.
3. `kbd-apply` SKILL.md:38: read the active change from `progress.json` `changes[]`.
4. `reanchor.sh` template: select `{phase, change, currentTask, exactNextCommand}`.

## Regression test

Register two changes. Complete every task of the first through `transition_task` only, with no `set_active_path` and no `revise`. Assert the waypoint's `exactNextCommand` names the second change.

## Workaround

`prometheus kbd revise --reason "…" --exact-next-work "/kbd-apply <current change>"` at a change boundary. It appends one auditable event and drifts again at the next boundary.

## Caveat

The crate tree read is dated Aug 30; the installed binary is dated Sep 16. `strings` on the binary shows the same field names and no next-command selector, and the observed data matches this source. Build provenance was not proven.
