# Evidence: skill usage by the Codex agent in prior-auth (Sep 4-18, 2026)

Read-only investigation. No build, test, CLI or repo-mutating command was run. Secrets in
`~/.codex/config.toml` were redacted at read time; `auth.json` was never opened.

Method: streamed all `~/.codex/sessions/2026/09/*/rollout-*.jsonl` whose `session_meta.cwd` is the
prior-auth repo (258 of 386 September sessions, 1.97 GB). Extracted every tool call, every
injected skill catalog, and outputs of verification commands into
`scratchpad/assess/events.jsonl`, `injections.jsonl`, `skill_msgs.jsonl` (scripts: `idx.py`,
`scan.py`, `loads.py`, `cost.py`). Cross-checked against the Codex log database
`~/.codex/logs_2.sqlite` (read-only; covers 2026-09-08 .. 09-18).

Session shape (fact): one root thread, `rollout-2026-09-06T01-55-57-01a075ee-...jsonl`, 1.13 GB,
running since Sep 6 with 192 `compacted` records, plus 256 spawned subagent threads (judges,
critics, workers). 29,453 tool calls total; 22,064 `exec` calls by `/root`. `turn_context.model`
in sampled threads is `gpt-5.6-sol` (also `-luna`, `-terra` in the log DB), not the
"gpt-6-astra" named in AGENTS.md. `~/.codex/config.toml:1` still has
`model = "gemma4:31b:cloud"` as the default; the desktop app overrides it per thread.

---

## 1. How this Codex install discovers skills

### Mechanism (fact)

- `~/.codex/config.toml` (690 lines) has no `[skills]` table and no skill budget setting. It
  enables 12 prometheus-skill-pack plugins plus `hybrid-mobile-architecture@knowme-builder`
  (lines 490-524). `~/.codex/AGENTS.md` (12 lines) is only the Context7 rule.
  `~/.codex/AGENT_BASE_RULES.md` (666 lines) contains the word "skill" zero times.
- Codex injects a `## Skills` block into a developer message at thread start and after some
  compactions (`internal_chat_message_metadata_passthrough.content_item_kinds` includes
  `host_skills.instructions`). Base instructions say each entry "includes a name, description,
  and location" and that the agent "must use that skill" when "the task clearly matches an
  available skill's description".
- Roots scanned (from the injected `### Skill roots` table, root thread 2026-09-06T08:57:16Z):
  `r0=~/.codex/skills`, `r1=~/.TOOLS/skills/agents` (486 dirs — a third root nobody mentioned),
  `r2=~/.codex/skills/.system`, 48 plugin-cache roots, `r51=<repo>/.agents/skills`.

### The catalog is truncated and carries no descriptions (fact)

- 279 catalog injections found across 249 prior-auth threads. 274 of them list exactly
  **238 entries with 0 descriptions** (~16.1 KB). Every entry looks like
  `- axum-patterns: (file: r0/axum-patterns/SKILL.md)`. 4 root-thread injections list 0 entries.
  One subagent on 2026-09-18T10:09:25Z (`...01a0b3fe-03c1...`, CLI 0.154.0-alpha.6.2) got 932
  entries / 95 KB, still 0 descriptions, still cut off mid-alphabet.
- Codex's own log states the cause. `logs_2.sqlite`, target
  `codex_skills_extension::render_observability`, 210 rows for prior-auth threads; the modal row
  (122x): `truncated skill metadata to fit skills context budget budget_limit=5440
  total_skills=1413 included_skills=238 omitted_skills=1175
  truncated_description_chars_per_skill=299 truncated_skill_descriptions=1413`.
  So **83% of discovered skills are omitted and 100% of descriptions are dropped.**
- 16 ERROR rows: `skills scan reached its traversal limit (root: file:///Users/gqadonis/.TOOLS/skills/agents)`.
- Budget is wasted on duplicates: of 238 entries only 164 names are unique. `artifact-refiner`
  appears 23 times (nested SKILL.md files), most `entity-*` names twice.
