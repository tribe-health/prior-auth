# Interim mitigation — prior-auth, while the Codex loop is live

1. **Authority.** `children/web-case-to-letter/progress.json` `changes[]` selects the next change. The waypoint's `exactNextCommand`, `change` and `currentTask` are not used to select work. Codex already does this (`evidence/web-06-criteria-catalog-core/task-1-eligibility.md:13`).
2. **Do not** hand-edit `current-waypoint.json`, `position.json` or `position-reminder.txt`. They are regenerated unconditionally, and `.claude/settings.json` denies the edit.
3. **Do not** run `prometheus kbd phase activate|transition` or `prometheus kbd revise` while a task is open. Each appends at `expected_revision` and can race the agent's `end-task`.
4. **Optional, at a change boundary only** (Codex idle, no task in progress), the operator may run once:

   ```bash
   prometheus kbd revise --reason "Realign exactNextWork with derived change state" --exact-next-work "/kbd-apply <the change about to start>"
   ```

   The flag names come from `prometheus kbd revise --help`. The command was not run during this trace. It realigns the pointer for one change and drifts again at the next boundary, so it is cosmetic unless a human reads the reminder.
5. **Ignore** the 13 phantom "Outstanding boundaries" in the session-start text. Only the entry for the active task is real.
6. File `upstream-bug.md` against kbd-runtime. The course-correction prompt (§0) already tells Codex not to act on the pointer and to log the gotcha.

Nothing in this directory was produced by running a KBD command, and nothing under `.kbd-orchestrator/` was written.
