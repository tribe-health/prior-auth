# Evidence: path optimality, parallelism and layer contracts

Read-only inspection, 2026-09-18. Nothing was built, run or modified in the repo.
Repo root abbreviated `R = /Users/gqadonis/Projects/TribeHealth/kevin/prior-auth`.
Child dir abbreviated `C = R/.kbd-orchestrator/phases/runtime-architecture/children/web-case-to-letter`.
Each statement is tagged **FACT** (read in a file) or **INFERENCE** (my reading).

## 0. Position at time of inspection

- FACT: web-00…05 DONE, web-06 IN_PROGRESS at task 4 of 7, web-07…17 PENDING (`C/progress.json`, `C/tasks.md:61-69`).
- FACT: `R/.kbd-orchestrator/current-waypoint.json` and `position-reminder.txt` say `exactNextCommand: /kbd-apply web-01-case-command-core`. That is stale. The web-06 eligibility evidence records the agent noticing it: "The generated exactNextWork/exactNextCommand projection still points at Web-01 … the stale shortcut is not used" (`C/evidence/web-06-criteria-catalog-core/task-1-eligibility.md`, "Canonical position" section). The file the agent is told to read first every turn gives a wrong command.
- FACT: last git commit is `d952425` dated 2026-09-12. `git status --porcelain` = 551 entries (343 untracked, 132 modified, 76 deleted). All of web-00…06 and most of RA05…RA18 exist only in the working tree. `git worktree list` shows one extra detached worktree at the same commit.
- INFERENCE: this is the single hardest blocker to any parallel worktree. A new worktree starts from 09-12 and contains none of the web-* code, the contract document, or the fixtures. Several adversarial-review CRITICALs were artifacts of the same condition ("The reviewed diff is incomplete", "The review diff omits the new Web-04 implementation units" — `C/review/web-02-*/findings-block.json`, `C/review/web-04-*/findings.json`): untracked files do not appear in `git diff`.

## 1. Real dependency DAG, web-06 … web-17

### Source quality

- FACT: the per-change OpenSpec artifacts for web-06…17 are template text. `design.md` is ~2,160 bytes in all twelve; `diff web-07/design.md web-12/design.md` differs only in the change name on two lines. `proposal.md` "Impact" says only "may affect the exact schema, host, server, projection, or React surfaces named by that plan". `specs/*/spec.md` holds two generic scenarios. None names a file, a type or a column.
- FACT: the real contract is `R/docs/architecture/web-case-to-letter-contract.md` (558 lines, 51,656 bytes). Dependencies below come from its "Downstream change inputs and outputs" table (lines 533-555), the command matrix (288-326), the publication matrix (452-473), the invalidation matrix (485-505), and `C/plan.md` "Depends on" lines.

### Declared versus real

