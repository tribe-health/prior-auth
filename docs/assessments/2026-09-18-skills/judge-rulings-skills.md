# Judge rulings on skills-impact-report-draft.md and the critic's findings

Date 2026-09-18, 15:00–15:20 CDT. Judge is independent of the report author and the critic. Read-only. The only file written is this one. No build, test, stack, KBD, OpenSpec or `prometheus` command was run. No credential or config file was opened.

REPO = /Users/gqadonis/Projects/TribeHealth/kevin/prior-auth
CHILD = REPO/.kbd-orchestrator/phases/runtime-architecture/children/web-case-to-letter
ASSESS = the session scratchpad `assess/` directory (transcript extracts, injected catalogs)
CC = REPO/docs/assessments/2026-09-18-delivery-speed/codex-course-correction-prompt.md

Method. File mtimes under CHILD/review and CHILD/evidence were listed and sorted. For every BLOCK verdict that carried a product finding, the interval to the next verdict file was taken as repair + re-verify + re-review. SQL, scripts, token source, skill roots, the validator and the injected catalogs were read directly. Counting rules are stated where used. Mtimes are an approximation; web-01's `*-block.json` files are copies stamped when the next packet was cut, so web-01 R1 is an upper bound.

Verdict on the draft: **BLOCK upheld.** The per-finding cost that drives every number in the ranking is 3–7 times the observed median, the chosen exemplar was under an open BLOCK and being rewritten while this review ran, and the recommendation the record best supports is to build no skills now.

---

## 1. Rulings

### C1 — UPHELD, with one correction to the critic

Evidence checked (CHILD/review mtimes, all 2026-09-17/18, CDT):

| Window (BLOCK with product finding → next verdict) | Minutes | Valid product findings | Min / finding |
|---|---|---|---|
| web-01 R1 → R2 (`packet-unscoped.json` 23:55:36 → `findings-pass2.json` 00:15:57; upper bound) | ≤ 20.4 | 2 (+1 false positive) | ≤ 10.2 |
| web-01 R2 → R3 (00:15:57 → 00:24:22) | 8.4 | 1 | 8.4 |
| web-01 R3 → R4 (00:24:22 → 00:49:27; fresh + upgrade probes re-run 00:38–00:42) | 25.1 | 1 | 25.1 |
| web-01 R4 → R5 (00:49:27 → 00:55:07) | 5.7 | 1 | 5.7 |
| web-02 R2 → R3 (03:10:34 → 03:19:17) | 8.7 | 2 | 4.4 |
| web-02 R5 → R6 (03:24:38 → 03:30:45) | 6.1 | 2 | 3.1 |
| web-03 R5 → R6 (05:09:06 → 05:16:23) | 7.3 | 1 | 7.3 |
| web-03 R6 → R7 (05:16:23 → 05:32:01; repair-induced) | 15.6 | 1 | 15.6 |
| web-03 R7 + R8 → R9 (05:32:01 → 05:37:48; `packet-pass8` was cut 13 s after R7, so the two were repaired together) | 5.8 | 2 | 2.9 |
| web-03 R9 → R10 (05:37:48 → 06:05:19; includes an 8-minute harness critic) | 27.5 | 1 | 27.5 |
| web-03 R10 → R11 (06:05:19 → 07:56:13; failed fresh probes of 1,340 s, 591 s, 553 s sit inside — evidence-time-allocation.md:121–134) | 110.9 | 2 | 55.5 |
| web-04 R1 → R2 (05:13:02 → 06:11:50) | 58.8 | 3 (+1 evidence) | 19.6 |
| web-05 R1 → R2 (10:29:02 → 10:37:00) | 8.0 | 2 | 4.0 |
| web-05 R2 → R3 (10:37:00 → 10:38:48) | 1.8 | 1 | 1.8 |
| web-05 R3 → R4 (10:38:48 → 10:44:13) | 5.4 | 1 | 5.4 |
| web-05 R4 → R5 (10:44:13 → 10:47:55) | 3.7 | 1 | 3.7 |

The re-verification is inside these windows, not after them: web-05's red/green pairs are stamped 10:32–10:45 (`task-5-populated-pglite-upgrade-red.log` 10:32:34 → `-restored.log` 10:33:28; `task-5-generation-cutover-red.log` 10:40:08 → `-green.log` 10:40:42; `task-5-electric-host-port-red.log` 10:44:48 → `-green.log` 10:45:05); web-02's at 03:16 and 03:28.

