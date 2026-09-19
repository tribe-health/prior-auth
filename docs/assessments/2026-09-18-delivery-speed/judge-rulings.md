# Judge rulings on report-draft.md and critic-findings.md

Date 2026-09-18. Judge is independent of the report author and the critic. Read-only. Nothing in the repo was modified. No build, test, stack, KBD or OpenSpec command was run. The only file written is this one.

REPO = /Users/gqadonis/Projects/TribeHealth/kevin/prior-auth
CHILD = REPO/.kbd-orchestrator/phases/runtime-architecture/children/web-case-to-letter
ASSESS = the scratchpad `assess/` directory holding the draft, the critic findings and the evidence files.

Method. Every `*findings*.json` under CHILD/review was parsed and every finding was read and classified by hand (no title heuristics). Review packets (`packet*.json`) were string-searched to establish when the code a late finding complains about first appeared in front of the reviewer. File mtimes were used for round spacing; they are an approximation. `~/.cargo/config.toml` was read (no tokens present). Skill files were read or grepped. Counting rules are stated where used.

Verdict on the draft: **PASS-WITH-CHANGES, conditional** — Step B1, Step B2, Step A2, Step A4, Step C3 and the §8 estimates must be rewritten before the operator sees it. If they are not, the verdict is BLOCK, because B1 as written removes the review rounds that caught authority defects and saves almost no time.

---

## 1. The review record, round by round (answers C1)

Counting rule. web-01 holds duplicate `findings-passN-block.json` / `findings-passN.json` pairs with identical content for passes 2–5; each pair is one round. web-00's 13 critic rounds are not persisted and are excluded. "Product" = a claim about shipped code or runtime configuration. "(ii)" = evidence missing for a required gate. "(iii)" = packet, manifest, record format, or the circular "tasks 2.1/3.1 are unchecked" finding. Severity is as recorded (CRITICAL/WARNING in REST diff-mode reviews; critical/major/minor in artifact-critic reviews). Only blocking severities are counted (CRITICAL, major); WARNING/minor are noted.

### web-01-case-command-core (REST judge gpt-5.5, diff mode)

| Round | Verdict | Product CRIT | (ii)/(iii) | Notes |
|---|---|---|---|---|
| R1 `findings-block.json` | BLOCK | 3 | 0 | routes discard capabilities; AppServices authorizes every human user; `MAINTAIN` on PG<17 (**false positive**, project is PG18 — evidence-time-allocation.md:40) |
| R2 pass2 | BLOCK | 1 | 0 | gate denies write-only callers (repair chain of R1) |
| R3 pass3 | BLOCK | 1 | 0 | same chain, one layer down |
| R4 pass4 | BLOCK | 1 | 0 | `connect` made `#[cfg(test)]` |
| R5 pass5 | BLOCK | 0 | 1 (iii, circular) | "2.1 and 3.1 are unchecked" |
| R6 pass6 | PASS | – | – | 1 WARNING |
| R7 pass7 | BLOCK | 2 | 0 | **both rejected as false positives** with compiler output and the mounted route — `pass7-rejection-feedback.md` |
| R8 pass8, final | PASS | – | – | |

### web-02-case-publication-ui

| Round | Verdict | Product CRIT | (ii)/(iii) | Notes |
|---|---|---|---|---|
| R1 `findings-block.json` | BLOCK | 0 | 1 (iii) | packet omitted untracked files (`use-case-command.ts` absent from `packet.json`) |
| R2 pass2 | BLOCK | 2 | 0 | NOT NULL replica migration; annotation bodies persisted durably |
| R3 pass3 | BLOCK | 0 | 1 (ii) + 1 (iii) | foreign-tenant sabotage not evidenced; placeholder command |
| R4 pass4 | BLOCK | 0 | 2 (ii) | demands `cargo build --workspace …` and `cargo test --workspace && flutter test` inside a T1 change |
| R5 pass5 | BLOCK | 2 | 0 | confirm-without-verify; reconciliation loses expected outcome. **Both strings are in packet-pass2, pass3 and pass4** |
| R6 pass6 | PASS | – | – | 1 WARNING |

Six rounds span 03:09 → 03:30 by mtime: **21 minutes**.

### web-03-administering-entity-resolution

