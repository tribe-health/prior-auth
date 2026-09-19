# Delivery-speed assessment: web-case-to-letter

Prior Authorization Workbench · 2026-09-18 · final, after critic and judge review

Standalone assessment (iterative-evolver Assess phase, operations domain), not connected to KBD. During the assessment no repo file, KBD state, OpenSpec state or build directory was touched, and no build, test, stack, KBD or OpenSpec command was run. Afterwards, at the operator's request, the report, the Codex course-correction prompt, the evidence files and the critic and judge records were copied into this directory. The raw transcript extracts and scripts stayed in the session scratchpad and are not preserved.

## 1. Verdict

The loop is slow for five measurable reasons. The first three account for most of the hours.

1. **Review finds defects one to three at a time, and every repair restarts the review.** Each review packet carries 150 KB to 1.65 MB of diff because nothing has been committed since Sep 12. One reviewer on an oversized packet yields 1.4 product findings per productive round, never more than 3. Any repair or evidence edit changes the packet's manifest digest and voids the prior verdict, so the freeze → critic → judge loop runs again. web-03 was implemented in about an hour and spent 10.4 active hours in its gate and closure tasks.
2. **The "focused" check is a small integration campaign.** Each service probe builds a disposable database, applies every migration twice, then runs `cargo test`. One probe ran 49 times for 3.98 hours in web-03 alone. Tests are 37.7 % of active time.
3. **The machine stalls the loop.** 10.5 of 42.8 hours were a lid-close sleep. Cargo waits on locks: the build-directory lock is contended inside this repo (root agent against its own subagents), and the package cache, sccache, an external HFS+ build drive and CPU are shared with two other live Codex sessions.
4. **The plan integrates once, at change 18 of 18, and nobody has looked at the product in a browser.** This is by design (plan revision 10 and the tier ladder). It is still the reason the operator cannot see progress.
5. **Stack and design skills are invisible to Codex.** Zero loads of any React, Impeccable or Rust skill, caused by a catalog truncation that Codex logs itself. This is the cheapest fix and, so far, the smallest loss of hours.

Writing code took 16.6 % of active time. That number needs care: repairs to real defects happen inside the review-gate task windows, so the 68 % spent in gate and closure is a mix of ceremony and legitimate rework. The record lets some of it be separated, and section 4 does that.

**Recommendation.** Do not reduce review of product code. Change its shape so it finds defects in one wide pass on a small packet, stop paperwork and circular findings from blocking, make the probe cheap, commit per change, fix the machine, and name vetted skills in task text. Ordered actions are in section 8. What this costs, and what the first draft of this report got wrong, are in sections 9 and 10.

## 2. Method and evidence

Three read-only evidence agents ran in parallel and wrote cited evidence files. A critic then reviewed the draft report alone, with read-only repo access and no view of the evidence files or of how the draft was produced. A separate judge ruled on each critic finding against the repo, the review record and the evidence files, and hand-classified every persisted review finding.

| File (this directory) | Content |
|---|---|
| `evidence-time-allocation.md` | Root Codex transcript (1.13 GB, began Sep 6): 3,975 commands and 688 patches in the web window; `pmset` logs; evidence and review directories |
| `evidence-path-and-contracts.md` | Plan, execution contract, `scope.json`, the 558-line workflow contract, OpenSpec changes web-06…17, Cargo manifests, `web/package.json`, routes, prototype |
| `evidence-skill-usage.md` | 258 prior-auth Codex sessions (1.97 GB, 29,453 tool calls), `~/.codex/logs_2.sqlite`, three skill roots, all project instruction files |
| `critic-findings.md` | Critic verdict BLOCK: 5 critical, 12 warning, 5 suggestion |
| `judge-rulings.md` | Judge verdict PASS-WITH-CHANGES; round-by-round review table; 56 findings classified by hand |

Limits. Command classification is pattern-matched. Time by category is summed command duration plus inference time attributed by task window. Round timing rests on file mtimes. "Valid finding" means not rejected in the record and plausible on reading; no defect was reproduced by running code. web-00's 13 critic rounds were never persisted and are excluded from finding counts. Critic and judge ran as fresh-context Claude subagents; this was not a cross-model review, because the local model gateway (`liter-llm`) failed to connect in this session.