REST-style rounds, 24 valid product findings, web-01…05: **median 6.5 min, mean 13.3 min, range 1.8–55.5 min, total 319.5 min (5.3 h).** Without web-03 R10's two findings: median 5.6, mean 9.5, total 208.5 min.

web-03 final rounds (top-level `findings-final*`): six BLOCK rounds, 00:33:59 → 02:40:54, **126.8 min; per round median 18.1, range 7.2–40.3.** The four valid product findings among them (final99 ×2 = 19.5 min, final102 = 40.3, final103 = 16.7): median 13.2, mean 19.1, total 76.5 min.

All 28 valid product findings: **396 min = 6.6 h = 23 % of the 1,695 active minutes.** The draft's 20–45 min × 28 = 9.3–21 h. The draft's unit cost is 1.5–3.4 × the observed mean and 3–7 × the median. The critic's cross-check is right.

The critic's specific numbers reproduce: the six findings credited to `aso-publish-relation` cost 23.9 min; "two CRITICALs in 9 min" is web-02 R2 (8.7); web-05 deltas 8.0 / 1.8 / 5.4 match. The critic's "rank 1 ≈ 80 min" is 91.6 min for the seven REST findings, 131.9 with final102.

Correction to the critic. "REST review rounds are cheap" holds for web-02 and web-05 and fails for 5 of the 16 windows (web-01 R3, web-03 R6, R9, R10, web-04 R1: 15–111 min). The distribution is heavy-tailed and the tail is probe re-runs. That matters for section 2: the expensive part of an expensive finding is priced by CC §5, which no skill touches.

Double count: upheld. final99–106 cost what they cost because any edit voided the verdict (judge-rulings.md:102, :256). CC §2.4 binds the verdict to a product-source digest and §2.1–2 replaces serial rounds with one wide round plus one confirmation. Crediting a skill with 20–40 min final-round minutes credits it with time CC already removes.

### C2 — UPHELD

- `findings-pass9.json`: file `migrations/server/2026090619_administering_entity_resolution_commands.sql`, claim "return the stored receipt before re-authorizing access to the target case", fix "Call `aso.require_case(target_case, …)` before returning any existing command result". A target-case defect, as the critic says.
- web-06 `import_criteria_catalog` (`2026090625_criteria_catalog_commands.sql:215` actor context, `:251` `RETURN original.result`; same order in `2026090626_criteria_catalog_repair.sql:77` → `:113`) has no target to authorize. Actor context must come first because the idempotency lookup is keyed on it. The ordering is forced, so it is no evidence that a lesson carried.
- The same forced ordering already existed in web-01 before R9: `2026090617_durable_case_commands.sql:531` before `:568`.
- The rule is written: `scripts/test-web03-resolution-service.py:795` `idempotent_retry_reauthorizes_case_target`; CC §4 "Retry and re-authorization proofs … retry semantics are authority semantics."

The draft's sentence "it is written nowhere in the repo" is false and its inference from web-06 is unsound. See section 6 item 1 for what both parties missed here.

### C3 — UPHELD, confirmed live

State of `review/web-06-criteria-catalog-core/` at 15:01 CDT: five files, all `repair-*`, newest `repair-findings.json` 14:30:40, verdict **BLOCK**, two CRITICALs (migrations 24/25 edited in place with no forward migration; revision-token tests cannot distinguish host-layer from SQL rejection). No PASS file exists. Codex was repairing during this review: `2026090626_criteria_catalog_repair.sql` and rewritten 24/25 stamped 14:33:00; `evidence/.../task-5-forward-repair-upgrade.json` 14:57:15; `task-5-repair-fresh.json` 14:59:43. The exemplar moved twice while the draft was being judged.

Authority shape: `criteria_actor_context(require_write)` checks the administrator `configure` capability (`…25…sql:127`). No target. No `pg_advisory_xact_lock` anywhere in migrations 25 or 26, where web-01 (`…17…sql:553, :662, :760`) and web-03 (`…19…sql:487`) lock before the idempotency lookup. Copying this into seven case-scoped clinical commands would copy administrator authority and drop the lock. Rule 2 collision is real.

