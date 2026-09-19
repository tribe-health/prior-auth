# Root-cause trace: stale `exactNextCommand` in KBD waypoint projection

**Verdict: logic bug in the runtime (upstream), NOT data corruption in this repo.**
The canonical event log is complete, correct, hash-chained and signed. The bug is
that `exactNextCommand` is a *stored* string, while every other projection field is
*derived*. Nothing in the work-completion path ever writes it.

## 1. Runtime location

| Thing | Path |
|---|---|
| Binary | `/Users/gqadonis/.local/bin/prometheus` (Mach-O arm64, 39,449,680 b, Sep 16 18:54) |
| **Source (found)** | `/Users/gqadonis/Projects/prometheus/prometheus-skill-pack/substrate/kbd-runtime/src/lib.rs` (9,867 lines) |
| Canonical store | `~/Library/Application Support/prometheus/kbd/projects/0e0821e7-baa6-41b2-9b15-beaa40e0f40b/` |
| Event log | `.../replicas/e9a7936c-.../events.jsonl` — 1,699 lines = 1,699 revisions |
| CRDT doc | `.../project.loro` (3.2 MB), + 1,702 signed fold checkpoints |

Source **was** available — no `strings` inference needed for the core finding.

## 2. The defect, in source

`src/lib.rs:5118` — the waypoint writer:
```rust
"exactNextCommand": state.exact_next_work,
```
Verbatim copy of a stored field. `position-reminder.txt` uses the same value at
`src/lib.rs:5161-5164`.

`state.exact_next_work` is mutated by **exactly four** event folds:
- `RunInitialized` (L1803)
- `CheckpointCreated` (L1816) / `PauseCheckpointed` (L1828)
- `PlanRevised` (L1845)
- `ActivePathChanged` (L2022; re-verified by the root session: assignments to `self.exact_next_work` exist only at L1803, L1816, L1828, L1845, L2022)

`ChangeTransitioned` (L1959) and `TaskTransitioned` (L1993) **do not touch it**.
Confirmed at the command→event mapping (L7265-7312): `ChangeTransition`,
`TaskTransition` and `ActivePathSet` are three independent commands. The public
API `transition_task` (L4618) and `set_active_path` (L4657) are separate calls;
completing a task never implies the other.

By contrast `change.status` **is** derived, `recalculate_change` (L2435):
```rust
change.implementation_status =
    if change.tasks.values().all(|task| task.status.is_terminal()) { WorkStatus::Complete }
    ...
change.status = change.implementation_status.clone();
```
That asymmetry is the whole bug: `progress.json` recomputes from tasks every fold;
`exactNextCommand` is frozen until someone explicitly re-sets it.

## 3. Evidence from the canonical log

`exact_next_work` was last written at **revision 1530**, `plan_revised`,
2026-09-17T03:44:06 (planRevision 9→10):
```json
{"from_revision":9,"to_revision":10,
 "reason":"Operator course correction: complete and certify the browser case-to-letter workflow end to end before any further Tauri/native or mobile implementation...",
 "superseded_next_work":"/kbd-apply web-00-workflow-contract",
 "exact_next_work":"/kbd-apply web-01-case-command-core"}
```
That string has been replayed unchanged into every projection for **169 revisions**.
No event after 1530 carries `exact_next_work` at all (verified by scanning all 1,699).

`active_path_changed` — the only event that sets `changeId` *and* `exact_next_work`
together — was last emitted at **revision 1499** (2026-09-16T23:40:28) with
`changeId: null`, `taskId: null`. That is why `current-waypoint.json:24-25` reads
`"change": null, "currentTask": null` while work is live.

Meanwhile task events are perfectly current — rev 1698 (2026-09-18T18:07:38)
transitions `web-06-criteria-catalog-core` task `5` → `in_progress`.

### Replaying task events alone reproduces progress.json exactly
| change | tasks complete | matches progress.json |
|---|---|---|
| web-00 | 6/6 | DONE ✓ |
| web-01 | 7/7 (6 complete + 1 cancelled) | DONE ✓ |
| web-02 | 6/6 | DONE ✓ |
| web-03 | 7/7 (6 + 1 cancelled) | DONE ✓ |
| web-04 | 6/6 | DONE ✓ |
| web-05 | 7/7 | DONE ✓ |
| web-06 | 5/7 (1 in_progress, 1 pending) | IN_PROGRESS, tasks_done 5 ✓ |
| web-07…17 | 0/6-7 | PENDING ✓ |

