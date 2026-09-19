OPERATOR COURSE CORRECTION — 2026-09-18 — web-case-to-letter

This is a direct operator instruction. It outranks AGENTS.md, plan.md, execution.md and every skill where they conflict, and it supersedes my 2026-09-16 status request. Stop ending turns with a full status report. Report in five lines or fewer at a change boundary, and otherwise keep working.

Nothing here weakens the four rules, the clinical-authority triple check, the three evidence states, the PHI boundary, the citation rule, or local-only testing. If you read any line below as weakening one of those, stop and quote the line to me.

## 0. When this takes effect

Finish the current web-06 task under the existing rules. Do not move HEAD, re-freeze a packet, or amend the plan while a web-06 review packet is frozen. Everything below applies from the web-06 close boundary onward. Section 1 runs at that boundary, before web-07 is activated.

Record this correction as the next plan revision through the KBD runtime's own amendment path, the same way revision 10 was recorded. Do not hand-edit generated files (`tasks.md`, `progress.json`, `current-waypoint.json`, `position.json`, `position-reminder.txt`). If you cannot confirm the amendment command exists, say so and ask me; do not invent one.

Known defect, do not act on it: `current-waypoint.json` and `position-reminder.txt` emit `exactNextCommand: /kbd-apply web-01-case-command-core` while `children/web-case-to-letter/progress.json` shows web-01 DONE. That is a kbd-runtime projection bug: `exactNextCommand` is a stored string that only a plan revision or an explicit path change rewrites, so it names whatever was current when it was last set. `progress.json` `changes[]` is the authority for the next change. Do not run a phase transition or activation to "fix" it. A fix is in flight upstream that derives the next change from task state and publishes it as `nextChange`; when your installed `prometheus` binary emits that field, prefer it and tell me. Until then, keep using `progress.json`.

## 1. Checkpoint commit at the web-06 boundary, then commit per change

The last commit is `d952425` (Sep 12). Every review packet since has carried 150 KB–1.65 MB of diff against it, and reviewers surface one to three findings per pass on a packet that size. Fix the base.