Is web-03 post-repair a sound case-scoped exemplar? For ordering, yes. `aso.resolve_administering_entity_command`: `:477` `case_actor_context('resolve_administering_entity')` → `:487` advisory lock → `:490` `PERFORM aso.require_case(target_case, 'resolve_administering_entity')` → `:504` `RETURN original.result`. The lookup function does the same (`:427` → `:428`). Limit: `aso.require_case` (`…17…sql:261–281`) checks only that the case's practice equals the actor's practice; it is a tenant check plus capability, with no per-case assignment. It shows the order; it does not show what a surgeon-only gate looks like. Authority still has to be derived per command, which is the critic's split (copyable registration and wiring; authority written and reviewed per command). Upheld in full.

### W1 — UPHELD

CC §4 keeps "Lane, privacy class, exact columns and tenant predicate recorded before any relation publishes" and "populated-replica upgrade proof"; §5.3 orders the populated fixture; §5's last paragraph orders the NOT NULL gotcha; §2.1(a)–(e) are the add-command and publish-relation review dimensions; §6.1, §6.3 and all of §7 are `aso-ui-gate`'s content; §3 is `aso-review-packet`'s content verbatim. The "Already in course-correction" column should read: add-command partly, publish-relation mostly, ui-gate mostly, review-packet yes, probe-fast yes.

### W2 — UPHELD

Row sums are 8–23.5 against a stated 8–16; no P(load) term although the draft says load is the binding mechanism; "about a third" has no derivation. Chain double counts confirmed (web-01 R2/R3 are R1's repair chain; final103 is induced by final102's repair — judge-rulings.md:64). Generous credit confirmed: final99 (an exclusive end date rendered "Effective through") and final102 (409 where the contract says 422) are not addressed by any listed skill content; web-05 R3 (generation cutover) is not in the six-artifact list. Publication task positions from CHILD/tasks.md: web-07 1.3, web-09 1.2, web-11 1.2, **web-13 1.4**, web-15 1.2.

### W3 — UPHELD, with a nuance