- Truncation is alphabetical within a root. `r0` stops at `feynman-loop`; `r1` stops around
  `firecrawl-*`. Everything from `g` onward in `~/.codex/skills` is invisible: all `kbd-*`,
  `hybrid-design-tokens`, `pem-local-first`, `react-vite-stack`, `reference-ui-fidelity`,
  `sync-doctrine`, `typescript-base-patterns`, `prometheus-entity-skills`.
- A "shadow skill selection" experiment runs each turn
  (`codex_skills_extension::shadow_selection_experiment`, 5,927 rows) and logs
  `catalog_entries=1479 selected_entries=0 query_terms=0` in the sampled rows. It is shadow
  only; it does not feed the prompt.

Consequence (inference): the trigger rule "task clearly matches a skill's description" cannot
fire, because the agent never sees a description. A bare name such as `error-handling` or
`audit` gives no reason to open the file.

### Presence matrix for the skills in question (fact)

Descriptions in the prometheus-skill-pack skills are YAML block scalars (`description: >`) and
are well-formed. Frontmatter is usable in every file checked.

| skill | ~/.codex/skills | ~/.TOOLS/skills/agents | ~/.claude/skills | in injected list | SKILL.md reads |
|---|---|---|---|---|---|
| react-vite-stack | yes | yes | yes | NOT listed | 0 |
| frontend-patterns | NO | NO | yes | NOT listed | 0 |
| prometheus-entity-skills | yes | yes | yes | NOT listed | 0 |
| pem-local-first | yes | yes | yes | NOT listed | 0 |
| sync-doctrine | yes | yes | yes | NOT listed | 0 |
| typescript-base-patterns | yes | yes | yes | NOT listed | 0 |
| hybrid-design-tokens | yes | yes | yes | NOT listed | 0 |
| reference-ui-fidelity | yes | yes | yes | NOT listed | 0 |
| entity-graph-web-shell, entity-graph-{setup,crud,realtime,optimize}, entity-crud-{page,table,form,relations}, entity-realtime-local-first | yes | yes | yes | listed, name only | 0 |
| a11y-gate | yes | yes | yes | listed, name only | 0 |
| axum-patterns, async-patterns, error-handling, clean-architecture, axum-agent-gateway | yes | yes | yes | listed, name only | 0 |
| impeccable + 20 sub-skills (teach-impeccable, critique, polish, arrange, typeset, colorize, clarify, harden, normalize, adapt, animate, audit, distill, delight, onboard, bolder, quieter, extract, optimize, overdrive) | NO | yes | yes (symlinks to `~/Projects/references/impeccable`) | NOT listed (only in the single 932-entry catalog) | 0 |
| rust-patterns, rust-testing, postgres-patterns, database-migrations, api-design, backend-patterns, healthcare-phi-compliance, hipaa-compliance | NO | NO | yes | NOT listed | 0 |
| radix-to-base-ui-migration | NO | NO | NO (exists only as `anthropic-skills:` plugin skill in Claude Code) | NOT listed | 0 |

Claude-only, therefore invisible to Codex: `frontend-patterns`, `rust-patterns`, `rust-testing`,
`postgres-patterns`, `database-migrations`, `api-design`, `backend-patterns`,
`healthcare-phi-compliance`, `hipaa-compliance`, `radix-to-base-ui-migration`.
Full table: `scratchpad/assess/matrix.md`.

---

## 2. Skill hit rate, Sep 4-18

Detection: any shell sub-command whose verb is sed/cat/nl/head/tail/awk/python and whose
argument is a path ending `/<name>/SKILL.md`. "Non-read" = rg/find/ls/test touches.

