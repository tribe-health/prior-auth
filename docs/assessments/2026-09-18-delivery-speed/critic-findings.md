# Critic findings on report-draft.md (verdict: BLOCK)

REPO = /Users/gqadonis/Projects/TribeHealth/kevin/prior-auth
CHILD = REPO/.kbd-orchestrator/phases/runtime-architecture/children/web-case-to-letter

## CRITICAL

C1. Step B1 (one adversarial pass, max two repair rounds; judge wins after two disagreements) is refuted by the review record. Cap ends review at pass 3. web-02 pass 5 found two product CRITICALs (update success confirmed without verifying fields committed; reconciliation can confirm the wrong projection) — CHILD/review/web-02-case-publication-ui/findings-pass5.json. web-05 pass 4 found "default Compose stack exposes an insecure direct Electric endpoint that bypasses the verified tenant/projection boundary" — CHILD/review/web-05-document-processing-ui/findings-pass4.json. In web-03 the judge returned PASS on rounds 99, 102, 103 while the critic found majors (exclusive validity end rendered as inclusive date; mounted incomplete-input response violates frozen HTTP contract, repeated unrepaired in 103). findings-final104-judge.json is BLOCK, so "judge PASS five times / critic BLOCK six" hides one agreement. Judge is the lower-recall reviewer yet gets the deciding vote. Correction: delete tie-break; replace round cap with a recall fix — parallel single-dimension critics (authority, tenant/privacy, migration, reconciliation, contract conformance) in one round; make MINOR-only verdicts non-blocking (findings-final101-critic.json blocked on two minors); print the counterfactual of what lands after any proposed cutoff.

C2. "Populated-PGlite upgrade proofs" is in the wrong (deferrable) column. The report's own repeated defect (NOT NULL column without default, web-02 pass2 and web-05 pass2) is a populated-upgrade defect that a fresh-install proof cannot see. Correction: keep per change, make cheap with a checked-in populated fixture.

C3. "Evidence-format and packet-manifest findings: log, never block" removes enforcement of the kept gates. web-02 findings-pass3.json CRITICAL #1: recorded evidence does not include the required foreign-tenant publication sabotage-and-restore; findings-pass4.json: constraints recorded as passed though the command is not evidenced. AGENTS.md: "An unverified claim reported as verified is worse than no check at all." Correction: split the class — "evidence missing for a kept gate" blocks; "packet manifest / file list / format" is logged. The 35–40 % paperwork share mixes the two and needs recounting.

C4. Step C3 names `react-vite-stack` for UI tasks. ~/.codex/skills/react-vite-stack/SKILL.md:7,26-27 prescribes @tanstack/react-query and TanStack Router; the project bans query caches (rule 4, audit check 2) and uses react-router 7.9. Skill contents were not vetted; same concern for the ten Claude-only skills to be copied. Correction: vet every named skill against the four rules; drop react-vite-stack or name it with an override line.

C5. Step A4 "stale pointer" diagnosis is wrong. current-waypoint.json is generatedBy kbd-runtime, revision 1699, updatedAt today; the runtime regenerates it each transition and still emits change:null, exactNextCommand web-01 while CHILD/progress.json shows web-06 IN_PROGRESS. It is a kbd-runtime projection defect. The recommended "transition command" moves phase position, which is already correct, and risks live canonical state; no actual command was named. Correction: reclassify as projection bug to report upstream; progress.json changes[] is the authority (position-reminder.txt says so); remove from "today".

## WARNING