None of the 56 findings is a missed registration. Incomplete *source lists* did block (web-02 R1, web-04 R1, final105), but those are review-packet file lists, and CC §1.5 (packet = the change's own diff) removes the class. For the `projection.rs` ↔ `shape-catalog.json` check there is no observed failure. Under CLAUDE.md's evidentiary standard that earns one sentence and a question. The publication edges that *did* fail already have executable guards (section 6 item 3).

### W4 — UPHELD

`AGENTS.md:1` `<!-- prometheus-base:start v1 -->`, `:208` `<!-- prometheus-base:end -->`; "Skills may be absent" is line 106, inside. Line 8: "Edits inside these markers are overwritten on re-run." The duplicated Testing Policy block is 1,243 bytes (lines 480–508), not 1.9 KB. CHILD/tasks.md carries `generatedBy` projections and CC §0 forbids hand-editing it, so "path in task text" has no install step in the draft.

One fact in the draft's favour that neither party used: naming works where it has been tried. `kbd-apply` is absent from the catalog and was read 138 times because task text names it (evidence-skill-usage.md:104, :135–137).

### W5 — PARTIALLY UPHELD (resolved from the injected catalog)

- **Position: the draft is right.** ASSESS/`dev_msg_0906.txt`: root table line 103 `r51 = <repo>/.agents/skills` is the last root, yet the entry list runs five `r2` system skills (lines 105–109) then the twelve `r51/openspec-*` entries at lines 110–121, then `r0`. ASSESS/`listed_skills_0906.txt` lines 6–17 agree. Root-table order and entry order differ; evidence-skill-usage.md:37 describes the first, the draft the second. A project skill named `aso-*` would sort ahead of `openspec-*` and survive truncation.
- **Descriptions: the draft is wrong.** Every one of the 238 entries is `- name: (file: rN/…/SKILL.md)` with no description; the 932-entry catalog (`dev_msg_0918_932.txt:288`) is the same. `truncated_description_chars_per_skill=299` is a log parameter; the rendered result is zero characters. "Trigger words go in the first 299 characters" has no effect on Codex. The name is the only discovery surface, which is one more reason the path must be named in text Codex already reads.
- **Validator: the critic is right.** `~/.codex/skills/.system/skill-creator/scripts/quick_validate.py:40` `allowed_properties = {"name","description","license","allowed-tools","metadata"}` is an authoring lint. `.agents/skills/openspec-apply-change/SKILL.md` carries `compatibility:` and openspec skills were read 18 times.
- 1,419: the log says `total_skills=1413` (evidence-skill-usage.md:49). Use 1,413.

### W6 — UPHELD

`diff -rq` of `.agents/skills` against `.claude/skills`, `.opencode/skills`, `.kimi-code/skills`: 11 files differ in each. The differences are invocation syntax emitted by the openspec generator (`$openspec-apply-change (Codex) or /openspec-apply-change` against `/opsx:apply`). They are per-harness variants from a generator. `aso-*` has no generator, so four hand copies will drift. Codex is the only harness with recorded product work in this repo; `.agents/skills/` alone serves it and three others.

### W7 — UPHELD

The draft prices no alternative and no build cost. The cheapest alternative has a measured load path (section 6 item 2).

### W8 — UPHELD

CC changes review shape, packet size, probe cost, session length and commit cadence at the same boundary the skills would install. Four changes after, six before, one outlier holding 41 % of the baseline. `SKILL.md` read counts are the only attributable measure. The baseline is already moving: web-06's `repair-confirmation-scope.md` uses named blocking dimensions and a product-source-only digest, which is CC §2–3 in substance. Whether the prompt was delivered could not be confirmed (CHILD/plan.md and execution.md are unchanged since 09-16 22:46; `.prometheus/gotchas.md` since 09-17 01:54).

### W9 — UPHELD

A 6 h low-estimate threshold cannot be met by one candidate when the five lows total 8 h in the draft and under 0.5 h in section 2. The three "No" verdicts stand on the repriced numbers without the threshold.

### W10 — UPHELD

CC §1.3: "Do not commit on `main`; create a branch first." The draft's install is "one commit" with no branch and no position relative to Codex's commit series. `git branch --show-current` is `main`, HEAD `d952425`.

### S — UPHELD, and stronger than stated

`assets/templates/design-tokens/tokens.toml:44` `accent = "#A85417"  # TEXT-SAFE accent`; `:45` `accentVivid = "#DF7C35"`. The role `accent` already is the deep value. A skill that teaches "the `#A85417` substitution" teaches agents to write a hex, which rule 3 forbids, to solve a problem the token source already solved. Labels live at `web/src/shared/model/evidence-state.ts:74–75` (`gap: 'Not met'`, `void: 'Not documented'`). `check-citations.sh` failure behaviour is undefined in the draft; as the skill's first step, a hard fail on a moving tree blocks the task the skill was loaded for.

---

## 2. Repriced increments

Formula, per skill:

`increment = N × m × p_prevent × p_load × (1 − o)`

- `N` — remaining changes where the class can occur (CHILD/tasks.md).
- `m` — observed class minutes per applicable completed change, from section 1. Repair chains are summed once under their root finding. False positives, final-round minutes (removed by CC §2) and findings the described skill text does not address are excluded.
- `p_prevent` — 0.3–0.6. The draft's 0.5–0.7 is lowered because the one direct test of written guidance in this loop failed (AGENTS.md states the render-test lesson; final104 found the class anyway — the draft's own §8).
- `p_load` — 0.5–0.9. Naming works for `kbd-*`; the draft has no install step that gets an `aso-*` path into generated task text (W4).
- `o` — share of the class CC already instructs (W1).

| Skill | N | Class minutes observed (what counts) | m | o | Increment (active h) |
|---|---|---|---|---|---|
| `aso-add-command` | 7 | 107.2 over web-01, 03, 04: web-01 R1-chain ≤ 53.9; web-03 R5+R6 chain 22.9, R7 2.9, R9 27.5; web-04 0. final102 excluded (final-round regime; status code not in skill text) | 35.7 | 0.3–0.5 | **0.3–1.6** |
| `aso-publish-relation` | 5 | 18.5 over web-02, 05: web-02 R2 8.7; web-05 R1 8.0, R2 1.8. web-05 R3 excluded (cutover not in skill text) | 9.3 | 0.6–0.8 | **0–0.2** |
| `aso-ui-gate` | 6 | 9.0 over web-02, 03, 05: web-02 R5 6.1; web-03 R8 2.9. final99 excluded (copy defect not in skill text); final103 induced; final104 ×3 is CC §6.1 | 3.0 | 0.3 | **0–0.1** |
| `aso-review-packet` | 12 | Ten process-only REST rounds cost 25.3 min in total; final101/104/105 cost 50.3. CC §3 and §2.4 remove all of it | — | ~1.0 | **0–0.1** |
| `aso-probe-fast` | 11 | Fresh probes 24,118 s. CC §5 instructs the fix inside `scripts/**`, which Codex owns. No `template` logic exists in `scripts/test-web0*.py` today. If Codex does not do §5, the lever is the operator enforcing §5 | — | 1.0 | **0** |
| **Suite** | | | | | **0.3–2.0 h; central about 1 h** |