| Change | Plan says depends on | Real data/contract dependency | Merely sequenced after |
|---|---|---|---|
| 06 catalog core | 03, 05 (`plan.md:94`) | 05 (policy-document ingestion reuse), 00 | 03. Contract input is "Criteria migration and citation matrices; processed policy document" (line ~541); import body carries `criteriaCatalogRevision` only. INFERENCE: 03 is not consumed until 07. |
| 07 selection + policy/pathway UI | 06 | 06 (`criteriaCatalogRevision`), 03 (`resolutionRevision`) | — for the command. The two React views need only the `criteria_catalog` / `case_criteria_selections` column lists (lines 461-462). |
| 08 evidence assembly core | 05, 07 | 07 (`criteriaSelectionRevision`), 05 (`documentSetRevision`) | — |
| 09 evidence workspace | 08 | 08 for real rows. Shapes `case_evidence` and `evidence_citations` are already published at projection revision 5 and `features/evidence-timeline` already exists (294-line component). | INFERENCE: view work is a column delta, not greenfield. |
| 10 prior letter command | 09 (`plan.md:134`) | 08 (`evidenceRevision`), 07, 03, existing gate (`gateRevision`). Contract line 547. | **09.** 10 is a Postgres-side command; it never reads the replica. INFERENCE: 10 ← 09 is ordering only. |
| 11 letter workspace + ack | 10 | 10 for letters/claims/QA rows; existing signing route | — for the ack command; the composer UI needs only the `letters`, `letter_claims`, `letter_qa_results`, `submissions` columns (468-471). |
| 12 determination ingest | 11 | the **acknowledgement command** half of 11 (`submissionRevision`), 04/05 (document upload reuse) | the composer UI half of 11 |
| 13 classification + denial UI | 12 | 12 (`determinationRevision`) | — |
| 14 response letter command | 10, 13 | 10 (composer, claim/QA persistence, letter table), 13 (`classificationRevision`), 12 | — |
| 15 response workspace | 14 | 14 for rows; reuses 11's QA/approve/sign/ack routes verbatim (contract rows web-11 and web-15 list identical paths, lines 318 and 324) | INFERENCE: 15 is mostly 11's UI parameterised by `purpose`. |
| 16 fixture + runner | 01-15 | runner needs mounted routes. The data half is already done: `R/docs/architecture/fixtures/web-case-to-letter/` holds `fixture-manifest.json` (247,707 B), `expected-output-manifest.json` (138,971 B), `manifest-lock.json`, `verify.py` (68,359 B), produced by web-00 task 1.4. | INFERENCE: a loader/runner that replays commands 1…N could grow per change. |
| 17 certification | 16 | everything | — |

### Critical path and width

- Backend critical path (FACT from tokens): 05 → 06 → 07cmd → 08 → 10 → 11ack → 12 → 13cmd → 14 → 16runner → 17. Eleven links. Every link is a revision token consumed by the next command, so the backend chain is genuinely serial.
- INFERENCE: the six UI pieces (07 views, 09, 11 composer, 13 denial review, 15, plus the unowned gate view — see 3) hang off that chain as leaves. Each needs the chain only for live rows. Maximum theoretical width is 2 lanes steady state (one backend, one UI), 3 briefly (06 ∥ 07-views ∥ 09-views). More lanes do not shorten the 11-link chain.
- FACT: plan rationale for serial execution, `C/plan.md:213`: "Execute web-00 through web-17 serially. The order is dependency-bearing and several changes share migrations, `AppServices`, projection registries, and route composition. Parallel work is limited to independent read-only exploration or explicitly disjoint files within the active change." `C/review/plan/findings.json` lists "serialize shared surfaces" as a resolved review finding. So serial was chosen for file contention, not only data flow.
- FACT already visible in the completed half: `plan.md:74` declares web-04 depends on web-01 only. 03 and 04 were independent and ran serially; 03 took ~23 h wall clock (section 6).

### File-ownership overlaps that break parallel worktrees

`C/scope.json` is one allowlist for the whole child (`crates/aso-host/**`, `crates/aso-server-axum/**`, `crates/aso-web-server/**`, `web/**`, `migrations/server/**`, `versions.toml` …). There is no per-change ownership. Hot files:

| File | Why every change touches it | Backend/UI lane |
|---|---|---|
| `crates/aso-web-server/src/adapters/gate.rs` (2,045 lines) | one struct `PgGateRepository` implements `CaseRepository` (l.871), `AuthorityPort` (1198), `EvidenceRepository` (1271), `CriteriaRepository` (1854), `LetterRepository` (1948); nine `mod *_transaction_tests` at the tail. Working-tree diff +1,668 lines. | backend |
| `crates/aso-host/src/ports/mod.rs` (480 lines) | all repository traits; 45 async methods so far | backend |
| `crates/aso-host/src/lib.rs` | `pub mod` list + `AppServices` struct | backend |
| `crates/aso-server-axum/src/lib.rs`, `routes/mod.rs` | `.merge(routes::x::router())` list, `pub mod` list | backend |
| `crates/aso-server-axum/src/routes/gate.rs` (551 lines) | central authorization callback; 5 review CRITICALs landed here for web-01 and web-03 | backend |
| `crates/aso-web-server/src/migrations.rs` (410 lines) + `migrations/server/20260906NN_*.sql` | single ordered `Vec<Migration>` with sequential integer ids; next free is `2026090626` | backend |
| `crates/aso-web-server/src/main.rs`, `adapters/mod.rs`, `adapters/unavailable.rs` | composition root | backend |
| `crates/aso-host/src/projection.rs` | global `PROJECTION_REVISION: u32 = 5` and `ProjectionId` enum; every publication bumps it | **both** |
| `docker/frf/shape-catalog.json`, `web/src/shared/sync/electric-shapes.ts`, `pglite-schema.ts`, `migration-ledger.ts`, `replica-mounted-runtime.ts`, `replica-browser-memory.ts` | every published relation is declared in all of them | **both** (owned by the odd "UI" changes) |
| `web/src/shared/runtime-command-registry.ts` | closed union `feature: 'evidence-reassessment' \| … \| 'document-upload'` | UI |
| `web/src/app/routes/app-routes.tsx` | only for 13/15: there is no denial or response-letter route today (lines 77-90) | UI |
| `Cargo.lock`, `versions.toml`, `.prometheus/*.md`, `C/progress.json`, `C/tasks.md` | append-only logs and runtime state | all |

- INFERENCE: the backend/UI split is clean at the feature-folder level (`web/src/features/<x>/**`, `web/src/app/routes/<x>-route.tsx` are one file per screen and lazy-loaded, `app-routes.tsx:77-90`). It is not clean at the publication layer: the "UI" changes (07, 09, 11, 13, 15) each own a server migration, a `projection.rs` revision bump, the FRF catalog and the PGlite schema migration. That half is backend-shaped and sits on the contended files. A parallel UI lane is safe only if it is restricted to `features/**/components|model`, route files, and fixtures, and the publication step stays in the serial lane.
- FACT: `.claude/hooks/single-writer.sh` is advisory; it warns after the write, and its own header says "Prevention belongs in worktrees". KBD runtime state is one append-only log with a single `childPointer`; INFERENCE: two concurrently active changes are not representable without a second child phase.

## 2. What web-00 produced, and whether the contracts are machine-checkable

FACT — artifacts:
- `R/openspec/changes/archive/2026-09-16-web-00-workflow-contract/` (spec.md 60 lines of scenarios; prose).
- `R/docs/architecture/web-case-to-letter-contract.md`: normative invariants, criteria migration matrix, lifecycle, assertion/citation matrix, capability matrix, command matrix with exact HTTP paths and reserved Tauri names, error-to-interface matrix, publication matrix with **exact column lists and tenant predicate per relation**, invalidation token matrix, fixture matrix, downstream I/O table.
- `R/docs/architecture/fixtures/web-case-to-letter/`: two JSON manifests + SHA-256 lock + `verify.py`. README states each positive workflow command carries "its mutation HTTP method and route, one or more `payload_refs`, the retry lookup anchor, actor, capability, input revisions, and result revisions", and the expected manifest freezes "exact letter bodies and claims, links, hashes, UI copy, refusal outcomes".
- `C/evidence/web-00-workflow-contract/` (5 files), `R/.refiner/artifacts/web-00-workflow-contract/` (1.2 MB).

Machine-checkable? Mixed:

| Boundary | State | Evidence |
|---|---|---|
| HTTP paths | prose table only | contract lines 304-320. Each feature api test re-asserts its own paths by string (`web/src/features/administering-entity/api/administering-entity-api.test.ts`). |
| HTTP request/response **body shapes** | **not frozen anywhere as a schema.** `grep -i 'request body\|response body\|```json'` on the contract returns nothing. Request payloads exist as examples inside `fixture-manifest.json`; response shapes do not. | — |
| Rust → TS types | **handwritten on both sides.** No `ts-rs`, `specta`, `utoipa`, `schemars`, `typeshare`, `aide` in any `Cargo.toml` (grep empty). `web/package.json` has no `zod`, `valibot`, `msw`, `openapi-*`. DTOs live inside each route module ("a module owns its DTOs", `routes/mod.rs:1-2`); TS mirrors them by hand, e.g. `features/administering-entity/model/administering-entity.ts:11-56` (two 20-field interfaces). | |
| Runtime validation of HTTP responses | none. `shared/api/http-client.ts` ends `return (await res.json()) as T;` | |
| Read path (replica) column contract | **machine-checked.** `web/src/shared/sync/catalog-conformance.test.ts` reads the deployed `docker/frf/shape-catalog.json` and compares it column for column with `SYNC_COLUMNS` and the PGlite schema. Its header records the defect that motivated it (`cases.gate_affirmed_at` silently dropped). | |
| Read path row typing | graph rows are `Record<string, unknown>`; each feature hook hand-decodes with `requiredString(row, 'processing_status')` style guards (`features/document-intake/hooks/use-document-statuses.ts:60-75`). Runtime-validated, not generated. | |
| Rust projection registry ↔ FRF catalog | INFERENCE: not cross-checked by a test I could find (`grep shape-catalog crates scripts` empty); `projection.rs` has its own unit asserts. | |
| Fixtures | machine-checked for internal consistency by `verify.py`; not yet consumed by any Rust or vitest test (INFERENCE from README: "their presence is not evidence that the application implements or passes the scenario"). | |
| Mock/fake server for UI work | none. `aso-web-server/src/main.rs:61` refuses to mount the API without three Postgres URLs and two Kratos URLs. `adapters/memory.rs` header: "In-memory fixtures compiled only for focused adapter tests." Component tests use `vi.mock` on the api module or projection hook. | |

INFERENCE — what is missing to let two layers move concurrently: the read-side contract is already hard enough (frozen column lists + conformance test). The write side lacks a single typed source for command bodies and receipts. Cheapest closure consistent with the repo's rules: one generated or schema-checked DTO module per command family (ts-rs or JSON Schema emitted from the Rust DTOs, checked into `web/src/shared/api/contracts/`), plus a fixture-driven graph seeder so components render the frozen `expected-output-manifest.json` rows without the stack. Neither adds a query cache.

## 3. Prototype versus pending UI changes

FACT — prototype inventory (`R/docs/design/prototype/`): `index.html` (queue) and 18 files in `screens/`, of which 5 are documentation (architecture, build-playbook, data-model, how-this-works, sitemap). Product screens: login, intake-checklist, evidence-timeline, policy-panel, pathway-comparison, surgeon-gate, letter-composer, submission-packet, receipt-verification, peer-to-peer, settings-integrations, settings-profile, admin-console. `app-routes.tsx:19-20`: "Screens map one-to-one onto docs/design/prototype/screens/."

FACT — placeholder routes (import `RoutePlaceholder`): admin-console, pathway-comparison, peer-to-peer, policy-panel, receipt-verification, settings-integrations, settings-profile, submission-packet, surgeon-gate = 9. `features/policy-panel/**` and `features/letter-composer/**` are empty directory scaffolds.