| Round | Verdict | Product | (ii)/(iii) | Notes |
|---|---|---|---|---|
| R1 | BLOCK | 0 | 2 (iii) | circular; recorded command missing `--output` |
| R2 | BLOCK | 0 | 1 (iii) | manifest lists files not in diff |
| R3 | BLOCK | 0 | 3 (ii) | workspace build / workspace tests / audit demanded in a T1 change |
| R4 | BLOCK | 0 | 2 (iii) | non-runnable recorded command; placeholder |
| R5 | BLOCK | 1 CRIT | 0 | gate rejects resolver-only callers |
| R6 | BLOCK | 1 CRIT | 0 | repair-induced (`authorize_administering_entity_target` first appears in packet-pass6) |
| R7 | BLOCK | 1 CRIT | 0 | gate reads a resolution instead of authorizing the case. In packet since R1 |
| R8 | BLOCK | 1 CRIT | 0 | committed command becomes unreconcilable. `refreshCommitted` in packet since R1 |
| R9 | BLOCK | 1 CRIT | 0 | **idempotent retry returns the receipt before re-authorizing.** `RETURN original.result` in packet since R1 |
| R10 independent critic | (no verdict field) | 2 CRIT | 0 | member input never evaluated; no invalidation on plan/rule/entity change. +2 WARNING |
| R11 | BLOCK | 1 CRIT (**false positive**, MAINTAIN again) | 2 (iii) | lock file not in diff; circular |
| R12, 13, 14, 16, final96, 96b, 98 | **PASS ×7** | – | – | |
| final99 | critic BLOCK / judge PASS | 2 major | 0 | exclusive end rendered "Effective through"; "Matching rule expired" misattributes. Both strings in packet since R1 |
| final101 | critic BLOCK / judge PASS | 0 (2 minor) | – | blocked on two minors |
| final102 | critic BLOCK / judge PASS | 1 major | 0 | mounted 409 where frozen contract says 422 |
| final103 | critic BLOCK / judge PASS | 1 major | 0 | guidance lost on navigation. Repair-induced (from 102). Not "102 repeated unrepaired" as the critic wrote |
| final104 | critic BLOCK / **judge BLOCK** | 0 | 2 + 1 (ii) | tests mock the boundary the artifact claims |
| final105 | critic BLOCK / judge PASS | 0 | 1 (ii, part iii) | sync sources not frozen; `plan_key` not exercised at two boundaries |
| final106 | PASS / PASS | – | – | |

R1–R9: 04:57 → 05:37, **40 minutes** for nine rounds. final99 → final106: 00:31 → 02:40, about 20–40 minutes per round.

### web-04-document-upload-core

| Round | Verdict | Product | (ii)/(iii) | Notes |
|---|---|---|---|---|
| R1 REST | BLOCK | 1 CRIT | 1 (iii) | page count discarded; packet omits units |
| R1 artifact-critic | fail | 2 major | 1 major (ii) | **PHI bytes and staging left after a pre-commit failure**; source reopened as octet-stream; validator claims cleanup it never tests. +2 minor |
| R2 both | PASS | – | – | |

### web-05-document-processing-ui

| Round | Verdict | Product CRIT | (ii)/(iii) | Notes |
|---|---|---|---|---|
| R1 | BLOCK | 2 | 0 | status table never publishable; fresh schema lacks requested columns. +1 WARNING (circular) |
| R2 | BLOCK | 1 | 0 | NOT NULL replica upgrade, same `ALTER` as web-02 R2 |
| R3 | BLOCK | 1 | 0 | cutover does not start a new generation |
| R4 | BLOCK | 1 | 0 | `ELECTRIC_INSECURE` with published port 3000. **Present at HEAD d952425 (`git show HEAD:docker-compose.yaml` lines 87–89) and in packet-pass2 and pass3.** Producer confirmed valid — `review-feedback-pass4.md` |
| R5 | BLOCK | 0 | 2 (iii, circular) | |
| R6 | PASS | – | – | |

Six rounds span 10:29 → 10:49: **20 minutes**.

### Answers

**Are the late findings genuine?** Yes. web-02 R5 (two), web-03 R9, R10 (two), final99 (two), final102, final103, web-05 R4 are real defects at CRITICAL or MAJOR. web-05 R4 was confirmed valid by the producer in writing. The exceptions are documented in the record itself: web-01 R7 (two) and the two `MAINTAIN` findings are false positives.