Against 26–48 h projected after CC, that is 1–4 %, from n = 6 with one outlier. It is not distinguishable from zero. The draft's 8–16 h does not survive. The critic's "under 3 h" holds; the critic's 0.5–1.5 h for rank 2 is too high once CC overlap is netted.

Two upsides the record cannot price, stated so nobody fills them in silently:

1. Implementation lookup. Source reading is 172 min of the window, about 25 min per change. If a 17-file recipe saved a third of that on 7 command changes, under 1 h. No transcript analysis attributes reading time to recipe re-derivation.
2. Fresh sessions (CC §9). A session that starts cold loses whatever lived in context. The counterfactual is a line in `.prometheus/gotchas.md`, which Codex demonstrably reads, so this upside belongs to "write it down", whichever file holds it.

Build cost is absent from the draft and from the record. Five skills each need a draft, `citations.tsv`, a check script, a fresh-context critic, a dry-run replay, an operator install on a branch Codex is assembling, and citation repairs on a tree that changes daily. My estimate, unmeasured: 5–10 h of agent and operator attention. On speed alone the suite is break-even at best.

---

## 3. W5 resolution (task 3)

Project `.agents/skills` entries sit at catalog positions 6–17, directly after the five system skills and ahead of every user skill, in both the 238-entry and 932-entry injections. Descriptions are absent from every entry in every injection examined. Evidence in the W5 ruling above.

## 4. C3 live check (task 4)

In the C3 ruling above. web-06: open BLOCK at 14:30:40, no PASS on disk, forward-migration repair in progress at 14:59:43. web-03 post-repair: target re-authorized at `:490` before the idempotent return at `:504`; sound for ordering; authority content is a practice-match check only.

---

## 5. What the operator should do

**Option (c), with a named condition for one skill later.**

Build no skills now. Do these instead, all through channels Codex already reads or owns:

1. Add four lines to the course-correction prompt telling Codex to append these entries to `.prometheus/gotchas.md` at the web-06 boundary (the file is append-only, outside the managed markers, and AGENTS.md already says to read it before touching a subsystem):
   - Case-scoped commands authorize the target before the idempotent return. Pattern: `2026090619_…commands.sql` actor context → advisory lock → `require_case` → lookup → return. Check: `idempotent_retry_reauthorizes_case_target`.
   - Never edit an applied migration; add a forward migration and prove the upgrade from the frozen version (web-06 repair round, today).
   - The publication artifacts that must agree, and that `catalog-conformance.test.ts` and `pglite-schema.test.ts` are the guards to extend.
   - Release command ownership only when the projection agrees on revision, status and fingerprints (`use-case-command.ts`).
   The NOT NULL entry is already ordered by CC §5.
2. Ask Codex one question about the `projection.rs` ↔ `shape-catalog.json` edge: is it covered by an existing test, and if not, does it want an `audit.sh` check. No observed failure exists, so it is a question.
3. Put the web-01 retry ordering (section 6 item 1) to Codex as a question at the web-06 boundary.
4. Remove the duplicated Testing Policy block (1,243 bytes) from `AGENTS.md` outside the managed markers. That is a free reduction of always-loaded text.

Why (c): the repriced suite is worth about an hour; its load mechanism is untested while `gotchas.md` has 285 transcript touches; the only product defect class that literally recurred (NOT NULL) recurred because nobody wrote it down, and CC already orders that; the exemplar is not stable; the install collides with Codex's branch work; and the intervention cannot be measured apart from CC.

Build one skill later — `aso-add-command`, `.agents/skills/` only, recipe for registration and wiring with web-03 post-repair cited for ordering, authority left to the command's author and reviewer — if either of these is observed:
- a fresh session (CC §9) or a second harness misses a rule that was present in `gotchas.md` and named in its task; or
- a transcript analysis shows more than about 30 min per command change spent re-deriving the file recipe during tasks 1.2–1.4.

