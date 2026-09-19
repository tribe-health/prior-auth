# Project skills for prior-auth: impact report

2026-09-18 · final, after critic and judge review · decision document for Gate 2

Nothing has been built. No repo file, KBD state or build directory was touched to produce this. No build, test, stack, `openspec` or mutating `prometheus` command was run (`prometheus kbd revise --help` only).

## 1. Recommendation

**Build no project skills now, and nothing native.** Repriced from the review record and net of what the course-correction prompt already instructs, the proposed five-skill suite is worth 0.3–2.0 active hours over the 12 remaining changes, central estimate about one hour, against 26–48 hours of projected work. Building and validating five skills would cost an estimated 5–10 hours (unmeasured). At best the suite breaks even.

Do three cheap things instead, all delivered through Codex as an addendum to the course-correction prompt (`course-correction-addendum.md`, beside this file):

1. Four entries appended to `.prometheus/gotchas.md`. That file has a measured read path in this loop (285 transcript touches, about 20 a day); project skills have none.
2. One authority question put to Codex: web-01's `update` and `transition` commands return the stored receipt before re-authorizing the case. That is the ordering ruled CRITICAL in web-03 round 9. Section 6.
3. Remove the duplicated Testing Policy block from `AGENTS.md` (1,243 bytes paid on every request).

Revisit one skill, `aso-add-command`, installed in `.agents/skills/` only, when either trigger fires: a fresh session misses a rule that was in `gotchas.md` and named in its task; or transcripts show more than about 30 minutes per change spent re-deriving the file recipe. Section 5 lists what evidence would justify building sooner.

This reverses the draft of this report, which recommended four skills and claimed 8–16 hours. The critic blocked it and the judge upheld the block. Section 7 says what was wrong.

## 2. Method

Inputs: the delivery-speed assessment and its evidence files; the judge's hand classification of 56 blocking findings; three read-only explorations (project recipes, harness skill discovery, `pmpo-skill-creator`); direct reads of exemplar code; file mtimes across the review and evidence directories.