1. Run `bash scripts/audit.sh`. Paste the output. A failure stops the commit.
2. Scan every untracked and modified file for secrets and for anything that looks like real patient data. List what you checked and how. Anything doubtful: stop and show me the path, do not commit it.
3. Do not push. Do not commit on `main`; create a branch first and tell me its name.
4. Split commits by ownership where the tree allows: parent-phase RA work; `desktop/src-tauri/**` (outside this child's scope — commit it separately and do not modify it); then one commit per web change, web-00 through web-06. Where files cannot be cleanly attributed to one change, say so and group them in one clearly labelled commit rather than guessing. Conventional commit format.
5. `docs/assessments/**` is mine, not yours. Commit it in its own commit, or leave it untracked and tell me; do not fold it into a change commit.
6. From web-07 on, add "commit the change" as the last step of per-change completion, after the verdict and before activating the next change. Every review packet is then the diff of that change against the previous change's commit, and nothing else.

## 2. Review shape: one wide round on a small packet

Review of product code is not reduced. There is no cap on rounds while valid product findings remain. The shape changes:

1. Run the critics in parallel in a single round, each with one dimension and the same small packet: (a) clinical authority at gateway, `AppServices` and Postgres trigger; (b) tenant and privacy boundary, including lane/class/columns/predicate for any published relation; (c) migrations, server and local replica, fresh and populated-upgrade; (d) command reconciliation, idempotency, revision tokens; (e) conformance to `docs/architecture/web-case-to-letter-contract.md`; (f) for UI changes, UI truthfulness — what the screen claims versus what committed. Fresh context each; none sees generation history.
2. Collect the union of findings. Repair them in one batch. Run one confirmation round on the repair delta only.
3. A judge may rule a finding a false positive only with a written rejection that cites the code. A judge PASS never overrides an open critic finding at CRITICAL or MAJOR. There is no tie-break.
4. Bind the verdict to a digest of the product source files under review. Editing an evidence file, a task checkbox or a manifest does not void a verdict and does not trigger a re-review.

## 3. What blocks and what is logged

1. A product finding at CRITICAL or MAJOR blocks.
2. Missing evidence for a gate in the keep-per-change list (section 4), at this change's own tier, blocks.
3. A finding that demands a higher-tier command inside a Tier 0/1 change (`cargo build --workspace`, `cargo test --workspace`, `flutter test`, full-stack runs) is rejected by rule. Cite AGENTS.md: "Running a tier before its point is a violation, not diligence." Log it and continue.
4. Packet, manifest, file-list, format and MINOR-only findings are logged to the change's review directory and do not block.
5. Remove "tasks 2.1 and 3.1 are checked" from the criteria given to reviewers. Task 2.1 contains the review, so that criterion is circular. It has blocked five times.

## 4. Gates: keep per change, or defer

Keep per change, every change where it applies:
- Lane, privacy class, exact columns and tenant predicate recorded before any relation publishes.
- Authority refusal proven independently at gateway, `AppServices` and Postgres trigger.
- Foreign-practice command refusal; stale-revision and stale-gate refusal.
- Retry and re-authorization proofs for sign, acknowledge and evidence-assembly commands. Where a revision token is consumed, retry semantics are authority semantics.
- Gap/void collapse sabotage-and-restore; documentless-assertion sabotage-and-restore.
- Server migration fresh proof, and populated-replica upgrade proof.
- No PHI in logs.
- The adversarial review in section 2.

Defer to one new named change placed immediately before web-16 — propose its id and task list to me as part of the amendment:
- Responsive-resize and reload checks.
- Artifact-refiner frozen packets.
- Conflicting-retry proofs for read-mostly commands only.
- Packet-format and manifest hygiene.

The deferred change inherits every deferred proof. Keep a running list of what each change defers, in that change's evidence directory, so the list is complete when the hardening change opens.

## 5. Make the focused probe cheap

The `scripts/test-web0N-*-service.py` pattern rebuilds a database, applies all migrations twice and shells out to `cargo test` on every run; one probe ran 49 times for 3.98 hours. From web-07 on:

1. Migrate a template database once per change; clone it per probe run.
2. Run the fresh-install migration proof once, at task close, not on every iteration.
3. Feed the populated-replica upgrade proof from a checked-in populated synthetic fixture. Synthetic data only.
4. Run `cargo check` before `cargo fmt --check`. Five of web-04's seven failed runs were format diffs ahead of a compile check.
5. Never run two cargo processes in this repo at once, including from subagents. Reviewers read; they do not build. The `Blocking waiting for file lock on build directory` waits came from this repo's own concurrent commands.

## 6. Write four rules into `.prometheus/gotchas.md`

These are the rules this loop has rediscovered by review. Append only; do not rewrite existing entries. Date each one, name the change and round where it was found, and cite the file that shows the correct form. Keep each under eight lines. `gotchas.md` is the right home because AGENTS.md already tells you to read it before touching a subsystem, and this loop reads it constantly.

1. **Re-authorize the target before the idempotent return.** In a command function, the target authorization (`PERFORM aso.require_case(target, …)` or the command's own) runs before `RETURN original.result`. Comparing `original.actor_id` is not enough: an actor whose access to the target ended after the original command must not receive the stored receipt. Found web-03 round 9. Correct ordering: `migrations/server/2026090619_administering_entity_resolution_commands.sql` — actor context, advisory lock, `require_case`, then the idempotent return. `require_case` checks practice match only; the command's own authority is still written per command. Guard: `idempotent_retry_reauthorizes_case_target` in `scripts/test-web03-resolution-service.py`.
2. **Never edit an applied migration.** A change to applied SQL is a new forward migration; the original file stays byte-for-byte, or the runner reports `server migration checksum mismatch`. Found in the web-06 repair review, 2026-09-18.
3. **A replica `ADD COLUMN … NOT NULL` needs a `DEFAULT` or a backfill.** A fresh-install proof cannot see the failure; only the populated-replica upgrade proof does. Found web-02 pass 2 and again web-05 pass 2. Guards: `web/src/shared/sync/catalog-conformance.test.ts`, `web/src/shared/sync/pglite-schema.test.ts`.
4. **Release command ownership only when the projection agrees.** A command hook releases its runtime-command claim when the projected row matches on revision, status and both fingerprints, never on the HTTP receipt alone. Found web-02 pass 5 and web-03 round 8. Correct form: `web/src/features/case-queue/hooks/use-case-command.ts`.

## 7. UI changes: routed render test, named inputs, split work

1. Every UI change adds a Tier 1 vitest routed render test that mounts the real route composition and asserts on the navigation destination, without mocking both data-loading boundaries. This is the wiring check web-03 rounds final103/final104 found missing. Prove it fails once: break the wiring, watch it go red, restore.
2. Do not start the full stack or a browser campaign before web-17. That stays as planned. I may open the dev server myself to look; that is a demo, records no evidence, and is not a gate.
3. Named inputs for every UI task: `docs/design/prototype/` (markup and copy port; CSS class names and JS do not), `docs/aso-brand-guide.html`, and tokens from `assets/templates/design-tokens/tokens.toml` only. Every evidence state renders a text label, and the label and action strings come from `web/src/shared/model/evidence-state.ts` — do not retype them. Use token roles, never hex literals: body copy, small labels and table headers take the role whose value is `#A85417`, and ember is for large text only. No third chromatic family.
4. Within an active UI change, `execution.md:16` already permits a second agent on explicitly disjoint files. Use it: one agent takes `web/src/features/**/components`, `**/model` and the route file, built against the web-00 fixture manifests; the root agent keeps publication, selectors, command reconciliation and every shared registry file. State the file split before starting. Do not work ahead on a change that is not active.

## 8. Skills: read these by path; discovery is broken

Your skill catalog carries names with no descriptions at all (238 of 1,413 listed, cut at `feynman-loop`), so matching by description cannot fire. Read the named file at the start of the task. If a path is missing, say so and proceed from AGENTS.md; do not invent its contents. Where a skill conflicts with AGENTS.md or the four rules, AGENTS.md wins.

UI tasks:
- `~/.codex/skills/pem-local-first/SKILL.md` — as written.
- `~/.codex/skills/a11y-gate/SKILL.md` — as written; run before calling a UI task done.
- `~/.codex/skills/hybrid-design-tokens/SKILL.md` — OVERRIDE: the web output is `web/src/theme.css`, not `desktop/src/theme.css`. Never hand-edit a generated output.
- `~/.codex/skills/reference-ui-fidelity/SKILL.md` — OVERRIDE: the authority is `docs/aso-brand-guide.html` and `docs/design/prototype/`. Ignore the skill's "no borders anywhere" line and its Tauri/Flutter persistence guidance; web only under revision 10.
- `~/.TOOLS/skills/agents/polish/SKILL.md` — OVERRIDE: the brief is the brand guide and prototype. Skip any prerequisite skill it names. Ask me nothing; make no change outside the active change's files.

Backend tasks:
- `~/.codex/skills/axum-patterns/SKILL.md` — Axum types never enter `crates/aso-host`.
- `~/.codex/skills/error-handling/SKILL.md`, `~/.codex/skills/async-patterns/SKILL.md` — as written.
- `~/.codex/skills/clean-architecture/SKILL.md` — OVERRIDE: entity hooks only, never TanStack Query; this repo's layering (component → feature hook → feature api → http client) wins over the skill's layer names.

Do NOT load `react-vite-stack` (prescribes `@tanstack/react-query` and TanStack Router; rule 4 and audit check 2 forbid the first, and this repo uses react-router), `frontend-patterns` (SWR / `useQuery`), or Impeccable `critique` (interactive; it will stall you).

## 9. Plan holes to close in the amendment

1. No change owns mounting the surgeon-gate route. `web/src/features/surgeon-gate/` already has the component, hook, API and model; `web/src/app/routes/surgeon-gate-route.tsx` is a placeholder; web-17 requires the gate step in the browser. Assign the mount, its routed render test and its authority-refusal evidence to a named change before web-11 and tell me which.
2. web-13 and web-15 have no prototype screen and no route, and the denial-class labels are my decision. Before web-12 closes, send me a one-page proposal: screen structure, the label copy in the Voice register, and which existing prototype patterns you would reuse. Do not start web-13 without my answer.
3. Treat the Tauri/native parity wording that remains in generated `tasks.md` as deferred to RA19/RA21 under revision 10. A reviewer finding that demands native parity in this child is rejected under section 3 rule 3.

## 10. Session hygiene and AGENTS.md

1. Start a fresh session at each change boundary, from: this correction, AGENTS.md, `docs/architecture/web-case-to-letter-contract.md`, and the active change's `tasks.md` and `specs/`. The current root session has run since Sep 6 with a 159 K median context; do not carry it forward. Write whatever the next session needs into the change's handoff file before ending.
2. AGENTS.md contains the "Testing Policy — Local Integration Only" section twice, at lines 448 and 480. Remove the second copy (1,243 bytes paid on every request) in the commit that records this correction. Touch nothing else in that file: lines 1–208 are managed by `prometheus-context-bootstrap` and a re-run overwrites them.

## 11. Two questions — answer before web-07 starts

1. **web-01 retry ordering.** In `migrations/server/2026090617_durable_case_commands.sql`, the `update` and the `transition` command functions end their idempotent branch with `RETURN original.result;` and call `PERFORM aso.require_case(target_case, 'case_write');` after it. That is the ordering web-03 round 9 ruled CRITICAL. The branch does compare `original.actor_id`, so the exposure is an actor whose access to the case ended after the original command. I read this; I did not reproduce it. Is it a defect under ADR-002? If yes, propose a forward migration (do not edit `2026090617`), a red/restore proof that fails on the current ordering, and which change carries it. If no, quote the reason. Do not fix it before answering.
2. **An unchecked contract edge.** Nothing cross-checks `crates/aso-host/src/projection.rs` `DEFINITIONS` against `docker/frf/shape-catalog.json`; `catalog-conformance.test.ts` covers catalog, TypeScript columns and PGlite schema only. Is a seventh `scripts/audit.sh` check, or a Rust unit test comparing the two column lists, worth adding? If yes, name the change that carries it. Do not add it unasked.

## 12. What I want back now

Before doing any of the above beyond finishing the current web-06 task, reply once with:
1. Any line here that conflicts with a rule you are bound by. Quote both.
2. The exact KBD amendment command you will use, or a statement that you could not confirm one.
3. The proposed id, position and task list for the hardening change in section 4.
4. Which change will own the surgeon-gate mount.
5. Your commit split plan for section 1: branch name, the commit list, and any files you cannot attribute.
6. Your answers to the two questions in section 11.

Then proceed without waiting for me on everything except: the commit in section 1 (wait for my yes on the split plan) and web-13 (wait for my answer on the screens).