**(a) Product CRITICAL/MAJOR findings first appearing after round 3.** Literal round index: **18 of 32** (web-01 3, web-02 2, web-03 12, web-05 1). Net of the four known false positives: **15 of 28**. Under the most charitable reading of Step B1 — count only rounds that carried a product finding, cap at three — the cap still drops **12** (web-01 3, web-03 8, web-05 1), including the retry-before-reauthorization authority hole, the unevaluated member input, the missing invalidation, and the open Electric endpoint.

**(b) Per-round yield and origin.** 23 rounds carried a product finding; they carried 32 findings: **1.4 per productive round, never more than 3**. No REST round returned more than three findings of any kind. Of the 15 valid late findings, **at least 11 concern code that was already in the first complete packet the reviewer was shown** (string-verified above), 2 are repair-induced (web-03 R6, final103), 2 undetermined (web-01 R4, web-03 R5). web-03 passed review **seven consecutive times** before final99 found two majors in strings present since R1.

Mechanism the record shows: the REST packet's `diff` field is 150 KB to 1.65 MB per round (web-03: 815–873 KB every round; first packets of web-02/04/05: 1.6–1.7 MB) because the diff base is the Sep 12 commit. One reviewer, one oversized packet, one to three findings per pass. That is low recall, and it is serial discovery.

**What the record supports.** The critic's position. A round cap is the wrong instrument, for two independent reasons: it discards valid authority findings, and REST rounds are cheap — web-02 and web-05 ran six rounds each in about 20 minutes, so capping web-02 at three saves roughly ten minutes and loses two CRITICALs. The time sits elsewhere: probe runs (web-03's fresh probe: 49 runs, 3.98 h), the freeze → fresh critic + fresh judge loop where every repair changes the manifest digest and voids the verdict (web-03 task 3.1: 328 min), and web-00's 13 critics (184 min).

**Judge tie-break.** In the five final rounds where judge said PASS and critic said BLOCK, the critic held a valid product major in three (99, 102, 103), minors in one (101), and an evidence gap in one (105). "Judge's verdict stands" would have shipped 409-for-422 and the lost guidance. The report's sentence "judge PASS five times, critic BLOCK six" is arithmetically correct and already says "both blocked only at final104" in the evidence file; the draft dropped that clause.

### Ruling C1 — **UPHELD**

One correction to the critic: final103 is a new defect introduced by the 102 repair, not 102 unrepaired.

Correction the report must carry: delete B1's round cap and the judge tie-break. Replace with the policy in section D below. Print the counterfactual table (18 literal / 12 charitable) in §9 beside the FCA paragraph. Add the four documented false positives, and strike "No finding's validity was independently checked … could not be determined": `pass7-rejection-feedback.md`, `review-feedback-pass4.md` and evidence-time-allocation.md:40 determine it for five findings.

---

## 2. Classification of every blocking finding (answers C3)

Deduped blocking findings (CRITICAL + major) in the persisted record: **56**.

| Class | Count | Share | Of which CRITICAL (of 45) |
|---|---|---|---|
| (i) product defect | **32** | 57 % | 26 |
| (ii) evidence missing for a required gate | **11** | 20 % | 6 |
| (iii) packet / manifest / format / circular | **13** | 23 % | 13 |

Inside the classes:

- (i): 4 documented false positives → 28 valid.
- (ii): **5 of 11** demand Tier 2 workspace-wide commands (`cargo build --workspace`, `cargo test --workspace && flutter test mobile`, `bash scripts/audit.sh`) inside a change whose plan says "only applicable Tier 0 and focused Tier 1" (web-02 R4 ×2, web-03 R3 ×3). The other 6 are legitimate: foreign-tenant sabotage unevidenced (web-02 R3), validator claims cleanup it never tests (web-04), tests mock the privacy boundary the artifact certifies (final104 ×3, final105).
- (iii): **5 of 13 are circular** — "tasks 2.1 and 3.1 are unchecked" (web-01 R5, web-03 R1, web-03 R11, web-05 R5 ×2). Task 2.1 *contains* "adversarial review", so it cannot be checked before the review that is blocking on it. Two more (web-02 R1, web-04 R1) are the untracked-files packet defect.

The report's "26 of 45 CRITICALs were product defects" is **confirmed exactly** by hand classification. Its "17 of 45" paperwork count is 19 by my count. Its "27 of 68" could not be reproduced.