**The canonical store is not corrupt.** `progress.json` is a faithful derivation.

## 4. Hypotheses tested and RULED OUT

- **ID-form mismatch** (`web-01-…` vs `runtime-architecture::web-case-to-letter::web-01…`) — ruled out. All 18 `change_registered` events (rev 1369-1386) use the short form, identical to the form in task events and progress.json.
- **Parent/child phase confusion** — ruled out. `phase_id` is consistently `runtime-architecture::web-case-to-letter` on every web-* event.
- **Stale plan-revision snapshot of change statuses** — ruled out. `plan_revised` carries no change statuses, only two strings.
- **Completion via OpenSpec archive the selector doesn't read** — ruled out. Completion flows through `task_transitioned`, which the selector also doesn't read, because *there is no selector*.
- **Counter arithmetic wrong** — ruled out. 41/57 is correct: parent 20/24 + web-case-to-letter 6/18 + ra06a 3/3 + ra06b 4/4 + legacy web-ui-architecture 8/8 = 41/57, consistent with `phase_implementation_counts` (L2499) honouring `legacy_completion_baseline`.

Interesting corroborating detail: across all 1,699 events only **four**
`change_transitioned → complete` events exist (ra06c-02, ra-14, ra-15, web-05).
Every other DONE change is DONE purely by task derivation — further proof that
change-level transitions are an optional, rarely-used path, and that anything
keyed off them (as `exact_next_work` effectively is, via manual `ActivePathSet`)
will drift.

## 5. "Outstanding boundaries" — the same class of bug, second instance

Emitter: `prometheus-skill-pack/shared/scripts/kbd-harness-adapter.sh:83`, in
`render_reanchor()`, which shells `prometheus kbd status --json` and renders
`.outstandingBoundaryObligations | map(.value.exactSignal)`.

Replaying `boundary_receipt_recorded` pairing `edge:before` against `edge:after`
yields **14 never-closed obligations**, exactly matching the reported text:

| rev | subject | signal (truncated) |
|---|---|---|
| 4 | phase `web-ui-architecture::pem-refresh-3-3-0` | Starting phase 1 out of 1 |
| 51 | phase `runtime-architecture` | Starting phase 2 out of 2 |
| 448 | task 1.1 Amend parent RA06… | Starting task 1 out of 7 |
| 451 | task 1.2 migrations… | Starting task 2 out of 7 |
| 1365 | phase `runtime-architecture::web-case-to-letter` | Starting phase 3 out of 3 |
| 1555 | task `web-01-case-command-core/3.1` | Starting task 6 out of 7 |
| 1605 | task `web-03-…/2.1` | Starting task 5 out of 7 |
| 1651 | task `web-05-…/4` | Starting task 4 out of 6 |
| 1674 | task `web06-eligibility` | Starting task 2 out of 7 |
| 1699 | task `web-06-criteria-catalog-core/5` | Starting task 6 out of 7 (legitimately open) |
| + 4 older RA-era task obligations | | |

Only rev 1699 is genuinely open. The other 13 are leaked `before` edges whose
`after` edge was never appended — same root pattern: a state field maintained by
explicit paired writes rather than derived, so any missed write leaks forever.
Note the phase obligations at rev 4/51/1365 can never close under normal operation.

## 6. Where the Codex agent already noticed

It diagnosed this **eight days before** the current symptom.

`.prometheus/session-log.md:1327` (2026-09-10, RA06c-01):
> "Child progress is authoritative at 1/4 changes complete. The generated
> current-waypoint exactNextCommand remains stale at ra06c-01 even though
> canonical transition rejected Complete-to-Complete and child progress marks it
> DONE. The next pending change is ra06c-02-distributed-gate-fence."

`.kbd-orchestrator/phases/runtime-architecture/children/web-case-to-letter/evidence/web-06-criteria-catalog-core/task-1-eligibility.md:13`:
> "The generated `exactNextWork`/`exactNextCommand` projection still points at
> Web-01 even though the detailed canonical changes show Web-01 through Web-05
> complete. Detailed canonical task state and the reviewed child plan govern this
> task; the stale shortcut is not used to select work."

`.prometheus/gotchas.md:486`:
> "The top-level waypoint can still show `currentTask: null` while the canonical
> task and phase task projection show `IN_PROGRESS`; use the canonical status and
> hook log as the task-boundary evidence in that case."