| Pending change | Prototype screen | Route today | Notes |
|---|---|---|---|
| 07 | `policy-panel.html` (18.6 KB), `pathway-comparison.html` (23.8 KB) | both placeholders | direct match |
| 09 | `evidence-timeline.html`, `intake-checklist.html`, queue counts in `index.html` | mounted already | extends existing feature |
| 11 | `letter-composer.html` (32.9 KB: whole letter, 15-check QA panel, held signature); `submission-packet.html` / `receipt-verification.html` for the acknowledgement | composer route mounts only `LetterSigningCard` (28 lines); packet/receipt are placeholders | plan does not say which route hosts the acknowledgement |
| 13 | **none.** No denial/determination screen exists; `grep -il denial` hits only a chip in `index.html:243`, a line in peer-to-peer, and doc pages | **no route** | needs design before build |
| 15 | **none** for the denial-response workspace; can reuse letter-composer layout | **no route** | |
| (unowned) | `surgeon-gate.html` (22.7 KB) | placeholder; `features/surgeon-gate` has `gate-affirmation-list.tsx`, hook, api, but nothing outside the feature imports it | web-17 (`plan.md:207`) requires "gate" in the browser. No web-06…15 task names mounting `/cases/:caseId/gate`. INFERENCE: plan gap that a walking skeleton would have exposed on day one. |

Portability. FACT: prototype is static HTML + `assets/aso.css` (54 KB, CSS custom properties `--sp-5`, `--s2`, `--accent`) + `shell.js` (44 KB) with screen-local `<style>` and simulated actions. `R/docs/architecture/react-ui-component-architecture.md:13`: scripts are "design evidence, not authorization or backend implementation. Reconstruct interactions using React and runtime contracts; do not run … imperative prototype DOM mutation inside React-owned nodes." The React app uses Tailwind tokens generated from `tokens.toml` (`bg-canvas`, `px-s5`, `text-eyebrow`). INFERENCE: markup structure, copy and hierarchy port; class names and JS do not. It is a translation job that needs no backend.

Is UI blocked on backend? INFERENCE: only by plan ordering, for the presentational half. Evidence: (a) exact projected columns per relation are frozen (contract 456-471); (b) expected rows, letter bodies, claims and UI copy are frozen in `expected-output-manifest.json`; (c) the existing features already separate `model/` + `components/` from `hooks/` + `api/`, and component tests already mock the hook (`case-intake.test.tsx` mocks `useCaseIntakeProjection`, noted in `C/review/findings-final104-critic.json`). The container half (projection hook reading real graph lists, command hook with lost-response reconciliation — 300 lines each in `use-case-command.ts`, `use-administering-entity-resolution.ts`) does depend on the publication and command existing.

Counter-evidence that hurts this position: the review history shows the expensive web defects were in the container half, not the markup — PGlite upgrade of populated replicas (web-02 pass2, web-05 pass1-3), command confirmed without projection agreement (web-02 pass5), committed resolution left unreconciled (web-03 pass8). Pre-building presentational components removes perhaps the cheapest third of each UI change.

## 4. Walking skeleton or stage-by-stage hardening?

FACT: stage-by-stage hardening, with integration deferred to the end.
- `C/plan.md:18`: "Full-stack testing waits until changes web-00 through web-16 are implemented. Each implementation change runs only applicable Tier 0 and focused Tier 1 checks. Web-17 runs the child Tier 2 local stack and actual-browser campaign."
- `C/execution.md:12`: "No broad local integration runs before web-17."
- `C/execution.md:20-27` per-change completion: confirm deps → smallest edit + T0 → "focused Tier 1 acceptance, including a deliberate red/restore for an uncovered load-bearing guard" → record outputs → "Run artifact-refiner and fresh adversarial review" → "verify the OpenSpec change, and archive it before activating the next change."
- Contract line ~557: "No downstream change may claim browser readiness from a schema row, fixture adapter, component test, build, typed Tauri wrapper, or historical run."
- No rationale for preferring this over a thin slice is stated anywhere I read. The only stated rationale is the operator's browser-before-native correction (`plan.md:16`) and shared-file serialisation (`plan.md:213`).

