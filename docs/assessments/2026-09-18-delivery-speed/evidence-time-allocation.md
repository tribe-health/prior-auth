# Evidence: where the time goes in the web-case-to-letter KBD loop

Scope: read-only evidence, no opinions about what to change. Repo `/Users/gqadonis/Projects/TribeHealth/kevin/prior-auth`. Nothing in the repo was modified; no build, test, `prometheus` or `openspec` command was run. All times are local CDT (transcript timestamps are UTC, converted at UTC-5).

## 0. Sources and method

| Source | Path |
|---|---|
| Root Codex session (all orchestration, edits, tests) | `~/.codex/sessions/2026/09/06/rollout-2026-09-06T01-55-57-01a075ee-75c6-7bd2-9e6e-eab5766a44a1.jsonl` (1.13 GB; session began Sep 6, so it is **not** under the `09/16..18` folders) |
| Critic / judge / mapper subagent sessions for this repo | `~/.codex/sessions/2026/09/{16,17,18}/rollout-*.jsonl` whose `session_meta.payload.cwd` ends in `kevin/prior-auth` (52 spawned in the web window). Other files in those folders belong to `flint-realtime-fabric`, `universal-agent-runtime`, `ssr-workspace` and were excluded. |
| KBD child phase | `.kbd-orchestrator/phases/runtime-architecture/children/web-case-to-letter/` (`plan.md`, `tasks.md`, `execution.md`, `progress.json`, `evidence/`, `review/`) |
| macOS power log | `pmset -g log` (sleep / dark-wake entries) |
| Working files for this analysis | `scratchpad/assess/timealloc/` (`ta_events.jsonl`, `analysis.json`, `rollup.json`, `roles.json`, `subagents.json`, `classify2.py`, `analyze.py`) |

Record schema used: `event_msg/item_completed` items of type `CommandExecution` carry `command`, `status`, `exit_code` and `duration {secs,nanos}`; `FileChange` items are `apply_patch` results with per-file diffs; `function_call wait_agent` → `function_call_output` brackets time blocked on a subagent; `event_msg/token_count.info.last_token_usage` is per-request token usage; `compacted` / `ContextCompaction` mark context compactions; `task_started` / `task_complete` bracket turns.