| skill | SKILL.md reads | by /root | dates |
|---|---|---|---|
| kbd-apply | 138 | 138 | every day Sep 6-18 (10-19/day Sep 14-18) |
| adversarial-review | 105 | 86 | every day Sep 6-18 |
| artifact-refiner | 56 | 54 | Sep 6-18 |
| kbd-status | 52 | 52 | Sep 7-18 |
| prometheus-artifact-refiner | 37 | 37 | Sep 6-18 |
| refine-validate | 10 | 7 | Sep 6,10,13,14,16,17 |
| kbd-process-orchestrator, kbd-plan, superpowers | 6 each | | |
| kbd-reflect, kbd-child-exit, kbd-assess | 5 each | | |
| kbd-execute | 4 | | Sep 6,9,13,16 |
| openspec-* (7 skills) | 18 total | | Sep 6,12,13,16,17,18 |
| sycophancy-correction, context7-mcp, using-superpowers, kbd-new-child | 3 each | | |
| documentation-and-adrs, code-review | 2 each | | |
| vercel-react-best-practices, vercel-composition-patterns, vercel-react-view-transitions, kbd-resume, kbd-new-phase, flint-gate-config | 1 each | | all Sep 6-7 |

Totals: about 470 SKILL.md reads; **~97% are process skills** (kbd-*, adversarial-review,
artifact-refiner/refine-*, openspec-*). Non-SKILL.md files under skill dirs (scripts,
references): kbd-apply 995 command touches, adversarial-review 643, artifact-refiner 437,
kbd-process-orchestrator 294; nothing else above 7.

The only stack skills ever opened: three `vercel-react-*` skills, once each, on 2026-09-06
(architecture exploration). None since.

**Zero loads, Sep 4-18, for every skill in the owner's list**: all React/PEM skills, all
Impeccable skills, a11y-gate, hybrid-design-tokens, reference-ui-fidelity, and all Rust/Axum/
Postgres/PHI skills (see matrix above; every row is 0). `entity-realtime-local-first` was
touched once by a non-read command.

Explicit statements by the agent ("using the `X` skill", 153 assistant messages mention skills):
kbd-apply 16, kbd-status 10, artifact-refiner 3, openspec-explore 1, kbd-new-phase 1,
kbd-execute 1, sycophancy-correction 1, using-superpowers 1. No stack or design skill is named.

Telling detail (fact): `kbd-apply`, `kbd-status` and the other `kbd-*` skills are **not in the
238-entry catalog** (they sort after `f`), yet they are the most-loaded skills. They are loaded
because prompts and task text name them. Naming a skill works; catalog discovery does not.

---

## 3. Do the project's instruction files steer skill use?

Grepped for every skill name in the owner's list plus `SKILL.md` and `/skills/`:

| file | stack/design skill names | word "skill" |
|---|---|---|
| `AGENTS.md` / `CLAUDE.md` (508 lines each) | 0 | 7, all generic |
| `.claude/rules/rust.md`, `typescript.md`, `flutter.md` | 0 | 0 |
| `.kbd-orchestrator/phases/runtime-architecture/children/web-case-to-letter/plan.md` (243 lines) | 0 | 0 |
| same dir `tasks.md` (169), `execution.md` (31) | 0 | 0 |
| `openspec/changes/web-06..web-17/{tasks,design,proposal}.md` and archived web-00..05 | 0 | 0 |

- `AGENTS.md:106-110` ("Skills may be absent") says harnesses drop skill descriptions past a
  context budget and tells the agent to "invoke it by name" — but no file anywhere gives the
  names to invoke for React, PEM, design, a11y, Axum or Postgres work.
- The only skills named in plan/task text are process skills: every change's task 2.1 reads
  "Run focused T0/T1 plus ... sabotage-and-restore, artifact-refiner, and adversarial review"
  (`tasks.md:10,19,29,39,48,57,68,...`). Those are exactly the skills that get loaded.
- UI changes: `web-02`, `web-05`, `web-07`, `web-09`, `web-11`, `web-13`, `web-15` contain
  **0 references** to `docs/design/prototype`, the brand guide, `tokens.toml` or `theme.css`,
  and 2-4 lines each touching a11y words (keyboard/aria/responsive). The UI task in each is a
  single line, e.g. `web-07 tasks.md` 1.4: "Mount policy and pathway responsive views plus
  browser HTTP commands; verify source/version/date/provenance, reload, resize, and downstream
  block." `plan.md` has no prototype/brand/token/a11y reference at all.