## 3. Goals and alignment (evolver Assess output)

Scores are judgment on a 0–100 scale where 100 means no action needed; they are ordinal, and no overall average is given.

| # | Goal | Priority | Score | Basis |
|---|---|---|---|---|
| G1 | Operator can see the happy-path UI soon | High | 25 | 6 of 18 changes done; 5 real routes plus the timeline; criteria, evidence assembly and letter absent; zero browser runs, by plan design |
| G2 | Verification effort lands at the right time | High | 35 | Rule-bound gates are correctly per change; probe cost, packet size, circular and tier-inflating findings are the waste |
| G3 | Work follows the shortest safe path | Medium | 45 | Backend chain is truly serial; two ordering-only dependencies; presentational UI not split out |
| G4 | Layers can be built concurrently against firm contracts | Medium | 35 | Read side machine-checked; write side prose plus handwritten TS with `res.json() as T` |
| G5 | Installed skills are found and used | Medium | 5 | Zero stack/design loads; process skills load only because task text names them |
| G6 | Loop runs without environmental stalls | High | 35 | Clamshell sleep, lock contention, external build drive, Docker hang, wrong next-command projection, sticky status request |

Health indicators:

| Indicator | Value | Status |
|---|---|---|
| Active time writing code | 16.6 % | Warning (no external baseline; includes no repair time booked to gates) |
| Patched-file touches that are product code | 26 % (269 of 1,049) | Warning |
| Gate + closure share of the six completed changes | 68 % (53 % without web-03) | Warning; part is legitimate repair |
| Blocking findings, deduped | 56: 32 product, 11 evidence-missing, 13 packet/format/circular | Critical for the 13; see section 4 |
| BLOCK rounds | 35 deduped (38 raw files); every implementation change blocked on first pass | Warning |
| Review packet size | 150 KB – 1.65 MB of diff per round | Critical |
| Uncommitted entries over last commit (Sep 12) | 551: 343 untracked, 132 modified, 76 deleted | Critical |
| Median context per inference request | 159 K tokens; 41 compactions; one 1.13 GB session since Sep 6 | Warning |
| Stack/design skill loads | 0 of about 470 skill reads | Critical |
| Browser runs in window | 0 | Observation against G1; a consequence of plan revision 10 and the tier table, by design |

## 4. Question 1 — Is testing happening at the wrong time?

Partly. The rule-bound checks are at the right time. The waste is in how the review is packaged, what is allowed to block, and what the probe does.

**Where the active time went** (30.9 active hours in a 42.8-hour window):

| By activity | Share | By task role | Share |
|---|---|---|---|
| Tests | 37.7 % | Verify/review gate (2.1) | 42.5 % |
| Critic/judge review | 17.2 % | Implementation (1.2–1.4) | 33 % |
| Writing code | 16.6 % | Closure (3.1) | 19.7 % |
| KBD/OpenSpec bookkeeping | 11.3 % | Planning | 2.5 % |
| Reading source | 9.3 % | Dependency gates (1.1) | 2.3 % |
| Build/lint | 7.7 % | | |

The six completed changes took 28.3 active hours: mean 4.7 h, median 3.7 h, 3.35 h without web-03. Planning was cheap (31 minutes, 4 rounds). web-00, a documents-only change, spent 184 of 228 active minutes in its gate with 13 fresh critics.

**What the review record shows** (56 deduped blocking findings, classified by hand by the judge):

| Class | Count | Detail |
|---|---|---|
| Product defect | 32 (26 CRITICAL, 6 MAJOR) | 4 are documented false positives with written rejections; 28 valid. They include a retry that returns a receipt before re-authorizing, an open Electric endpoint that bypasses the tenant boundary, and a reconciliation that can confirm the wrong projection |
| Evidence missing for a required gate | 11 | 6 legitimate (for example, the foreign-tenant sabotage proof was never evidenced). 5 demand Tier 2 workspace-wide commands inside a Tier 1 change: the reviewer pushing the loop to break its own tier ladder |
| Packet, manifest, format, circular | 13 | 5 are circular: they block because tasks 2.1/3.1 are unchecked, and task 2.1 contains the review doing the blocking. 2 are the untracked-files packet defect |