Analysis window ("web window"): **Sep 16 18:09:25** (operator's web-first goal is set, `thread_goal_updated`) → **Sep 18 12:55** (last record when sampled) = **42.77 h**.

Wall-clock attribution method: command intervals `[end − duration, end]`, subagent waits, and machine-sleep intervals were swept with a priority order (asleep > tests > build > LLM judge > subagent wait > refiner/packet > KBD CLI > evidence write > process read > source read > poll). Time covered by none of these is model inference/turnaround; it is attributed to the category of the **next** action the model emitted (so the thinking before an `apply_patch` counts as editing). Command classification is regex-based (`classify2.py`); a tests run whose output is `tee`'d into an evidence file is counted as tests, not bookkeeping. Classification is heuristic; spot checks were done per category but individual commands can be misfiled.

A correction to the brief: `review/findings-final96…106-*.json` are **not** plan-review rounds. Every one names `web-03-administering-entity-resolution` as its artifact, and their creation times (Sep 17 10:50 → Sep 18 02:40) fall inside web-03 task 3.1. The number is the count of frozen source snapshots in the refiner manifest (96 → 136), not a round index.

## 1. Per change, web-00 … web-06

Boundaries are the first successful `kbd-apply.sh begin-task <change> 1` and the `archive <change>` call in the root transcript. Evidence/review counts are files on disk.

| Change | Start → archive (CDT) | Wall | Active (excl. sleep/gaps) | Tasks | Evidence files | Review files | Verdict rounds persisted (BLOCK) | Critic/judge subagents | Persisted findings: product code / evidence-process |
|---|---|---|---|---|---|---|---|---|---|
| planning (assess+plan+18 OpenSpec changes) | 09-16 18:09 → 18:40 | 0h31 | 46 min | – | – | 2 | 2 artifacts × 2 rounds each | 5 (3 mappers, 2 critics) | resolved findings: 4 + 7 |
| web-00 workflow-contract (docs/fixtures only) | 09-16 18:41 → 22:38 | 3h57 | 228 min | 6 | 5 | 3 | 1 REST verdict (PASS); REST judge "unavailable" twice | **13** fresh critics (`artifact_critic_web00` … `_pass10`) | not persisted per round; agent messages report findings in at least 9 of the 13 rounds |
| web-01 case-command-core | 09-16 22:43 → 09-17 01:54 | 3h11 | 180 min | 7 (1 dup skipped) | 27 | 28 | 10 (6) | 3 | 11 / 1 |
| web-02 case-publication-ui | 09-17 01:55 → 03:38 | 1h43 | 104 min | 6 | 18 | 12 | 6 (5) | 1 (+1 mapper) | 7 / 4 |
| web-03 administering-entity | 09-17 03:39 → 09-18 02:45 | **23h06** | **689 min** (630 min machine asleep, 68 min unexplained gap) | 7 (1 dup skipped) | 74 | 35 + 15 top-level `findings-final*` = 50 | **32 (17)** | **27** | 14 / 16 |
| web-04 document-upload-core | 09-18 02:46 → 06:17 | 3h31 | 212 min | 6 | 69 | 7 | 4 (2) | 2 | 4 / 3 |
| web-05 document-processing-ui | 09-18 06:18 → 10:58 | 4h40 | 282 min | 7 | 60 | 19 | 6 (5) | 0 | 5 / 3 |
| web-06 criteria-catalog-core | 09-18 11:00 → in progress | 1h55 so far | 115 min | 7 (4 done) | 15–18 | 0 | – | 0 | – |

Notes.
- "Findings causing rework": every BLOCK round was followed by a repair and a new packet/freeze. BLOCK rounds: web-01 6, web-02 5, web-03 17, web-04 2, web-05 5 = **35 persisted BLOCK rounds**, plus the web-00 critic rounds that are not persisted as files.
- Product-code vs evidence-process split is a keyword/path heuristic over finding titles. Evidence-process examples (verbatim titles): "The review packet shows required focused verification and completion evidence criteria are still unsatisfied" (web-01 pass5); "The retained verification does not satisfy the blocking build-passes constraint because it omits the required workspace build, web build, and Flutter analyze command" (web-03 pass3); "The frozen packet does not prove that the case-summary publication boundary stayed narrow" (final104). Product-code examples: "Idempotent resolve-command retries return the stored receipt before re-authorizing access to the target case" (web-03 pass9); "The case-summary migration cannot be applied to an existing replica … NOT NULL columns without defaults" (web-02 pass2). Some "code" findings were treated by the agent as false positives (e.g. PostgreSQL < 17 `MAINTAIN` against a project pinned to PG 18; web-03 pass11).
- Subagent cost (this repo only, web window): planning 5 agents / 25 min / 8.8 M input tokens; web-00 13 / 79 min / 42.8 M; web-01 3 / 41 min / 7.3 M; web-02 2 / 5 min / 2.2 M; **web-03 27 / 618 agent-minutes / 61.3 M**; web-04 2 / 61 min / 4.1 M (`timealloc/subagents.json`; two web-03 agents span the machine sleep, so their minutes are inflated).

### Active minutes by task role (from `kbd-apply` task windows)

Task roles: `1.1` dependency/ownership gate; `1.2–1.4` implementation (each carries its own "; verify …" clause); `2.1` "focused T0/T1 + sabotage-and-restore + artifact-refiner + adversarial review"; `3.1` "record commands/outputs, confirm callers, mark complete".

| Change | planning | 1.1 gate | 1.2–1.4 implementation | 2.1 verify + review gate | 3.1 closure | active total |
|---|---|---|---|---|---|---|
| planning | 46 | | | | | 46 |
| web-00 | | 3 | 34 | **184** | 8 | 228 |
| web-01 | | 10 | 50 | **107** | 12 | 180 |
| web-02 | | 7 | 56 | 35 | 6 | 104 |
| web-03 | | 6 | 58 | **298** | **328** | 689 |
| web-04 | | 4 | 116 | 87 | 4 | 212 |
| web-05 | | 6 | 191 | 79 | 7 | 282 |
| web-06 (open) | | 7 | 108 | 0 | 0 | 115 |
| **All** | 46 | 43 | **612** | **790** | **365** | **1,856 min (30.9 h)** |
| **%** | 2.5 % | 2.3 % | **33.0 %** | **42.5 %** | **19.7 %** | |

web-03's 328 "closure" minutes were not record-keeping: task 3.1 was open from 09-17 09:41 to 09-18 02:45 while nine further freeze → fresh critic + fresh judge rounds ran (final82 … final106). Counting it with 2.1, **62 % of active time sat in the per-change verify/review/closure tasks and 33 % in the implementation tasks.**

## 2. Planning-phase cost and "Plan revision 10"

- Planning ran **09-16 18:09 → 18:40 (31 min wall, 46 active minutes including registration)**: three read-only mapper subagents (`web_e2e_domain_map`, `web_e2e_ui_map`, `web_e2e_plan_audit`), `assessment.md` (critic: 2 rounds, 4 resolved findings — `review/assessment/findings.json`), `plan.md` (critic: 2 rounds, 7 resolved findings — `review/plan/findings.json`), two sycophancy screens (`sycophancy/assess-…231338Z.json`, `plan-…232303Z.json`), and all 18 OpenSpec changes with proposal/spec/design/tasks (agent message 18:34: "`openspec validate --strict` passed for every change"). So: **4 plan-stage review rounds in ~30 minutes before any code.** Planning itself was cheap.
- The first `begin-task web-00 1` failed at 18:41 and succeeded at 18:54 ("The orchestration defect is resolved", agent message 18:56): ~13 min on KBD task registration.
- "Plan revision 10" is **not** ten revisions of this plan. `planRevision` is a project-wide counter in `.kbd-orchestrator/current-waypoint.json` (`"planRevision": 10`); values 1–9 already appear in the transcript on Sep 6. Inside this child phase exactly **one** `prometheus kbd revise --reason …` was executed (09-16 22:44): "Operator course correction: complete and certify the browser case-to-letter workflow end to end before any further Tauri/native or mobile implementation…". That single revision rewrote the 17 remaining OpenSpec changes to HTTP-only (agent message 22:50). What drove revisions 1–9 cannot be determined from the Sep 16–18 window; the KBD journal that would show it was not located (`.prometheus/events.jsonl` has 4 unrelated rows).
- The expensive "plan-like" review was **web-00**, a contracts/fixtures-only change with "no application behavior" (`plan.md` web-00 scope line): 228 active minutes, of which 184 were task 2.1, with 13 fresh critic sessions (42.8 M subagent input tokens) between 19:37 and 22:32.

## 3. Command classification, web window (root session)

3,975 shell commands (251 failed), 688 `apply_patch` events, 132 `wait_agent` calls, 41 context compactions, 58 turns. (Full Sep 16 00:00 → Sep 18 12:55, including the RA16–RA18 work earlier on Sep 16: 5,455 commands, 893 patches; split is nearly identical and is in the last table of this section.)

| Category | Commands | % of count | Summed command duration | % of duration |
|---|---|---|---|---|
| (a) source reading/searching (`sed -n`, `rg`, `nl`, `git diff/status`) | 1,246 | 31.3 % | 4.5 min | 0.5 % |
| (b) editing via shell (heredoc/`cat >`), excl. apply_patch | 29 | 0.7 % | 0.3 min | 0.0 % |
| (b) `apply_patch` events (no duration recorded) | 688 | – | – | – |
| (c) build/typecheck/lint (`cargo check/clippy/fmt`, `tsc`, lint, `py_compile`) | 364 | 9.2 % | 90.6 min | 10.5 % |
| (d) tests (`cargo test`, vitest, `scripts/test-web*.py`, docker/psql) | 552 | 13.9 % | **639.9 min** | **73.8 %** |
| (e) KBD/OpenSpec CLI (320), evidence writing (16), reading plans/tasks/waypoint/skill files (761) | 1,097 | 27.6 % | 40.6 min | 4.7 % |
| (f) review: LLM judge dispatch via `secrets.env` + `dispatch-judge.sh` (84), refiner/packet/manifest/validate (491) | 575 | 14.5 % | 57.9 min | 6.7 % |
| (g) polling (`sleep 30; pgrep …`, `ps`) | 112 | 2.8 % | 32.8 min | 3.8 % |

Within (d): 210 test commands (27,396 s) wrote straight into an evidence file; 113 used `--install-mode fresh` (24,118 s) and 45 `--install-mode upgrade` (4,067 s); 41 test commands were sabotage/red/restore runs (2,427 s). 71 commands of any category mention sabotage/red-control.

`apply_patch` file touches by class: process artifacts (`.kbd-orchestrator`, `openspec/`, `.refiner`) **384**; product code 269; test code 232; docs/contracts/fixtures 157; other 7. Diff bytes: process 662 KB, product 590 KB, test 476 KB, docs 298 KB. **Product code is 26 % of patched-file touches and 29 % of diff bytes.**

### Non-overlapping wall-clock split of the 42.77 h window

| Bucket | Minutes | % of window | % of active (1,856 min) |
|---|---|---|---|
| Machine asleep (pmset: 09-17 11:44 → 23:06) | 630 | 24.5 % | – |
| Unexplained gaps > 10 min with no records (mainly 09-17 23:10 → 09-18 00:06 after wake) | 80 | 3.1 % | – |
| Tests running + polling + thinking that led to a test | 700 | 27.3 % | **37.7 %** |
| Review: judge dispatch, refiner/packet work, blocked on critic/judge subagents, thinking that led to them | 320 | 12.5 % | **17.2 %** |
| Writing code/docs/tests (inference before `apply_patch` + shell edits) | 308 | 12.0 % | 16.6 % |
| KBD/OpenSpec CLI, evidence writing, reading process artifacts | 210 | 8.2 % | 11.3 % |
| Reading/searching source | 172 | 6.7 % | 9.3 % |
| Build/typecheck/lint | 142 | 5.5 % | 7.7 % |

Of the active time, **55,336 s (15.4 h) is commands/subagents executing and 56,036 s (15.6 h) is model inference/turnaround.** 5,278 root-session model requests in the window → **10.6 s mean turnaround per request**, at a median context of 159 K tokens (p90 220 K, window 258 K).

### Tokens (from `token_count.info.last_token_usage`, summed per local day)

| Day | Root input | of which cached | Root output (reasoning) | Requests | Subagent input | Subagent output |
|---|---|---|---|---|---|---|
| Sep 16 (full day, incl. RA16–18) | 452.2 M | 445.7 M | 1.22 M (0.31 M) | 2,945 | 69.9 M | 0.28 M |
| Sep 17 | 309.0 M | 304.5 M | 0.76 M (0.20 M) | 1,957 | 40.1 M | 0.22 M |
| Sep 18 (to 12:55) | 354.4 M | 349.6 M | 0.72 M (0.18 M) | 2,327 | 34.8 M | 0.18 M |

Web window only: root 814.9 M input (98.6 % cached), 2.02 M output; this-repo subagents 126.5 M input, 0.60 M output. Subagent figures exclude the other repos' sessions in the same folders.

Compactions: **41 in 42.8 h** (one per ~27 active minutes). Every compaction's `replacement_history` retains 72 user-role items, the last real one being the Sep 16 18:01 message "Provide a complete status of phases, changes, and tasks…". **24 turns ended with a full status report within 15 minutes after a compaction (5,306 s = 88 min total; median ≈ 155 s each)**, and the agent itself classifies them as "a status-only turn, so it made no goal progress" (agent messages 09-17 04:46, 08:11).

## 4. Slowest commands and repeated expensive commands

Top 15 by duration (root session):

| When | Dur | Status | Task | Command (abbrev.) |
|---|---|---|---|---|
| 09-17 06:36 | 1,340 s | failed | web-03:5 | `test-web03-resolution-service.py --install-mode fresh` |
| 09-17 13:24 | 1,114 s | failed | web-03:6 | same, fresh (ran inside the machine-sleep block) |
| 09-17 08:38 | 1,039 s | failed | web-03:5 | same, fresh |
| 09-18 08:42 | 1,038 s | failed | web-05:3 | `cargo test -p frf-gateway --test shape_projection_grant && cargo test -p frf-app …` |
| 09-17 19:45 | 807 s | failed | web-03:6 | `docker compose exec -T db psql …` (OrbStack engine not answering; restarted at 21:09) |
| 09-17 10:24 | 788 s | ok | web-03:6 | web03 service, fresh |
| 09-18 00:21 | 740 s | ok | web-03:6 | web03 service, fresh |
| 09-17 06:56 | 631 s | ok | web-03:5 | sabotage script: back up migration, weaken, run probe, restore |
| 09-18 09:45 | 603 s | failed | web-05:5 | `test-web05-document-status-projection.py --install-mode fresh` |
| 09-17 07:17 | 591 s | failed | web-03:5 | web03 service, fresh |
| 09-18 09:55 | 584 s | ok | web-05:5 | web05 status projection, fresh (rerun) |
| 09-18 06:00 | 572 s | ok | web-04:5 | `test-web04-document-upload-service.py --install-mode fresh` |
| 09-17 22:26 | 566 s | failed | web-03:6 | web03 service, fresh |
| 09-17 07:51 | 553 s | ok | web-03:5 | `cargo fmt --check && ` web03 service, fresh |
| 09-17 10:34 | 543 s | ok | web-03:6 | web03 service, upgrade |

Repeated expensive commands (normalized, output paths stripped):

| Command | Runs | Total | Failed |
|---|---|---|---|
| `scripts/test-web03-resolution-service.py --install-mode fresh` | **49** | **14,319 s (3.98 h)** | 24 |
| `cargo check -p aso-web-server` | 26 | 2,521 s | 4 |
| `scripts/test-web05-document-processing-service.py --install-mode fresh` | 9 | 2,501 s | 8 |
| `scripts/test-web04-document-upload-service.py --install-mode fresh` | 9 | 1,979 s | 3 |
| `scripts/test-web03-resolution-service.py --install-mode upgrade` | 16 | 1,898 s | 0 |
| `scripts/test-web05-document-status-projection.py --install-mode fresh` | 5 | 1,769 s | 1 |
| `cargo test -p frf-gateway --test shape_projection_grant` | 2 | 1,564 s | 1 |
| `cargo check -p aso-web-server --tests` | 20 | 1,110 s | 5 |
| `scripts/test-web01-case-migration.py --install-mode fresh` | 11 | 785 s | 2 |
| `scripts/test-web06-criteria-service.py --install-mode fresh` | 6 | 632 s | 5 |

Why a "focused" probe takes 5–22 minutes: each `scripts/test-web0N-*-service.py` run creates a disposable PostgreSQL database, applies every server migration, reruns them, checks a deliberate checksum-mismatch refusal, then shells out to `cargo test -p aso-web-server` (`scripts/test-web03-resolution-service.py` line 27). The Rust step shares an external Cargo target with other concurrent workspaces. Agent messages: 09-17 07:13 "The host is concurrently linking another large Rust workspace"; 07:28 and 07:51 "waiting on the shared Rust target lock held by another local process". Two other Codex root sessions were live on the same machine throughout (`flint-realtime-fabric` 01a0a3b0, `universal-agent-runtime` 01a0ab85).

## 5. Verification performed before the feature is usable

State of usability: in the 42.8 h window the root session ran **0** browser-automation commands, **0** dev-server starts, **0** `docker compose up`. `progress.json` → `completion.evidence.summary` says "NOT evidence of visual correctness — nothing has rendered in a browser" (this summary text may be inherited from an earlier phase projection; the file's `last_updated` is 2026-09-18T17:32Z), and `completion.publication.status` is `BLOCKED` ("createEvidenceSyncAdapter has no callers and nothing writes rows into PGlite"). Every one of the 24 post-compaction status reports opens with "The web application is **not ready for a full … scenario**".

The plan itself says verification should wait: `plan.md` "Plan revision 10" paragraph 2 — "Full-stack testing waits until changes web-00 through web-16 are implemented. Each implementation change runs only applicable Tier 0 and focused Tier 1 checks." But `execution.md` "Per-change completion" steps 3 and 5 require, **per change**, "a deliberate red/restore for an uncovered load-bearing guard" and "Run artifact-refiner and fresh adversarial review", and step 6 forbids activating the next change before archive.

Concrete instances:

| What | Where | When |
|---|---|---|
| 13 fresh-context critics on a docs/fixtures-only change with no application behaviour | subagent sessions `artifact_critic_web00` … `_pass10`; `tasks.md` line 10 | 09-16 19:37 → 22:32 |
| Sabotage-and-restore on case commands before any case UI exists | `evidence/web-01-case-command-core/` (7 sabotage/red files, e.g. `task-5-write-target-sabotage.json`); `tasks.md` line 19 | 09-17 00:30 → 01:42 |
| 29 red/restored files for one resolver | `evidence/web-03-…/task-5-untrusted-selection-red.log` / `-restored.log`, `task-5-retry-reauthorization-red.json`, `task-6-authoritative-race-red.json`, `task-6-incomplete-input-focus-red.log`, … | 09-17 04:47 → 09-18 02:20 |
| Fresh-install **and** populated-upgrade migration proofs per backend change, for a database that has never held production data | `evidence/web-04-…/task-2-fresh-schema.json` + `task-2-upgrade-schema.json`, `task-3-fresh-service.json` + `task-3-upgrade-service.json`, `task-4-fresh-http.json` + `task-4-upgrade-http.json`, `task-5-*-pass2/pass3/final` (15 fresh + 8 upgrade files in web-04; 11 + 6 in web-05; 5 + 5 in web-03) | per change |
| Partial-commit and tamper sabotage on upload, before the upload UI (web-05) was started | `evidence/web-04-…/task-5-partial-commit-sabotage.json`, `task-5-tamper-sabotage.json`; `tasks.md` line 48 | 09-18 04:47 → 06:13 |
| Negative controls written into implementation tasks: "verify parity, overlap refusal, grade non-promotion, tenant scope, and conflicting retry" for an HTTP catalog route whose UI is web-07 | `tasks.md` line 67 (web-06 1.4, in progress) | 09-18 12:32 → |
| Upcoming: "provenance-laundering sabotage-and-restore, artifact-refiner, and adversarial review" | `tasks.md` line 68 | pending |
| Judge blocking on evidence form, not behaviour: omitted `--output` argument in a recorded command; "placeholder instead of the five file paths"; judge importing workspace build + Flutter analyze into a focused Tier 1 task | `review/web-03-…/findings.json`, `findings-pass3.json`, `findings-pass4.json` | 09-17 04:57 → 05:05 |
| Freeze → review → fix → re-freeze loop: each repair changes the manifest digest, which invalidates the prior verdict; "the prior critic will not be reused" | agent messages 09-16 20:43, 21:36; `findings-final96b` (96 snapshots) → `final106` (136 snapshots) | 09-17 10:37 → 09-18 02:40 |

Task-line classification of `tasks.md` (113 lines, web-00 … web-17):

| Class | Lines | Share |
|---|---|---|
| Implementation (1.2–1.4 of web-01…web-15) | 44 | 38.9 % |
| 1.1 dependency/ownership gate | 19 | 16.8 % |
| 3.1 record/confirm/mark-complete closure | 19 | 16.8 % |
| 2.1 T0/T1 + sabotage + artifact-refiner + adversarial review | 18 | 15.9 % |
| web-17 / web-15 certification tasks | 5 | 4.4 % |
| web-00 contract/spec docs | 3 | 2.7 % |
| web-16 fixture/runner infrastructure | 3 | 2.7 % |
| duplicate registrations marked SKIPPED | 2 | 1.8 % |

43 of the 44 implementation lines carry an embedded "; verify …" clause; 22 of those name negative controls (refusal, tenant, conflict, stale, tamper, overlap, retry). 15 of the 18 `2.1` lines name sabotage-and-restore; 19 lines name artifact-refiner and 19 name adversarial review. Only 8 of the 44 implementation lines mount browser UI (`tasks.md` lines 28, 37, 56, 76, 94, 111, 130, 147).

## 6. Why web-03 took ~23 hours, and the idle gaps

web-03 wall: 09-17 03:39 → 09-18 02:45 = 23h06. Decomposition:

| Segment | Minutes |
|---|---|
| Tasks 1.1–1.4 (gate + all implementation, incl. UI panel) 03:39 → 04:42 | **64** |
| Task 2.1 verify/review 04:43 → 09:40 | **298** |
| Task 3.1 active work 09:41 → 11:44, dark-wake slices during sleep, and 09-18 00:06 → 02:45 | **328** |
| Machine asleep 09-17 11:44 → 23:06 (dark-wake trickle only) | **630** |
| No records 09-17 23:10:25 → 09-18 00:06:32 (after full wake; turn ended without `task_complete`, goal continuation restarted it) | 56 (+12 other) |

So: **the feature code was written in about one hour; 10.4 further active hours went to verification/review; 11.4 hours the laptop was asleep.**

Inside the 626 review minutes: 16 REST-judge packets (`packet.json` … `packet-pass16.json`), 9 consecutive BLOCKs in 40 minutes (04:57 → 05:37), then an independent critic BLOCK at 06:03 (resolver invalidation — a real defect), 49 runs of the fresh service probe (24 failed; failures include harness arguments, fixture constraints, key ordering in an expected list, cargo target-lock waits, and the OrbStack Docker engine hanging at 19:45–21:09), then nine freeze/critic/judge rounds final82 → final106. In the six rounds final99 → final105 the independent judge returned PASS five times while the fresh critic returned BLOCK all six times (both blocked only at final104); the final104 and final105 BLOCKs were about which source files were included in the frozen packet, not about behaviour. Machine-sleep onset caught a sabotage ("red-control") run mid-flight (agent message 11:41; `wait` call issued 11:44:07, returned 23:03:08).

Context compaction/restart: 41 compactions in the window, none caused a long stall by itself; each costs a re-orientation plus, in 24 cases, a status report (section 3).

### Gaps > 30 min with no root-session records, Sep 16–18 (CDT)

| Gap | Minutes | Cause |
|---|---|---|
| 09-16 03:01 → 03:34 | 33 | machine asleep (pmset block 09-16 00:13 → 05:50, 5.6 h, dark-wake trickle; before the web phase) |
| 09-17 11:47 → 13:24 | 97 | machine asleep |
| 09-17 13:24 → 16:06 | 162 | machine asleep |
| 09-17 16:47 → 17:49 | 61 | machine asleep |
| 09-17 17:57 → 19:43 | 106 | machine asleep |
| 09-17 19:51 → 20:23 | 33 | machine asleep |
| 09-17 23:10 → 09-18 00:06 | 56 | machine fully awake (wake 23:06); turn stopped after 6 read commands with no `task_complete`; resumed by goal continuation. Cause not determinable from the transcript. |

Both sleep blocks: `pmset -g log` shows "Entering Sleep state" 09-16 00:13 → FullWake 05:50, and 09-17 11:44 → "Wake from Deep Idle" 23:06; during them the process only advanced in ~45-second DarkWake slices. Rate limits were not the cause: the highest `rate_limits.*.used_percent` seen was 91 % (09-17 09:53) and `rate_limit_reached_type` was never set.

There were no idle gaps > 30 min while the machine was awake other than the 56-minute one. The loop otherwise chains turns with no operator input: exactly one user message appears in the window (09-16 18:01).

## What could not be determined

- The per-round findings of the 13 web-00 critic subagents are not persisted in `review/web-00-workflow-contract/`; only agent-message summaries exist, so "rework-causing findings" for web-00 is a lower bound.
- What drove KBD plan revisions 1–9.
- Why the turn stopped at 09-17 23:10:25 for 56 minutes.
- Whether individual judge findings were true or false positives; the product/process split is a title heuristic.
- Machine-sleep time inflates the recorded `duration` of any command or subagent that spanned it (at least one 1,114 s probe that ran inside the sleep block, and two web-03 subagents); the wall-clock table corrects for this, the summed-duration table does not.