- Backend changes: no mention of axum/rust/postgres skills.
- CLAUDE.md does point at `docs/design/prototype/` and the brand guide in prose ("Where the
  design lives"), but no change or task makes reading them an acceptance step.

---

## 4. Cost evidence

Change windows from `kbd-apply.sh` begin/archive calls in the root thread (UTC).
Failure counts are heuristic: a verification invocation counts as failing if its captured
output shows a non-zero exit, `error TS`, `Tests N failed`, `error[E`, etc. They include
deliberate TDD red runs and sabotage-and-restore runs, and outputs over 1,500 chars were
sampled head+tail, so treat them as upper-bound indicators, not exact.

| change | window | duration | tool calls | tsc runs / vitest runs | cargo check+clippy+test | distinct failing verif. invocations | node_modules cmds | prototype reads | review passes |
|---|---|---|---|---|---|---|---|---|---|
| web-01 backend | 09-17 03:32-06:54 | 3h22 | 626 | 0 / 0 | 23+16+34 | 7 | 1 | 0 | - |
| **web-02 UI** | 09-17 06:55-08:38 | 1h43 | 313 | 23 / 20 | 0+0+14 | 8 | 2 | 4 cmds (one screen: `intake-checklist.html`) | 6 |
| web-03 backend | 09-17 08:39 - 09-18 07:45 | 23h06 | 2,315 (27 subagents) | 33 / 63 | 22+0+47 | 18 | 5 | 1 | judge agent named `harness_judge_web03_final106` (09-18T07:36Z); review dir keeps `findings-final96b..final106` judge+critic pairs. Round count per change not verified |
| **web-04 backend** | 09-18 07:46-11:17 | 3h31 | 818 | 0 / 0 | 41+7+16 | 7 | 0 | 0 | - |
| **web-05 UI** | 09-18 11:18-15:58 | 4h40 | 711 | 20 / 20 | 18+6+24 | 9 | 5 | 2 cmds (same screen) | 6 |
| web-06 backend | 09-18 16:00 - running | - | 389 | - | 13+13+3 | 0 so far | 0 | 0 | - |

Findings, stated plainly:

1. **The node_modules hypothesis is not supported for web-02/web-05.** 2 and 5 commands. Across
   all 14 days: 359 of ~26,700 exec commands mention `node_modules` (some are `-g '!node_modules'`
   exclusions); 90 target `@prometheus-ags/*`; another 85 commands read the PEM source checkout
   at `~/Projects/prometheus/prometheus-entity-management`. The peak was Sep 14 (154 cmds) during
   ra-07/ra-09 PEM runtime work, e.g. 2026-09-14T16:13:34Z
   `sed -n '1594,1665p' web/node_modules/@prometheus-ags/entity-graph-core/dist/index.mjs`.
   That is where a PEM skill would have paid; it is already spent.
2. **Typecheck/test churn in UI changes is moderate.** web-02: 8 failing of ~25 verification
   invocations; real type errors at 07:55:39 (`TS2339`) and test failures at 07:39, 08:15, 08:27.
   web-05: 9 failing; `TS2353` at 13:17:20, three vitest failures 14:15-14:23 on the new
   `document-intake` API/component tests, two on `pglite-schema.test.ts` 15:32-15:33.
3. **Backend churn is mostly formatting, not Rust/sqlx trial and error.** web-04: 5 of 7 failing
   invocations are `cargo fmt --all -- --check && cargo check ...` failing on a fmt diff
   (08:21:30, 09:26:27, 09:29:19, 09:30:41, 09:34:00); one missing `tests.rs` module (09:24:05);
   one genuine compile error `E0277` (10:21:11). Running `cargo fmt` before the check removes 5
   round trips. No Rust skill is needed for that.
4. **The real rework is in review passes, and none of it is about UI quality.** Both UI changes
   took 6 adversarial passes (`.../web-case-to-letter/review/web-02-case-publication-ui/findings-pass2..6.json`,
   same for web-05). 19 findings total: 16 CRITICAL, 3 WARNING. Topics: PGlite replica migration
   and generation cutover (4), publication/authorization shape (4), reconcile/confirm logic (2),
   and **missing or placeholder completion evidence / unchecked tasks (7)**. Zero findings on
   visual design, brand, tokens, contrast, or a11y. The reviewers receive diff packets and never
   look at rendered UI, so UI quality is unreviewed rather than passing.
5. **One defect was found twice.** web-02 pass2: "adds several NOT NULL columns without defaults
   or backfill" to an existing replica. web-05 pass2: "adds multiple `NOT NULL` columns without
   defaults" to a non-empty revision-3 `cases` table. `grep -i 'NOT NULL' .prometheus/gotchas.md`
   returns nothing, so the lesson was not captured between the two. The skills that cover this
   ground (`entity-realtime-local-first`: 12 pglite/migration lines; `sync-doctrine`: 3;
   `pem-local-first`) had 0 loads; two of the three are not in the catalog.
6. **"UI" changes are mostly not UI.** In web-05 the first look at the prototype and
   `web/src/components/ui` is at 14:01-14:09Z, 2h43 into a 4h40 change. Before that the work is
   migrations, Electric shapes, principals and SQL (70 psql/sqlx/migration commands, 48 cargo
   runs). The prototype consulted was one file (`docs/design/prototype/screens/intake-checklist.html`);
   the brand guide, the shared design-system files, `tokens.toml` and `theme.css` were opened 0
   times in either UI change.

Inference: for the 13 remaining changes, loading design/React skills would raise UI quality but
would not shorten the loop much, because the loop's time goes to sync/migration correctness and
evidence bookkeeping caught late by reviewers. web-03 alone consumed 23 hours and 27 subagents.

---

## 5. Claude Code side and telemetry

- `~/.claude/skills` has 496 entries and contains every skill in the owner's list except
  `radix-to-base-ui-migration` (available there as an `anthropic-skills:` plugin skill). The
  prometheus-skill-pack skills are symlinks into `~/.prometheus/plugins/prometheus-skill-pack/current/skills/`;
  Impeccable skills are symlinks into `~/Projects/references/impeccable/.claude/skills/`.
  Claude Code lists them with descriptions for a subset; AGENTS.md's own note says descriptions
  drop past a budget there too.
- Telemetry that records skill exposure exists only in Codex: `~/.codex/logs_2.sqlite`, targets
  `codex_skills_extension::render_observability` (346 rows), `...::shadow_selection_experiment`
  (5,927), `...::host_service` (103), `codex_skills::interface` (32). It records what was
  rendered, not what was read. Retention starts 2026-09-08.
- No hit counter found. `~/.codex/ambient-suggestions/7196d088.../ambient-suggestions.json` for
  this repo is `{"suggestions": []}`. `~/.prometheus/hooks.log` records hook runs, 0 lines
  containing "skill". `~/.claude/telemetry` holds 3 failed-event files. `skill-health` and
  `skill-stocktake` exist as Claude commands/skills but I found no output store. The transcripts
  are the only usage record, which is what section 2 mines.

---

## Could not determine

- Whether Codex exposes a setting to raise `budget_limit=5440`; none is present in
  `config.toml` and I did not read Codex source.
- Why one subagent on Sep 18 received a 932-entry catalog (different CLI build
  0.154.0-alpha.6.2 is the only visible difference).
- Encrypted reasoning items hide whether the agent considered and rejected a skill.
- The root thread predates the log DB window, so its budget rows are absent; its injected
  catalogs match the 238/0 pattern exactly.

## The uncomfortable part

The owner's premise is half right. The agent uses none of the stack skills, and the cause is
mechanical and provable: 1,413 skills compete for a 5,440-unit budget, so descriptions are
stripped and the list is cut at the letter `f`. But the transcripts do not show that missing
skills are what makes the loop slow. The measured cost sits in 6-pass reviews about replica
migrations and missing evidence, a 23-hour backend change, and `cargo fmt` ordering. Fixing
skill discovery will improve UI quality that nobody currently reviews; it will not by itself
make the loop fast.