So 28 of 56 blocking findings were valid product defects, 6 were legitimate evidence gaps, and 18 should never have blocked (the 13 packet-class findings, which include the 5 circular ones, plus the 5 tier-inflating demands). The remaining 4 are the documented false positives. The review earns its cost on substance. One finding, the open Electric endpoint, predates this phase and sits in the Sep 12 commit; the per-change review caught a standing tenant-boundary hole.

**The rounds themselves are cheap; the loop around them is dear.** web-02 and web-05 each ran six review rounds in about 20 minutes. The hours are in three places: probe runs (web-03's fresh probe, 49 runs, 24 failed, 3.98 h); the freeze → fresh critic → fresh judge loop, where any repair or evidence edit voids the verdict (web-03 task 3.1: 328 minutes); and web-00's 13 critics.

**Why findings arrive late.** Of the 28 valid product findings, 15 first appeared after round 3. At least 11 of those 15 concern code that was already in the first complete packet; only 2 were introduced by repairs. web-03 passed review seven consecutive times before round final99 found two majors in code present since round 1. That is low recall per pass, caused by one reviewer reading a megabyte of diff. In the five final web-03 rounds where the judge said PASS and the critic said BLOCK, the critic held a valid product major in three.

**Why a focused check costs 5–22 minutes.** Each `scripts/test-web0N-*-service.py` run creates a disposable database, applies every server migration, reruns them, checks a checksum-mismatch refusal, then shells out to `cargo test -p aso-web-server`. In web-04, 5 of 7 failed verification runs were `cargo fmt --check` diffs that ran before `cargo check`.

**A repeated defect that was never learned.** NOT NULL column without default, breaking upgrade of a populated local replica: found in web-02 pass 2 and again in web-05 pass 2. It is not in `.prometheus/gotchas.md`. A fresh-install proof cannot see it; only the populated-upgrade proof does.

**Which gates stay per change, and which can move.**

| Keep per change | Move to one hardening change before web-17 |
|---|---|
| Lane, privacy class, exact columns and tenant predicate recorded before any relation publishes | Responsive-resize and reload checks |
| Authority refusal proven at gateway, `AppServices` and Postgres trigger | Artifact-refiner frozen packets |
| Foreign-practice command refusal; stale-revision and stale-gate refusal | Conflicting-retry proofs for read-mostly commands only |
| Retry and re-authorization proofs for sign, acknowledge and evidence-assembly commands (retry semantics are authority semantics where a revision token is consumed) | Packet-format and manifest hygiene |
| Gap/void collapse sabotage; documentless-assertion sabotage | |
| Server migration fresh proof, and populated-replica upgrade proof from a checked-in populated fixture | |
| No PHI in logs | |
| Adversarial review of the change's product diff | |

## 5. Question 2 — Is this the optimal path?

No. It is safe per stage and late to integrate.

- **Integration last.** `plan.md:18`: "Full-stack testing waits until changes web-00 through web-16 are implemented." `execution.md:12`: "No broad local integration runs before web-17." Six changes are certified in isolation and have never run together.
- **The wiring check that belongs at Tier 1 is missing.** web-03 rounds final103 and final104 found that tests "never mount the navigation destination" and that "the only retained destination test replaces both data-loading boundaries with mocks". CLAUDE.md records the same lesson from 2026-09-06. A routed render test in vitest that mounts the real route composition is a Tier 1 check and catches this class without a browser.
- **Unowned work.** web-17 requires the surgeon-gate step in the browser. `web/src/features/surgeon-gate/` already has the component, hook, API and model, and the route file is a five-line placeholder. No pending change claims the mount. Changes 13 and 15 have no prototype screen and no route, and their denial-class copy is an operator and design decision.
- **Ordering-only dependencies.** web-06 does not need web-03. web-10 does not need web-09. web-12 needs only the acknowledgement half of web-11. web-04 depended only on web-01, so web-03 did not have to block it.
- **The backend chain is truly serial.** Each command consumes a revision token from the one before: 05 → 06 → 07cmd → 08 → 10 → 11ack → 12 → 13cmd → 14 → 16 → 17. Parallelism cannot shorten it; only cheaper changes can. The existing order already runs criteria → evidence → letter → sign → denial, so a "walking skeleton" reorder would add nothing beyond the gate changes in section 8.
- **OpenSpec files.** `design.md` and `proposal.md` for web-06…17 are template text. `spec.md` is not: web-10's spec carries the document/page/span/date citation requirement and the refusal while a mandatory void or unargued gap remains. The specs carry information; the design and proposal files do not.
- **Already taken.** Plan revision 10 defers Tauri parity. KBD-generated `tasks.md` still says "HTTP/native" on 8 lines (native wording on 12), and CLAUDE.md states the 1:1 route rule without the revision-10 exception. Both invite a reviewer to block on parity. `tasks.md` is generated, so the wording can only change through canonical KBD state.
- **Context size.** One root session has run since Sep 6 with 192 compactions in total and a 159 K median context. Every inference request pays for that. A fresh session per change, started from the change's own tasks and the contract document, was not weighed by the current plan.

## 6. Question 3 — Parallel work and hardened interfaces

Useful width is two lanes. Part of it is available today without a plan amendment.

**Available now.** `execution.md:16` already permits parallel agents on "explicitly disjoint files within the active change". Inside any active UI change, the presentational half (`web/src/features/**/components`, `**/model`, route files) can go to a second agent while the root agent does publication, selectors and command reconciliation. The presentational half reads replica output, and that path is already machine-checked by `catalog-conformance.test.ts` (deployed shape catalog against TS columns against PGlite schema). web-00 also left 387 KB of fixture manifests with a SHA-256 lock and `verify.py` to build against.

**Needs an amendment.** A lane working ahead on a future change is not covered (`execution.md:27`: archive before activating the next change). It is also blocked by three facts: nothing is committed, so a new worktree has none of web-00…06; `scope.json` is one advisory allowlist for the whole child phase; and the hot files collide (`adapters/gate.rs` at 2,045 lines with one struct implementing five repository traits, `ports/mod.rs`, the sequential `migrations.rs` list, the global `PROJECTION_REVISION`, `shape-catalog.json`, `electric-shapes.ts`, `pglite-schema.ts`, `runtime-command-registry.ts`).

**The write-side contract is the soft spot.** No crate uses ts-rs, specta, utoipa, schemars or typeshare. The web app has no zod and no msw. TS DTOs are handwritten and `http-client.ts` returns `res.json() as T`. Request envelopes are private serde structs in the Axum crate (16 derives across `crates/aso-server-axum/src/routes/*.rs`, camelCase, `deny_unknown_fields`, carrying `command_id` and expected revisions). Payload and response types live in `aso-host` (64 derives across 15 files). There is no mock server, and the API will not mount without three Postgres URLs and two Kratos URLs.

Recommended hardening: emit a schema artifact from both crates, check it in, generate the TS types from it, and add a write-side conformance test beside the read-side one. A derive adds no shell name to `aso-host`, so audit check 4 is unaffected. Crate choice is an architect decision, and the version must be verified against official sources and pinned in `versions.toml`; this assessment verified no version. This change is worth doing for correctness and for the container half of UI work. It is not a prerequisite for the presentational split above, and it should not be inserted ahead of the critical path.

The limit: the costly web defects so far were in the container half (projection hooks, command reconciliation, replica migrations). That half needs the backend. Splitting out presentational work shortens UI changes; it does not remove the hard part.

## 7. Question 4 — Are the skills being used?

No. The hit rate is zero and the cause is mechanical.

- Codex logs it (`~/.codex/logs_2.sqlite`, `codex_skills_extension::render_observability`, 210 prior-auth rows): `budget_limit=5440 total_skills=1413 included_skills=238 omitted_skills=1175 truncated_skill_descriptions=1413`. The catalog has names only, no descriptions, cut alphabetically at `feynman-loop`. Codex's trigger fires on a description match, so nothing fires. Only 164 of the 238 names are unique; `artifact-refiner` appears 23 times.
- Never listed: `react-vite-stack`, `pem-local-first`, `sync-doctrine`, `hybrid-design-tokens`, `reference-ui-fidelity`, `typescript-base-patterns`, `prometheus-entity-skills`, every `kbd-*` skill.
- The Impeccable skills exist only under `~/.TOOLS/skills/agents` (486 directories), where Codex's scan hits a traversal limit (16 ERROR rows).
- Ten skills exist only on the Claude side, including `rust-patterns`, `rust-testing`, `postgres-patterns`, `database-migrations`, `api-design`, `backend-patterns`, `frontend-patterns`.
- Of about 470 `SKILL.md` reads since Sep 4, about 97 % are process skills: `kbd-apply` 138, `adversarial-review` 105, `artifact-refiner` 56, `kbd-status` 52. The `kbd-*` skills are absent from the catalog and load constantly because task text names them. Naming works; discovery does not.
- No project file names a stack or design skill. The UI changes contain zero references to `docs/design/prototype`, the brand guide or the tokens, and reduce UI to one task line each.
- No skill hit counter exists on this machine; these figures were reconstructed from transcripts.

**Do not name skills blind.** The judge read each skill against the four rules:

| Skill | Disposition |
|---|---|
| `pem-local-first`, `a11y-gate`, `error-handling`, `async-patterns`, `axum-patterns` | Name as-is (for `axum-patterns`, add a reminder that Axum types stay out of `aso-host`) |
| `hybrid-design-tokens` | Name with an override: web output is `web/src/theme.css` (the skill says `desktop/src/theme.css`) |
| `reference-ui-fidelity` | Name with an override: authority is `docs/aso-brand-guide.html` and `docs/design/prototype`; the skill's "no borders anywhere" line describes another project |
| `clean-architecture` | Name with an override: entity hooks only; the repo's layering wins |
| Impeccable `polish` | Name with an override: brief is the brand guide and prototype; no third chromatic family; text label on every evidence state; ask no questions |
| `react-vite-stack` | **Do not name.** It prescribes `@tanstack/react-query`, `QueryClientProvider` and TanStack Router. The project bans the first (rule 4, audit check 2) and uses react-router 7.9 |
| Impeccable `critique` | **Do not name in Codex tasks.** It is interactive and would stall an unattended loop. Run it operator-side at a milestone |
| Claude-only `frontend-patterns` | **Do not copy.** It carries SWR and a hand-rolled `useQuery` |
| Other Claude-only skills | Vet before copying; `backend-patterns` and `database-migrations` had off-stack term hits and were not read in full |

Size of the loss so far: none of the 19 findings on the two finished UI changes concerned design, accessibility or tokens, and `node_modules` exploration was negligible in web-02/05. The design-quality cost is ahead, on 07, 09, 11, 13 and 15, the screens the operator wants to see, where no gate checks the UI against the prototype.

## 8. Recommendation

Step A changes no plan. Steps B and C change the plan and are the operator's to deliver to Codex as a course correction at the web-06 boundary, the way revision 10 was. This assessment changed nothing.

**Step A — environment and hygiene**

1. The 10.5-hour stall was a lid close (`pmset`: Clamshell sleep). `caffeinate` does not prevent that. Keep the lid open, or run on power with an external display, or run the loop on a machine that stays up. Any `pmset` change is a system setting and is the operator's to make. 24.5 % of wall-clock is the ceiling of what this recovers, since some of those hours may have been idle anyway.
2. Stop running cargo concurrently inside this repo (root agent against its own critic/judge subagents); the transcript shows `Blocking waiting for file lock on build directory`, and the build directory is hashed per workspace, so the contender is this repo. `… on package cache` waits are shared with the two other Codex sessions, along with sccache, CPU (`jobs = 10` each) and the external HFS+ build drive at `/Volumes/my-passport`. Consider a project-level build directory on the internal SSD. Measure before and after.
3. Send Codex a fresh instruction that supersedes the Sep 16 status request. All 41 compactions in the window retain it as the last user message, and 24 turns ended in a full status report (about 88 minutes).
4. Append the populated-replica migration defect to `.prometheus/gotchas.md`.
5. Remove the duplicated Testing Policy block from AGENTS.md (`CLAUDE.md` is a symlink to it). Leave the Astra section alone; it holds the red/restore and render-level-test rules.
6. Report the next-command defect upstream as a kbd-runtime projection bug: `current-waypoint.json`, `position.json` and `progress.json` are all written in the same pass at the same revision, and the waypoint says `/kbd-apply web-01…` while `progress.json` says web-01 is DONE and web-06 is in progress. Until it is fixed, `progress.json` `changes[]` is the authority, as the reminder file itself says. Do not run a phase transition to "fix" it; phase position is already correct.

**Step B — review and test shape (operator decision)**

1. **Commit per change**, starting with a checkpoint at the web-06 boundary: after `bash scripts/audit.sh`, after a PHI and secret scan of the 343 untracked files, split by phase where the tree allows (13 entries are under `desktop/src-tauri`, which this child's scope denies). Do not move HEAD mid-gate; web-06's packet is frozen against a digest. Add "commit" to the per-change completion list. This shrinks every review packet from about a megabyte to the change's own diff, which is the recall fix.
2. **One wide round in place of many narrow ones.** Run parallel single-dimension critics (authority, tenant/privacy, migration, reconciliation, contract conformance, UI truthfulness) on the small packet; repair the union in one batch; run one confirmation round on the delta. No round cap on valid product findings. The judge gets no tie-break: it passed three rounds that held valid majors.
3. **Four blocking rules.** (a) Product findings block. (b) Evidence missing for a named kept gate, at the change's own tier, blocks. (c) A demand for a higher-tier command is rejected by rule, citing "Running a tier before its point is a violation". (d) Packet, manifest, format and minor-only findings are logged. Remove "tasks 2.1/3.1 checked" from the criteria handed to the reviewer, since it is circular.
4. **Bind the verdict to source digests**, so an evidence-file edit does not void it.
5. **Make the probe cheap.** Migrate a template database once per change and clone it per run; run the fresh-install proof once at task close; keep the populated-upgrade proof, fed from a checked-in populated fixture; run `cargo check` before `cargo fmt --check`.
6. **Add the routed render test at Tier 1** for every UI change (section 5).
7. **Seeing the product.** Opening the dev server to look is a demo and needs no amendment, provided no evidence is recorded from it. A recorded browser smoke per UI change is a Tier 3 and `execution.md:12` violation as written; if the operator wants it, make it an explicit amendment that quotes both rules. The Tier 1 render test covers the wiring class without it.
8. Move only the right-hand column of the section 4 table into a named hardening change before web-17. That change inherits every deferred proof and must be given real time.

**Step C — path, lanes, skills, context (operator decision)**

1. Assign the surgeon-gate route mount to a named change now. Decide the denial-class copy and screens for 13 and 15 before those changes start.
2. Use the within-change split (section 6) from web-07 onward. It needs no amendment.
3. Name the vetted skills in UI and backend task text, with the override lines from section 7. Add the prototype and brand guide as named inputs to every UI task. Copy vetted skills into `~/.codex/skills` and prune duplicates so the catalog fits its budget; whether the 5,440 budget is configurable was not determined.
4. Start a fresh Codex session per change. Weigh reasoning effort per task type; the project file already says to set it through the API.
5. Schedule the write-side contract change (section 6) off the critical path.
6. Drop B6 of the draft (skip per-change OpenSpec archive): nothing shows `/kbd-apply` will activate the next change with the prior one unarchived.

**Arithmetic scenarios, not a forecast.** n = 6, one outlier holds 41 % of the time, and the remaining changes are harder than the sample.

| Quantity | Range | Basis |
|---|---|---|
| Remaining 12 changes at current policy | 40–57 active hours | 12 × 3.35 to 12 × 4.7, less 1.9 h already spent on web-06 |
| After Step B | 26–48 active hours | 15–35 % of active time is removable: probe cost, the 18 findings that should not block, digest-voided re-reviews. Repair of valid product findings is not removable |
| Walkable criteria → evidence → letter → sign | 15–25 active hours after the amendments land | Rest of 06, 07–11, plus the gate mount |
| Hardening change | Not estimable; not zero | It inherits every deferred proof |

Active hours convert to calendar time only if Step A holds.

## 9. The uncomfortable part

- **The first draft of this report recommended capping review at three rounds with a judge tie-break. The record refutes that.** Under that cap, 18 of 32 product findings first appear after the cutoff (15 of 28 net of false positives; 12 under the most charitable reading). Dropped findings would have included the retry-before-reauthorization authority hole, the open Electric endpoint on the tenant boundary, and web-02's reconciliation that can confirm the wrong projection. The draft ranked a time-share chart above the review files. The critic caught it; the judge confirmed it from the JSON.
- **The reviews are the most valuable activity in the loop, and also its largest cost.** Half of all blocking findings were valid product defects in authority, tenancy and reconciliation code. In a product whose citations are a False Claims Act control, the honest speed-up is modest: Step B removes perhaps 15–35 % of active time. An operator expecting the happy path in an afternoon will not get it from this codebase's rules, and those rules are the point of the product.
- **The recommended review shape is untested.** Parallel single-dimension critics are inferred from a recall pattern. web-00's 13 fresh critics show that more critics without a convergence rule can also burn three hours.
- **Changing the plan mid-flight costs hours** of amendment review and re-anchoring. If the operator does only Step A plus the commit, a large share of the gain is still captured.
- **The skills finding is the weakest lever on speed**, even though zero is the most striking number here. It matters more for the quality of the screens still to come.
- **Reliability.** Time shares rest on heuristic classification with no hand-labelled validation sample. Origin analysis of late findings rests on string presence in packets. The web-03 accounting closes as 1,386 wall minutes − 630 asleep − 68 unexplained post-wake gap = 688 active (11.5 h); the cause of that gap is unknown, though `/Volumes` appears to have remounted inside it. Which model the root loop ran in the web window is unverified: review files record `producer_model: gpt-6-astra`, and the only `gpt-5.6-sol` records found belong to subagents.

## 10. Review record for this report

| Stage | Result |
|---|---|
| Critic (artifact alone, read-only repo) | BLOCK: 5 critical, 12 warning, 5 suggestion |
| Judge (repo, review record, evidence files) | PASS-WITH-CHANGES. Upheld C1, C3, C4, C5 and eleven warnings in full; C2 upheld at reduced severity; W5 and W8 partially upheld; S5 resolved as two valid counting rules |
| Changes made | Round cap and tie-break deleted and replaced (8.B2); four-rule blocking split (8.B3); Step A rewritten for clamshell sleep, intra-repo lock contention, projection bug, and the symlink; skill table vetted (7); estimates replaced by scenarios (8); browser smoke reframed against the tier ladder (8.B7); populated-upgrade and retry/re-authorization proofs moved to keep-per-change (4); counts corrected (269 of 1,049; 68 %; 4.7 h; 8 lines) |
| Found by the judge and missed by both author and critic | Review rounds are cheap and the loop around them is not; five circular findings; five tier-inflating findings; four documented false positives; packet size as the recall mechanism; digest-voids-verdict; the Electric endpoint defect predates the phase |

## 11. Verification statement

Run: three read-only evidence agents; one critic; one judge; file reads of KBD state, plan, routes, OpenSpec tasks and review JSON; transcript parsing with python in the scratchpad; read-only `git status`, `git log`, `mount`. Not run: any build, test, stack, KBD or OpenSpec command. Unverified as a result: whether current code builds or tests pass; whether any cited defect reproduces; whether any recommended crate version is current; whether the Codex skill budget is configurable; the cause of the post-wake gap; what drove plan revisions 1–9. Added to the repo: this directory only, at the operator's request after the assessment; the evidence, critic and judge files were included so the report's citations survive. Every guard recommended here traces to a finding in the review record or to a rule in CLAUDE.md; the parallel-critic shape is the one recommendation that rests on inference.