What would change the recommendation toward building now: a measured p_load (an `aso-*` path placed in task text through the KBD amendment path and read in the next change), plus a held-out replay where the skill text prevents a finding that the gotchas line does not.

Native: nothing is justified. The whole suite is under a third of the draft's own 6 h threshold for a single native candidate, run time is Postgres and `cargo`, and templating authority code is the failure mode C3 describes.

---

## 6. What both the author and the critic missed

1. **The R9 ordering is still present in web-01.** `2026090617_durable_case_commands.sql` `update`: `:678 RETURN original.result` precedes `:681 PERFORM aso.require_case(target_case, 'case_write')`; `transition`: `:776` precedes `:779`. That is the order web-03 R9 ruled CRITICAL. web-03's check covers only web-03. Exposure today is limited, because `require_case` checks practice match only and the command lookup is already keyed on the actor's practice and identity — which was equally true of R9. The record applies the rule to one of three case-scoped command families. An exemplar skill pointing at "the case commands" could copy either order. Not fixed here; it is a question for Codex.
2. **`gotchas.md` is a channel with a measured read rate and nobody writes to it.** 285 transcript events touch it (19–23 per day in the web window; the root session's first command cats it). Last write 09-17 01:54. The draft proposes a new channel with zero measured loads; the critic lists gotchas entries as an alternative without checking that the channel works.
3. **The observed publication failures already have executable guards.** `catalog-conformance.test.ts:83` "grants exactly the columns the migrated local schema can hold", `:96` "keeps the requested column set in step with the catalog"; `pglite-schema.test.ts:107` "cuts a populated revision-5 replica over before adding required case columns". Rank 2's prose duplicates tests that run at Tier 1.
4. **`accent` is already `#A85417`.** See S.
5. **Recurrence is rare.** Of 28 valid product findings, one class recurred across changes (NOT NULL). The draft's classes are drawn after the fact and wide enough ("anything about a command") that multiplying by remaining changes assumes a recurrence rate the record does not show. web-06's six findings today (cross-practice supersession, overlap namespace, source-date equality, token canonical form, migration edited in place, test truthfulness) fall in none of the five skills.
6. **The cost tail is probe time.** The five expensive windows contain fresh-probe re-runs. The per-finding model in the draft, and the critic's "rounds are cheap", both hide that the variance belongs to CC §5.
7. **Six-harness distribution answers no observed problem.** Only Codex has done product work here. The draft's own §9 says four harnesses were never seen loading a project skill.

---

## Uncomfortable for this ruling

The repricing rests on mtimes, and on my reading of which findings a skill's described text "would address" — a judgement the author would draw more generously. `p_prevent` and `p_load` are ranges I chose; halving or doubling them leaves the suite under 4 h, which is why the conclusion holds, but the central figure of one hour is soft. Option (c) relies on written prose in `gotchas.md` binding Codex, and the one test of written prose in this loop (final104) failed; if prose does not bind, the answer is more executable checks, and this ruling proposes none beyond a question. Recommending "no skills" is also the cheap verdict for a judge to give, because its cost — slower fresh sessions in web-08 or web-10 — would show up later and be hard to attribute.

## Verification statement

Run: `stat`/`ls` on CHILD/review and CHILD/evidence; `grep`/`sed` on migrations 17, 19, 25, 26, `scripts/test-web03-resolution-service.py`, `scripts/test-web0*.py`, `tokens.toml`, `evidence-state.ts`, `catalog-conformance.test.ts`, `pglite-schema.test.ts`, `AGENTS.md`, `quick_validate.py`; `diff -rq` across the four skill roots; `git branch --show-current`, `git log -1`; inline python over three findings JSON files; `grep` counts over ASSESS/`events.jsonl`, `dev_msg_0906.txt`, `dev_msg_0918_932.txt`, `listed_skills_0906.txt`. One inline-python heredoc hung and was abandoned; its question was answered with `grep` instead. Not run: any build, test, stack, KBD, OpenSpec or `prometheus` command. Unverified as a result: whether any cited defect reproduces; whether the web-01 ordering is exploitable; whether CC has been delivered to Codex; web-01 R1's true verdict time; whether the conformance tests predate or postdate web-05 R1; build cost of the skills. Written: this file only.