### Ruling C3 — **UPHELD, with a refinement the critic did not make**

The two-way split the critic proposes ("evidence missing for a kept gate blocks; packet/format is logged") would still bless the five tier-inflating findings unless "kept gate" is bound to the change's own tier. Correction: three rules. (1) Evidence missing for a gate in the kept list, at the change's tier, blocks. (2) A demand for a higher-tier command is rejected by rule, citing CLAUDE.md "Running a tier before its point is a violation". (3) Packet, manifest, format findings are logged. (4) The criterion "2.1/3.1 checked" is removed from the packet handed to the reviewer. Replace the 35–40 % line with the three counts above.

---

## 3. Rulings on the remaining CRITICAL findings

### C2 — **UPHELD, severity reduced to WARNING**
The repeated defect (web-02 R2, web-05 R2: same `ALTER TABLE cases ADD COLUMN … NOT NULL` in `web/src/shared/sync/pglite-schema.ts`) is a populated-replica defect; a fresh-install proof cannot see it. The cost data settles it: `--install-mode upgrade` totals 4,067 s across the window against 24,118 s for fresh (evidence-time-allocation.md:84), and web-03's 16 upgrade runs had zero failures. Deferring the upgrade proof saves about an hour and removes the check aimed at the only defect class that has recurred. Reduced severity because no production replica exists and the replica can be truncated and resynced. Correction: move "populated upgrade proof" to the keep column; note that both hits were found by the reviewer reading SQL, so the cheap fix is a checked-in populated fixture plus the gotchas entry.

### C4 — **UPHELD** (full list in section 5)

### C5 — **UPHELD**
`current-waypoint.json`, `position.json`, `position-reminder.txt` and CHILD/`progress.json` all carry `generatedBy: kbd-runtime`, `sourceRevision = derivedRevision = 1699`, `updatedAt 2026-09-18T18:07:41Z`, `conflictCount 0` — written minutes before this review, in one projection pass. The waypoint says `change: null`, `currentTask: null`, `exactNextCommand: "/kbd-apply web-01-case-command-core"`. The same revision's `progress.json` says web-01 DONE and web-06 IN_PROGRESS. A projection that disagrees with itself at one revision is a live projection defect, not a stale file. Second defect in the same output: `position-reminder.txt` directs the reader to `phases/runtime-architecture/progress.json` (the parent), not the child. The reminder names `prometheus kbd phase activate|transition`; that moves phase position, which is already correct. Correction: remove A4 from "today"; reclassify as a kbd-runtime projection bug to report upstream; tell Codex in the superseding message (A5) that `progress.json changes[]` is authoritative and the "Next command" line is wrong. The cost is unmeasured: the file instructs Codex to read it as its first tool call every turn.

---

## 4. Rulings on WARNING findings