INFERENCE: the combination is the costly one. Each stage is hardened to archive quality in isolation, yet nothing is exercised end to end in a browser until web-17. Integration defects (the unowned gate view, the missing denial routes, `case_evidence.policy_criterion_id` in today's shape versus `criterion_id, rationale, revision` in the frozen matrix) surface last, after 16 changes have been individually sealed and archived.

Gates required before the next change may start (from `tasks.md` task 5/6 of every change, and `execution.md`):

| Gate | Protects an irreversible decision? | Deferrable? |
|---|---|---|
| Lane/privacy/column/tenant/revocation record before any relation joins a replica (`plan.md:26`, tasks 1.2/1.3 of 07, 09, 11, 13, 15) | **Yes** — Phase 1 privacy class, PHI boundary | No. Keep per change. |
| Forbidden-column / foreign-tenant publication sabotage-and-restore (02, 05) | **Yes** — PHI boundary | No, but one test per relation, not per pass. |
| Authority refusal at gateway + service + database (01, 08, 10, 11, 13, 14) | **Yes** — ADR-002 triple check. Review caught real misses here: web-01 first pass found mounted routes and the service authorizing every human without a capability check (`C/review/web-01-*/findings-block.json`). | No. |
| gap/void-collapse sabotage (08), documentless-claim sabotage (10, 14) | **Yes** — ADR-003 and the False Claims Act citation control | No. |
| Additive-only migration, fresh + populated-upgrade proof | Partly. Server migrations touching clinical/audit tables are hard to reverse. The PGlite replica is declared disposable ("Disposable client generations rebuild", contract ~478), so populated-replica upgrade proofs protect convenience, not an irreversible decision. | Server: keep. Replica upgrade: deferrable pre-release. |
| Conflicting retry / lost-response reconciliation per command | No. Idempotency key shape (`commandId`) is frozen in the contract; the reconciliation behaviour can be hardened later without schema change. | Deferrable to a hardening pass. |
| Responsive resize, keyboard, reload continuity per UI change | No | Deferrable; web-17 re-tests all of it anyway. |
| artifact-refiner frozen `dist/` packet + source manifest + critic/judge rounds | No. Rounds 104 and 105 blocked because the *packet manifest omitted files* (`findings-final104-critic.json`, `findings-final105-critic.json`), not because the product was wrong. | Deferrable / collapsible to once per phase (CLAUDE.md "Anti-sycophancy" asks for review "at phase completion and before delivery"). |
| OpenSpec strict verify + archive per change | No | Could batch. |
| "Record actual commands… confirm real mounted callers" task 6 | Evidence standard, cheap when not looped | keep, lightweight |

## 5. Tauri parity

- FACT: `R/CLAUDE.md` "Architecture boundary": "A route added to `aso-server-axum` without its desktop counterpart is an incomplete change."
- FACT: `C/plan.md:12,16,217` (revision 10) defers "all typed Tauri wrappers" to RA19/RA21 after web-17; `C/scope.json:21-24` denies `desktop/**` and `mobile/**`; the contract reserves wrapper names only (col. 4 of the command matrix, and lines 322-326). `grep create_case|upload_case_document|resolve_administering desktop/src-tauri/src` returns nothing. The speed-up is taken and consistently recorded.
- FACT, residue: the KBD-generated `C/tasks.md` still says "Mount HTTP/native…" / "typed Tauri wrappers" (lines 18, 37, 47, 67, 76, 85, 103, 112, 121, 129, 139) while the OpenSpec `tasks.md` was corrected ("Mount browser HTTP catalog contracts", `openspec/changes/web-06-*/tasks.md:6`). Two task lists disagree; the stale one is the one the runtime projects.
- The uncomfortable part: CLAUDE.md still states the 1:1 rule without the revision-10 exception, so every fresh session reads a rule the plan overrides. 40+ wrapper functions are now a known debt for RA19/RA21.

## 6. Other structural drag

Wall-clock per change from evidence file mtimes (`C/evidence/*`, `C/review/*`). Idle time cannot be separated from work time; treat as upper bounds.

| Change | Start → archive | Implementation tasks 2-4 | Hardening + review + completion (tasks 5-6) | Adversarial passes (first verdict) |
|---|---|---|---|---|
| 00 | 09-16 19:33 → 22:38 | — | — | 1 (PASS) |
| 01 | 09-16 22:49 → 09-17 01:51 (3.0 h) | 22:49 → ~23:27 (0.6 h) | 00:14 → 01:51 (1.6 h) | 13 files / 8 passes (BLOCK, 3 CRITICAL) |
| 02 | 09-17 02:01 → 03:37 (1.6 h) | ~1.1 h | 03:09 → 03:30 | 6 (BLOCK) |
| 03 | 09-17 03:43 → 09-18 02:35 (**22.9 h**) | 03:43 → 05:06 (1.4 h) | task 5: 04:48 → 09:38; task 6 + "final96…final106" critic/judge rounds: 09:59 → 09-18 02:40 | 16 passes + 8 "final" rounds (BLOCK) |
| 04 | 09-18 02:50 → 06:16 (3.4 h) | 03:01 → 04:45 (1.7 h) | 04:57 → 06:16 (1.3 h, 52 evidence files) | 2 (BLOCK) |
| 05 | 09-18 06:22 → 10:57 (4.6 h) | 06:52 → 09:32 (2.7 h) | 09:45 → 10:57 (1.2 h, 41 files) | 6 (BLOCK) |

- FACT: every implementation change was BLOCKED on its first adversarial pass. Classifying the 45 CRITICAL findings by cited path: 18 backend code/SQL, 8 web code, 17 process/evidence paperwork (`.kbd-orchestrator/**`, `.refiner/**`, `openspec/**/tasks.md` checkbox state, "diff omits files"), 2 other. So ~58% found product defects, including genuine authority and tenant holes; ~38% were about the evidence packet itself.
- FACT: review packets are large: `C/review/web-03-*` = 15.2 MB in 35 files; all web reviews ≈ 32 MB. Evidence dirs: 27-74 files and 200-400 KB per change. `.refiner/artifacts/web-0*` = 0.4-2.0 MB each, containing a frozen `dist/` copy of sources plus `source-manifest.sha256`.
- FACT: the "final" numbering reached 106 on web-03 (`validation-run-final96.log` … `final106.log`, `critic-findings-final82.md` in `.refiner/artifacts/web-03-*`).
- FACT: tasks 1 and 6 of every change are identical boilerplate ("Confirm dependency completion, assigned file ownership, frozen web-00 contracts…", "Record actual commands…"). 12 remaining changes × 2 = 24 ceremony tasks, plus 12 × (artifact-refiner + adversarial review + strict verify + archive).
- FACT: instruction load. `AGENTS.md` = `CLAUDE.md` = 22,184 bytes, byte-identical (`cmp`), and the "Testing Policy — Local Integration Only" section appears twice in each (so ~1.9 KB duplicated per file). Path rules add 2.9-4.1 KB each. `.prometheus/gotchas.md` 53 KB ("Read `gotchas.md` before touching a subsystem"), `decisions.md` 52 KB, `session-log.md` 235 KB. Contract doc 52 KB is re-read at every change's task 1.
- FACT: CLAUDE.md contains a section "Working as GPT-6 Astra" with OpenAI Responses-API runtime notes. It is loaded into Claude sessions as well. Its "Verification, calibrated" paragraph says the model's "documented tendency is to over-test small changes, which is waste" — the evidence directories (52 files for one task) suggest that guidance is not biting.
- FACT: `hooks.log.jsonl` 1,043 lines for the parent phase; 5-6 hook events per task boundary.
- FACT: handoff-in.md for the child still has three `<!-- TBD -->` sections; harmless, but it shows ceremony artefacts that nobody reads.

## Cannot be determined from files

- Active versus idle time inside the 22.9 h web-03 window.
- Token cost per review round (no usage logs found in the child directory).
- Whether `projection.rs` and `shape-catalog.json` are cross-checked by a script outside `crates/` and `scripts/` (grep found none).
- Whether Codex's session loads `.prometheus/gotchas.md` in full each time or greps it.