W1. Checkpoint commit is not risk-free: git status = 343 untracked, 132 modified, 76 deleted; 13 entries under desktop/src-tauri (denied by this child's scope.json:21-24; parent-phase work); RA-era files included. web-06 is mid-gate with packets frozen against a digest; moving HEAD today invalidates the frozen packet. Omits `bash scripts/audit.sh` before commit and a PHI/secret scan of untracked files; does not say who commits. Correction: commit at the web-06 boundary after audit, split by phase/change, and add commit-per-change to the completion list.

W2. Cargo lock claim conflicts with machine config: ~/.cargo/config.toml sets build-dir = "/Volumes/my-passport/cargo-build/{workspace-path-hash}" (per-workspace), artifacts to project-local target/. Cross-project build-dir lock cannot be shared; wait is more plausibly CARGO_HOME package-cache lock, sccache or I/O. Builds run on an external WD My Passport drive — unexamined candidate for slow probes and the 56-minute post-wake stall. Correction: quote the actual lock message and session cwds before prescribing.

W3. "Recovers about a quarter of wall-clock" is only a ceiling (10.5/42.8). Sleep cause unclassified; caffeinate does not prevent lid-close sleep on battery. 24 turns ended in status reports, i.e. loop idle waiting for operator.

W4. Estimates do not follow: 12 × 5.15 = 61.8 h; halving the 62 % gate share gives ≈ 42.6 h, not 35–40. "Walkable path in 10–15 h" is below six changes × any plausible rate (≥ 21 h at ~3.5 h/change) plus surgeon-gate mount, contract change, re-anchoring. Hardening change costed at zero. Baseline skewed by web-03 (11.5 of 30.9 h); other five average 3.9 h.

W5. 23 h − 10.5 h = 12.5 h, report says 11.5; the missing hour is presumably the post-wake stall, unreconciled.

W6. Time split cannot separate ceremony from rework: repairs to real product CRITICALs occur inside 2.1/3.1 windows so count as "gate". "16.6 % writing code — Critical" has no baseline; ±5 points claim unvalidated. "688 patches" vs "653 patched-file touches" inconsistent. Simpler explanation unweighed: low critic recall per pass multiplies rounds independent of ceremony.

W7. Browser smoke per UI change contradicts the tier ladder the report cites: REPO/.claude/rules/typescript.md tier table puts e2e at "T3 milestone only". Report scores zero browser runs as Critical, i.e. scores rule compliance as failure. Testing Policy ("All testing is local full-integration testing") pulls the other way and is not cited. Correction: present as explicit operator override with the rule quoted.

W8. Contract hardening: wire request shapes are private structs in crates/aso-server-axum/src/routes/cases.rs:36-55 (CreateCaseMutation etc., command_id, deny_unknown_fields, camelCase; 16 such derives across routes/*.rs), not DTOs in aso-host. Write-side change is not a prerequisite for the presentational lane (which reads the already machine-checked replica path). CHILD/execution.md:16 already permits parallel agents on "explicitly disjoint files within the active change" — no amendment needed; report missed it. scope.json per-lane ownership asserted without checking check-child-scope.sh.

W9. "Templates in place of design" overstates: design.md/proposal.md are template text, but spec.md is not (web-10 spec carries "exact immutable document version/page/span/date" and refusal while mandatory void/unargued gap remains). Step B6 does not show tooling allows skipping archive (/kbd-apply activation, execution.md:27 "archive only a PASS"); tasks.md is generated by kbd-runtime so the HTTP/native wording can only be fixed through canonical state. Literal "HTTP/native" is on 8 lines; native-parity wording on 11 task lines.

W10. Left column omits: command-side foreign-practice tenant refusal; no-PHI-in-logs check; stale-revision / stale-gate refusal. "Conflicting-retry and lost-response reconciliation" is misplaced for sign, acknowledge and evidence-assembly commands, since the chain consumes revision tokens and duplicate submission acknowledgement is FCA-adjacent.

W11. CLAUDE.md is a symlink to AGENTS.md, so "byte-identical" is a non-finding. The Astra section holds model-independent rules (red/restore, render-level test lesson); "correct or remove" risks deleting them. Model name gpt-5.6-sol unverifiable from the artifact.

W12. Missing options: context size (159 K median, 41 compactions, 1.13 GB single session) diagnosed then dropped — fresh session per change not weighed; executing model / reasoning effort; smaller per-dimension review packets; commit per change.

## SUGGESTION

S1. Surgeon-gate hole is smaller: web/src/features/surgeon-gate/ already has component, hook, API, model; gap is mounting the route.
S2. Walking-skeleton item repeats Step B3; existing order already is criteria → evidence → letter → sign → denial. Define which acceptance clauses are cut or remove; benefit double counted.
S3. Screens 13/15 have no prototype: UI lane and Impeccable pass have nothing to build against; denial-class copy is an operator/design decision.
S4. Alignment percentages have no stated scale; "about 30 %" is an unweighted mean despite stated priorities.
S5. Critic counts 38 BLOCK files and 49 CRITICALs under CHILD/review vs report's 35 and 45. State the counting rule.

## Critic's "uncomfortable thing"

The time-share chart outranked the review files. The record supports "the critic has low recall per pass, so rounds multiply"; the fix is wider single-round review, not fewer rounds. §9 names the FCA trade in the abstract but not the three concrete late findings.