**W1 — UPHELD.** `git status --porcelain`: 343 `??`, 132 `M`, 76 `D` (= the report's 551). Includes `desktop/src-tauri/**` (modified and untracked) which CHILD/`scope.json` denies, and `docker-compose.ra05.yaml`. HEAD is d952425, Sep 12. Correction as the critic states: commit at the web-06 boundary, after `bash scripts/audit.sh` and a PHI/secret scan, split by phase, operator decides who commits. Add what the critic missed: the commit also shrinks every review packet from ~1 MB to the change's own diff, which bears directly on reviewer recall (section 1).

**W2 — UPHELD, and both parties are partly wrong.** `~/.cargo/config.toml`: `build-dir = "/Volumes/my-passport/cargo-build/{workspace-path-hash}"`, `rustc-wrapper = /opt/homebrew/bin/sccache`, `SCCACHE_DIR = /Volumes/my-passport/sccache`, `jobs = 10`. `mount`: `/dev/disk6s2 on /Volumes/my-passport (hfs, …)` — an external HFS+ volume. A test binary path in the transcript confirms it: `/Volumes/my-passport/cargo-build/02/70d32e…`. So the build directory is already per workspace; Step A2's "give this project its own target directory" is a no-op. Actual lock text in the extracted transcript (ASSESS/events.jsonl, whole history): `Blocking waiting for file lock on build directory` ×15, `… on package cache` ×37; inside the web window 2 and 1 (lower bounds; the extract samples outputs). The evidence file's "shared Rust target lock" is the agent's paraphrase, not cargo's message. Because the build dir is hashed per workspace path, a **build-directory** lock wait can only come from another cargo process in *this* repo — the root's own concurrent commands or its critic/judge subagents, which record commands they ran. The critic's guess (package cache only) is also incomplete. Shared across the three Codex sessions: the CARGO_HOME package-cache lock, the sccache server and its cache, the external drive's I/O, and CPU (`jobs = 10` each). Not shared: build dir, final `target/`. Unexamined: `/Volumes` was modified Sep 17 23:35–23:38, i.e. the drive appears to have remounted about 30 minutes after the 23:06 wake, inside the unexplained 23:10 → 00:06 gap. Correlation only. Correction: replace A2 with "do not run cargo concurrently inside this repo (root vs subagents); consider a project-level build-dir on the internal SSD; measure before prescribing", and quote the two lock messages.

**W3 — UPHELD, stronger than the critic put it.** ASSESS/timealloc/pmset_sleepwake.txt, 2026-09-17 11:44:01: `Entering Sleep state due to 'Clamshell …`. The 10.5-hour block was a lid close. `caffeinate -dims` does not prevent clamshell sleep. Correction: A1 becomes "keep the lid open or run in clamshell mode on power with an external display, or run the loop on a machine that stays up"; any `pmset` change is a system setting and is the operator's to make. State 24.5 % as a ceiling.

**W4 — UPHELD** (recomputed in section 6).

**W5 — PARTIALLY UPHELD.** The evidence reconciles it: 1,386 wall − 630 asleep − 68 unexplained gap = 688 ≈ 689 active minutes = 11.5 h. The draft omits the 68-minute gap, so its arithmetic does not close on the page. Add the term.

**W6 — UPHELD.** The inconsistency is a real error: evidence-time-allocation.md:86 gives 384 + 269 + 232 + 157 + 7 = **1,049** file touches. 269/1,049 = 26 %. The draft's "269 of 653" uses 384 + 269 as the denominator, which would be 41 %. Correct to "26 % (269 of 1,049)". The larger point also stands: repairs to valid product CRITICALs happen inside task 2.1/3.1 windows, so "62 % in gate and closure" is not 62 % ceremony. The draft must say so where it first uses the number.

**W7 — UPHELD** (section 7).

**W8 — PARTIALLY UPHELD.** Shapes are split. Request envelopes are private structs in the shell crate: 16 serde derives across `crates/aso-server-axum/src/routes/*.rs` (`cases.rs:30–58`: `CaseQuery`, `CreateCaseMutation`, `UpdateCaseMutation`, `TransitionCaseMutation`, all `camelCase`, `deny_unknown_fields`, carrying `command_id` and expected revisions). Payload and response types (`CaseInput`, `CaseStatus`, receipts) live in `aso-host` (64 derives across 15 files). So "derive from the Rust DTOs in aso-host" covers half the wire. Correction: the schema artifact must be emitted from both crates; deriving in `aso-server-axum` raises no audit-check-4 question. On parallelism: CHILD/execution.md:16 — "Parallel agents may … receive explicitly disjoint files **within the active change**" — so splitting the presentational half of an *active* UI change needs no amendment, and the draft missed that. A lane working ahead on a *future* change is not covered (execution.md:27 "archive it before activating the next change"), so the draft's cross-change lane still needs the amendment. `scope.json` `__note`: "Enforced advisorily by check-child-scope.sh" — per-lane ownership there would be advisory.

**W9 — UPHELD.** web-08 vs web-10 with change names stripped: `design.md` differs on 2 lines, `proposal.md` on 6; `specs/prior-letter-command/spec.md` is a 17-line frame carrying change-specific scenario text ("exact immutable document version/page/span/date … refused while mandatory void work or an unargued mandatory gap remains"). "HTTP/native" appears on 8 lines of tasks.md; native/Tauri wording on 12. Correct both counts; B6 must show the tooling permits skipping archive or be dropped.

**W10 — UPHELD on reading.** web-03 R9 (retry returns a receipt before re-authorizing) is exactly the class the draft moves to hardening under "conflicting-retry". For commands that consume revision tokens, retry semantics are authority semantics. Keep retry/re-authorization proofs per change for sign, acknowledge and evidence-assembly commands; add foreign-practice command refusal, stale-revision refusal and no-PHI-in-logs to the keep column.

**W11 — UPHELD, and the draft's model claim is contradicted by the record.** `CLAUDE.md -> AGENTS.md` is a symlink. All 43 REST findings files record `"producer_model": "gpt-6-astra"`. The root session's only two model records (both Sep 6) show one `gpt-5.6-sol` and one `gpt-6-astra`; critics and judges ran `gpt-5.6-sol` / `gpt-5.5`. "The sampled threads run gpt-5.6-sol" describes subagents. Delete the mismatch claim and the "correct or remove the Astra section" action; keep only "remove the duplicated Testing Policy block".

**W12 — UPHELD.** Packet size (section 1) makes "smaller per-dimension packets" and "commit per change" first-order options, not omissions of detail.

**S1 — UPHELD.** `web/src/features/surgeon-gate/` has component, hook (+test), api, model; `web/src/app/routes/surgeon-gate-route.tsx` is a five-line `RoutePlaceholder`. The hole is a route mount plus its gate evidence.
**S2 — UPHELD.** **S3 — UPHELD** (`docs/design/prototype/screens/` has no denial-classification or response-letter screen). **S4 — UPHELD.**
**S5 — RESOLVED.** Both counts are right under different rules. Raw files: 38 BLOCK, 49 CRITICAL. Deduping web-01's four duplicate `-block` files and counting web-04's artifact-critic `fail`: 35 and 45. State the rule.

---

## 5. Skill vetting against the four rules (C4)

| Skill | Finding | Disposition |
|---|---|---|
| `react-vite-stack` | SKILL.md:7–8, 26–28, 70–83, 113–123: TanStack Router, `@tanstack/react-query`, `QueryClientProvider` in `main.tsx`, `useQuery` for server state. Repo: react-router 7.9.1, audit check 2 rejects the dependency | **Drop** |
| `pem-local-first` | Prohibits TanStack Query/SWR/Apollo; PGlite; Zustand transient only | Safe as-is |
| `a11y-gate` | WCAG 2.2 AA checklist; no conflict | Safe as-is |
| `error-handling`, `async-patterns` | Rust-generic; no conflict | Safe as-is |
| `axum-patterns` | Axum 0.8 generic. One-line reminder that Axum types stay out of `aso-host` | Safe; optional reminder |
| `hybrid-design-tokens` | Same source `assets/templates/design-tokens/tokens.toml` and same script; names the web output `desktop/src/theme.css`. Repo output is `web/src/theme.css` | **Override line** |
| `reference-ui-fidelity` | Line 68: "This project is strict Flat 2.0: no visible lines or borders anywhere" — a claim about some other project; also prescribes Shadcn/Assistant UI and Tauri/Flutter persistence | **Override line**: authority is `docs/aso-brand-guide.html` + `docs/design/prototype`; web only under revision 10 |
| `clean-architecture` | Line 132: application hooks "TanStack Query or entity hooks"; layer names differ from the repo's Component → feature hook → feature api → http client | **Override line**: entity hooks only; repo layering wins |
| Impeccable `polish` | Requires `/frontend-design` and `/teach-impeccable` first; neither is in a Codex skill root. Token-only rule agrees with rule 3 | **Override line**: brief = brand guide + prototype; no third chromatic family; text label on every evidence state; ask nothing |
| Impeccable `critique` | Interactive by design: asks the user 2–3 questions, persona scoring, recommends further slash commands. In an unattended loop it stalls or widens scope | **Drop from Codex task text**; run it operator-side at a milestone |
| Claude-only `frontend-patterns` | Line 15 "data fetching (SWR, React Query …)"; lines 157–199 hand-rolled `useQuery` | **Do not copy** |
| Claude-only `backend-patterns` (16 off-stack hits), `database-migrations` (10), `postgres-patterns` (2), `api-design` (1) | Not read in full | Vet before copying |
| Claude-only `rust-patterns`, `rust-testing`, `healthcare-phi-compliance`, `hipaa-compliance` | Zero conflict-term hits; not read in full | Likely safe; vet |

None of the named skills touches the three-evidence-state rule or the no-shell rule adversely. None was checked for version pins.

---

## 6. Estimates recomputed (W4)

The draft's baseline is wrong, and so is the critic's. 30.9 h includes 46 min of planning and 115 min of the still-open web-06. The six completed changes took 228 + 180 + 104 + 689 + 212 + 282 = **1,695 min = 28.3 h → 4.7 h mean, 3.7 h median, 3.35 h mean without web-03** (the critic's 3.9 h repeats the draft's error). Gate + closure share on those six: 1,155 / 1,695 = **68 %**; without web-03, 529 / 1,006 = **53 %**.

| Quantity | Defensible range | Basis |
|---|---|---|
| Remaining 12 changes at current policy | **40–57 active h** (less 1.9 h already spent on web-06) | 12 × 3.35 to 12 × 4.7. Upward pressure: UI changes trend 104 → 282 min; web-08/10/14 carry the FCA citation rule; web-17 is a Tier 2 campaign |
| Effect of a revised Step B | **15–35 % of active time**, i.e. 26–48 h remaining | Removable: probe cost (tests are 37.7 % of active; fresh probes 24,118 s), 13 packet findings and 5 tier-inflating findings no longer forcing rounds, digest-voids-verdict re-reviews. Not removable: repair of 28 valid product findings, which sits inside the same task windows (W6). "Halves gate and closure" has no support |
| Walkable criteria → evidence → letter → sign | **15–25 active h** after amendments, plus the contract change and re-anchoring | Six changes (rest of 06, 07–11) plus the gate mount. 6 × 3.35–4.7 = 20–28 h, less 15–35 %. The draft's 10–15 h is below the floor. Only meaningful once S2's cut list exists |
| Hardening change | Not estimable; must not be costed at zero | It inherits every deferred proof |

If the operator wants one number, the honest answer is that none should be given: n = 6, one outlier holds 41 % of the time, and the remaining work is harder than the sample. Present the table as arithmetic scenarios.

---

## 7. Browser smoke and the tier ladder (W7)

REPO/.claude/rules/typescript.md tier table: "T3 milestone only | e2e; visual regression; bundle-size gate". CLAUDE.md: "Running a tier before its point is a violation, not diligence." CHILD/execution.md:12: "No broad local integration runs before web-17." A per-UI-change browser smoke recorded as evidence **is** a tier violation and a plan violation as written. The Testing Policy ("All testing is local full-integration testing. Stand the stack up locally") says where tests run, not when, and does not license it.

So the health indicator "Browser runs in window: 0 — Critical" scores the loop for obeying its plan. It is a valid observation against goal G1 and must be labelled "consequence of plan revision 10 and the tier table, by design".

How to frame it. Two options that need no override, and one that does:

1. **Inside the rules (T1).** A routed render test in vitest that mounts the real route composition and asserts on the destination. This is exactly what final103/final104 found missing ("they never mount the navigation destination"; "the only retained destination test replaces both data-loading boundaries with mocks") and what CLAUDE.md's 2026-09-06 lesson asks for ("only a rendering test caught it"). It catches the wiring class the draft wants the browser for.
2. **Not a gate at all.** The operator opens the dev server to look. No evidence recorded, no verdict attached. That is a demo, not a tier.
3. **Override.** A recorded browser smoke per UI change. Present it as an explicit operator amendment that quotes the T3 row and execution.md:12, and says what it buys over option 1.

---

## A. Overall verdict

**PASS-WITH-CHANGES.** The diagnosis half of the draft is sound and mostly confirmed: 26/45 product CRITICALs reproduced exactly, 35 BLOCK rounds reproduced, the uncommitted tree, the absent write-side contract, the skill catalog truncation, the sleep block. The prescription half has one recommendation that would do harm (B1), three that would do nothing (A1 as worded, A2, A4), and one that would inject a banned dependency (C3 naming `react-vite-stack`). The critic's BLOCK was justified on the text as drafted; all five CRITICALs are upheld (C2 at reduced severity).

## B. Required changes, in priority order

1. Replace Step B1 and delete the judge tie-break (section D). Print the counterfactual: 18 valid-or-claimed product findings after round 3, 15 net of false positives, 12 under the charitable reading.
2. Replace B2 with the four-rule split in section 2, and replace the 35–40 % line with 32 / 11 / 13.
3. Fix Step A: A1 (clamshell sleep; caffeinate does not apply), A2 (build dir already per workspace; contention is intra-repo plus package cache, sccache, external HFS+ drive), A4 (live projection defect, report upstream, remove from "today"), A3 (timing, audit, scan, scope — W1), A7 (drop the Astra edit and the model-mismatch claim).
4. Fix Step C3 per the table in section 5.
5. Replace §8 "Expected effect" with the scenario table in section 6, and correct 5.2 h → 4.7 h, 62 % → 68 % (53 % without web-03).
6. Reframe the browser smoke per section 7; relabel the zero-browser-runs indicator.
7. Move populated-upgrade and retry/re-authorization proofs to the keep column (C2, W10); add the three missing gates.
8. Correct the facts: 269 of 1,049; the 68-minute gap; 8 "HTTP/native" lines; spec.md is not template text; surgeon-gate needs a mount, not a build; request envelopes live in `aso-server-axum`; execution.md:16 already allows intra-change parallel agents; counting rule for 35/45 vs 38/49.
9. In §9, name the concrete late findings, and state that finding validity *is* partly determinable from the record.

## C. What both the report and the critic got wrong or missed

1. **REST review rounds are cheap.** Six rounds in ~20 minutes (web-02, web-05), nine in 40 (web-03). The draft wants to cap them and the critic defends them, and neither noticed that their count is not where the hours go. The hours are in probes, in the freeze → critic + judge loop, and in web-00.
2. **The circular finding.** Five blocking CRITICALs say "2.1/3.1 unchecked", where 2.1 includes the review doing the blocking. The critic's proposed rule would keep these as "evidence missing".
3. **Tier inflation by the reviewer.** Five findings demand Tier 2 workspace commands in a Tier 1 change. The reviewer is pushing the loop to violate its own ladder, and the draft cites that ladder without noticing.
4. **Documented false positives exist** (4 of 32 product findings, 12.5 %), with written rejections in the review directory. The draft says validity cannot be determined; the critic treats every late finding as genuine.
5. **Packet size is the recall mechanism.** 150 KB–1.65 MB of diff per round to one reviewer, because the diff base is Sep 12. This links the commit (A3) to review quality, and explains one-to-three findings per pass better than either party's account.
6. **Seven consecutive PASS verdicts on web-03 preceded four valid majors.** A PASS from the REST diff reviewer is weak evidence. And the re-reviews happened because any repair or evidence edit changes the manifest digest and voids the verdict — the verdict is bound to the wrong digest.
7. **Both baselines are wrong** (5.15–5.2 h and 3.9 h); see section 6.
8. **Clamshell sleep** is in the evidence agent's own pmset extract. The draft prescribes caffeinate; the critic says "cause unclassified".
9. **web-05 R4's defect predates the phase** — it is in the Sep 12 commit. The per-change review caught a standing tenant-boundary hole the phase did not create, which is an argument for the review and against scoring it purely as change cost.
10. **Build-directory lock waits are intra-repo.** The draft blames other projects; the critic says it cannot be the build dir. Cargo's message says it is, and the hashed path says the contender is this workspace.

## D. The review policy the record best supports

Keep review uncapped on valid product findings, and change its shape: commit per change so the packet is that change's diff, then run one wide round of parallel single-dimension critics (authority, tenant/privacy, migration, reconciliation, contract conformance, UI truthfulness) on small packets, repair the union in one batch, and run one confirmation round on the delta. Block only on product findings and on missing evidence for a named kept gate at the change's own tier; log packet, format, circular and minor-only findings; reject higher-tier demands by rule; bind the verdict to source digests so an evidence edit does not void it. The judge gets no tie-break: it passed three rounds that held valid majors.

## Uncomfortable for this ruling

The origin analysis rests on string presence in packets, which shows the reviewer was shown the text, not that the defect was identical at that round. Round spacing rests on file mtimes. "Valid" means "not rejected in the record and plausible on reading"; no finding was reproduced by running code. Parallel single-dimension critics are inferred from a recall pattern; the record contains no trial of them, and web-00's 13 critics show that fresh critics without a convergence rule can also burn three hours.

## Verification statement

Run: file reads and read-only `git status`, `git show HEAD:docker-compose.yaml`, `git diff --stat`, `mount`, `ls`, `grep`, inline python over JSON. Not run: any build, test, stack, KBD or OpenSpec command. Unverified as a result: whether any cited defect reproduces; which model the root loop ran in the web window; the cause of the 56-minute post-wake gap; whether the ten Claude-only skills are safe beyond a term grep. Written: this file only.