Cost model (judge's, from mtimes on each BLOCK → next-verdict interval, which includes repair, red/green re-verification and re-review):

| Round type | Valid product findings | Minutes per finding |
|---|---|---|
| REST-style rounds, web-01…05 | 24 | median 6.5, mean 13.3, range 1.8–55.5 |
| web-03 final rounds | 4 | median 13.2, mean 19.1 |

All 28 valid product findings together cost 396 minutes, 6.6 hours, of a 28.3-hour sample. The long tail (five of 16 windows ran 15–111 minutes) is probe re-runs, which course-correction §5 already addresses, so no skill is credited for it.

Increment formula per skill: `N × m × p_prevent × p_load × (1 − overlap)`, where N is the number of remaining changes in which the defect class can occur, m is observed minutes per change for findings the skill's text would actually address (repair chains counted once; false positives and final-round minutes excluded), `p_prevent` is 0.3–0.6, `p_load` is 0.5–0.9, and overlap is the share the course-correction prompt already covers. The probability ranges are judgment. Halving or doubling them keeps the suite under 4 hours.

## 3. Repriced ranking

| Skill | N | m (min/change) | Overlap with course-correction | Increment (active h) |
|---|---|---|---|---|
| `aso-add-command` | 7 | 35.7 | 0.3–0.5 (§4 keeps the three authority proofs, retry and re-authorization, stale revision; §2.1 runs authority, reconciliation and contract critics) | 0.3–1.6 |
| `aso-publish-relation` | 5 | 9.3 | 0.6–0.8 (§4 lane and privacy record plus populated-upgrade proof; §5 populated fixture and the NOT NULL gotcha) | 0–0.2 |
| `aso-ui-gate` | 6 | 3.0 | 0.3 and more (§6 render test and named inputs; §7 the skill list, overrides and do-not-load list) | 0–0.1 |
| `aso-review-packet` | 12 | not priced | about 1.0 (§3 states the blocking rules) | 0–0.1 |
| `aso-probe-fast` | 11 | not priced | 1.0 (§5) | 0 |
| **Suite** | | | | **0.3–2.0** |

That is 1–4 % of projected work and is not distinguishable from zero at n = 6.

Why the knowledge argument is weaker than it looked:
- Only one defect class actually recurred across changes (replica `NOT NULL` without default), and the course-correction prompt already orders that gotcha entry.
- The retry rule is written: `scripts/test-web03-resolution-service.py` carries a check named `idempotent_retry_reauthorizes_case_target`, and course-correction §4 keeps retry and re-authorization proofs per change.
- Tier 1 guards already exist for the publication failures (`catalog-conformance.test.ts`, `pglite-schema.test.ts`).
- None of web-06's six findings today fits any of the five proposed skills.
- The `verify-registration` script has no observed failure behind it. None of 56 findings is a missed registration, and a miss is loud: the fresh probe fails, the HTTP probe returns 404, or the build breaks. Under the project's evidentiary standard that guard does not qualify.

## 4. Harness facts worth keeping

These hold whether or not skills are built, and they change how any future skill should be delivered.

| Harness | Project skill root | Basis |
|---|---|---|
| Codex CLI 0.154.0 | `.agents/skills/` | observed live: project entries sit at catalog positions 6–17 |
| Kimi Code 0.42.0 | `.agents/skills/`, `.kimi-code/skills/` | constants in its bundled source; not observed loading |
| MiniMax Code 0.2.6 | `.agents/skills/`, `.minimax/skills/` | bundled docs; not observed |
| Zed 1.20.2 | `.agents/skills/` | doc table in binary; not observed |
| Claude Code 2.1.274 | `.claude/skills/` | settings schema |
| OpenCode 1.18.25 | `.opencode/skills/` | bundled docs; not observed |

- Only Codex has done product work in this repo. A six-harness install solves a problem that has not occurred.
- Codex's injected catalog carries **zero description characters** for every entry (238 of 1,413 listed). Writing trigger words into a description does nothing for Codex. A skill loads when task text or the operator names it; that is the only mechanism with evidence.
- The "frontmatter validator" is an authoring lint in Codex's skill-creator, not the loader. The existing openspec skills carry `compatibility` and loaded 18 times.
- `AGENTS.md` lines 1–208 sit inside `prometheus-context-bootstrap` managed markers, including "Skills may be absent" at line 106. Anything added there is overwritten on a bootstrap re-run. A path table would have to go below line 208.
- `tasks.md` is generated by kbd-runtime and is in Codex's scope, so "name the skill path in task text" has no install step available to anyone but the plan author at plan time.
- The four existing skill roots are not duplicates. They are generator-emitted per-harness variants with different invocation syntax. Hand-copying `aso-*` skills into four roots would drift; if one skill is ever built, install it in `.agents/skills/` only.
- `pmpo-skill-creator` has no adapter for `.agents/skills`, Kimi, MiniMax or Zed and no notion of native skills. Its output would need pruning to `SKILL.md`, `references/`, `scripts/`.

## 5. Native (WASM or Rust CLI)

Nothing native is justified. The whole suite prices at about one hour, so no part of it can clear any reasonable bar for "huge". The draft's 6-hour threshold was set after the numbers and could not have been met by any candidate; the honest statement is simpler. A probe runner's time is Postgres and `cargo test`, which a Rust wrapper does not shorten. A WASM sandbox cannot usefully drive `cargo` or `psql`. A command scaffolder would stamp authority code across command families that differ exactly in their authority logic, and the same hazard applies to a prose recipe built on one exemplar (section 7).

What would change the answer on skills or native:
- A measured load: an `aso-*` path placed in task text and read in the transcript.
- A held-out replay in which the skill text prevents a finding that the `gotchas.md` line does not.
- A second harness or a fresh-session-per-change regime actually starting, with a rule missed as a result.
- A script prototype measured as the bottleneck of a step, with the count of remaining changes that would use it.

## 6. Finding for Codex: web-01 retry ordering

Read directly in `migrations/server/2026090617_durable_case_commands.sql`: in both the `update` and the `transition` command functions, the idempotent branch ends with `RETURN original.result;` and `PERFORM aso.require_case(target_case, 'case_write');` follows it. The branch does compare `original.actor_id` to the current actor, so another actor cannot replay the command. An actor whose access to that case has ended since the original command still receives the stored receipt. web-03 round 9 ruled this ordering CRITICAL, and web-03's repaired function runs actor context, lock, `require_case`, then the idempotent return. No later migration redefines the web-01 functions.

This was read, not reproduced. It is a question for Codex at the web-06 boundary, as a forward migration (applied migrations are not edited in place; web-06 is blocked today for doing that). It is in the addendum.

## 7. What the draft got wrong

- **Cost per finding.** The draft divided gate-plus-closure minutes by findings and got 20–45 minutes. The record shows a median of 6.5. The draft thereby credited skills with probe time and freeze-loop time that the course-correction prompt already removes.
- **The web-06 inference.** The draft claimed web-06 "gets the retry ordering right" and that the lesson lived only in session memory. Round 9 was a target-case authorization defect; web-06 has no target at all, and its actor-context-first ordering is structurally forced. The rule is also written down, in a probe check and in the course-correction prompt.
- **The exemplar.** The draft built the top-ranked skill on web-06's `criteria_catalog`. That change is under an open BLOCK today (migrations edited in place; cross-practice supersession, a tenant defect), authorizes with the administrator `configure` capability, has no target and takes no advisory lock. Copying it into case-scoped clinical commands would collide with rule 2. web-03 post-repair is a sound exemplar for ordering only; `require_case` checks practice match, so authority still has to be written per command.
- **Overlap cells.** Three of five "already in course-correction" cells understated the overlap, and the fourth was credited despite being marked fully covered.
- **Harness claims.** Descriptions are absent from Codex's catalog, not truncated to 299 characters. The managed-marker and generated-`tasks.md` constraints were missed.

## 8. The uncomfortable part

- The operator asked for a skill-building plan and this report recommends not building. The evidence supports that, and it is a smaller deliverable than was asked for.
- The central one-hour figure rests on judgment ranges for prevention and load probability. It is not a measurement. What is solid is the ceiling: all valid product findings in six changes cost 6.6 hours in total, so no set of skills could have saved more than that, and the course-correction prompt already claims most of it.
- The skills have a quality argument the pricing ignores. The five UI changes ahead are where design quality will show, and no gate checks them against the prototype. Course-correction §6 and §7 carry that today as prompt text, which lives in a session and not in the repo. If that prompt is never delivered, or sessions restart, the case for `aso-ui-gate` returns.
- The most valuable output of this exercise was not about skills: the web-01 retry ordering in section 6, found by the judge while checking an exemplar.

## 9. Review record

| Stage | Result |
|---|---|
| Critic (artifact alone, read-only repo) | BLOCK: 3 critical, 10 warning |
| Judge (repo, review record, mtimes) | BLOCK upheld. C1–C3 and W1–W4, W6–W10 upheld; W5 partially (author right on catalog position; critic right on descriptions and the validator). Repriced suite: 0.3–2.0 h |
| Found by the judge, missed by author and critic | web-01 retry ordering; `gotchas.md` is read constantly and unwritten since Sep 17; existing Tier 1 publication guards; token role `accent` already equals `#A85417`, so a "substitution" rule teaches agents to write hex; none of web-06's findings fits the suite; only Codex has worked here |

## 10. Verification statement

Run: three read-only explorations, one critic, one judge; direct reads of `judge-rulings.md`, the web-01 and web-06 command migrations, the probe scripts, `gotchas.md` and kbd-runtime source; `prometheus kbd revise --help`. Not run: any build, test, stack or `openspec` command, or any `prometheus` command that writes. Unverified as a result: whether the web-01 ordering is exploitable in the running system; whether the course-correction prompt has been delivered to Codex; the build cost of the skills; whether OpenCode, Kimi, MiniMax or Zed load a project skill on this machine; the true verdict time of web-01 round 1. Written: files under `~/Projects/TribeHealth/kevin/prior-auth-skills-staging/` and a copy under `docs/assessments/2026-09-18-skills/`.