`.prometheus/gotchas.md:104` (and `:71`, `:239`):
> "Do NOT hand-edit `current-waypoint.json` to make the counters look right — it is
> the position record, and `.claude/settings.json` denies Edit on it for that reason."

So the live agent is **correctly ignoring the stale field** and steering from
`progress.json`. That materially lowers the operational risk.

## 7. Hook / consumer risk

- `.claude/hooks/reanchor.sh` (repo SessionStart hook) reads `current-waypoint.json` but only prints `jq -c '{phase, task, waypoint}'` — **none of those keys exist** in schemaVersion 5, so it emits `{"phase":"runtime-architecture","task":null,"waypoint":null}`. It never surfaces `exactNextCommand`. Low risk, but it is silently broken against the current schema.
- `kbd-harness-adapter.sh` `render_reanchor()` prints `Exact next work:` and the boundary list from the CLI — **this is the one that shows the stale command and the 13 phantom boundaries.**
- `kbd-status` SKILL.md:59-82 prefers `position.json`, falls back to waypoint; SKILL.md:185 derives its narrative from `exactNextCommand` → will report the wrong next change.
- `kbd-apply` SKILL.md:38 says `CHANGE="<active change id from the waypoint>"` → **this is the dangerous one**: `change` is `null` and `exactNextCommand` says `web-01-case-command-core`, so a naive operator or agent following the skill literally would re-apply an already-DONE change.

`hooks.log.jsonl` (1,047 lines) is healthy: 1,046 entries `status: 0`; one
`status: 124` (timeout) at 2026-09-15T08:06:26 on `kbd-memory-log` for
`ra-12-public-auth-startup:5` — unrelated to this defect. Last entries at
2026-09-18T18:07:41 correctly log `web-06-criteria-catalog-core:5`.

## 8. Remediation

### MUST NOT do while the Codex loop is live
- Do **not** hand-edit `current-waypoint.json`, `position.json` or `position-reminder.txt`. They are unconditionally regenerated (`src/lib.rs:5134-5139` explicitly documents that this file is *not* clobber-protected), so edits are discarded; and `.claude/settings.json` denies Edit on them by policy.
- Do **not** run `prometheus kbd phase activate|transition|revise` right now. Each appends a signed event at `expected_revision`, which races the live agent's `end-task` and can force an `InvalidTransition` / optimistic-concurrency failure mid-task.
- Do **not** delete or rewrite `events.jsonl` — it is hash-chained (`previousHash`/`integrityHash`) and Ed25519-signed; any edit invalidates the chain.

### Safe, legitimate fix (after the current task closes)
One command, appends one event, no history rewrite:
```
prometheus kbd revise \
  --reason "Realign exactNextWork with derived change state: web-00..web-05 DONE, web-06 IN_PROGRESS" \
  --exact-next-work "/kbd-apply web-06-criteria-catalog-core"
```
Or, to also fix the null `change`/`currentTask`, `prometheus kbd phase activate
--id runtime-architecture::web-case-to-letter --exact-next-work ...`. Both are
supported operator paths and leave an auditable plan revision.
This is a **data patch for a logic bug** — it will drift again at the next change boundary.

### Real fix (upstream, `substrate/kbd-runtime/src/lib.rs`)
Either:
1. Derive it — replace `"exactNextCommand": state.exact_next_work` (L5118) with a computed "first change in plan order whose `implementation_status != Complete`", falling back to the stored string only when no changes exist; **or**
2. Maintain it — have the `TaskTransitioned` / `ChangeTransitioned` folds advance `active_path` and `exact_next_work` when a change completes (mirroring what `recalculate_change` already does for status).

Option 1 is smaller and matches the existing derived-projection contract.
Separately, the boundary-obligation leak needs either auto-close on the matching
`after` edge at a higher scope, or a staleness filter in `render_reanchor()`.

## 9. Fact vs inference

**Fact** (read directly): all source line numbers and quotes; all event revisions,
timestamps and payloads; the 14 unclosed obligations; the task-replay table; the
Codex quotes; the hook contents; CLI help output.

**Inference**: that the binary at `~/.local/bin/prometheus` was built from this
exact source tree — the crate dir is dated Aug 30 and the binary Sep 16, so the
binary may be newer. The behaviour observed in the data is *fully consistent* with
this source, and `strings` on the binary confirms the same field names
(`exactNextCommand`, `exactNextWork`, `position-reminder.txt`, the full `EventKind`
list) and no additional next-command-selector symbols. Confidence high but not
absolute.
