# session log

Append-only. Dated entries. Mark superseded entries; do not delete them.

## 2026-09-04
- Initialized by prometheus-context-bootstrap.

### 2026-09-04 · Context bootstrap
Ran `prometheus-context-bootstrap` against a repository with no `AGENTS.md` and
no `CLAUDE.md` — a fresh install, not a v3 migration.

Stack detection only inspects the repository root, so it found `Cargo.toml` and
missed `web/package.json` and `mobile/pubspec.yaml` one level down. Forced with
`--stacks rust,typescript,flutter`; all three rule files then installed.

`verify.sh`: 10 PASS, 0 FAIL, 2 WARN. Both warnings are machine-wide skill-budget
findings (2,468 skills, ~43x over budget), not repository defects — this repo
contributes 1,976 description characters of that total.

`versions.toml` and `.kbd-orchestrator/**` are denied to Edit by
`.claude/settings.json`. Content for `versions.toml` was drafted but **not
written** — it is handed to the operator to apply by hand, which is what the
deny rule is for.

### 2026-09-04 · Phase paused for upstream fix
`/kbd-plan web-ui-architecture` paused before writing plan.md. Two BLOCKING
gaps were resolved by operator decision:

- **GAP-1** → ElectricSQL 1.8.0 owns the Postgres→PGlite boundary. Decisive
  evidence: `prometheus-entity-sync`'s JS SDKs are v0.1.0, unpublished, with
  `main`/`types` pointing at raw `src/*.ts`, no build script, no `dist`, and a
  peer range of `@electric-sql/pglite ^0.2.0` against current 0.5.8.
  `entity-sync-tauri` is 1 line. The Rust `pes-server` is real; the TS client
  layer is a stub. Publishing it would ship the stub.
- **GAP-8** → hand-build auth flows on `@ory/kratos-client-fetch@26.2.0` with
  the existing shadcn library. No second design system.

Work moved upstream to `/Users/gqadonis/Projects/prometheus/prometheus-entity-management`
to fix the React binding's package name before planning depends on it.

### 2026-09-04 · Child phase spawned: pem-refresh-3-3-0
`web-ui-architecture` › `pem-refresh-3-3-0` (depth 2). Source edits target
`/Users/gqadonis/Projects/prometheus/prometheus-entity-management` @ d1588d8c,
not this repo; scope.json denies web/, mobile/, crates/, desktop/, docs/.

Scope grew past what the parent could absorb: a package rename (358 referencing
files, changesets `fixed` lockstep), a react-table v8→v9 major (15 call sites),
PGlite 0.5.4→^0.5.8, and a Flutter package one minor behind the JS packages
while pinning Riverpod below what prior-auth mobile already uses.

Baseline before any change: `validate:release-contract` = 0 errors, 16
artifacts, 12 npm packages @ 3.2.0.

### 2026-09-05 · Child closed, parent resumed
`pem-refresh-3-3-0` complete: PEM published at 4.0.0 (13 npm packages +
entity_graph_flutter on pub.dev), registry-verified, alias deprecated.
Shipped as a major rather than the planned 3.3.0 because all packages went
ESM-only — required by @tanstack/react-table v9 being ESM-only.

Waypoint returned to `web-ui-architecture`, childPointer cleared. Two plan
amendments carried back: G3's install line becomes
`@prometheus-ags/entity-graph-react@^4.0.0`, and G1 gains an ESM audit.

### 2026-09-05 · PEM 4.0.0 committed and tagged
`f3c02502` release: 4.0.0 — ESM-only, entity-graph-react, react-table v9 (202 files)
`05622ae5` release: bump docs site to 0.0.4 for the 4.0.0 dependency
Tagged `v4.0.0`, matching the repo's existing vX.Y.Z convention.

Deliberately excluded: five `.kbd-orchestrator/**/tasks.md` deletions that were
already in the working tree before this phase began. Sweeping someone else's
pending change into a release commit would misattribute it.

Not pushed — no remote push was requested.

## 2026-09-05 — web-ui-architecture complete (8/8)

W4 app shell, W5 component library, W7 evidence-timeline slice delivered this
session; W1/W2/W3/W6/W8 earlier. Reflection at
`.kbd-orchestrator/phases/web-ui-architecture/reflection.md`.

4 goals MET, 3 PARTIAL, 0 NOT MET. Verified: test 35/35, typecheck 0, lint
clean, build 4.55s, audit PASS 6/6, compose config parses. Five behavioural
guards each sabotaged, observed failing, reverted.

Unresolved: both QA gates (artifact-refiner, adversarial-review) skipped on all
eight changes — everything is `pending_review`. Entire phase is **Build-only**:
nothing rendered in a browser, `docker compose up` never run, `readTimeline`
never executed against a populated PGlite.

Next: `web-runtime-verification`. First task is `docker compose up` — W7 assumes
Electric can serve a Postgres VIEW, and the `sync_*` views ARE the PHI boundary.

## 2026-09-06 — G3 closed, phase complete, handoff prepared

G3: `shared/store/interaction-store.ts` (three fields, each passing ADR-006's
disagreement test) wired into the evidence timeline as a state filter.
14 new tests. 7/7 goals MET.

Sixth sabotage of the phase, and the only one whose first test version MISSED
it: `countStates(entries)` -> `countStates(visible)` left 18/18 green because
the tests exercised functions, not wiring. A component-level rendering test
catches it. Lesson: test where the rule can actually break.

Completion dimensions: implementation 8/8 COMPLETE, evidence COMPLETE,
certification **BLOCKED** (both QA gates unrun on all eight changes),
publication PENDING.

AGENTS.md audited per OpenAI's explicit recommendation for GPT-6 Astra and
extended with a "Working as GPT-6 Astra" section (precedence, autonomy,
calibrated verification, writing, delegation, runtime). Six existing
stop-directives kept — none weakened.

Handoff: `docs/handoff/codex-astra-kickoff.md`. Waypoint at revision 38.

## 2026-09-06 — Shared browser/desktop runtime architecture

Spec/Plan work requested by the user. Added `prior-auth.code-workspace` with
the existing ASO, Forge, Gate, Realtime Fabric and entity-management folders.
Created `docs/architecture/application-runtime-architecture.md` as a Proposed
design, with six Mermaid diagrams. No application code, dependency pins or
accepted ADRs changed. The workspace file does not modify Codex UI settings.

Recommendation: common React application and PEM's existing Zustand graph;
worker PGlite for browser and native SQLite desktop target after parity proof.
Source inspection found the missing Electric facade/materialization seam,
snapshot-only persistence adapters, module-global PEM runtime state, and the
Kratos opaque-token versus FRF JWT integration boundary. These are documented
refinements, not implemented fixes. ADR-006/007 successor decisions are named.

Artifact review initially found four gaps: durable logout fencing, ownership
of unsent drafts, offline authorization lifetime and atomic graph publication.
The revised artifact received **Passed** from the independent artifact critic.
Document T0 checks: Python JSON/path/link/fence validation reported **Passed**;
all five workspace folders exist. Mermaid 11.16.1 `parse` reported **Passed**
for all six diagrams after fixing a semicolon in a sequence message. No T1/T2
application tests, live service tests or native runtime checks were run; those
claims remain unverified. Diagram parsing is not visual rendering proof.

Primary memory write did not return and was stopped; its persistence is
unconfirmed. This append-only entry is the local fallback. No guards or
unrequested application behavior were added.

## 2026-09-06 — Complete ADR reconciliation

User-authorized documentation reconciliation completed through Spec, Plan,
Execute and Reflect; recorded project phase remains web-ui-architecture,
waypoint revision 41. No application code or dependency pins changed.

ASO ADRs 001–005 now align runtime ownership, clinical authority, evidence
states, component composition and navigation. ADRs 006–007 retain their exact
original decision bodies as superseded history; accepted target ADRs 008–009
replace their state/session and storage/update decisions. The application
runtime architecture is an accepted target, not implementation certification.
The new architecture README indexes every decision across all five roots.

All eight original FRF ADRs now declare integration scope. FRF ADR-009 records
ASO shape authorization, subject/run visibility and bounded revocation gates.
Media records distinguish concrete adapter types from their existing crate
packaging deviation and resolve shared socket/driver-task ownership. Original
FRF proposal/acceptance statuses and dates are preserved. No numbered ADRs were
found in Forge, Gate or PEM; PEM's unnumbered incremental-query decision was
reviewed as historical performance guidance, not a current performance SLA.

T0 Python checks: Passed — 20 Markdown documents, balanced fences, existing
local links, successor statuses, exact historical decision-body preservation,
and all eight original FRF status/date lines retained. Mermaid 11.16.1 parse:
Passed — all six architecture diagrams. Independent artifact critic: Passed —
all 18 numbered ADRs, index, runtime architecture and PEM decision; no blocking,
major or minor consistency findings. No T1/T2 application tests were run.

Reflection delta: the complete inventory also exposed conflicting media port
packaging and task-ownership statements; documentation corrections stayed
within the requested ADR scope. No unrequested behavior or executable guards
were added. Documented authorization fences trace to session/tenant/clinical
trust boundaries. FRF shape materialization, native parity, live Kratos,
revocation, updates and runtime certification remain unverified. The existing
media crate/rule discrepancy is recorded, not fixed. Local append-only memory
is used after the primary memory write failed to return in this session.

## 2026-09-06 — React component, mobile and motion architecture

User requested a document connecting prototype UI to the accepted runtime,
with extensible shadcn parts/sections/cards/views, hooks and Zustand ownership,
then added smooth desktop-to-mobile resize and effective motion. Spec/Plan,
document execution and reflection completed; waypoint remains revision 41,
web-ui-architecture. Added docs/architecture/react-ui-component-architecture.md
and its review receipt, and linked both from the architecture index.

Applied Vercel composition, React best-practices and view-transition skills;
excluded conflicting SWR/Next.js/React Canary recommendations. Context7 and
official docs supported stable React, Base UI composition and Zustand scoping.
One CSS-adaptive tree preserves runtime/view/editor identity on resize; local
motion respects existing tokens and reduced-motion preferences. Protected
browser document transitions are disabled because captured outgoing pixels
can outlive DOM teardown. The same runtime adapters serve every viewport size.

Reflection delta: source inventory corrected generic screen assumptions into
the actual generated-letter/model-correction, annotation disposition and
reviewer-accountability workflows. It also identified prototype-only persona
and gate simulations, tablet navigation gaps and incomplete focus exclusion.
Judge findings made stage dependencies, preview/auth contracts and candidate
token implementation order explicit. Repeated evidence queries distinguished
source repository exports from installed 4.0.0 exports; final independent
critic adjudication found no unresolved architecture defect. Remaining unused
auxiliary-type observations are recorded as implementation guidance.

T0 Passed: all 19 prototype HTML files mapped, 26 architecture local links,
balanced fences, four Mermaid diagrams parsed, reviewed SHA-256 unchanged.
Independent critic Passed; REST judge role k3 Passed with warning dispositions
recorded in the review receipt; strict report screens Passed at score 0.0.
No application code, pins, tokens or prototype files changed; no executable
guards or unrelated changes added. Documented guards correspond to real
session/clinical boundaries and observed prototype gaps. Implementation,
accessibility behavior, physical devices and animation performance are not
certified; no application T1/T2 tests ran. Local append-only memory is the
fallback for the previously unavailable primary memory write path.

## 2026-09-06 — Task A closed; adversarial review changed the verdict

Both skipped gates ran. artifact-refiner 11/11 blocking constraints across web,
Rust and Flutter. Adversarial review: 2 CRITICAL, 3 HIGH, 3 MEDIUM, 1 LOW.

**The read path is disconnected.** `createEvidenceSyncAdapter` has one
occurrence — its own definition. Nothing writes rows into PGlite. Every case
renders "No evidence has been recorded" regardless of the chart. Four addenda
of my own increasingly confident verification did not surface it; a
fresh-context reader found it in four minutes.

Six fixed, three carried to runtime-architecture. Certification COMPLETE,
publication BLOCKED. 57/57 tests, audit PASS, browser renders.

Lesson: a green suite plus a rendering browser cannot tell you a module has no
callers.

## 2026-09-06 — runtime-architecture execution prompt written

`docs/handoff/codex-runtime-architecture-execute.md` (315 lines). The prior
kickoff is marked superseded for this phase and retained for the Task A record.

Shape of the prompt: it does NOT restate the two architecture documents (859
lines of reviewed specification with their own sequences) — summarizing them
would create a third, lossier source. It says which document governs what, in
which order, names the three carried defects with verified line numbers, and
states one concrete first exit criterion.

It also does not assign the whole seven-row sequence. Runtime orders 1-2 are
server and gateway work across flint-gate, flint-forge and
flint-realtime-fabric; starting there without the operator's sequencing
decision would be guessing.

All 14 factual claims in it verified against the repo before writing.

## 2026-09-06 — phase closed and committed

Reflection consolidated into a phase-close section (941 lines total, seven
addenda plus the close). Sycophancy screen 0.0 at strict.

Repository INITIALIZED — this working tree was not under version control for
the whole phase. First commit `6bf36c2`, 483 files, branch `main`, tagged
`phase/web-ui-architecture`.

Two ignore gaps closed before committing: a top-level `node_modules/`
catch-all and `*.tsbuildinfo`. `.env` was already ignored and stays untracked.
No secrets staged.

Gates at commit: web 57/57, typecheck 0, lint clean, cargo 5 passed, flutter
analyze clean, audit PASS 6/6.

## 2026-09-06 — Created runtime-architecture phase

User invoked /kbd-new-phase runtime-architecture based on
 docs/handoff/codex-runtime-architecture-execute.md. Used the kbd-new-phase
helper with runtime authority enabled, not direct projection edits. Seeded
eight goals in .kbd-orchestrator/phases/runtime-architecture/goals.md and an
explicit interpretation of handoff authorization/startup/publication wording.
Canonical next work is /kbd-assess runtime-architecture; no assessment, plan
or application implementation is claimed by this phase-creation operation.

First delivery is a persisted synthetic clinical-domain row through the
server-authorized Electric/FRF, local SQL and coherent scoped PEM path to a
browser-rendered screen with payload evidence. Runtime order 1 precedes 2–4;
UI stage dependencies are the presentation view of that same sequence.
Canary columns filtering alone does not prove access control. Every continuation
must be authorized and upstream Electric remains private. Preserve full startup
invalidation transitions and offline locking. No real patient data is used.

Independent scope reader identified the same handoff ambiguities; they are
resolved in goals.md. T0 Passed: eight goals, four source links and no placeholder
stub. prometheus kbd status --json confirms runtime-architecture in_progress,
revision 51, exact next work /kbd-assess runtime-architecture. Audit shows
phase_defined (48), active_path_changed (49), phase_transitioned (50), and one
passing phase/before boundary receipt (51). Waypoint and new progress projection
agree. Prior publication remains blocked; no completion dimension was cleared.

Observed compatibility discrepancy: project.json.activePhase still names
web-ui-architecture. The runtime-authority helper returns before updating that
legacy metadata; canonical state and generated projections point to the new
phase. No typed project-metadata update command was exposed in CLI help.
AGENTS prohibits hand-editing that control file, so it was preserved. This does
not change canonical assessment readiness and is recorded for assessment.

No application code, dependency pins, tokens or architecture specs changed.
No executable guards or unrelated behavior added; no application tests run.
Phase implementation and its browser acceptance outcome remain unverified.

## 2026-09-06 — runtime-architecture assessment complete

Executed /kbd-assess only. Added phase assessment.md, review packets/findings,
critic/review receipts, tone evidence and stage handoffs. Runtime CLI recorded
Assess complete at revision 53 and next /kbd-plan runtime-architecture at 54.
Optional analyze/spec handoffs explicitly use the existing researched runtime/UI
specifications; remaining contract/adoption choices stay open for planning.
The prior publication blocker remains blocked. Legacy project metadata remains
stale and was not manually rewritten.

D1-D3 remain source-confirmed. Additional findings: caller-selected signing
actor plus permissive memory authority in the actual ASO composition; absent
ASO membership/transaction context and FRF Electric facade; copied one-shot SQL
results in React; unsafe lifecycle globals and optional pending-action replay;
evidence_states key/id mismatch; missing annotation/authorized preview service;
native transport and update gaps. These are source findings, not exploit or
integrated runtime results. Their common root is treating available primitives
and convincing comments as evidence that the composed path exists.

Independent critic suggested the key/id finding, incorporated. Distinct k3 REST
judge returned PASS twice, final 0 critical / 2 warnings / 1 suggestion. Both
anti-theater gates passed at score 0.0. Final warnings remain in review.md:
some companion excerpts were not present for the judge, and follow-up invariant
checks found transitive swr@2.5.1 through assistant-ui/ai-sdk and ai-sdk/react.
No direct web SWR import or observed clinical query cache is claimed; planning
must dispose of that dependency under the no-query-cache rule. Assessment hash
matches packet-final.json; post-review diagnostics are explicitly supplemental.

Current T0 diagnostics: pnpm --dir web typecheck && pnpm --dir web lint exited 0
(tsc --noEmit; oxlint). Both PEM packages match pin/declaration/installation
4.0.0. DB metadata is 60 base tables + 10 views, not 70 base tables. Isolated
temporary token regeneration exactly matches both project theme outputs. Four
assessment links, 19 matrix rows, JSON and fences validated. Application-path
git status was empty. No application code/dependency/schema/token edits, no new
guards, no unrelated implementation, and no real patient data used. Browser,
native/device, clinical authorization and full build/invariant gates remain
unverified this turn. No broader completion/certification claim was made.


## 2026-09-06 — runtime-architecture planning complete

Executed /kbd-plan only. Added phase plan.md, critic/judge packets and findings,
final review receipt, validation/tone receipts, Plan handoff, and 24 root OpenSpec
changes (proposal, design, spec and unchecked tasks per change). Registered the
24 changes through the canonical CLI in dependency order. Plan stage is complete;
revision 81 points to /kbd-execute runtime-architecture. Local implementation is
PENDING, 0/24; publication remains BLOCKED. Inherited evidence/certification
summaries describe earlier work and do not verify these new runtime changes.

Backend correction: the root openspec/config.yaml exists and selects spec-driven;
openspec list --json confirmed the nearest root. The stale constraint allows a
root OpenSpec project OR actual specs, and the KBD skill selects an existing root.
Root OpenSpec owns tasks; KBD owns ordering/status. No duplicate native changes
or manual edits to canonical JSON were introduced. Legacy project metadata was
not rewritten.

Independent artifact critic resolved SQLite projection scope, an oversized sync
change (split into conformance, worker ownership and SQL materialization), missing
gate-summary projection/read ownership, and durable synthetic crash-fixture scope.
Distinct k3 REST judge returned PASS twice; final findings were 0 critical,
3 warnings and 1 suggestion. Warning dispositions: retain root OpenSpec on actual
root evidence; move orthogonal ra-10 dependency to first delivery ra-14; explicitly
accept actual practice-derivation triggers on fresh/upgraded schema. Flutter
analyze/test was added to phase T2 after round 1. Final amendments were independently
critic-checked, with no new critical/warning finding; no third REST judge was run.
Review receipt distinguishes judged and final hashes. G-PIN still requires the
operator-owned PEM pin decision and an actual verified package artifact; isolated
candidate tests cannot certify the application's existing exact 4.0.0 installation.

T0 Passed: each of 24 openspec validate <id> --strict --json --no-interactive
commands returned one valid item and zero issues; 96 authored Markdown artifacts,
75 acceptance criteria, 195 unchecked tasks, acyclic dependencies. Aggregate check
first failed because its reader assumed a top-level validation boolean; corrected
to the observed CLI items/summary schema and passed. Link check: 97 planning
documents, 54 local links resolve. Both judge anti-theater gates passed at 0.0;
final tone score 0.017857 has only a low length flag. Handoff JSON/output references
passed; canonical progress is 0/24 pending and publication blocked. Scoped git
status for application, docs, pins, tokens and workspace paths was empty.

No application code, dependency, schema, token or architecture-document edits.
No executable guards or unrelated implementation added; proposed guards trace to
assessment findings or explicit authority/privacy/session boundaries in the plan.
No application tests/builds or browser/native/device verification ran. Those
runtime claims and integrated phase acceptance remain unverified. plan:after
completed; memory mirror write failed, so this append is the required local
fallback. No real patient data was used and no commit or publication occurred.


## 2026-09-06 — runtime-architecture execution dispatch and RA-01 eligibility

Ran /kbd-execute with root OpenSpec and the KBD-owned per-task driver. Added
execution.md, execute handoff, RA-01 eligibility evidence and a fresh artifact
critic receipt. Reused all 24 changes. Registered RA-01's eight tasks and completed
only task 1.1 (driver ordinal 1); the seven implementation/acceptance/review tasks
remain unchecked. Execution stage remains in progress. Canonical revision 97
names next /kbd-apply ra-01-verified-session, RA-01 IN_PROGRESS, phase 0/24.
Publication remains BLOCKED. The apply driver completes one task per turn; this
invocation handled execution setup plus eligibility, not a implemented endpoint.

Routing is explicit: project registry resolves frontier.local to
claude-sonnet-4-6, which is not a callable native model here; the reviewed plan
recommends Codex, so actual dispatch stays with active frontier gpt-6-astra.
No project metadata/model registry was rewritten. Independent source reader
inspected bounded Gate/Forge/ASO seams; fresh critic reviewed only dispatch and
eligibility artifacts and returned no findings, without runtime/source verification.
Per-change artifact-refiner and distinct-model diff review remain required when
a change is implemented; no archive or certification was claimed.

RA-01 has no predecessor or immediate operator gate. Confirmed no mounted session
route, no ASO database adapter/runtime role, example Gate upstreams, and an
Axum-owned session type that needs a shell-neutral contract. Membership is active
users plus user_roles/user_capabilities, not users.practice_id alone. Authorization
revision semantics still need concrete definition in implementation task 1.2.
Context7 /ory/docs and the official pinned Kratos v26.2.0 OpenAPI support Cookie,
Bearer and X-Session-Token. This verifies a candidate protocol, not the deployed
hop. Forge remains the Postgres substrate; no ASO business logic goes in its
shared gateway. Native authentication remains inactive and private replicas stay
outside this change.

T0 Passed: execution.md has 24 assignments and resolving local links; eligibility
covers six gates and ownership; handoff JSON/output references resolve. After the
single task update, openspec validate ra-01-verified-session --strict --json
--no-interactive returned valid=true, issues=[], one passed and zero failed.
Canonical progress checks: 0/24, RA-01 1/8 tasks and IN_PROGRESS, next command
/kbd-apply ra-01-verified-session, publication BLOCKED. After task-driver completion
the observed change projection had returned to Pending; restored InProgress with
a typed CLI transition and verified revision 97. Root cause of that status reset
was not investigated or claimed fixed. No generated JSON was hand-edited.

Docker compose status: db and electric running/healthy; Gate and Kratos running
without a health assertion. No application endpoint/test/build or database data
query ran. Scoped git status for application, dependencies, deployment and
architecture docs was empty. No application source, executable guards or
unrelated implementation added; all runtime acceptance remains unverified.
Lifecycle hooks completed with memory-mirror failures; this append is the local
fallback. No real patient data, database mutation, commit or publication occurred.


## 2026-09-06 — RA-01 task 1.2 implemented and verified

Execute phase. Delivered the mounted GET /api/session path through a shell-neutral
AppServices port, real Kratos validation, and fresh Postgres membership. Added
restricted reader migration and incarnation/revision triggers, sanitized no-store
responses, configured adapters and an inactive typed desktop counterpart.
Task 1.3/1.4 still own full context cleanup/parity and Gate/two-identity conformance.
No unrelated code was added; existing clinical behavior and PEM pins were preserved.

T0 Passed: check/clippy for host, Axum, web-server and desktop using installed
Rust 1.97.1; default stable cargo was unavailable. Web clippy has three preexisting
unit-struct-default warnings. T1 Passed: 3 provider tests, pinned Kratos transport
probe, 12 schema checks, and 34 actual mounted-app checks with no-store on all
30 responses. Controlled removal of provider active-state and practice-membership
guards each caused the targeted test to fail; sources restored byte-for-byte and
respective suites passed. All disposable identities, sessions, databases, roles,
app processes and logs were cleaned. No existing application database was migrated.

Independent artifact critic found a P2: runtime role validation covered schema
ownership but missed effective table ownership/write grants. Expanded the check;
critic confirmed resolution and mounted negative fixtures prove refusal/restoration.
The first mounted fixture failed because it assumed port 5432 while Docker publishes
55432; it now discovers the published port. Failed attempts remain in evidence.
Guards trace to actual credential and tenant authority boundaries, including this
observed defect. No speculative business guards were added.

OpenSpec strict validation after task completion: valid=true, issues=[], 1 passed,
0 failed. Receipt links, JSON, Python syntax, all 13 source hashes and scoped diff
check passed. Driver end-task completed ordinal 2 at revision 102; its projection
again reset change status to Pending. Typed CLI transition restored InProgress at
revision 103; no generated JSON was hand-edited and no orchestrator fix is claimed.
Canonical progress: RA-01 2/8, phase 0/24, next /kbd-apply ra-01-verified-session
(task 1.3), publication BLOCKED. Existing inherited certification summaries are
not certification of this runtime phase.

Full-change artifact-refiner/adversarial gates, two-identity pool/cancellation
behavior, mounted Gate routing, production secrets/migration and physical native/UI
execution remain unverified. No T2/T3, archive, commit or publication. Evidence:
.kbd-orchestrator/phases/runtime-architecture/evidence/ra-01-verified-session/task-2.md.


## 2026-09-06 — RA-01 task 1.3 complete

Execute phase. Delta: transaction setup and shell-neutral identity already existed
from task 1.2; extracted production begin_scoped owner and added missing lifecycle,
mounted provider-trait/error and desktop refusal evidence. Changed adapter, new
transaction test module, desktop test module, new context runner and OpenSpec
design/tasks. No dependency/schema/unrelated implementation or new guards.

T0 Passed: cargo +1.97.1 check and clippy --tests --no-deps for web-server and
desktop; web-server retains three preexisting unit-struct-default warnings.
T1 Passed: desktop actual-wrapper test 1/0/0; context runner 41 checks, all 37
responses no-store; explicitly enabled database test 1/0/0 covers six exits.
Normal exits reused same backend with cleared identity and restored settings.
Active-query cancellation discarded old backend; replacement was clean and old
backend absence was verified. Initial fixture incorrectly required same PID in
that case. SQLx source explains discard on release ping error. Corrected fixture,
retained failed evidence.

Independent artifact-critic found one P2 fixture error: inherited helper assumed
every 403 meant practice denial. Explicit status/body/no-store reauthentication
assertion fixes it; independent source recheck confirmed resolution. Deliberate
transaction identity-persistence and desktop-refusal bypass each produced failed
tests (101); restored both sources byte-for-byte and final suites passed. All
disposable resources and controlled provider stopped/removed.

OpenSpec strict validation after completion: valid=true, issues=[], 1 passed,
0 failed. Source hashes, receipt links, JSON, Python syntax, shell-neutral host,
PEM 4.0.0 pins and scoped diff check Passed. KBD driver completed task3 at 107
and again reset projected change to Pending; typed transition restores InProgress
without editing generated JSON. RA-01 3/8, phase 0/24, publication BLOCKED, next
/kbd-apply ra-01-verified-session for task1.4. Lifecycle memory mirror failed;
this append is the fallback.

Gate/two-identity assembled conformance, HTTP-disconnect propagation, native
UI/IPC/credentials, production deployment and full-change review remain unverified.
Cancellation can wait for the five-second statement timeout. No T2/T3, archive,
commit or publication. File-by-file evidence and limits:
.kbd-orchestrator/phases/runtime-architecture/evidence/ra-01-verified-session/task-3.md.


## 2026-09-06 — RA-01 task 1.4 complete

Execute phase. Added ASO Gate exact session site/route and disposable mounted
Gate harness. No permanent Rust, dependency, schema or companion edits. Anonymous
passthrough delegates fresh validation to ASO; site upstream preserves practiceId.
Both real Kratos identities (surgeon/staff in different practices) reused one
Postgres backend, with correct A/B GUC and reader role observed inside the lookup.
Only disposable DB instrumentation wraps its original unchanged identity function.

T1 Passed: RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-session-gateway.py, exit0,
36 checks, 34/34 no-store (33 through Gate, one direct readiness); Cookie/Bearer/
X-Session-Token, full summaries/revision/expiry, forged hints, foreign scopes,
mixed distinct credentials, membership removal, deactivation, outage and recovery.
Removed GUC setup deliberately: mounted A Bearer returned403 instead of200, probe
exit1; restored source byte-for-byte. T0 check/clippy for web-server exit0 (three
preexisting warnings), final mounted suite passed. All owned resources removed.

Independent artifact critic found P2 cleanup timeout escaped and skipped later
cleanup. Catch subprocess/OS failures and continue; mocked recheck proved second
and base cleanup run, resultFailed retained. Critic confirmed resolution and no
remaining actionable scoped findings. First live fixture used wrong role key
coordinator; corrected to schema staff; deactivation uses deactivated. Failed
attempts are retained. All new tests trace explicit session/tenant requirements;
no unrelated guards added. Generated probe bytecode removed.

T0 YAML/AST, source hashes, receipt links, JSON and scoped diff Passed. OpenSpec
strict validation after task4 completion: valid=true, issues=[], 1 passed/0failed.
Driver revision112 reset change Pending; typed transition restored InProgress.
Canonical RA01 4/8, phase0/24, publicationBLOCKED, next /kbd-apply
ra-01-verified-session (acceptance2.1). No generatedJSON hand edits.

Known Gate same-name duplicatecredential collapse remains an explicit transport
limitation; mixed distinct sources are tested. Full productionconfig, native
UI/IPC, HTTPdisconnect propagation and full-change QA remain unverified. Outage
was injected via forwardingproxy without stopping sharedKratos. No T2/T3, archive,
commit or publication. File-by-file evidence:
.kbd-orchestrator/phases/runtime-architecture/evidence/ra-01-verified-session/task-4.md.


## 2026-09-06 — RA-01 acceptance 2.1 complete

Execute phase. No application implementation or runtime rerun was needed: all
18 latest tracked source/design hashes matched the verified artifacts. Added
task-5 acceptance JSON/receipt binding current hashes to previous actual T1
commands and results. Clarified OpenSpec outcome1 expiry wording to match the
existing task1.2 design: preserve each credential's verified expiry; separate
browser/native sessions may differ. No lifetime or authority semantics changed.

Acceptance Passed using gateway-session.json (completed17:54:05UTC, 36checks,
34/34 no-store) and context-session.json (completed16:28:18UTC,41checks,37/37
no-store). Six A/B transport cases, exact sanitized fields, per-session expiry,
current database revision and fresh membership/capability changes are supported.
Prerequisites and cleanup are recorded at those runs, not claimed freshly run.
T0 this turn: 18 source hashes, two evidence hashes, named case/result assertions,
JSON/link/scoped-diff checks Passed. Post-completion OpenSpec strict validation
returned valid=true, issues=[], 1passed/0failed. No new T1/T2/T3 execution.

Independent artifact critic found no actionable acceptance2.1 gaps after comparing
receipts, assertions and spec/design. Its review was source/evidence only. No
unrelated implementation, dependencies, tests or guards added. Prior trust-boundary
mutation proofs remain unchanged. Gate same-name duplicate-header parity, native
UI/IPC, production deployment and full-change QA remain unverified.

KBD completed task5 at revision117, then again projected Pending. Typed change
transition restored InProgress; no generated JSON edited. Canonical RA01 5/8,
phase0/24, publicationBLOCKED, next /kbd-apply ra-01-verified-session for2.2.
Start hook memory mirror failed; this append is the local fallback. No live
resource mutation, archive, commit or publication this turn. File-by-file receipt:
.kbd-orchestrator/phases/runtime-architecture/evidence/ra-01-verified-session/task-5.md.


## 2026-09-06 — RA-01 acceptance 2.2 complete

Execute phase. Added task-6.md and task-6-acceptance.json mapping 16 recorded
cases to the forged-hint, unauthorized-practice and explicit refusal requirements.
No application code, specification, test, dependency or guard changes were needed.
All 18 source/design hashes and both evidence hashes remain unchanged. No live
T1 rerun or current service-availability claim was made.

Acceptance Passed using prior gateway-session.json (36 checks, 34/34 no-store)
and context-session.json (41 checks, 37/37 no-store). Forged headers without
credentials return 401; with a valid credential they preserve verified scope.
Foreign practice returns 403 practice_denied. Controlled provider traits do not
grant authority. Anonymous remains 401 during provider outage; credentialed
requests return 503 session_unavailable. Invalid session and reauthentication
retain distinct error bodies. The receipt distinguishes controlled provider
traits and injected outages from real Kratos behavior.

T0 executed: source/evidence hashes, 16 named status/no-store assertions, recorded
cleanup, JSON/local links and scoped diff Passed. OpenSpec strict validation
after completion returned valid=true, issues=[], one passed and zero failed.
Independent artifact critic found no false claims or acceptance evidence gaps;
review was read-only. No new guards or unrelated implementation were added.
Prior credential/tenant mutation evidence remains unchanged.

KBD task6 completed at revision122; its projected Pending state was restored
to InProgress through a typed transition. No generated JSON was hand-edited.
Canonical progress: RA-01 6/8, phase 0/24, publication BLOCKED; next command
/kbd-apply ra-01-verified-session for acceptance 2.3. Same-name duplicate-header
parity, native UI/IPC, HTTP-disconnect propagation, production configuration/
deployment and full-change QA remain unverified. No T2/T3, live resource
mutation, archive, commit or publication occurred. File-by-file receipt:
.kbd-orchestrator/phases/runtime-architecture/evidence/ra-01-verified-session/task-6.md.


## 2026-09-06 — RA-01 acceptance 2.3 complete

Execute phase. Plan/delivery delta: no implementation changes were needed;
acceptance maps existing mounted evidence to pooled identity isolation and
membership refusal. Added task-7.md and task-7-acceptance.json. KBD updated
openspec/changes/ra-01-verified-session/tasks.md and generated projections.
No application code, tests, dependencies, unrelated additions or guards added.
Existing context/membership guards trace to explicit identity and tenant boundaries.

T0 observed: Passed: 18 source/design hashes, 2 evidence hashes, 17 Gate
observations, six lifecycle exits, local links and whitespace.
openspec validate ra-01-verified-session --strict printed
Change 'ra-01-verified-session' is valid; scoped git diff --check exited 0.
Prior T1 gateway run: 36 checks, 34/34 no-store, one shared backend for A/B.
Prior T1 context run: 41 checks, 37/37 no-store, six transaction exits Passed.
Removed B membership and deactivated A each returned 403 while the other
identity retained its correct 200 response/context. No live rerun or current
service-availability claim. Cancellation replaced and removed the old backend;
normal exit paths proved cleanup on the same backend.

Independent artifact critic found no substantive evidence gaps. Its P2 finding
was completion prose preceding the task transition; resolved by KBD end-task
and checking canonical progress. Driver projected Pending; typed transition
restored InProgress without hand-editing generated JSON. Revision128: RA01 7/8,
phase0/24, publication BLOCKED. Next /kbd-apply ra-01-verified-session runs task
3.1 full-change QA. Unverified: general concurrency, HTTP-disconnect propagation,
native UI/IPC, complete production configuration/deployment and Gate repeated
same-name credential header refusal parity. No T2/T3, archive, commit or publish.
Receipt: .kbd-orchestrator/phases/runtime-architecture/evidence/ra-01-verified-session/task-7.md.


## 2026-09-06 — RA-01 final completion and archive

Execute task 3.1 complete. Plan/delivery delta: no application code changed;
completion used current source hashes to retain prior T0/T1 rather than repeat
unchanged live campaigns. Added task-8.md, task-8-checks.json and
task-8-completion.json; scoped refiner state/report/validator and independent
review receipts under review/ra-01-verified-session; added archived files.txt
review inventory. KBD completed tasks, archived the change and promoted its spec.

Observed current T0: 18 source/design plus 2 evidence hashes unchanged, three
Python probes parse, Gate YAML/operator pins/shell neutrality pass, scoped diff
exit0 and strict OpenSpec valid=true with zero issues. Refiner Passed 96 checks,
0 issues; rerun after archive Passed 96,0. Prior T1 remained 36 Gateway checks
with34/34 no-store and41 context checks with37/37 no-store, all owned cleanup true.
Independent artifact critic had zero findings. k3 REST judge timed out at180s,
HTTP000, exit3, no verdict. Documented fresh-context native fallback gpt-5.6-sol
returned PASS with0 critical/0 warning/0 suggestion and six checked classes.
Producer was gpt-6-astra; weaker harness-native isolation recorded. Findings
schema Passed; anti-theater script printed PASS(score=0.0,strictness=strict),
exit0; direct MCP screen independently returned0.0 and no classifications.

Driver printed verify: PASS and archived: ra-01-verified-session. Actual archive
openspec/changes/archive/2026-09-06-ra-01-verified-session has8 checked tasks;
promoted openspec/specs/ra-01-verified-session/spec.md strictly valid,0issues.
Canonical revision133: RA01 complete, projection DONE/implementation COMPLETE,
phase1/24, publication BLOCKED. Initial read-only final assertion expected
projection COMPLETE; canonical inspection corrected the assertion, no state repair.
Next /kbd-apply ra-02-durable-affirmation. No T2/T3, live rerun, commit or publish.
No unrelated implementation/dependency/guard additions. Existing guards trace to
credential, identity, tenant and inactive native trust boundaries. Remaining
unverified: broad concurrency, HTTP-disconnect propagation, native UI/IPC, full
production deployment/configuration and duplicate-header refusal parity through
Gate. UI startup/clinical operations/replication remain their assigned later work.


## 2026-09-06 — RA-02 eligibility complete

Execute task1.1 Passed; RA02 1/9 in progress. Added evidence/ra-02-durable-affirmation/
eligibility.md and eligibility.json. Canonical RA01 complete8/8 and archive/spec
confirmed;18 source/design and2 evidence hashes matched. Plan, assessment/review
supplement, ownership and all6 decision gates reviewed. Independent ownership
reader found no conflict; artifact critic found no actionable eligibility defect.
Critic did not repeat canonical queries/hashes; root performed those checks.

The current clinical path is memory/actor-based, the existing PostgreSQL adapter
is read-only session scope, and checksummed server migration infrastructure is
missing. These are assigned RA02 implementation work, not eligibility blockers.
Preserve session-reader privileges, native inactivity untilRA17 and synthetic-only
proof. Historical canonical blockers retained; no publication approval inferred.

Driver initially registered only current task; registered8 remaining definitions
as pending via typed CLI before completion so total9 stays accurate. No later
implementation task started. Driver completed1/9; Pending projection restored to
InProgress through typed change transition. No generated state hand-edited.
T0 JSON/local links/whitespace Passed; strict OpenSpec valid=true,0issues,1passed.
No application code, schema, dependencies, guards or unrelated work added.
No live service/patient-data access, Cargo/T1/T2/T3, archive, commit or publication.
Next /kbd-apply ra-02-durable-affirmation implements task1.2: checksummed migration,
least-privilege durable affirmation/command ledger, gate summary and write refusal.

## 2026-09-06 — RA-02 task 1.2 backend complete

Runtime-architecture Execute. KBD begin/end task 2 of 9 fired. Canonical task2
is complete; RA02 remains in_progress, 2/9 complete and task3 pending. The driver
projected Pending after task end; typed change transition restored InProgress
at revision152. No generated state was hand-edited.

Added checksummed explicit migration, least-privilege gate repository and
service command contracts, atomic audit/result ledger, upgrade reconciliation
and summary write refusal. T0 host/web check+clippy Passed; test composition
retains three existing warnings and staged binary has four dead-code warnings.
T1 final disposable fixture Passed:22 fixture checks,16 lifecycle markers,
6 cleanup checks; Rust1passed,0failed,0ignored. Service mutation failed as
intended then restored byte-for-byte; direct trigger and summary sabotage
controls were rolled back. Independent critic found0remaining backend issues
after3findings were fixed. Strict OpenSpec valid=true,0issues.

No unrelated additions, dependency version/PEM pin/lockfile changes, real PHI,
commit, deployment or broad T2/T3. HTTP/Gate/desktop integration and full change
acceptance remain unverified. Next /kbd-apply ra-02-durable-affirmation executes
task1.3. Detailed file-by-file delivery, guard provenance, failures and evidence:
.kbd-orchestrator/phases/runtime-architecture/evidence/ra-02-durable-affirmation/task-2.md.


## 2026-09-06 — runtime-architecture Execute, RA-02 task 1.3

Delivered actor-free durable gate HTTP/desktop contracts, fresh session and
independent Gate callback policy, server repository composition, web command
lookup/recovery, and relevant ADR/runtime-document alignment. Companion Gate
hook required five source files. Independent critic found stale web lookup
state; correction plus scope fencing passed 12 tests. Router 10, Gate 8 and
desktop 2 tests passed. Live Gate/ASO/Kratos/Postgres fixture passed 81 checks
and 17 cleanup checks. Callback, desktop and lookup source mutations went red
at intended assertions and were restored; final T0/T1 passed. Final independent
review found no remaining actionable unit finding. No T2/T3, deployed image,
physical device or clinical UI certification. RA-02 continues after task 3.
Evidence and file inventory: .kbd-orchestrator/phases/runtime-architecture/evidence/ra-02-durable-affirmation/task-3.md.


## 2026-09-06 — RA-02 task 1.4 verification

Fresh migration before seeding passed 16 fixture checks; populated upgrade
passed 22. Both actual PostgreSQL lifecycle runs passed 17 markers and six
cleanup checks. Real post-commit transport loss, lookup/retry and payload
conflicts passed in mounted Gate campaign: 96 checks, 18 cleanup checks.
Added explicit real-service-authority administrator/foreign/Agent controls
with accepting write repository. Independent critic found no actionable gap.
No product code, migration or dependency changed in task4. Evidence:
.kbd-orchestrator/phases/runtime-architecture/evidence/ra-02-durable-affirmation/task-4.md.

## 2026-09-06 — RA-02 completion review

Runtime-architecture Execute task 3.1 completed at T0/T1. Three artifact-refiner
iterations corrected seven observed findings; its final deterministic gate
passed 190 checks with zero issues. Fresh and upgrade database campaigns passed
16/22 checks, 18 real lifecycle assertions each and six cleanup checks each.
The mounted Gate/server campaign passed 96 checks and 18 cleanup checks. Host
clippy, 11 server route tests, web typecheck/lint and all 69 web tests passed.
Strict OpenSpec validation passed.

The final isolated gpt-5.6-sol judge returned PASS with zero critical findings,
one plaintext-callback warning and zero suggestions. Strict findings schema and
anti-sycophancy checks passed. Real server and Gate callers are mounted; the
browser route and desktop wrappers remain test-only. No T2/T3, deployment,
physical device, real PHI, dependency pin, commit or publication was added.
Evidence: .kbd-orchestrator/phases/runtime-architecture/evidence/ra-02-durable-affirmation/task-9.md.

## 2026-09-06 — RA-03 task 1.1 eligibility

Runtime-architecture Execute. Confirmed RA-02 canonical completion at 9/9 and
matched all seven files referenced by its final acceptance receipt. Registered
the full eight-task RA-03 inventory with only task 1 started. Recorded the ASO,
Gate, Forge, realtime-fabric and PEM ownership boundary plus G-PIN, G-REV,
G-DATA, G-SYNC, G-NATIVE and G-MEASURE dispositions. The independent critic's
three evidence findings and one follow-up accounting finding were corrected;
its final artifact-only verdict was PASS. T0 JSON, canonical dependency, hash,
local-link, whitespace and strict OpenSpec checks passed. No application code,
schema, dependency, guard or companion-repository source changed; no live data,
Cargo, T1, T2 or T3 check was used. The driver completed task 1; a typed change
transition restored the unfinished change to InProgress at revision 199, with
1/8 tasks complete. Evidence:
.kbd-orchestrator/phases/runtime-architecture/evidence/ra-03-clinical-command-parity/eligibility.md.

## 2026-09-06 — runtime-architecture Execute, RA-03 task 1.2

Delivered actor-free verified-context letter signing across host, HTTP, Gate
policy, restricted PostgreSQL and the inactive typed desktop counterpart. The
command binds letter/QA/signature revisions; server and database independently
refuse forged scope, admin/agent principals, stale revisions, incomplete QA,
missing sources, moved approved claims and annotation-only claims without the
required document/page/date citation.

T0 check/clippy passed for host, Axum, web-server and desktop; web-server kept
two pre-existing memory unit-struct warnings. Focused T1 passed: host 3/3, Axum
4/4, desktop 1/1, deployment 1/1, and fresh/upgrade real PostgreSQL fixtures
with 8/8 signing markers each. Four guard sabotages failed as intended and were
restored to hashes matching the passing receipts. Independent artifact review
failed initially, the two task-scoped defects and overclaims were corrected,
and remediation review passed with zero remaining task 1.2 findings.

No T2/T3, mounted Gate image, live Kratos, Tauri runtime, deployment, commit or
production migration ran. Signing replay/result lookup and rollback injection
remain tasks 1.3 and 1.4. Detailed evidence:
`.kbd-orchestrator/phases/runtime-architecture/evidence/ra-03-clinical-command-parity/task-2.md`.

## 2026-09-06 — runtime-architecture Execute, RA-03 task 1.3

Delivered authoritative met/gap/void evidence reassessment with expected
`assessedAt` revision, an immutable PostgreSQL command ledger, exact replay and
explicit receipt lookup. Repaired signing replay so a lost response resolves
before already-signed target validation. Added matching Axum, Gate and inactive
desktop contracts. React retains uncertain command correlation, performs lookup
through feature HTTP APIs and waits for projection; signing, reassessment and
affirmation do not enter PEM replay.

T0 check/clippy passed for host, Axum, web-server and desktop; web-server retained
one existing memory unit-struct warning. Web typecheck/lint passed. Focused T1
passed: host signing 5/5 and reassessment 4/4, Axum evidence 4/4, letters 5/5 and
Gate 11/11, desktop 4/4, evidence hook 2/2 and affirmation hook 12/12. Fresh and
upgrade reassessment PostgreSQL campaigns passed four lifecycle markers each;
fresh signing reconciliation passed nine. Two guard sabotages failed as intended
and were restored. A mistakenly broad web run exposed an unrelated existing
GraphSessionManager timeout; no completion claim relies on that run.

No T2/T3, live Kratos, mounted Gate image, native runtime, deployment, commit or
production migration ran. Task 1.4 still owns production memory-path removal and
rollback injection. Detailed evidence:
`.kbd-orchestrator/phases/runtime-architecture/evidence/ra-03-clinical-command-parity/task-3.md`.

## 2026-09-06 — runtime-architecture Execute, RA-03 task 1.4

Removed production memory clinical composition from the mounted web server and
made Kratos plus restricted session/clinical PostgreSQL configuration mandatory.
Added a stateless unavailable criteria adapter and kept memory adapters test-only.
Expanded real signing and reassessment campaigns to prove administrator, agent
and foreign-practice refusal at service, repository and exact database-trigger
layers. Forced final-receipt failures proved complete rollback; successful
reassessment then preserved met/gap/void across three audited transitions.

Web-server check/clippy passed without warnings; deployment tests passed 2/2;
host signing and reassessment tests passed 5/5 and 4/4. Fresh and populated
upgrade PostgreSQL campaigns passed 16/22 fixture checks for each operation,
with 10 signing and 7 reassessment lifecycle markers and complete cleanup. The
real Kratos/mounted-server compatibility run passed 34 checks, 30 no-store
responses and 9 cleanup checks. No T2/T3, deployed Gate image, Tauri runtime,
production migration, dependency change or real patient data was used. Evidence:
`.kbd-orchestrator/phases/runtime-architecture/evidence/ra-03-clinical-command-parity/task-4.md`.

## 2026-09-07 — runtime-architecture Execute, RA-03 task 2.1

Recorded current proof that a forged signing actor cannot enter the trusted
context and stale letter, QA and signature revisions cannot pass. Host signing
tests passed 5/5, Axum letter-route tests 5/5 and the inactive desktop signing
boundary 1/1. A fresh disposable PostgreSQL campaign passed 16 fixture checks,
10 lifecycle markers and six cleanup checks using the actual `AppServices` and
restricted `PgGateRepository`; its stale-revision marker observed the letter
remain approved and unsigned. No product source, migration, dependency or
architecture document changed. No T2/T3 or native signing claim was made.

The KBD task-begin memory mirror write failed while canonical lifecycle state
advanced normally. This append and the task receipt are the local fallback.
Evidence:
`.kbd-orchestrator/phases/runtime-architecture/evidence/ra-03-clinical-command-parity/task-5.md`.

## 2026-09-07 — runtime-architecture Execute, RA-03 task 2.2

Proved signing and reassessment lost-response reconciliation against current
service, HTTP and PostgreSQL paths. Host tests passed 5/5 and 4/4; Axum tests
passed 5/5 and 4/4. The current signing receipt and a new reassessment campaign
each observed exact repeat plus lookup with one clinical effect, one audit and
one immutable receipt. Two React hook files passed 14/14 tests. Five static
production call-path checks proved affirmation uses its HTTP feature API, no web
signing caller exists, and shared sync/PEM contains no clinical command path.

No product source, migration, dependency or architecture document changed. No
T0 was required; no T2/T3 or native/realtime convergence claim was made.
Evidence:
`.kbd-orchestrator/phases/runtime-architecture/evidence/ra-03-clinical-command-parity/task-6.md`.
The KBD task-end memory mirror write failed while canonical completion advanced;
this append is the required local fallback.

## 2026-09-07 — runtime-architecture Execute, RA-03 task 2.3

Proved independent unauthorized-signing refusals and the audited three-state
reassessment lifecycle. Host signing/reassessment tests passed 5/5 and 4/4;
Axum letter policy/route tests passed 5/5. Current-hash validation of the fresh
signing and reassessment PostgreSQL receipts observed administrator, agent and
foreign-practice refusal at service, restricted-function and direct-trigger
layers, with exact trigger SQLSTATE 42501. The allowed sequence retained void,
gap and met and ended with three surgeon-attributed audits and three receipts.

No product source, migration, dependency or architecture document changed. No
T0 was required and no T2/T3 or deployed Gate claim was made. The task-begin
memory mirror write failed while canonical state advanced; this append is the
local fallback. Evidence:
`.kbd-orchestrator/phases/runtime-architecture/evidence/ra-03-clinical-command-parity/task-7.md`.


## 2026-09-08 — runtime-architecture Execute, RA-03 task 3.1

Completed the final focused verification and review for clinical command parity. Scoped Rust T0 passed 8/8 without warnings under Rust 1.97.1. Focused T1 passed host signing 5/5 and reassessment 4/4, Axum letters 5/5, evidence 4/4 and Gate 13/13, web-server deployment 2/2, desktop 4/4, and React hooks 25/25. Fresh/upgrade PostgreSQL campaigns passed signing 25/31 checks with 24 markers and reassessment 16/22 with seven markers; every campaign passed 6/6 cleanup. Eleven negative controls reproduced their targeted defects and restored sources exactly.

Seven isolated adversarial attempts found and drove repairs for publication ordering and identity, schema publications, DDL write-skew, source and truncation races, uncertain command ownership, practice scope, navigation lifetime, and Gate outage classification. The final isolated gpt-5.6-sol verdict reported zero findings across seven checked classes. The findings schema and strict anti-sycophancy gate passed. Artifact refinement converged at iteration seven with 109/109 checks. No Tier 2/Tier 3, deployment, browser-rendering, Tauri-window, physical-device, commit, production database, or real-patient-data operation ran. Evidence: `.kbd-orchestrator/phases/runtime-architecture/evidence/ra-03-clinical-command-parity/task-8.md`.


## 2026-09-08 — runtime-architecture Execute, RA-04 task 1.1

Passed the projection-grant eligibility gate. Canonical KBD status at revision 247 records RA-03 complete with 9/9 tasks; its archive, final acceptance, 109/109 refiner output, and zero-finding adversarial verdict are present and current-hash recorded. Repository ownership is bounded across prior-auth, flint-gate, flint-realtime-fabric, flint-forge, and prometheus-entity-management, with every pre-existing dirty entry preserved. G-DATA permits synthetic contract testing and continues to block real clinical persistence. Twenty-one input hashes, two JSON receipts, six local links, strict OpenSpec validation, and scoped whitespace checks passed. No product source, dependency, database, service, T1, T2, or T3 operation ran. Evidence: `.kbd-orchestrator/phases/runtime-architecture/evidence/ra-04-projection-grants/eligibility.md`.

## 2026-09-08 — runtime-architecture Execute, RA-04 task 1.2

Added the host-neutral five-table projection registry and mounted
`GET /api/session/replica-grant` on the verified session boundary. Two synthetic
practices receive distinct `practice_id` scopes, while `evidence_states` uses
the explicitly approved `key` reference contract. Strict query parsing rejects
caller-supplied `table`, `where` and `columns` controls before session lookup.
The matching desktop command remains fail-closed until RA-17 owns native
credentials.

Rust T0 check/clippy passed for host, Axum and desktop; Axum retained ten
existing warnings in untouched route functions. Focused T1 passed host 2/2,
mounted HTTP 2/2 and desktop 1/1. A temporary protected-column sabotage failed
as intended and the restored registry passed. Strict OpenSpec validation and
format/whitespace checks passed. No companion repository, dependency, database,
T2/T3, native runtime or real clinical data changed. Evidence:
`.kbd-orchestrator/phases/runtime-architecture/evidence/ra-04-projection-grants/task-2.md`.

## 2026-09-08 — runtime-architecture Execute, RA-04 task 1.3

Implemented the session-bound projection grant across ASO, Gate and FRF. ASO
now returns verified identity/session linkage and expiry. Gate resolves the
grant using only original credentials, validates the exact five projection IDs,
and mints a typed allowlist with bounded expiry. FRF rejects missing or malformed
session identifiers and requires exact scope, revision, authorization revision,
originating session and projections at the shape boundary.

Focused T1 passed ASO 3/3, Gate 3/3, FRF identity 9/9 and gateway shape 3/3.
T0 check/clippy passed all touched crates; only 13 pre-existing warnings remained
across Gate and Axum. Removing the FRF scope guard made its focused test fail
with exit 101; restoration returned it to 1/1 passing. No Tier 2/Tier 3, live
Electric route, database, browser, Tauri window, physical device or real patient
data was used. The KBD task-begin memory mirror failed while canonical lifecycle
state continued; this append is the local fallback. Evidence:
`.kbd-orchestrator/phases/runtime-architecture/evidence/ra-04-projection-grants/task-3.md`.
## 2026-09-08 — runtime-architecture RA04 task 1.4

Completed the bounded implementation proof for fail-closed replica grants.
Added mounted actual-Gate and fresh/upgrade PostgreSQL fixtures. The mounted
fixture passed 17 checks with only the valid request reaching its accepting
downstream. Both database modes passed the seven established derivation cases,
an unowned-practice RLS refusal and the exact three-state reference check, then
removed all disposable resources. Removing the originating-session comparison
made the mounted fixture fail and increased downstream calls; exact restoration
passed. Gate check/clippy and two focused tests passed, with three unrelated
pre-existing clippy warnings. RA05 still owns live FRF/Electric delivery.
## 2026-09-08 — runtime-architecture RA04 task 2.1

Recorded current behavioral acceptance for the five-table projection registry.
The host registry tests passed 2/2 and the mounted HTTP registry tests passed
2/2. Two synthetic practices received distinct server-derived practice scopes;
`evidence_states` retained primary key `key`; fourteen sensitive metadata
columns and deferred `policy_criteria` remained absent; caller table, predicate
and column controls were rejected before session resolution. No product source,
database, dependency, T2/T3 surface or real clinical data changed.

## 2026-09-08 — runtime-architecture RA04 task 2.2

Recorded strict projection-grant acceptance across Gate and FRF. The mounted
Gate fixture passed 17 checks with only the valid human session reaching its
accepting downstream. Gate tests passed 3/3, FRF identity tests 9/9, mounted
shape-route tests 2/2, and shape widening tests 2/2. Wrong scope and projection
revision returned HTTP 403 before resolver or facade access. Removing that
mounted route check made both new tests fail with exit 101; restoration passed.
FRF formatting, check and focused Clippy passed. Two inaccurate test commands
were preserved and corrected before they were used as evidence. No runtime
source, dependency, database, T2/T3 surface or real clinical data changed. The
KBD task-begin memory mirror failed while canonical lifecycle state continued;
this append is the local fallback. Evidence:
`.kbd-orchestrator/phases/runtime-architecture/evidence/ra-04-projection-grants/task-6.md`.

## 2026-09-08 — runtime-architecture RA04 task 2.3

Recorded fail-closed grant-dependency acceptance. A freshly checked Gate debug
target passed the 17-check mounted fixture: membership denial, membership
outage, mismatched originating session, mixed credentials, service principal,
and missing required minter all stopped before downstream; only the valid human
session reached it. Added a mounted ASO route test proving denied, unavailable,
and expired session results return 403, 503, and 401 error-only responses. All
four session-boundary tests passed. Mapping PracticeDenied to 200 made the new
test fail with exit 101; restoration passed. Rust T0 passed with ten known
warnings in untouched routes. The fixture now accepts an explicit output path
so later acceptance runs preserve older receipts; task-4 remained unchanged
during the task-7 run. No dependency, migration, runtime branch, database,
T2/T3 surface, or real clinical data changed. Evidence:
`.kbd-orchestrator/phases/runtime-architecture/evidence/ra-04-projection-grants/task-7.md`.

## 2026-09-08 — runtime-architecture RA04 task 2.4

Recorded the reactive gate-summary projection contract. Fresh and upgrade
PostgreSQL campaigns passed 18/18 named gate lifecycle assertions, including a
later surgeon removing an affirmation and transactionally clearing the case
summary while the first command result remained immutable. Both campaigns and
the earlier failed attempt removed every disposable resource; final counts were
zero databases and zero roles. Host projection tests passed 3/3 with an exact
`gate_affirmed_at` inclusion and `gate_affirmed_by` exclusion. Mounted FRF route
tests passed 3/3 and preserved a null-bearing gate summary through verified
practice scope and the six-column cases policy. Both new guards failed with
exit 101 under controlled projection/body removal and passed after restoration.
Rust and web T0 passed with one known web lint warning. The database fixture's
broad filter had selected three RA03 lifecycle tests; it now uses the exact
module-qualified gate test. AppShell's handoff now names the RA14 graph selector
over `cases.gate_affirmed_at`; live Electric delivery, materialization and
navigation reaction remain assigned to RA05, RA11c and RA14. Evidence:
`.kbd-orchestrator/phases/runtime-architecture/evidence/ra-04-projection-grants/task-8.md`.
The KBD task-end memory mirror failed while canonical lifecycle state advanced
to revision 289; this append is the required local fallback.

## 2026-09-08 — runtime-architecture RA04 task 2.5

Recorded fresh and upgrade derivation-trigger acceptance under a non-owner
`NOSUPERUSER NOBYPASSRLS` login. Each mode passed the same 10 checks: forged
derived practice IDs were overwritten, permitted case and patient transfers
cascaded in both directions, an unowned case transfer was refused by RLS, and
`evidence_states` remained the exact `gap`, `met`, `void` reference set with no
application trigger. Removing the direct `practice_id` update trigger path made
the fixture fail at `T3_direct_practice_update_is_forced_back`; exact restoration
returned fresh and upgrade runs to 10/10. All disposable databases and roles
were removed. The fixture gained an explicit output option so this run preserved
the task-4 receipt. The first receipt-audit script failed because it treated the
cleanup object as a list; the corrected audit passed against the recorded shape.
No final migration behavior, dependency, product runtime branch, T2/T3 surface,
or real clinical data changed. Evidence:
`.kbd-orchestrator/phases/runtime-architecture/evidence/ra-04-projection-grants/task-9.md`.

## 2026-09-08 — runtime-architecture RA04 task 3.1

Completed the bounded RA04 T0/T1, artifact-refiner and isolated adversarial
review gate. Final checks passed across the primary Rust targets, Gate, FRF and
web. The mounted Gate campaign passed 19 checks; fresh and upgrade database
campaigns retained 18 lifecycle assertions each; practice derivation passed
10/10 in both modes with complete cleanup. Artifact-refiner passed 23
deterministic checks over 29 current source hashes and 34 retained receipts.

Four isolated `k3` reviews ran against producer `gpt-6-astra`. Review findings
led to independent expiry and human-principal checks on both mounted session
routes, credential whitespace and duplicate-cookie rejection, replica-only UUID
token-ID strictness that preserves other FRF lanes, corrected RA04/RA05 stream
ownership, and private typed Gate failure responses. Each new guard retained a
failing-before and passing-after receipt. The final review returned PASS with
zero critical findings, zero warnings and two suggestions; the strict
anti-sycophancy gate passed with score 0.0.

The project deployment still does not enable the Gate replica hook. RA05 now
requires a real asymmetric Gate token through the configured FRF issuer and
audience plus the committed `gate_affirmed_at` transition through Electric.
Desktop IPC, web graph consumption, T2/T3 and G-DATA remain unverified. Evidence:
`.kbd-orchestrator/phases/runtime-architecture/evidence/ra-04-projection-grants/task-10.md`.

## 2026-09-08 — RA05 task 1.1 eligibility

- Phase: runtime-architecture / Execute.
- Result: Passed. RA04 is complete and archived at 12/12; its final 29 source and 34 receipt hashes verify with zero failures.
- Decision: RA05 may proceed with isolated synthetic persistence under G-DATA and the recorded repository boundaries. Real clinical persistence, browser/local SQL proof, measured revocation, native behavior, and publication remain unverified.
- Observation: the existing FRF facade is partial; handle-to-grant binding, complete Electric response semantics, live committed transition proof, and bypass-resistant deployment remain RA05 work.
- Memory fallback: the KBD memory mirror failed at task start, so this append-only entry is the durable fallback.
- Completion fallback: the KBD memory mirror also failed after `end-task`; canonical KBD progress advanced to revision 309.

## 2026-09-08 — RA05 task 1.2 authorized shape boundary

- Phase: runtime-architecture / Execute.
- Result: Passed. FRF now places shape policy, live authorization, grant expiry, and exact continuation-handle binding in `frf-app`; `frf-shape-electric` is a one-port HTTP adapter.
- Protocol: initial, current, continuation, long-poll cursor, conditional ETag, upstream status, selected Electric/cache headers, response body, and 409 control frames remain intact through the gateway.
- Verification: focused T0 passed with no warnings; focused T1 passed 94 tests with zero failures and one pre-existing live-infrastructure test ignored.
- Limit: the live Gate/FRF/Electric/PostgreSQL composition and committed `gate_affirmed_at -> null` observation remain tasks 1.3–2.3.
- Memory fallback: the KBD task-start memory mirror failed; this append preserves the task boundary locally. Canonical `end-task` advanced progress to revision 316.

## 2026-09-08 — RA05 task 1.3 bounded authorized composition

- Phase: runtime-architecture / Execute.
- Result: Passed. A bounded local stack now joins Kratos v26.2.0, Gate RS256 minting, FRF issuer/audience verification, and Electric 1.8.0 through the shape-only gateway profile.
- Runtime evidence: 16 checks passed. A valid initial request and same-session continuation with a fresh Gate JWT returned 200; cross-identity handle reuse, scope change, and projection change returned 403 with no Electric headers. Five requests resolved fresh host grants and both synthetic identities were deleted.
- Profile evidence: health and readiness returned 200; metrics, publish, agent WebSocket, and signal WebSocket routes returned 404; unauthenticated shape returned 401; gRPC 9090 was closed; media and agent lanes logged disabled.
- Observed defects: transient Gate JWT-ID handle binding rejected a valid continuation, and the Iggy health command used the wrong address flag. Stable originating-session binding and the pinned CLI's `--tcp-server-address` form returned the composition to green.
- Verification: strict Rust T0 passed with no warnings and every inspected module at most 500 lines; focused T1 passed 106 tests with zero failures and one pre-existing separate-infrastructure test ignored; the rebuilt runtime image was `sha256:7986aaa5c979019c1a5d1c245c3b9f74c947342e83ea7ece1f30c4e566472c78`.
- Limits: handle bindings remain process-local. Persisted `gate_affirmed_at -> null`, real HTTP expiry, and certified client topology remain tasks 1.4–2.3.
- Memory fallback: the KBD task-start memory mirror failed; this append preserves the task boundary locally.
- Completion fallback: the KBD memory mirror failed after `end-task`; canonical progress advanced to revision 321 with 5 of 8 tasks remaining and task 1.4 next.

## 2026-09-08 — RA05 task 1.4 real HTTP expiry and client topology

- Phase: runtime-architecture / Execute.
- Result: Passed. The bounded stack now separates `ra05-client` from `ra05-backend`; FRF bridges both, Electric joins only the backend, and the one-off client joins only the internal client segment.
- HTTP evidence: 19 checks passed. Allowed initial and same-session continuation requests returned 200. Cross-identity handle reuse, client scope/projection changes, and a three-second handle retried after four seconds under a fresh valid grant returned 403 with no Electric headers. Seven requests caused seven fresh host grant resolutions; both synthetic identities were deleted.
- Topology evidence: 7 checks passed. The client reached `shape-facade`, could not resolve Electric, and could not reach `host.docker.internal:3000`; the operator diagnostic remained reachable at `127.0.0.1:3000`; FRF had no host port.
- Red/green evidence: removing handle expiry produced a leaked 200 and test exit 101; attaching Electric to the client network made the topology verifier exit 1. Both sabotages were reverted and their guards passed.
- Verification: strict FRF T0 passed with no warnings and a 485-line maximum; focused T1 passed 107 tests with zero failures and one pre-existing separate-infrastructure test ignored. Final HTTP and topology campaigns passed against image `sha256:88edebd621b39a2f9655745c36440131becd218b9d19933b45b6e4cc120201b4`.
- Limits: each deployment-specific network still needs the same proof. Measured session/membership revocation belongs to RA06; committed `gate_affirmed_at -> null` delivery remains RA05 task 2.1.
- Memory fallback: the KBD task-start memory mirror failed; this append preserves the task boundary locally.
- Correction: the preceding task-start memory-fallback statement is superseded. Neither the task 1.4 `begin-task` nor `end-task` command emitted a memory-mirror failure. Canonical task progress advanced to revision 326 with four of eight OpenSpec tasks remaining and task 2.1 next.

## 2026-09-08 — RA05 task 2.1 persisted gate transition

- Phase: runtime-architecture / Execute.
- Result: Passed. A persisted synthetic case crossed a real Kratos v26.2.0, Gate, FRF and Electric 1.8.0 path. Its initial insert contained exactly the six approved case columns for the granted practice; the other practice's case was absent.
- Transition evidence: separate PostgreSQL backend PIDs 4487 and 4493 seeded four affirmations and deleted the plan affirmation. The database committed three remaining affirmations and null summary columns. The same Electric handle advanced from offset 0_0 to 1094474184_0 and delivered an update with id, gate_affirmed_at null and updated_at.
- Red/green evidence: removing gate_affirmed_at from the mounted catalog made the probe exit 1 at the approved-column assertion. The catalog was restored, FRF was rebuilt and recreated, and the campaign returned to 21/21. Every red and green run removed all synthetic relational rows and Kratos identities.
- Verification: primary and FRF T0 passed Python/JSON checks, exact receipt checks, formatting, strict clippy, diff checks and the 500-line limit. The final focused T1 passed against image sha256:4d8f2d56079c39e6b4a6bbc221171947f57a22db5708131b41ddf83f87281153 with no rate-limit retry.
- Limits: the update was a partial three-column Electric delta. Client materialization into local SQL and PEM and measured session or membership revocation remain unverified and are assigned to later work.

## 2026-09-08 — RA05 task 2.2 authorized scope and token trust

- Phase: runtime-architecture / Execute.
- Result: Passed. A real Gate-minted token and an exact same-key diagnostic token returned 200 and exposed only the granted practice's synthetic case. Same-session continuation returned 200.
- Denial evidence: cross-identity continuation and offset -1 refetch, client practice change and client projection change returned 403. Same-key tokens differing only in issuer or audience returned 401. No denial exposed Electric headers, protected identifiers or shape messages; token values were never written to output or receipts.
- Freshness and cleanup: six logical Gate requests resolved six fresh host grants across two Kratos identities. The final 23-check run needed no rate-limit retry and removed every synthetic relational row and both identities.
- Red/green evidence: changing only Gate's mounted issuer made its real token receive 401 and failed the intended valid-token assertion. The config was restored, Gate and FRF were restarted, and the full campaign passed.
- Verification: primary T0 passed Python, JSON, config-restoration, token non-disclosure, receipt and diff checks. Focused T1 passed against healthy FRF image sha256:4d8f2d56079c39e6b4a6bbc221171947f57a22db5708131b41ddf83f87281153.
- Limits: this bounded stack proves verifier logic with ignored synthetic key material. Production key custody and rotation, multi-replica handle durability and measured revocation remain unverified.

## 2026-09-08 — RA05 task 2.3 bounded client topology

- Phase: runtime-architecture / Execute.
- Result: Passed. The resolved Compose model and running containers agree that Electric belongs only to ra05-backend, FRF bridges the backend and internal ra05-client networks, the client probe belongs only to ra05-client, FRF has no host port, and Electric's diagnostic binds only 127.0.0.1:3000.
- Route evidence: the client reached shape-facade with exit 0, direct Electric and host-diagnostic requests each failed with exit 6, and the operator loopback diagnostic returned HTTP 200. All eight topology checks passed with healthy Electric and FRF prerequisites.
- Red/green evidence: dynamically attaching Electric to the client network with its service alias made a direct client request return HTTP 200 and made the topology verifier fail at live membership. The trap disconnected Electric; the restored client network contained only FRF and the green campaign passed.
- Verification: primary T0 passed Python/JSON parsing, exact certification and receipt checks, restored membership and diff checks. Focused T1 passed against FRF image sha256:4d8f2d56079c39e6b4a6bbc221171947f57a22db5708131b41ddf83f87281153.
- Limit: this certifies the bounded local Compose topology on one Docker host. Every Kubernetes, remote Docker or production network must repeat the resolved-model, live-membership and client-request proof.

## 2026-09-09 — RA05 task 3.1 completion review

- Phase: runtime-architecture / Execute.
- Result: Passed. The final bounded client path is Gate first: Gate joins the client and backend networks; FRF and Electric are backend-only. The client receives Gate's 401 session challenge and cannot resolve FRF or Electric directly.
- Reviewer fixes: arbitrary upstream error bodies are private; 409 must-refetch survives; unscoped practice shapes fail; shared handles retain exact session bindings; responses are private no-store; only the exact compiled evidence-states reference may be unscoped; shape-only fails startup without both sources; and the network prevents Gate bypass. All eight controls have failing-before and passing-after evidence.
- Verification: primary and FRF T0 passed. Focused FRF T1 passed 115 tests with zero failures and one unrelated infrastructure test ignored. The final image passed 19 composition, 21 transition, 23 authorization and 9 topology checks with complete synthetic cleanup. Artifact validation passed 20/20.
- Review: the final fresh-context critic returned PASS with zero findings across eight review classes. The strict sycophancy screen passed at score 0.0. The external REST judge timed out, so the documented same-family fresh-context fallback supplied the independent verdict.
- Limits: the callback remains synthetic; web and desktop consumers are disconnected; handle state is process-local; measured revocation, materialization, T2/T3, deployment, browser, Tauri and physical-device proof remain later work.
- Correction: the earlier RA05 task 1.4 and task 2.3 entries describe the superseded direct-client-to-FRF topology. This final entry supersedes them with the Gate-first topology and its controlled FRF-bypass proof.

## 2026-09-09 — RA06 task 1.1 eligibility and UI scope

- Phase: runtime-architecture / Execute.
- Result: Passed. RA03 is complete and archived; its server command and React reconciliation contracts are prerequisites rather than work to rerun. RA05 is complete, archived and independently reviewed PASS.
- User scope: RA06 must make RA03 signing/reassessment states and RA06 revocation/access states reachable through the shared responsive React UI. The interface must preserve authoritative outcomes, fence protected content before motion, adapt without remounting command ownership, and support keyboard, touch and reduced motion.
- Ownership: ASO owns session/membership plus Zustand and feature composition; Gate owns cache/invalidation/minting; FRF owns response leases and handle expiry. Forge and PEM are unchanged in RA06.
- Gate: G-REV remains open until task 1.2 records a numeric end-to-end bound and component budgets. No application code changed in task 1.1.

## 2026-09-09 — RA06 task 1.2 fixed revocation budget

- Phase: runtime-architecture / Execute.
- Result: Passed. G-REV is resolved at a 5,000 ms additive server ceiling, recorded before runtime implementation. ASO's replica-grant decision is the active lease authority; caches, notifications and local epochs only accelerate or fence work.
- Budget: cache fence 250 ms, Gate interval 750 ms, ASO call 750 ms, Gate cancellation 250 ms, Gate token and FRF lease 1,750 ms, FRF final fence 250 ms, and clock allowance 1,000 ms.
- Clock and ordering: elapsed deadlines use monotonic clocks; absolute expiry converts once from UTC. Async refill, response completion and handle binding must compare their captured generation before publishing. The browser fences the session epoch and protected React children synchronously when it observes revocation, without a protected exit animation or component replacement on resize.
- Verification: the contract verifier printed `Passed`; four focused tests passed. The tests reject a response one nanosecond beyond the ceiling, a stale refill publication and protected exit animation.
- Limit: the five-second window is an accepted exposure bound, not a measured result. Live Gate/FRF/ASO and React observations remain tasks 1.3–2.3. No runtime application code changed in this task.

## 2026-09-09 — RA06 task 1.3 bounded runtime and UI

- Gate identity caching now retains expiry and uses a generation fence so invalidation wins over a late refill.
- FRF shape delivery has a 1,750 ms lease plus post-fetch authority validation before rows or handles publish.
- ASO added authoritative Kratos logout and a fresh signing-target read; Tauri mirrors both operations fail-closed.
- The React session store synchronously removes protected content and unresolved commands on revocation. Evidence reassessment and signing controls now expose committed, refused, pending and uncertain states across compact and desktop layouts.
- T1 evidence: Gate 569/0, FRF 16/0, Axum session 7/0 and letters 6/0, Tauri 4/0, web 160/0, architecture audit PASS, deterministic conformance Passed.
- Live five-second measurement remains task 1.4; no live-service claim was made here.

## 2026-09-09 — RA06 task 1.4 live bounded-revocation campaign

- Phase: runtime-architecture / Execute.
- Result: Passed. The local Kratos v26.2.0, Gate, FRF, Electric 1.8.0 and restricted ASO server composition passed 51 checks with four synthetic identities and complete cleanup.
- Measured closure: session expiry 278.672 ms, logout 1,737.861 ms, role removal 1,429.459 ms and replica-grant authority loss 1,749.861 ms. Every response was empty and within the fixed 5,000 ms ceiling; fresh requests returned 401, 403 or 503 without Electric headers or protected identifiers.
- Clinical boundary: after role removal, the real ASO affirmation route returned 403 `practice_denied` and committed no affirmation while the former three-second replica token remained time-valid.
- Race boundary: eight requests racing role removal all returned 403. The generation-fenced cache unit proves invalidation advances before eviction and suppresses late publication; the live unavailable-authority request returned 503 without restoring cached authority.
- Observed defect and correction: FRF passed `50` to `tower_governor::per_second`, which means a 50-second replenishment period. FRF now converts 50 requests per second to a 20 ms period. The focused security-layer regression and all five security-layer tests passed.
- Verification: the final live report and its monotonic observation projection both report Passed; 16 FRF shape tests and 5 security-layer tests passed. No CI test evidence was used.
- Limit: logout and authority-loss closure sit close to the 1,750 ms compiled lease. Any lease, token-precision or cancellation change must rerun the live campaign.

## 2026-09-09 — RA06 task 2.1 response-closure acceptance

- Phase: runtime-architecture / Execute.
- Result: Passed. The task 1.4 full-integration campaign supplies monotonic response-closure evidence for session expiry, logout and membership removal against the predeclared 5,000 ms server ceiling.
- Observed results: session expiry closed in 278.672 ms and the next request returned 401; logout closed in 1,737.861 ms and the next request returned 401; membership removal closed in 1,429.459 ms and four subsequent requests returned 403.
- Disclosure boundary: each revoked response ended as an empty 204, and the logout and membership cases exposed no Electric shape headers or protected value. The contract verifier printed `Passed` against the recorded observations.
- Prerequisites and cleanup: local Kratos, Gate, FRF, Electric, ASO and PostgreSQL were available; four synthetic identities and two synthetic rows were removed. Production, Tauri-window and physical-device latency remain outside this Tier 1 proof.

## 2026-09-09 — RA06 task 2.2 stale-refill and authority-loss acceptance

- Phase: runtime-architecture / Execute.
- Result: Passed. Gate's focused generation-fence test passed 1/1 and proves an invalidation captured after lookup prevents that lookup from publishing a late session refill. FRF's focused shape suite passed 9/9, including post-fetch revocation, unavailable authority and active-lease closure.
- Live race: eight requests racing the membership commit all returned 403 and old authorization was never restored. Authority loss closed the already-open response in 1,749.861 ms as an empty 204 with no Electric headers; the next request returned 503 in 28.975 ms.
- Verification: direct JSON comparison confirmed the acceptance record matches the task 1.4 live report. The deterministic contract verifier previously printed `Passed` for the same observation set. No CI test evidence was used.
- Limit: a distributed cache across several Gate replicas remains outside this single-host Tier 1 proof.

## 2026-09-09 — RA06 task 2.3 post-revocation clinical-command acceptance

- Phase: runtime-architecture / Execute.
- Result: Passed. After the synthetic surgeon's practice membership was removed, the mounted `POST /api/cases/{case_id}/gate/affirm` path performed fresh validation and returned 403 `practice_denied`.
- Independent condition: the previously issued three-second replica token still had a future expiry when the command was refused. PostgreSQL recorded zero affirmation mutations, so token validity did not become clinical authority.
- Focused verification: `RUSTUP_TOOLCHAIN=1.97.1 cargo test -p aso-server-axum routes::gate::tests::each_command_resolves_fresh_context_and_ignores_identity_headers -- --exact` passed 1/1 with 29 filtered. Direct JSON comparison matched the acceptance record to the live measurement.
- Limit: production deployment and native Tauri credentials remain outside this local Tier 1 proof.

## 2026-09-09 — RA06 task 3.1 adversarial review blocked

- Phase: runtime-architecture / Execute.
- Result: Blocked. Two isolated review rounds ended with four critical findings. RA06 remains in progress; its final OpenSpec task is unchecked and the change is not verified or archived.
- Confirmed server defects: FRF ends its 1,750 ms lease before Axum delivers the buffered nonempty body, so the recorded last-protected-byte deadline is unproved. Gate's session generation is process-local and `invalidate_session` has no runtime caller, so logout and membership changes do not provide a shared multi-replica cache fence.
- Confirmed caller/evidence gaps: the replica-revalidation event reaches the React session fence only in a direct test because the real Electric materializer is a later phase. Current final evidence does not bind all changed Rust boundary checks and the live campaign to the reviewed candidate digest.
- React corrections retained: verified-expiry and page-resume fencing, replacement-session installation, explicit replica-failure event projection, signing conflict retention, and separation of accepted signing receipts from confirmed projections. Web typecheck and lint passed; the full web run passed 22 files and 177 tests. Strict OpenSpec validation passed.
- Superseded claims: the earlier task 1.3, 1.4, 2.1 and 2.2 entries remain useful single-host and empty-response evidence, but they do not prove the full RA06 contract. Their Result: Passed statements are superseded by this Blocked review outcome for change completion.

## 2026-09-09 — RA06 revocation-contract-repair child planned

- Phase: runtime-architecture / ra06-revocation-contract-repair / Plan.
- Result: Plan complete. Four child changes are registered: durable ASO authority events, a distributed Gate fence, an FRF final-frame lease, and a candidate-bound assembled campaign.
- Contract correction: the 5,000 ms ceiling ends at the last protected body frame produced by the server or cancellation preventing the next frame. Client receipt through kernel, proxy and network buffers is not claimed.
- Authority design: ASO persists session denials, logout retry state and membership revision events. Gate performs a fresh ASO authority-fence probe for every protected authorization, disables caches on a missed 250 ms event high-water probe, and uses atomic version-stamped publication across Redis replicas. FRF revalidates at 750 ms with a 750 ms authority timeout and 250 ms cancellation propagation.
- UI ownership: the existing shared React/Zustand access fence remains RA06 behavior for wide and compact layouts. RA11c owns the real replica-materializer failure caller; RA13 owns resume and draft recovery. Native Flutter remains outside this child.
- Review: two assessment rounds and two plan rounds blocked. All plan findings were corrected; the final two are carried verbatim because KBD permits no third plan vet. Sycophancy detection scored 0.017857 with no mandatory correction.
- Verification: all four new OpenSpec changes passed strict validation; child plan/scope JSON and whitespace checks passed. No application implementation or application test was run in this planning turn.
- Next: `/kbd-execute runtime-architecture > ra06-revocation-contract-repair`, beginning with `ra06c-01-durable-authority-events`.

## 2026-09-09 — RA06 revocation-contract-repair execution prepared

- Phase: runtime-architecture / ra06-revocation-contract-repair / Execute.
- Result: execution ready. OpenSpec through `/kbd-apply` is the backend for all four ordered child changes.
- Canonical state: the execute stage is in progress, 26 task definitions are registered across the four changes, and the exact next command is `/kbd-apply ra06c-01-durable-authority-events`.
- Dispatch contract: `execution.md` records frontier model routing, companion-repository ownership, dependency gates, local T0/T1 requirements, per-change QA, and the parent T2 return condition.
- Lifecycle evidence: the execute stage gate passed and the execute handoff names `execution.md` plus `progress.json`. The execute-after hook was invoked, but its best-effort memory path produced no observable output in the bounded calls; this did not block the supported handoff.
- No application code or application tests changed or ran during execution setup.

## 2026-09-09 — RA06 repair task 1 architecture contract aligned

- Phase: runtime-architecture / ra06-revocation-contract-repair / Execute.
- Result: Passed. Parent RA06, the application/FRF runtime documents, accepted ADR-008/009, RA11c and RA13 now share the corrected revocation contract and ownership.
- Timing: the 5,000 ms server interval starts at the ASO authority commit or verified expiry and ends at FRF's final protected frame or cancellation preventing the next frame plus denial of a subsequent request. Kernel/proxy buffering, network transit and client receipt are excluded.
- Authority: session denial uses deployment/issuer/verified-session identity; membership authority uses deployment/incarnation/monotonic revision. ASO owns durable denial, retry and outbox state; Gate owns fresh decisions and Redis coherency; FRF owns the protected-body lease.
- UI ownership: RA06 owns the synchronous Zustand access fence across wide/compact shared React layouts. RA11c owns the real materializer failure caller. RA13 owns foreground/resume, the durable client logout marker and draft recovery.
- Verification: all four affected OpenSpec changes passed strict validation; the 16-file whitespace/stale-wording scan passed; `bash scripts/audit.sh` printed `audit: PASS` with all six checks green.
- Limit: no application code changed and no runtime behavior was proven. Mermaid rendering was not visually checked in this task.

## 2026-09-09 — RA06 repair task 1.2 durable authority persistence

- Phase: runtime-architecture / ra06-revocation-contract-repair / Execute.
- Result: Passed. Fresh bootstrap and additive migration 2026090609 now create one ASO deployment identity, the session-denial/retry journal and the ordered authority outbox while preserving an upgraded authority incarnation and revision.
- Transaction boundary: each membership/capability statement updates the global revision and appends its deployment/incarnation/revision event in the same PostgreSQL transaction. The disposable upgrade and fresh fixtures observed the intermediate revision/event, rolled back, and then observed both original values unchanged.
- Denial boundary: a committed synthetic denial appended one session event; a rolled-back denial left no journal or event row. Exact expiry-plus-skew retention is immutable, early deletion was refused and the local-relation publication guard refused adding the journal to a publication.
- Verification: Python compilation, Rust formatting and scoped whitespace checks passed. The local PostgreSQL upgrade receipt passed 13/13 checks and the fresh receipt passed 12/12 checks. No CI result was used.
- Observed fixture defect: separate volatile timestamps differed by microseconds and correctly failed the exact retention constraint. The fixture now derives expiry and retention from one statement timestamp; both final receipts bind the corrected source hashes.
- Limit: logout coordination, leases/recovery, denied-session reads, Gate consumption, HTTP/Tauri and UI behavior remain tasks 1.3 through 3.1.

## 2026-09-09 — RA06 repair task 1.3 durable logout coordination

- Phase: runtime-architecture / ra06-revocation-contract-repair / Execute.
- Result: Passed. The shell-neutral coordinator authenticates first, commits the ASO denial and row lease before the Kratos effect, confirms only under that live lease, and returns an explicit incomplete result while durable recovery continues.
- Runtime: the ASO web server now composes a restricted PostgreSQL journal, issuer-bound Kratos admin session-ID revoker and 250 ms recovery runner. Session read, clinical write and logout authority use separate database credentials for the same database; only the server receives the Kratos admin URL.
- Database proof: the disposable upgrade fixture passed 6/6 journal assertions covering live-lease exclusion, wrong-token refusal, expired-lease recovery, scheduled retry, exact retention, one transactional event per denial and least-privilege refusal. Cleanup removed the database, login and task-created executor role.
- Verification: T0 check/clippy passed for host, Axum, web server and desktop. Focused T1 passed host 4/0, web session 6/0 with two fixture-only ignores, Axum session 7/0, and the ignored PostgreSQL lifecycle 1/0 through its runner. No CI evidence was used.
- Limit: direct external Kratos observation, complete HTTP/Tauri parity, real-Kratos crash/race coverage, Gate consumption, FRF final-frame enforcement and candidate-bound proof remain later child work.

## 2026-09-09 — RA06 repair task 2.1 denied-session enforcement

- Phase: runtime-architecture / ra06-revocation-contract-repair / Execute.
- Result: Passed. `SessionService` now checks the deployment-qualified issuer/session denial before and after membership resolution, so current-session and replica-grant requests share one fail-closed authority predicate.
- Direct revocation: a mounted path can revalidate a retained server-verified identity. When Kratos reports that identity inactive, the coordinator commits the same durable denial/outbox event and confirms the observation without accepting a request-supplied session ID.
- Database proof: the restricted PostgreSQL fixture passed seven named assertions, including matching denial, foreign issuer/session isolation, exact retention expiry, lease recovery and least-privilege refusal. Cleanup removed every fixture-owned resource.
- Verification: T0 format/check/clippy passed for the touched Rust crates. Focused T1 passed host session 3/0, host logout 5/0, Axum session 8/0, web session 7/0 with two fixture-only ignores, and PostgreSQL lifecycle 1/0. No CI evidence was used.
- Command correction: `cargo clippy --lib` correctly reported that `aso-web-server` has no library target; the verified `--bin aso-web-server` command passed.
- Limit: task 2.2 owns HTTP/Tauri parity. Task 2.3 owns the real-Kratos assembled scenario. Gate consumption and FRF final-frame enforcement remain later child changes.

## 2026-09-10 — RA06 repair task 2.2 HTTP/Tauri session parity

- Phase: runtime-architecture / ra06-revocation-contract-repair / Execute.
- Result: Passed. Desktop current-session, replica-grant and logout operations now obtain their opaque credential from an injected trusted-host owner and call the same `SessionPort` contract used by HTTP.
- IPC boundary: renderer-facing operation signatures accept no cookie, token, credential or session ID. The unavailable owner preserves fail-closed native behavior until RA17 installs a protected production credential facility.
- Logout result: the shared serializable contract preserves both confirmed and durable-denial-pending outcomes; the desktop wrapper does not turn pending revocation into success.
- Verification: host logout 5/0, Axum session 8/0 and desktop session contract 5/0 passed. Rust format, desktop check/clippy, focused whitespace and three static renderer-signature checks passed. No CI evidence was used.
- Limit: the repository still has no Tauri dependency or mounted command macros. No Tauri window, real native IPC, native Kratos login or secure credential store was run; RA17 owns those production checks.

## 2026-09-10 — RA06 repair task 2.3 failure and isolation campaign

- Phase: runtime-architecture / ra06-revocation-contract-repair / Execute.
- Result: Passed. Fresh and upgrade authority fixtures proved membership and denial rollback, deployment-qualified events, foreign-deployment refusal, exact retention, early deletion refusal and deletion after retention with the event preserved.
- Crash and race proof: host logout tests passed 7/0, including no Kratos effect before denial commit and idempotent recovery after a completion-write failure. Fresh and upgrade PostgreSQL journal fixtures each passed eight assertions, including a simultaneous due-retry race with exactly one lease winner.
- Scope isolation: issuer/session predicates were tuple-scoped; four disposable stores produced four distinct deployment IDs; host denial checks passed 3/0; mounted Axum practice/grant checks passed 8/0; matching desktop contract tests passed 5/0.
- Evidence integrity: all four disposable fixture receipts were checked against current source hashes and bound by `task-6-campaign.json`. Python compilation, Rust formatting and focused whitespace checks passed. No CI result was used.
- Limit: a real Kratos process and the assembled two-Gate/FRF timing run belong to ra06c-04. Production native credential activation remains RA17 work.


## 2026-09-10 — RA06c-01 task 3.1 completion

- Execute phase, child runtime-architecture > ra06-revocation-contract-repair.
- Completed the final ra06c-01 evidence task after three isolated review rounds.
- Round one corrected the incomplete review packet, missing mounted trusted-revalidation caller, and nullable denial-event identity.
- Round two corrected commit-order inversion in authority outbox allocation and stale retry mutation after lease expiry.
- Fresh and upgrade PostgreSQL probes now prove commit-ordered visible sequences and expired retry-owner refusal.
- Final T0 passed for aso-host, aso-server-axum, aso-web-server and aso-desktop.
- Focused T1 passed 8 logout, 4 host session, 9 mounted Axum, 7 web adapter and 5 desktop tests; four disposable database fixtures passed.
- Controlled denial-predicate sabotage failed the mounted test, and exact restoration passed.
- Artifact-refiner passed 14 checks. The third isolated reviewer returned PASS with no findings; strict anti-sycophancy screening scored 0.0.
- Remaining boundary: real Kratos and assembled two-Gate/FRF timing belong to ra06c-04; Gate fencing and FRF final-frame work remain ra06c-02 and ra06c-03; production native credentials remain RA17.


## 2026-09-10 — RA06c-01 verified and archived

- KBD end-task recorded authoritative completion with zero remaining tasks.
- KBD verify returned PASS; OpenSpec archived the change at openspec/changes/archive/2026-09-10-ra06c-01-durable-authority-events and promoted its spec.
- Post-archive strict validation passed 1/1 for the promoted RA06c-01 spec and 1/1 for the parent RA06 change; focused whitespace validation passed.
- The archived task surface contains 7 checked and 0 unchecked tasks.
- Child progress is authoritative at 1/4 changes complete. The generated current-waypoint exactNextCommand remains stale at ra06c-01 even though canonical transition rejected Complete-to-Complete and child progress marks it DONE. The next pending change is ra06c-02-distributed-gate-fence.

## 2026-09-10 — RA06c-01 reviewer-guard red/green proof

- Removed the outbox sequence serialization guard in a controlled sabotage. The fresh authority fixture failed because the competing transaction did not wait (`contender_waited: false`); restoring the exact reviewed sources returned the fixture to Passed.
- Removed only the retry lease-expiry predicate in a controlled sabotage. The fresh logout-journal fixture failed at the stale-owner assertion with test return 101; restoring the exact reviewed source returned all nine assertions to Passed.
- SHA-256 checks confirmed the migration, bootstrap SQL and journal adapter were restored byte-for-byte to the versions accepted by the final adversarial review. The final evidence receipt and all four red/restored receipts parsed successfully.

## 2026-09-10 — RA06c-02 task 1.1 ASO authority consumer

- Phase: runtime-architecture / ra06-revocation-contract-repair / Execute.
- Result: Passed. Gate now consumes an ASO repeatable-read authority snapshot and ordered outbox through a separately configured least-privilege login, persists a deployment/incarnation-qualified cursor in Gate PostgreSQL, and requires each process to establish its own readiness.
- Freshness boundary: the process probes at 125 ms and expires cache readiness 250 ms after its last successful high-water observation. Lag, namespace change, regression, malformed replay or consumer exit leaves the cache in bypass mode.
- Privilege boundary: the ASO role can select only four authority relations and cannot write or access sequences. Runtime attestation also rejects excess ASO reads, ownership, privileged attributes and unrelated parent roles.
- Observed corrections: the live proof exposed `USAGE` as incorrect for a NOINHERIT login, a cursor key that was too broad across authority incarnations, and independently computed timestamps that violated exact denial retention by one microsecond. The final implementation uses `MEMBER`, a deployment/incarnation cursor key and one derived expiration timestamp.
- Verification: authority unit tests passed 6/0; CLI precedence passed 1/0; Gate core/binary checks and scoped strict Clippy passed; ASO web-server format/check/strict Clippy passed. Fresh PostgreSQL passed 18/18 checks and upgrade passed 19/19, each with 4/4 mounted Gate assertions. OpenSpec validation and the six-check architecture audit passed. No CI evidence was used.
- Limit: Redis atomic publication, authorization-time fresh checks, two-Gate failure scenarios, HTTP/Tauri and UI remain tasks 1.2 through 3.1.

## 2026-09-10 — RA06c-02 task 1.2 distributed Gate fence

- Added a Redis authority fence in Flint Gate using redis-rs 1.2.4 Lua scripts for observed-value
  bootstrap, exact monotonic advance, compare-and-publish session writes and compare-and-load reads.
- Versioned L1/L2 entries bind deployment, incarnation, revision, outbox sequence, Kratos issuer,
  verified session, optional authoritative tenant and session expiry. Raw credentials stay out of
  Redis keys.
- Disabled the legacy unstamped session cache whenever ASO authority readiness is attached. Wired
  startup so Redis loss leaves authority caching bypassed and the consumer becomes ready only after
  ASO snapshot/replay and successful shared-fence publication.
- Local verification passed: 3 authority-consumer tests, 13 cache tests, 21 Gate binary tests, a
  real Redis 8.10.1 atomic-fence test with five named assertions, all/no-default feature checks,
  scoped strict Clippy, strict OpenSpec validation and the six-check architecture audit.
- Learned constraint: an identity-cache lookup precedes authoritative practice resolution. Tenant
  qualification is valid only after ASO establishes the practice; the current replica-grant path
  remains fresh and uncached rather than inventing a tenant claim early.

## 2026-09-10 — RA06c-02 task 1.3 fresh protected authority

- Wired the versioned Redis session cache into the Kratos request pipeline. Provider, explicit
  canonical issuer, credential kind and credential digest now select entries; other auth providers
  never consult this session cache.
- Kept the clinical authorization and replica-grant callbacks as the required fresh ASO decisions
  after any cache hit. Authority-enabled Kratos routes without either callback fail with a
  non-cacheable 503.
- Split exact-fence cache misses from Redis fence mismatch. Mismatch, loss or an absent fence now
  requests a full ASO bootstrap and replay before readiness can return.
- Aligned Kratos forwarding and cache selection, rejected competing credentials, required verified
  session identity and expiry, and repaired the authority-mode stream watchdog fallback.
- Local evidence passed: 583/0 core library tests, 7/0 focused Kratos tests, a real Redis 8.10.1
  test with six named assertions, all/no-default feature Gate checks, scoped strict Clippy, strict
  OpenSpec validation and the six-check architecture audit. No CI evidence was used.
- Remaining boundary: tasks 2.1 and 2.2 own two-Gate/Postgres failure injection; RA06c-03 owns the
  final protected response frame.

## 2026-09-10 — RA06c-02 task 2.1 two-replica fence proof

- Phase: runtime-architecture / ra06-revocation-contract-repair / Execute.
- Result: Passed. Two independent Gate authority replica states shared one disposable ASO
  PostgreSQL source, durable Gate cursor database and Redis fence while retaining separate readers,
  readiness state, L1 caches, Redis connections and consumers.
- Distributed evidence: both replicas bootstrapped at one high-water; two committed membership
  events replayed gap-free in sequence; the second replica advanced the shared fence; and duplicate
  synchronization was idempotent.
- Failure evidence: the first replica received no Pub/Sub listener notification and kept its old
  local generation, yet its stale L1/L2 entry could not be served. A delayed old-stamp refill was
  rejected, forced bootstrap-required bypass and recovered only after a full snapshot and replay.
- Isolation: the same credential under distinct tenant-qualified keys did not collide across the
  two replicas.
- Verification: Gate core check and scoped strict Clippy passed. The local PostgreSQL/Redis runner
  returned 0 with eight named distributed assertions and complete disposable-resource cleanup.
  Strict OpenSpec validation passed. No CI evidence was used.
- Limit: both replica runtimes execute inside one focused Rust test process. Task 2.2 owns the
  250 ms stalled-consumer deadline, Redis partition, empty restart and restored-old-snapshot cases.

## 2026-09-10 — RA06c-02 task 2.2 fence recovery

- Phase: runtime-architecture / ra06-revocation-contract-repair / Execute.
- Result: Passed. Gate now timestamps readiness at the final successful ASO high-water observation,
  enters every bootstrap as bootstrap-required and bounds authority Redis operations at 200 ms.
- Observed defect: readiness previously used Redis completion time, allowing slow Redis work to
  renew a stale ASO observation. The focused regression passed after carrying the original probe
  instant through replay and fence comparison.
- Recovery evidence: a stalled consumer expired cache use after 250 ms; one committed authority
  event replayed before readiness returned; a lower restored Redis fence forced bypass; and shallow
  synchronization could not clear the bootstrap requirement.
- Partition evidence: removing Redis caused a versioned L1 read to return no identity within one
  second. A new empty container on the same port could not attest freshness; the existing connection
  manager reconnected, shallow synchronization failed and full ASO bootstrap restored readiness.
- Verification: Gate core format/check/scoped strict Clippy passed. The slow-fence unit passed 1/1.
  The disposable recovery campaign returned 0 with six named assertions and complete cleanup. The
  corrected task 2.1 campaign was rebound to the final source and passed eight assertions. Strict
  OpenSpec validation passed. No CI evidence was used.
- Limit: the recovery proof runs real Gate components inside one Rust test process. Mounted proxy
  binaries and the combined 5,000 ms protected-body proof remain RA06c-04 and RA06c-03 work.


## 2026-09-11 — RA06c-02 distributed Gate fence complete

- Phase: runtime-architecture / ra06-revocation-contract-repair / Execute.
- Delta from plan: the planned two-process fence and recovery proof was delivered. Adversarial
  review exposed additional correctness obligations before acceptance: request-entry snapshots,
  bounded target watching, pre-hook and stream watchdog cleanup, an authenticator-independent
  deadline, structured timeout mapping across cache/body/lookup/hooks/callbacks, callback response
  timer ownership, downstream receiver closure in the production forwarding loop, and a controlled
  Cargo build chain bound to the exact executable launched by both mounted processes. These were
  added within the change's existing security and evidence scope.
- Runtime result: two mounted Gate proxy processes share durable ASO authority and configuration
  fences; stale replicas deny protected requests during missed notification, Redis partition,
  lower-fence restore and empty-Redis recovery. Protected request work returns structured
  `authority_decision_unavailable` responses within the shared 5,000 ms deadline.
- Failure controls: atomic-publication sabotage failed at the intended stale-resurrection race, and
  anonymous-deadline sabotage exceeded 5,000 ms. Byte-exact restoration returned both campaigns to
  Passed before final validation.
- Build provenance: a pre-build manifest covered 70 reachable local Cargo inputs, effective
  hierarchical Cargo configuration, a sanitized build environment and native tool identities. The
  emitted controlled executable and both launch-time paths had the same SHA-256; the validator
  repeated the controlled build and matched it.
- Verification: the refiner validator passed 30/30 checks. Gate T1 reported 590 passed, 0 failed and
  20 ignored; Gate MCP end-to-end reported 5 passed. Rust format/check/strict Clippy passed in both
  repositories, Python runners compiled, strict OpenSpec validation passed, and the six-check
  architecture audit passed. Isolated critic and judge round 26 both returned PASS with no findings.
  No CI evidence was used.
- Review history: rounds 19 through 25 found and drove the snapshot, watcher, pre-hook/watchdog,
  independent deadline, timeout mapping, callback timer, production downstream-closure and exact
  executable-binding corrections. Round 26 accepted the resulting artifact.
- Scope remaining: RA06c-03 owns authority through the final Flint Realtime Fabric response frame.
  UI, Tauri-window and physical-device behavior remain outside this Gate change. Complete Redis
  tombstone loss and expired denial entries retained in process memory remain documented limits.
- Archive: `openspec/changes/archive/2026-09-11-ra06c-02-distributed-gate-fence`.


## 2026-09-11 — RA06c-02 canonical projection reconciliation

- The KBD/OpenSpec adapter had retained six numeric registration records as pending beside the six
  completed semantic task IDs. Typed task transitions reconciled those generated duplicates; the
  canonical change is COMPLETE with 12/12 registered records complete, while the OpenSpec delivery
  surface remains 6/6 tasks complete.
- The child phase is now 2/4 implementation changes complete at canonical revision 522. The exact
  next command is `/kbd-apply ra06c-03-final-frame-lease`.


## 2026-09-12 — RA06c-03 task 1.1 final-frame contract

- Phase: runtime-architecture / ra06-revocation-contract-repair / Execute.
- Result: Passed. FRF ports now expose a shell-neutral ordered byte stream and an authority lease
  bound to one verified grant and server-derived authorization tuple. The buffered response stays
  active until task 1.2 replaces the application boundary.
- Locked API evidence: `Cargo.lock` resolves Axum 0.8.9 and axum-core 0.5.6. Context7 and the exact
  installed source agree that `Body::from_stream` accepts the new fallible `Bytes` stream by value.
  The focused gateway compatibility test passed 1/1 against that lock.
- Verification: FRF formatting, isolated `frf-ports` checking, scoped diff checks and strict
  OpenSpec validation passed. The fresh isolated gateway build completed in 14m 02s and its focused
  test reported 1 passed, 0 failed. No CI evidence was used.
- Environment defect: the first locked check found a corrupt local Cargo git database for the
  pinned Iggy commit. Fetching that exact commit with `git fetch --refetch` repaired the cache; the
  lockfile and repository sources were unchanged.
- Limit: dropping Axum's body drops the stream but does not alone stop an independent authority
  worker. Task 1.2 owns explicit idempotent worker cancellation, periodic revalidation and
  continuation release through completion or consumer drop.


## 2026-09-12 — RA06c-03 task 1.2 streamed response lease

- Phase: runtime-architecture / ra06-revocation-contract-repair / Execute.
- Result: Passed. Electric now returns a fallible byte stream after response metadata, FRF owns
  that upstream stream in a bounded background producer, and Axum consumes the protected stream
  directly. The request and body share one monotonic deadline capped at 1,750 ms.
- Cancellation: the producer revalidates at 750 ms intervals, bounds each decision to 750 ms or
  the remaining response lifetime, continues during upstream stall/client backpressure, and drops
  upstream work on deadline, denial, authority error or consumer drop. The receiver checks an
  atomic cancellation fence before and after every frame poll.
- Authority division: FRF rechecks its captured relation tuple and grant expiry. The
  `verified-identity` backend is not a fresh ASO decision; Gate's already implemented response
  watchdog owns fresh ASO revalidation and its downstream closure triggers FRF cleanup. The docs
  now state that limit explicitly.
- Verification: FRF application tests passed 42, Electric adapter tests passed 8, and the gateway
  shape selection passed 10. Strict Clippy passed for ports/application/Electric. Gateway Clippy
  showed only the pre-existing precision-cast warning outside this task when capped at warnings;
  gateway compile and route tests passed. Formatting, scoped diff checks and strict OpenSpec
  validation passed. No CI evidence was used.
- Remaining: task 1.3 owns provisional handle cleanup and the full protocol matrix. Tasks 2.1–2.2
  own mounted revocation and timestamp evidence; task 3.1 owns FRF-wide T0/T1 and sabotage proof.


## 2026-09-12 — RA06c-03 task 1.3 protocol and continuation settlement

- Phase: runtime-architecture / ra06-revocation-contract-repair / Execute.
- Result: Passed. Electric status, allowed protocol headers and body-frame order cross the
  shell-neutral response and Axum adapter unchanged, while authenticated cache policy remains
  `private, no-store`.
- Continuation lifecycle: an output handle remains provisional behind a completion marker ordered
  after the last protected frame. Normal completion commits it; cancellation, upstream failure,
  unexpected termination or consumer drop discards it and releases the resuming authority's prior
  binding. A normal `304` without a replacement preserves the prior handle.
- Verification: FRF application tests passed 47, Electric adapter tests passed 8, and the selected
  gateway shape tests passed 11. Application strict Clippy, formatting, scoped diff checks, file
  limits and strict OpenSpec validation passed. Gateway Clippy emitted only the pre-existing
  precision-cast warning outside the task. No CI evidence was used.
- Remaining: tasks 2.1 and 2.2 own mounted revocation and timestamp proofs; task 3.1 owns FRF-wide
  T0/T1, final-check sabotage and isolated review.


## 2026-09-12 — RA06c-03 task 2.1 nonempty response revocation matrix

- Phase: runtime-architecture / ra06-revocation-contract-repair / Execute.
- Result: Passed. A deterministic three-frame throttled response now proves that logout,
  membership change and grant expiry suppress every frame after the first, drop upstream work,
  release provisional continuation state and deny a new request.
- Direct Kratos boundary: Gate owns fresh session observation in production. Its modeled response
  consumer drop aborts FRF's producer, drops the upstream body and releases the continuation; the
  evidence does not claim FRF directly queries Kratos.
- Verification: the focused matrix passed 4/4; the full FRF application suite passed 51/51;
  strict pedantic Clippy, formatting, scoped diff checks, file limits and strict OpenSpec
  validation passed. No CI evidence was used.
- Remaining: task 2.2 owns measured timestamps and interruption behavior under stall,
  backpressure, authority failure, consumer drop and normal completion. Task 3.1 owns FRF T0/T1,
  sabotage and isolated review. RA06c-04 owns the assembled live Kratos/Gate/FRF/Electric proof.


## 2026-09-12 — RA06c-03 task 2.2 response lease timing matrix

- Phase: runtime-architecture / ra06-revocation-contract-repair / Execute.
- Result: Passed. Public `ShapeUseCase` tests recorded monotonic timestamps for upstream stall,
  client backpressure, authority unavailability and timeout, consumer drop and normal completion.
- Measurements: stall and backpressure cancelled at the 1,000 ms test lease; authority
  unavailability cancelled at 750 ms; authority timeout cancelled at 1,500 ms; consumer drop
  released upstream at 125 ms; normal frames arrived at 0, 100 and 200 ms and completed at 200 ms.
  Cancellation added zero virtual milliseconds after each triggering event.
- Delta from plan: the first normal-completion assertion expected upstream release at opening.
  The observed 200 ms release was correct because the producer retained the body through the
  final frame. The expectation was corrected; production code did not change.
- Verification: the focused matrix passed 6/6; the full FRF application suite passed 57/57;
  strict pedantic Clippy, formatting, scoped diff checks, file limits and strict OpenSpec
  validation passed. No CI evidence was used.
- Remaining: task 3.1 owns FRF T0/T1, final-check sabotage, restoration, artifact refinement and
  isolated review. The assembled live Kratos/Gate/FRF/Electric proof remains in RA06c-04.


## 2026-09-12 — RA06c-03 task 3.1 final-frame lease completion

- Phase: runtime-architecture / ra06-revocation-contract-repair / Execute.
- Result: Passed. FRF now retains a shell-neutral protected body lease through the final
  server-produced frame, rejects buffered frames at the deadline and settles continuation state on
  completion or cancellation.
- Review delta: isolated critics found three real timing defects. Receiver polling now owns the
  deadline as well as the worker; Unix request time remains sub-second; and the gateway samples
  monotonic time before wall time so dispatch delay cannot extend JWT expiry.
- Verification: controlled red/green proofs passed after repair; final T0 passed; final T1 reported
  142 passed, 0 failed and one ignored live-service test; artifact-refiner passed 18/18; the final
  isolated critic and strict anti-sycophancy gate passed. No CI evidence was used.
- Claim boundary: Gate observes exact-session Kratos state and closes the FRF consumer. RA06c-04
  owns the mounted Kratos-to-Gate observation interval and full live campaign.


## 2026-09-12 — RA06c-04 task 1.1 candidate identity

- Phase: runtime-architecture / ra06-revocation-contract-repair / Execute.
- Result: Passed. A canonical manifest now binds current source, modes, symlinks, gitlinks, locks,
  sanitized configuration, toolchains, fixtures and clock identity across prior-auth, flint-gate
  and flint-realtime-fabric.
- Candidate: `sha256:4493c02af61792a5766d08af69079337e6b01e79d482f408289094cf20ca35da` over 3,348 included files.
- Security boundary: secret values and secret-derived hashes are absent; stable redaction markers
  preserve configuration shape. Evidence and workflow paths are explicit exclusions whose matched
  path observations do not alter candidate identity.
- Verification: Python compilation passed; the boundary test passed; the real manifest generated
  and validated against all three current repositories. No CI evidence was used.
- Remaining: task 1.2 builds immutable runtime artifacts, adds image identities and freezes the
  final candidate before command receipts are collected.

## 2026-09-12 — RA06c-04 task 1.2 frozen runtime candidate

- Phase: runtime-architecture / ra06-revocation-contract-repair / Execute.
- Result: Passed. A fresh local Compose build produced the database, two Gate and FRF images; the
  final manifest freezes their exact image IDs with source and effective configuration.
- Candidate: `sha256:47d904bd9394c484991df735dd4bdd4d4c46224f9b616e474b5960246a637b0e`
  over 3,350 included files, six sanitized configurations, seven locks and two fixtures.
- Receipt boundary: commands receive the digest in `RA06_CANDIDATE_DIGEST`; receipts record the
  same digest, sanitized command, closed-log hash and empty pre/post validation errors. Validation
  re-reads current repository, effective-configuration and Docker-image identity.
- Verification: the four-image build passed; final manifest validation passed; the candidate-bound
  source/config/image validation and both focused boundary suites passed. The receipt drift test
  proved a source mutation fails post-validation. No CI evidence was used.
- Remaining: task 2.1 runs the first assembled live revocation scenarios against a nonempty FRF
  body and two Gate replicas using this candidate digest.

## 2026-09-12 — RA06c-04 task 2.3 responsive Zustand fence

- Phase: runtime-architecture / ra06-revocation-contract-repair / Execute.
- Delta from plan: earlier evidence asserted one responsive command owner but no test composed the
  production session boundary, responsive clinical control and command registry. The root now uses
  the exported `SessionAccessBoundary`, and a five-case component test supplies that proof.
- Candidate: `sha256:31e6f9a0bba33845fd30ccd7c92cb6ae3345ddf767cc94a635ae4486ae42b1bd`.
  The UI source change invalidated earlier receipts, so candidate validation and tasks 2.1 and 2.2
  were replayed. Every current receipt has empty pre/post validation errors.
- Verification: typecheck passed; lint exited 0 with one unrelated existing warning; the focused UI
  set passed 9 files and 52 tests; live revocation passed 51 checks; the two-Gate campaign passed 43
  checks; failure recovery passed 24 checks. No CI evidence was used.
- Observed verifier defect: expiry closure arrived 3.061 ms before the sampled monotonic trigger.
  The runner now applies the pre-recorded 1,000 ms clock allowance on the lower bound while still
  enforcing the 5,000 ms upper bound and zero protected-row delivery. The replay passed at
  -2.343 ms with the protected suffix withheld.
- Blocking boundary: `createEvidenceSyncAdapter` still has only its exported definition, all RA11c
  tasks remain unchecked, and RA11c still owns the real materializer caller and authority-failure
  publisher.
- Remaining: task 3.1 closes and indexes evidence, runs final current T0/T1, strict validation,
  artifact refinement and isolated adversarial review.

## 2026-09-12 — RA06c-04 task 3.1 candidate evidence closure

- Execute phase closed task 3.1 for candidate
  `sha256:5e8584e7dbb6922c6d6836af96d1188a7b65b579d3b6f2ddb6204ea8d247d664`.
- All 12 candidate receipts replayed locally. Live revocation passed 64 checks, the mounted
  two-Gate campaign passed 60, recovery passed 24, and responsive Zustand fencing passed 52 tests
  across 9 files.
- The evidence index contains 49 entries. The complete packet contains 122 candidate sources, 12
  contracts, 37 closed evidence records, four build provenance records, and 11 refiner artifacts.
- Artifact-refiner validation passed 8 constraints and finalized as converged.
- A fresh harness-native isolated critic returned PASS with 0 critical findings, 1 warning, and
  c1-c8 passed. The strict anti-sycophancy screen passed at 0.080357.
- The retained warning is that the Gate test build log is transitively hash-bound through the
  manifest and build attestation rather than listed as a direct evidence-index row.
- Task 3.2 remains open. RA11c materializer caller, physical-device behavior, Tauri paint timing,
  focus visibility, and reduced-motion rendering remain outside the task 3.1 claim.

## 2026-09-12 — RA06c-04 task 3.2 parent handoff

- Execute phase wrote the child `handoff-out.md` for candidate
  `sha256:5e8584e7dbb6922c6d6836af96d1188a7b65b579d3b6f2ddb6204ea8d247d664`.
- The handoff maps all four former parent RA06 critical findings and all five second-round child
  assessment findings to production callers, observed local commands and candidate-bound
  receipts. Its embedded validator passed 10 checks.
- The handoff requires local parent T2, a separate immutable parent evidence index and renewed
  RA06 artifact refinement plus isolated adversarial review against the same candidate. Any
  candidate input repair invalidates both child and parent evidence.
- The real Electric/PGLite materializer caller remains absent and assigned to unchecked RA11c.
  The handoff closes the child's ownership correction without converting that missing caller into
  a passing parent claim.

## 2026-09-13 — RA06d03 review isolation repair continuation

Execute remains at ra06d03 task 4 of 5. Interrupted freeze session 41420 was
terminated with exit 143 after discovering that readable Git diffs still
included excluded process history. It supplied no new certified candidate.
The packet builder and validator now exclude .prometheus, .refiner and
.kbd-orchestrator from each Git diff/status projection. An independent focused
artifact critic found an empty unstaged-diff assertion and missing exact ZIP
membership validation. Added staged and unstaged fixture content, exact archive
membership and duplicate rejection. These guards protect the review input
boundary; they do not change application behavior or relax security contracts.

Tier 0: Python compilation and git diff --check exited 0. Tier 1:
python3 scripts/test_ra06d02_review_tooling.py printed
"Passed: review identities, strict activity, and conservative expiry trigger".
In-memory removal of diff exclusions and archive membership enforcement each
made the regression fail. No mutation was written to the production files.
Current freeze session 2779 writes task-4-diff-isolation-freeze.log. Final
candidate identity and phase-completion integration remain pending. RA06,
RA11c and RA17 completion claims remain unchanged.

Focused critic reinspection found both diff/ZIP findings resolved. Added
--no-cache to the campaign's Vitest command: installed Vitest writes results.json
under the now-bound node_modules/.vite tree by default. Confirmed CLI support
through Context7 Vitest documentation and installed Vitest parser/cache writer.
Shell syntax and git diff --check passed; campaign execution of the option is
pending. Input snapshot b17da3bdfb3760cc2e8cd7b1a9d38f853aa4416407deb10767bb3a5afff361bb
was captured after these edits.

Read-only RA07 preparation confirms PEM 4.0.2 still lacks strict hydration
cancellation, fully drainable persistence/replay, isolated actions/status and
listener/queued-flush disposal. Existing ASO manifests and installation use
4.0.2 while versions.toml records 4.0.0; this is unresolved RA09 adoption/pin
evidence, not permission to rewrite the pin. No PEM files were changed.

## 2026-09-13 — Isolate FRF after a second shared-source freeze failure

Input b17da3bd failed pre-build validation because the shared FRF repository and
Cargo.lock changed during capture. Preserved the manifest/log under
ra06d03/history/b17da3bdfb3760cc2e8cd7b1a9d38f853aa4416407deb10767bb3a5afff361bb.
No integration command ran for that input.

Added a one-shot Git snapshot utility with focused synthetic checks. Snapshot
preserves HEAD/tree, logical index, tracked dirty bytes, nonignored untracked
files, deletion, mode and symlink identity; excluded process history and ignored
working-tree files are omitted. Git history/index still contain historical
objects; external symlink referents are explicitly not frozen. Initial slow
capture was interrupted without a Passed receipt and its partial directory was
retained. Batched Git object inspection removed 3,200 redundant subprocesses.

Real FRF snapshot capture and destination-only verification Passed with digest
e2bebc2d2208f810737b2d9b7c1d2c989eaf22bb75bb7fe317a2232dfce52b38.
Its dedicated root is .runtime/ra06d03-sources/flint-realtime-fabric. Updated
Compose override, campaign common/build specification, source packet/index
mappings and refiners to select it consistently. The default Compose context
and PROMETHEUS_ROOT override still resolved correctly in local config checks.
The initial config check lacked required synthetic environment values and failed;
all three corrected context checks Passed. No shared FRF source was altered.

Independent focused review found an opaque receipt did not prove destination
identity. Fixed with recomputed receipt verification before/after freeze, before
replay and in both refiners. Reviewer reinspection found no remaining concrete
issue. Worker Tier 0 compilation Passed; six focused Tier 1 Git tests Passed
(13.384s). Root verified the actual retained snapshot and existing review-tooling
regressions; git diff --check exited 0. Full local integration and final
candidate critic/judge remain pending. Freeze session 96408 writes
ra06d03/task-4-isolated-source-freeze.log. Candidate now binds 40 fixtures,
including snapshot utility, tests and capture receipt.

Isolated-source freeze input is now
0392c78304f574e19f3bdb4121f110e85ad237602b068c2e0a490362f8c9b9e4.
Its attester PID 20324 is waiting on Docker image compilation; freeze session
96408 is still active. Docker build record orbstack/orbstack/9gleosim4c686atyvs45e4vgf
reports Running for FRF, while DB and both Gate image records completed. The
record name is the snapshot's local Git origin, not its build context. Confirmed
snapshot origin is the shared FRF path; attested Compose context is the dedicated
snapshot. The release profile uses opt-level 3, thin LTO, codegen-units 1. Latest
build log reached frf-gateway compilation at step #83 1022.8 seconds. Do not use
existing top-level campaign receipts until their candidate_digest matches the
new final manifest and every role has actually completed.

## RA06 source isolation continuation — 2026-09-13

Input 0392c78304f574e19f3bdb4121f110e85ad237602b068c2e0a490362f8c9b9e4 built all images, but Gate generated `.claude/settings.local.json` changed before final attestation. The attester was stopped; this input never entered integration and is not certified. Its input, exclusion contract and log are preserved under ra06d03/history/0392c78304f574e19f3bdb4121f110e85ad237602b068c2e0a490362f8c9b9e4.

Added an exact exclusion for generated harness settings. Created separate sibling snapshots under `.runtime/ra06d03-isolated-sources`. FRF was carried from the previously verified snapshot and retains content hash e2bebc2d2208f810737b2d9b7c1d2c989eaf22bb75bb7fe317a2232dfce52b38. Gate hash42926312a157bfe95a6352c0d7d0503b7414aaff1fccb5c8ce111970efaa73c4; Forge hash37043e48f6c6a2770ca1b596aede8c6db87cbdabf459640b2a0f9208fd0820a6. All three receipts and destination verification Passed. No external symlinks were found in these snapshot worktrees. Snapshot unit tests:6 Passed in9.016s. Build/review/replay bindings are being checked against this source set before the next freeze.

### Cargo configuration identity repair

Input ca87f7849afbf4cf1b3eb0294df00ff18bffb29d120a741cf6e43a7fdd93bd05 was stopped during Gate compilation after independent critic confirmed missing ancestor Cargo config and absolute sccache identity. No integration ran. Host identity now includes Cargo config search inventories (present and absent paths), selected-config hashes and enabled compiler-wrapper executable identities. Real collector Passed with16 config candidates/1selected/1wrapper for prior-auth and22/1/1 for Gate. Synthetic config creation/edit/wrapper-byte/precedence tests Passed and are called by campaign unit main. Packet and child refiner now require this closure. Existing source snapshots remain valid.

### Final candidate campaign — 2026-09-13

Freeze Passed for sha256:8fef8e781fbd9ae42b2c5ca43bc55b3e31e6c697b4e8002d5b11c984ad8c0369 (input9335cedcd83582025f8eb84b4972b7e40ddd031dea279171261d9838bdb2df6f). All12 local replay receipts Passed; UI9files/52tests Passed; live four-trigger, mountedtwoGate, recovery/lease and RA11c open-obligation checks Passed. Child8/8 and parent7/7 deterministic refiners Passed. Index140 entries: baseline132 +5 snapshot fixtures +3 retained invalidation receipts.

Refiner invocation must source candidate-common, activate its environment, export RUSTUP_TOOLCHAIN=1.98.1 and prepend dirname(RA06_TOOL_PYTHON) to PATH: otherwise literal python3 selects the system interpreter without tomllib. This was an invocation error; candidate source unchanged.

Packet builder preserves CR in Docker log display, while validator expects universal newlines. Corrected only derived packet display projection, preserving raw evidence hashes and the source bundle; normalization receipt is in ra06d03/packet-display-normalization.json. Refreshed the stale closure summary to current candidate before fresh review. Final packet7febe6b668d69bda873558d7c9cef809efd745669e706c69fb84c3cc0a7bf092 passed packet validation. Gateway returned HTTP413/exit3, so fresh-context different-model native critic and judge are reviewing that packet under the supported fallback. No final certification claim yet.

## 2026-09-13 — RA06 reauthentication fence repair

Final isolated critic rejected candidate 8fef8e78 despite 12 passing campaign roles: server 403 reauthentication_required did not publish local revocation. Confirmed in HTTP client and rendered boundary. Added exact-code fence, GET/empty-response tests and rendered signing/command-ownership coverage. Observed red before repair and rendered mutation red, restored implementation, then 10/10 targeted tests Passed; typecheck/lint Passed. Preserved full prior evidence under history/8fef8e78-reauthentication-finding. New candidate and phase replay required; no RA06 completion claim.

## 2026-09-13 — Correct frozen child UI test count

Candidate 86d12421 passed all 12 local roles (64 live, 61 mounted, 24 recovery, 55 UI tests). Child c4 rejected it because its frozen validator still required exactly 52 tests; parent count had been updated but this second assertion was missed. Preserved passing campaign and failed checklist in evidence/ra06d03/history/86d12421-validator-count. Corrected both child count assertions to 55, verified syntax and acceptance/rejection against actual log plus old/partial counts. New freeze and replay required because validator is an explicit fixture. No application code changed in this correction.

## 2026-09-13 — Flutter relative age invalidated unchanged toolchain

Candidate 1a155a23 passed roles 1–10 and the 55-test UI command, but UI post-validation rejected toolchain identities. Exact comparison found only Flutter human output engine age changed from 12 days ago to 13 days ago; binary and dependency hashes were unchanged. Local Flutter CLI source and execution confirm --version --machine provides fixed revisions/dates. Updated collector to canonical JSON with flutterRoot path redaction; preserved all byte identity checks. Regression failed against old text collector, passed against actual machine output, and two actual captures matched. Candidate and failure preserved under evidence/ra06d03/history/1a155a23-flutter-relative-age.

### Flutter first-run machine-output suffix

The first stable-Flutter freeze stopped in its early manifest test, before creating a candidate: a fresh build home appended the Flutter first-run telemetry notice after the machine JSON. Confirmed with the installed CLI; --suppress-analytics does not suppress this notice. Collector now decodes the first JSON document explicitly and canonicalizes its complete metadata. A fresh-home real capture and a repeated capture matched exactly; fixed revisions/dates, root redaction, executable/dependency hashes remain bound. Syntax and git diff --check Passed.

## 2026-09-13 — Nested process history escaped root-only review exclusions

Candidate 78cfbbe5 passed all 12 local roles but independent review found four Flint Forge nested .prometheus files in its source bundle. Root-only path filters missed nested directory components. Added nested exclusion rules, component detection in builder/validator, matched Git pathspecs, and real staged/unstaged/untracked regression fixtures. Regression failed before repair and passed after. Frozen verification inputs changed; preserved prior receipts as historical and require a new candidate. No application behavior changed.

## 2026-09-13 — RA06 closed; RA07 candidate implementation entered

RA06 final candidate011433b2 passed12 local receipts, child8/8,parent7/7, packet validation and independent critic/judge strict review. Parent and all three final-repair child changes archived. Child exit overwrote handoff; restored exact SHA25650d7bc3aad0d2b410d6e573587da7283213a8df06a9fdb5302f87899824c6188 with lifecycle receipt. Memory hook script absent; this is append-only fallback. RA11c/RA17 and upload-to-letter UI remain open. RA07 uses isolated PEM worktree codex/ra07-scoped-pem-runtime at071b9e5b; no app pin/adoption change. Implementation precedes assembled local acceptance under PEM rules.

## 2026-09-14 — RA07 scoped candidate implementation and local acceptance

RA06 remains closed. RA07 implementation in `.runtime/ra07-pem-source` now owns graph,
status, actions, hydration, saves, realtime manager and listener disposal explicitly.
Core/React packages built and their ledgers matched. Packed React + real IndexedDB
PGlite acceptance passed six groups; real Postgres/Electric/PGlite acceptance passed
five groups. Three controlled installed-package mutations each failed the intended
assembled assertion; exact original package bytes were restored and both complete
acceptance paths passed again. Final independent adversarial review is in progress;
no ASO pin adoption, uploaded-case letter generation, or native readiness is claimed.

KBD repeated generic final-review title collision recurred. Cancelled only pending
RA07 numeric task 8 and registered `ra07-final-review`, preserving the work statement
and guarded transition. Canonical revision 719 records final review in progress.

## 2026-09-13 — RA08 assembled acceptance

RA07 is archived complete with its immutable review and acceptance receipts. RA08 implementation finished before acceptance: committed SQL-to-graph projector, explicit primary keys and atomic row/list/metadata publication. Seven real PGlite/packed React browser scenarios passed. Two controlled installed-entry mutations failed on their intended publication/epoch assertions; byte restoration returned all seven to Passed. Main PEM pins remain 4.0.0. Independent RA08 review remains before closure. Upload-to-letter UI remains incomplete; RA14 is first persisted-row UI, not the entire product workflow.

### Correction — existing PEM installation

RA09 read-only inspection found versions.toml4.0.0 versus web manifest/lock/install4.0.2. Earlier statements describing the installation as4.0.0 were incorrect. No current turn changed these files. RA09 must reconcile authority with the actual candidate, not assume the registry4.0.2 contains the isolated RA07/08 changes.

### RA08 review repairs and final local acceptance

Independent REST judge identified invalid admission being tracked, inherited dictionary property collisions, and inherited normalized primary keys. Fixed admission before tracking with caller-owned rejected SQL, rejected Object.prototype dictionary names, and required own raw/normalized keys. Final core entry883c1c09fea0cb717c56bf85e186a4496af386263eb020e1bf3a6e63af309760 passed10 assembled browser groups and5 meaningful negative controls with exact restoration. Refiner digest618cd23572a6b0bac21862e5bc079221a9322df761d538a5826c84eb5f36ca21 passed deterministic validation; final independent review pending. Historical iterations remain retained.

## 2026-09-13 — RA08 closed; RA09 candidate prepared

RA08 archived at revision761 after10 realbrowsergroups,5 effective mutation controls, deterministic refinement and final critic/RESTjudge PASS. RA09 candidate4.0.3-ra09.0.g071b9e5.s8179d23348ab packages acceptedsource and exactbuiltbytes; isolatedASOconsumer retainsReact19.2.0. Candidatepassed6scopedbrowser+10committedbrowser+5realElectricgroups. Deliveryverifier nowchecksfullinstalledcoreinventory and Passed6; extra hiddenpackage causedintendedfailure, removalrestoredPassed. Existingmain4.0.2 iscorrectlyrejected. Mainpinfilesuntouched; G-PINcandidateadoptionawaitsoperator. Candidatefinalreviewpendingafterverifierrepair. Parent8/24complete.

## 2026-09-13 — RA09 delivery review repairs

Replaced optimization-removable Python assertions at the provenance/package boundary with explicit exceptions. Under python3 -O, reconstructed tarballs matched both frozen candidate hashes and a Failed prerequisite was rejected. Expanded installed core/React checks to all107 shared identities, with the intentional useGraphStore override documented and validated. Seven installed checks Passed; prior21 assembled behavior groups remain tied to unchanged package bytes. G-PIN adoption remains pending; main pins/manifests/lock unchanged.

## 2026-09-13 — RA09 candidate review completed

Final candidate-only review Passed at iteration5, digest bc449802471b3b5841eccc890e11789329e670aad3357a502084b8119ad912da. REST gpt-5.5 judge and independent critic returned zero findings; strict screens0.0. Full source/member checks and immutable original packager provenance resolve delivery review defects. Candidate21 local groups and7installed checks remain Passed. Main adoption and RA09 closure remain Blocked pending the exact G-PIN decision; no main pin changes or upload-to-letter readiness claim.

## 2026-09-13 — Independently eligible RA10 implemented

Continued independent work while RA09 G-PIN approval is pending. Removed unused @assistant-ui/ai-sdk and five-package exclusive closure without changing retained lock entries or16 exact installed pins. Added transitive lock graph guard; actual old manifest-only check missed SWR and new guard rejects the real pre-removal chain. Offline frozen install and28targeted rendering tests Passed after implementation. Updated ADR001 and TypeScript rule descriptions. RA09 pin-gate hashes remain historical pre-RA10 evidence; this authorized independent manifest/lock change is not PEM adoption. Review pending.

## 2026-09-13 — RA10 complete and archived

Canonical revision834: runtime parent9/24changes complete; RA10all8planned tasks complete with duplicate generic registration separately cancelled. Deterministic validation and independent RESTjudge/critic Passed with zero findings; strict screens0.0. KBD verifyPASS/archive succeeded. Implementation preceded local acceptance, and no broadphaseT2/T3/CI tests ran. RA09 G-PIN approval remains the next dependency gate; remaining RA11onward cannot adopt unapproved candidate. Overall autonomous goal remains active and incomplete.

## 2026-09-14 — RA09 adopted, verified and archived

Operator authorization resolved G-PIN and permitted the necessary `versions.toml` change. The authority file, web manifest, lockfile, vendored tarballs and installed packages now agree on PEM candidate `4.0.3-ra09.0.g071b9e5.s8179d23348ab`. Frozen offline install, typecheck, lint, the query-cache guard and seven installed-identity checks Passed; the verifier found exactly one core singleton, six required factories and 107 shared public export identities. Final refiner digest `1cdec751e1497595484a1de2feee9017ad3e3db609e09579851710a4eeb5af85` passed independent REST judge and critic review with zero findings after portable provenance paths and receipt bindings were corrected. RA09 is archived; the runtime parent is 10/24 changes complete. Production runtime wiring, native behavior and upload-to-letter remain open in RA11–RA22.

## 2026-09-14 — RA11a tasks 1–4 implementation record

RA11a fixed the exact experimental closure and 16,203-row thresholds, then added a tracked isolated
PGlite Sync conformance package plus a real Kratos/Gate/FRF/Electric coordinator. Offline frozen
install, TypeScript checking, Node syntax checking, Python compilation, oxlint and diff checks
Passed. Exact package and FRF source establish a concrete blocked candidate contract before broad
local integration: mandatory Electric protocol parameters and response metadata do not cross the
current facade, and PGlite Sync 0.6.9 contains an unawaited coordinated-commit call. No production
dependency was adopted and no isolated PGlite data remains. Behavioral local-integration tasks are
still open.

## 2026-09-14 — RA11a sync conformance closed

- Completed and archived `ra-11a-sync-conformance` after scoped T0 and a real local Kratos → Gate → FRF → Electric → PGlite T1 campaign.
- The exact `@electric-sql/pglite-sync@0.6.9` closure remains Blocked: the authorized FRF facade returns HTTP 400 `parameter not allowed: log` for the client's mandatory `log=full` request before materialization.
- The final artifact-refiner digest is `536e2fbf12428f1e559de35ec24c0e7d33fc9e827c068c9d5fb1a2dac2310108`. A fresh cross-model critic passed 14 checked classes with zero findings. The sycophancy screen exited 0 but skipped rendering because its renderer was unavailable.
- No production PGlite Sync dependency was added. Restart, refetch, graph publication, and full-materialization memory remain unverified.

## 2026-09-14 — RA11b worker ownership complete

Completed and archived `ra-11b-worker-ownership` at KBD revision 937. The production GraphProvider now opens persistent PGlite only inside `ReplicaWorkerOwner` Web Locks ownership, applies the full checksummed schema plan under a held advisory lease, fences exposed PGlite operations through the owner epoch, retries follower handover, cancels abandoned opens, and quarantines failed teardown. Local T1 evidence: TypeScript passed; 88 focused tests across 8 files passed; the headless Chrome worker-leader-death check passed. The final isolated gpt-5.5 review returned PASS with no findings and the strict sycophancy gate scored 0.0. Live FRF/Electric materialization remains gated to RA11c.
## 2026-09-14 — RA11c task 1.4 memory block

Continued Execute / runtime-architecture / ra-11c-sql-materialization task 1.4.
The real synthetic Postgres→Gate/FRF→PGlite→PEM lifecycle reached its update,
delete, rollback, restart, refetch, owner-disposal and replacement-owner
assertions. The fixed 16,203-row memory-only browser baseline failed the
pre-recorded 512 MiB incremental RSS gate at 1,054,425,088 bytes; heap used
93,947,024 incremental bytes and passed its 256 MiB gate. Cleanup passed for
relational rows, isolated PGlite storage, campaign services, grant callback and
synthetic Kratos identity. RA11c remains incomplete pending a planned decision
between the browser database requirement and the fixed memory budget.


## 2026-09-14 — RA11c closure durability repair

Independent review found that resume could leave a stale nonzero persisted graph
behind a newer SQL checkpoint and that replica/checkpoint tables were unlogged.
The runtime now compares projector and checkpoint transaction IDs after an
authorized response and republishes a complete committed SQL replacement only on
mismatch. Both tables are logged. The four closure-focused files passed 36 tests;
the full 18-file suite passed 158 tests with one worker, and typecheck/lint passed.
Current-source mounted replay is Blocked because the local Docker API is
unresponsive. Production adoption remains Blocked by the previously measured
1,011,023,872-byte incremental RSS result against the 536,870,912-byte limit.


### RA11c closure review blocked canonical completion

The isolated gpt-5.5 judge returned BLOCK with one critical and one warning. The
warning was repaired by a live-session authority guard whose 11 focused tests,
TypeScript, and lint passed. The critical remains: current-source mounted
acceptance cannot run because Docker server and `docker ps` time out, Gate refuses
its port, Kratos times out, and port 5432 is not the campaign database. Registered
`ra11c-current-source-mounted-replay` as a canonical blocked task. RA11c now reports
Blocked with 8/9 OpenSpec tasks complete and was not verified or archived.


## 2026-09-15 — RA11c task 9 mounted replay and ordered-fold review

Relaunched the unresponsive OrbStack application and restored Docker 29.4.0. The
current-source Postgres→Kratos→Gate/FRF→PGlite→PEM campaign passed both durable
processes, all 11 behavioral checks, and all five cleanup checks. The fixed browser
RSS gate failed at 1,007,419,392 bytes against 536,870,912; heap passed at
76,155,544 bytes. KBD completed task 9 at revision 1003. Fresh isolated review then
found cold snapshots apply accumulated deletes after accumulated upserts, losing a
later reinsert for the same ID. Registered canonical task 10 and OpenSpec now reports
9/10; RA11c returned to Pending at revision 1004.

## 2026-09-15 — RA11c SQL materialization closed

- Phase: runtime-architecture / Execute.
- Completed and archived `ra-11c-sql-materialization` at canonical revision 1008; runtime implementation is 13/24.
- Cold Electric messages now fold in response order. Delete/reinsert survives, update-after-delete is rejected, and internal operation metadata preserves insert versus update semantics through the SQL writer.
- FRF 401/403 bodies are not consumed or published into session-revocation reasons.
- Focused transport/writer/runtime/ledger verification passed 75/75; typecheck and lint exited 0. Mounted initial and continuation processes exited 0, all 11 behavior checks were true, and all five cleanup checks passed.
- Artifact iteration 13 digest: `b4ec90718c4f7bf2d6500af114e56e55a83d83469bddaf3fe475f2319ee0f461`. Isolated adversarial review: PASS with zero findings.
- Production adoption remains Blocked: PGlite incremental RSS was 1,016,692,736 bytes against 536,870,912 allowed; heap was 77,579,792 bytes against 268,435,456 allowed.

## 2026-09-15 — RA12 task 1 eligibility

- Phase: runtime-architecture / Execute.
- Completed RA12 task 1 of 8 at canonical revision 1013.
- Verified RA11c complete and archived, recorded all six phase gates, assigned ASO composition/session/authentication ownership, and retained the PGlite memory-adoption block.
- Evidence: `.kbd-orchestrator/phases/runtime-architecture/evidence/ra-12-public-auth-startup/task-1-eligibility.json`; JSON, dependency archive, six gate entries and every referenced source path passed local structural checks.
- No application code changed.

## 2026-09-15 — RA12 task 2 public/authenticated startup boundary

- Phase: runtime-architecture / Execute.
- Added public login/recovery route composition outside `GraphProvider`, distinct anonymous/unavailable presentation, and an ephemeral session/runtime Zustand state machine.
- Removed the unavailable-service development identity fallback, preventing unverified private PGlite and shape startup.
- Graph startup now publishes migration, hydration, catch-up, ready, offline-limited and recovery states against the captured session epoch.
- Focused verification passed 30/30 tests; typecheck, lint and diff check exited 0. Removing the ordered-transition guard made its focused test fail, and restoring it returned the suite to green.
- Separately observed: `lease-store-web.test.ts` fails 1/9 in isolation. This task did not alter that subsystem.

## 2026-09-15 — RA12 task 1.3 typed Kratos browser flows

Implemented the typed login/recovery flow model, API/service/hook and shadcn form; added the narrow web-server Kratos proxy, Vite development forwarding and enabled code-based recovery in the pinned Kratos configuration. Web typecheck and lint passed. Nine focused test files passed 46/46. The ASO web server format, check and scoped Clippy gates passed; its proxy test passed 1/1. The Kratos v26.2.0 process accepted the config through database initialization. A controlled removal of the action-path guard made the parser accept an admin endpoint and fail as expected; restoring it passed 2/2. Full mounted browser-flow testing remains task 1.4, so no broad integration or phase tier ran.

## 2026-09-15 — RA12 task 1.4 authentication and startup tests

Added composition coverage for anonymous, unavailable and authenticated startup with instrumented database/shape ownership; expanded login/recovery flow coverage for provider errors, invalid and expired flows, superseded responses and successful completion; and added a source-level credential/CSRF storage boundary. Web typecheck and lint passed. The final 12-file targeted run passed 68/68 tests. A controlled synthetic password insertion made the storage test fail 1/2 and exact restoration returned it to 2/2 Passed. No mounted or broad phase tier ran; tasks 2.1–2.3 retain those behavioral receipts.

## 2026-09-15 — RA12 task 2.1 public startup proof

Retained an assembled React boundary receipt with Node v24.16.0, pnpm 11.25.0 and Vitest 3.2.7. The public-route and auth-flow hook command passed 8/8 tests: anonymous and provider-unavailable routes remained usable with zero instrumented private database opens and shape subscriptions, while the authenticated control opened one of each. Temporarily wrapping the public outlet in GraphProvider made both public cases fail; exact restoration returned the route test to 3/3 Passed. No application source changed in this evidence task.

## 2026-09-15 — RA12 task 2.2 authenticated startup-order proof

Added a composition test that runs the real GraphProvider startup factory with an instrumented verified session and external adapters. The retained command passed 31/31 tests across four files and observed opening-replica, database open, migration, hydration, shape catch-up, graph caught-up and Ready in order. TypeScript and lint passed. Moving Ready before continuation completion made the composition test fail 0/1; exact restoration returned it to 1/1 Passed. No phase-wide integration tier ran.

## 2026-09-15 — RA12 task 2.3 browser-flow proof

Retained the browser-flow and secret-containment receipt with Node v24.16.0, pnpm 11.25.0 and Vitest 3.2.7. Six files passed 22/22 tests, followed by passing TypeScript and lint. The receipt covers provider and field messages, CSRF-only submission, invalid and expired flows, correct login/recovery renewal, both completion paths, superseded-flow fencing, public error isolation and the store-source credential boundary. No application source changed in this evidence task.

## 2026-09-15 — RA12 public authentication and startup closed

- Phase: runtime-architecture / Execute.
- Final review found and repaired a protected-route exposure in
  `offline-limited`; patient routes now render only when runtime state is
  `ready`, with distinct closed offline and recovery surfaces.
- Removed stale README guidance for the deleted development-session fallback.
- Scoped web verification passed 99/99 tests; typecheck and lint exited 0. The
  boundary negative control failed 2/13 as expected, then exact restoration
  passed 13/13.
- Artifact iteration 3 passed 11 checks with digest
  `59950903fad4b5c83cea1291587b4e9e2acc7c9d7a8d2a230495264e58dc4949`.
  Final isolated review passed with zero findings and the strict anti-theater
  gate passed at score 0.0.

## 2026-09-15 — RA13 task 1 eligibility

- Phase: runtime-architecture / Execute.
- Confirmed RA12 complete, verified and archived with its clean isolated review
  and artifact digest.
- Recorded RA13 ownership across browser session/runtime coordination, per-view
  factories, noncredential logout controls and the conditional draft repository.
- Carried all six phase gates forward. Browser lifecycle and synthetic or
  memory-only evidence may proceed; real clinical draft persistence, production
  materializer adoption and native claims remain outside the authorized scope.
- Eligibility JSON validation passed six gates, fourteen source references and
  the dependency archive check. No application code changed.

### RA13 task-registration projection repair

The first task completion exposed a KBD registration edge case: only task 1 was
known canonically, so the runtime briefly inferred the change was complete while
OpenSpec correctly reported 1/8. Registered tasks 2–8 and returned RA13 to
`in_progress`; canonical and backend status now agree at 1/8.

## 2026-09-15 — RA13 task 2 epoch revalidation and view fencing

- Phase: runtime-architecture / Execute.
- Added foreground and cross-tab authoritative session revalidation with a
  synchronous protected-content fence and deterministic graph quiescence.
- Added a reusable scoped Zustand view owner and applied it to evidence,
  surgeon-gate and letter-signing hooks. Epoch-transition tests prove delayed
  old reads cannot replace current view state.
- The focused local suite passed 110/110 tests across 19 files. Typecheck and
  lint exited 0.
- The drain-order negative control failed 2/5 provider tests when replacement
  authority was deliberately installed before graph drain, then passed after
  restoration. No T2 or release checks ran before phase completion.

## 2026-09-15 — RA13 task 3 durable logout control

- Phase: runtime-architecture / Execute.
- Added the noncredential, generation-matched browser `logoutPending` control,
  preserved the mounted server's confirmed/incomplete result, and blocked
  passive startup restoration across reloads and tabs.
- Wired explicit login completion as the only client ceremony that may clear a
  marker without a matching confirmed logout; recovery flows cannot clear it.
- Focused web verification passed 65/65 tests across 13 files. The existing ASO
  logout coordinator passed 8/8 focused tests and its mounted Axum result test
  passed 1/1. Typecheck and lint exited 0.
- The passive-reentry negative control failed 2/8 startup tests, then exact
  restoration passed. No T2 or release checks ran before phase completion.

## 2026-09-15 — RA13 task 4 scoped draft recovery

- Phase: runtime-architecture / Execute.
- Added an identity/practice-scoped, memory-only targeted correction repository
  outside replica generations, with abortable handles and explicit recovery.
- Wired draft quarantine into session fencing and showed memory-loss notices on
  the correction editor and public or locked access surfaces.
- Added the correction draft to the real letter view without adding a clinical
  apply, submit or signing command.
- Focused verification passed 39/39 tests across six files. Typecheck and lint
  exited 0. Removing identity from the record key made the isolation test fail,
  then exact restoration passed. No T2 or release checks ran.

## 2026-09-15 — RA13 task 5 scope-change proof

- Phase: runtime-architecture / Execute.
- Ran one current-source behavioral receipt across session revalidation, graph
  startup and ownership, protected rendering, scoped Zustand views, clinical
  feature hooks and memory-only draft persistence.
- The verbose local run passed 102/102 tests across fourteen files. It observed
  immediate locking, ordered Quiescing, stale work refusal and reopening only
  from current authority at Ready.
- The attachment case used synthetic bytes through the production scoped lease;
  RA16 still owns the authorized source-byte service and visible preview.
- No application source changed and no T2 or release check ran.

## 2026-09-15 — RA13 task 6 failed-logout proof

- Phase: runtime-architecture / Execute.
- The current-source browser receipt passed 43/43 tests across eight files; the
  mounted Axum result test passed 1/1 and the host coordinator passed 8/8.
- A disposable real-PostgreSQL run applied the server migrations and passed all
  nine restricted logout-journal assertions, then removed its database/login.
- The combined evidence proves pending-marker reload/new-tab locking, explicit
  login or confirmed-result clearance, and server-only denial/retry ownership.
- One preliminary Rust command selected zero tests because of `--exact`; it was
  discarded and replaced by the module-filtered 1/1 result.
- No application source changed and no T2 or release check ran.

## 2026-09-15 — RA13 task 7 draft runtime recovery proof

- Phase: runtime-architecture / Execute.
- Added one integration test that carries a synthetic correction through replica
  rebuild, authoritative revalidation, unsupported migration, revocation,
  foreign identity refusal and fresh original-user recovery.
- The full focused run passed 80/80 tests across nine files, including real
  in-memory PGlite migration recovery and replica-runtime rebuild behavior.
- Clearing drafts during quarantine made the composed test fail, then exact
  restoration passed. The earlier identity-key negative control also remains
  applicable.
- Typecheck and lint passed. No T2 or release check ran.
# 2026-09-15 — RA13 final review and repair

RA13 closed after four isolated review iterations. The final repair made the
mounted `logout_incomplete` response explicit at the feature API boundary,
stopped SessionProvider from closing an injected hint bus, and added epoch to
clinical command ownership keys while retaining the shared pre-epoch clear.
The scoped gate passed 192 tests in 26 files; TypeScript, lint, artifact-refiner
schemas and deterministic checks passed. The final distinct-model review
returned PASS with no findings. Broad T2 and device/release tiers did not run.

## 2026-09-15 — RA14 task 1 eligibility and ownership

- Phase: runtime-architecture / Execute.
- Canonical revision 1125 confirmed RA13 and RA10 complete; both OpenSpec
  changes are archived and their completion evidence is retained.
- RA14 owns the ASO evidence timeline, its scoped provider and committed-gate
  navigation wiring, and a local browser acceptance runner. The sibling service
  repositories remain outside this task's write ownership.
- G-PIN, G-REV and G-DATA permit bounded browser implementation. G-NATIVE does
  not apply to this browser change. G-SYNC permits experimental qualification,
  while G-MEASURE still blocks production materializer adoption: measured
  incremental RSS is 1,016,692,736 bytes against a 536,870,912-byte limit.
- No application code or versions.toml value changed. Only the eligibility
  evidence and this append-only task-boundary entry were added.

## 2026-09-15 — RA14 task 2 committed graph wiring

- Phase: runtime-architecture / Execute.
- Replaced the mounted timeline's one-shot PGlite read and copied clinical view
  state with scoped PEM list/entity selectors. Citations and documents rejoin
  from the same committed Zustand graph snapshot; the explicit row state alone
  decides met, gap or void.
- Reassessment remains a server intent. Accepted commands retain ownership
  until the graph subscriber observes the accepted state and assessment
  revision.
- Replaced the shell's false gate placeholder with a second graph subscriber.
  Navigation now distinguishes synchronizing, unavailable, unaffirmed and
  affirmed case projections and opens gated steps only from the last state.
- TypeScript compilation and diff checks passed. No behavioral test ran because
  RA14 implementation tasks 3 and 4 remain; tasks 5-7 own the assembled local
  acceptance runs. The temporary legacy SQL read helper has no production
  caller and remains for task 3's caller cleanup.
## 2026-09-15 — RA14 task 3: installed runtime callers and state references

- Phase: Execute. Change: `ra-14-live-evidence-timeline`. Task: 3 of 8.
- Removed the remaining feature-facing PGlite context and SQL timeline helper. Timeline reads now enter only through committed PEM graph selectors.
- Removed the evidence hook's caller-selected practice option. The verified session now supplies practice scope for graph reads and server intent commands.
- Added committed `evidence_states` list/entity validation so the timeline refuses readiness unless `met`, `gap`, and `void` remain three distinct key identities.
- Corrected `CitationChip`: missing source metadata now renders `This assertion has no source document. It will not be included.` and does not reclassify the assertion as `void`.
- Verified the installed PEM root exports at runtime. `pnpm --dir web typecheck`, `pnpm --dir web lint`, and the scoped diff check exited 0. No behavioral or integration test ran; RA14 tasks 4 through 7 own assembled local verification.

## 2026-09-15 — RA14 task 4: assembled browser campaign

- Phase: Execute. Change: `ra-14-live-evidence-timeline`. Task: 4 of 8.
- Added a local Playwright campaign for the synthetic Postgres, Gate, FRF,
  Electric, PGlite, committed PEM graph and Chromium path. It covers two graph
  subscribers, reassessment, deletion, logout, account change, foreign shape
  continuation, reduced motion and desktop-to-mobile resize.
- Added configurable Vite development proxies for Kratos, the ASO API and Gate,
  and applied reduced-motion transition classes to the shell controls reached by
  the campaign.
- `python3 -m py_compile`, the campaign `--help` entrypoint, web typecheck, web
  lint and the scoped diff check exited 0. The result remains **Build-only**:
  tasks 5 through 7 own the one assembled local integration execution after the
  implementation tasks, so no browser screenshots or live protocol logs were
  claimed in this task.

## 2026-09-15 — RA14 task 5: live SQL, graph and browser parity

- Phase: Execute. Change: `ra-14-live-evidence-timeline`. Task: 5 of 8.
- The local synthetic campaign passed 33 checks across Postgres, Gate, FRF,
  Electric, PGlite, the committed PEM graph and two Chromium subscribers. It
  observed 22 insert, 4 update and 6 delete operations; the source row count
  moved from one to zero and both subscribers rendered the reassessment and
  deletion without a browser reload or copied clinical React state.
- The run exposed and repaired two application defects: PGlite `Date` values
  were rejected by the timeline projection, and historical deletes in a
  paginated cold Electric snapshot caused a must-refetch loop. It also exposed
  two harness defects: trigger-disabled fixture cleanup left an orphan citation,
  and the Vite wrapper hid its startup failure.
- `pnpm --dir web typecheck` and `pnpm --dir web lint` exited 0. The focused
  Vitest run passed 23 tests in 2 files. The full browser campaign passed and
  every synthetic cleanup result passed with zero relational rows remaining.
- Physical mobile-device and Tauri-window claims remain unverified. The RA11c
  production materializer memory gate remains unchanged.

## 2026-09-15 — RA14 task 6: authorization and projection boundary proof

- Phase: Execute. Change: `ra-14-live-evidence-timeline`. Task: 6 of 8.
- Reused the single passing post-implementation campaign from task 5. The
  wrong-practice request returned 403, the broadened-column request returned
  400 and the prior account's continuation returned 403. All three denial
  responses omitted Electric shape headers.
- The delivered column sets matched the approved five-shape catalog exactly;
  `rationale`, `quote`, `patient_id`, `author_name`, `author_npi`, `storage_uri`
  and `data` did not arrive. The graph retained separate `met`, `gap` and `void`
  reference identities, and account change exposed no prior-practice row.
- No application code changed for this task. The task-specific receipt points
  to the immutable campaign hash and preserves its prerequisite and cleanup
  results. RA15 and RA16 still own authorization for annotation and source
  preview shapes.

## 2026-09-15 — RA14 task 7: adaptive authentication and mobile behavior

- Phase: Execute. Change: `ra-14-live-evidence-timeline`. Task: 7 of 8.
- Visual inspection rejected the original resize proof: the 320px full-page
  screenshot exposed document overflow, then a user horizontal-wheel probe
  showed the main pane could move and clip its left edge. The shell now
  constrains navigation width, the document clips root overflow, the main pane
  scrolls vertically only and citation chips wrap within the viewport.
- The final synthetic campaign passed 35 checks. At 320px, body width remained
  320, root and main horizontal offsets remained zero, the 320px pipeline
  retained its own 1,189px scroll strip and moved 100px, and the 284px citation
  remained within the viewport. Filter state survived resize and reduced-motion
  transition-property was `none`.
- Logout removed protected content from both tabs with zero protected document
  transition calls. Account B saw no account A row and its attempt to continue
  account A's shape handle returned 403 without Electric headers.
- TypeScript, lint, Python compilation, receipt validation, source hash and the
  scoped diff check passed. Every synthetic cleanup check passed with zero
  relational rows remaining. Physical mobile-device and Tauri-window claims
  remain unverified.

## 2026-09-15 — RA14 final review

- Phase boundary: runtime-architecture Execute, ra-14-live-evidence-timeline final review.
- The first isolated review blocked on four critical findings and one warning. All were repaired before closure.
- Scoped verification passed 81 tests; the strengthened local browser campaign passed 37 checks across the real Postgres, Gate, FRF, Electric, PGlite, PEM graph and Chromium path.
- Artifact-refiner passed 21 deterministic checks. The fresh final critic passed with no findings through the harness-native fallback; the receipt records the same-model collision.

## 2026-09-15 — RA15 task 1 eligibility

- Phase: runtime-architecture, Execute.
- Completed RA15 task 1.1 after confirming RA14 canonical completion and its OpenSpec archive.
- Recorded ownership and G-PIN, G-REV, G-DATA, G-SYNC, G-NATIVE, and G-MEASURE outcomes in `task-1-eligibility.json`.
- Allowed authoritative server annotation persistence and synthetic, memory-only client draft work. Durable client clinical drafts, production PGlite, and native runtime claims remain outside this task's approved evidence.
- T0: `jq -e` and `git diff --check` passed for the task evidence; no application code changed.

## 2026-09-15 — RA15 task 2 attributed annotation command and projection

- Phase: runtime-architecture, Execute.
- Added the host-neutral annotation command, Postgres revision/command/audit transaction, authenticated HTTP routes, desktop parity wrappers, and projection revision 2 across the Rust registry, FRF catalog, PGlite schema, and PEM bindings.
- A fresh disposable PostgreSQL install accepted migrations 0600–0614. Held revision 1 and included revision 2 committed with two revisions, commands, and audits; a direct administrator rewrite failed with SQLSTATE 42501 and left the row unchanged.
- T0 passed for all touched Rust crates and the web typecheck/lint. Focused T1 passed 6 Rust tests and 15 web projection tests. Both disposable databases were removed.
- Mounted end-to-end projection and responsive UI behavior remain assigned to later RA15 tasks.

## 2026-09-15 — RA15 task 3 scoped annotation UI

- Phase: runtime-architecture, Execute.
- Added the annotation PEM projection, feature API and command hook, session-owned memory draft support, and shadcn annotation composer, disposition, card, and section compositions inside the evidence timeline.
- The editor uses one DOM textarea across responsive reflow. Two mounted views share semantic draft text while retaining distinct caret ranges and scoped IME composition state; a remounted view requires explicit recovery.
- T0 passed with `tsc --noEmit` and oxlint. Focused T1 passed 7 files and 18 tests, including the same-node resize assertion, two-view independence, attribution/disposition rendering, command-to-projection confirmation, and existing correction-draft compatibility.
- The first broad invocation used a package script that ignored its file filter. Its unrelated concurrent PGlite timeouts and lease-store failure were excluded from task evidence; the newly affected evidence component seam was repaired and passed 6/6 in isolation.
- First-annotation creation remains incomplete because projection revision 2 exposes type IDs on annotations but no authoritative annotation-type selection catalog. Live mounted save/refusal/recovery proof remains task 1.4.

## 2026-09-15 — RA15 task 4 mounted annotation verification

- Phase: runtime-architecture, Execute. Change: `ra-15-attributed-annotations`. Task: 4 of 8.
- Completed projection revision 2 across the ASO grant, Flint Gate issuer and Flint Realtime Fabric consumer, including the exact six-shape allowlist with `annotations`. The FRF shape-only deployment now omits the event-spine connection that its profile refuses.
- Repaired the web annotation payload to satisfy the typed `Clinical Judgment` schema and mapped PostgreSQL JSON-schema violations to an invalid annotation response. Repaired scoped view-store disposal so React Strict Mode effect replay cannot permanently close a mounted Zustand view store; session and scope changes still fence old leases synchronously.
- `python3 scripts/test-ra15-attributed-annotations.py` passed 37 checks through Kratos, the ASO API, Postgres, Gate, FRF, Electric, PGlite, PEM and Chromium. It proved server attribution, held/included projection, stale 409 plus visible conflict, zero stale writes, administrator refusal, mobile resize continuity, account-change draft isolation and exact projected columns. Cleanup deleted all four identities and left zero synthetic relational rows or temporary roles.
- Focused web verification passed 18 tests in 7 files. TypeScript, oxlint, `cargo check -p aso-web-server`, FRF identity/gateway/shape tests and all six architecture audit checks passed. Physical mobile-device, Tauri-window and trusted OS-level IME behavior remain outside this browser campaign; component tests cover React composition state.

## 2026-09-15 — RA15 task 5 authorized annotation acceptance

- Phase: runtime-architecture, Execute. Change: `ra-15-attributed-annotations`. Task: 5 of 8.
- Strengthened the mounted campaign with a direct post-inclusion read-back proving the targeted chart evidence remained `met`, retained its original assessor and still cited the original synthetic MRI document.
- The rerun passed 38 checks with complete cleanup. `task-5-authorized-save-receipt.json` binds the accepted behavior to campaign SHA-256 `05d71970444f71ea5c06d5c2547602c8b1273b9ded35c3d3a60a5b644daa52ea`.
- The receipt records revision 3, included state, server-derived attribution and equal counts of three successful annotation commands, revision rows and audit rows. The approved annotation projection columns remained exact.

## 2026-09-15 — RA15 task 6 responsive editor acceptance

- Phase: runtime-architecture, Execute. Change: `ra-15-attributed-annotations`. Task: 6 of 8.
- Bound the mounted 1200px-to-320px Chromium result to the responsive editor receipt: the same textarea retained its draft and selection `[10,15]`, while body width remained exactly 320px.
- The fresh focused component run passed 2/2 tests. One editor retained its node, text, selection and composition state across resize; two same-case views shared semantic draft text while keeping selections `[0,5]` and `[12,18]` and independent composition state.
- `task-6-responsive-editor-receipt.json` validates against the campaign, screenshot, test log and test-source hashes. Physical mobile-device, Tauri-window and trusted operating-system IME certification remain later runtime work.

## 2026-09-15 — RA15 task 2.3 session and conflict fencing

- Phase: runtime-architecture / Execute.
- Completed RA15 behavioral task 2.3 with mounted browser/API evidence and focused store/hook tests.
- A stale UI submission returned HTTP 409 `revision_conflict`, remained visibly actionable, and left the annotation revision, revision-row count and command-row count at `2|2|2`.
- An administrator submission returned HTTP 403 `annotation_denied` and left annotation/command counts at `3|3`.
- Switching identities hid the prior in-memory draft, rejected a delayed save through the old handle, and rendered only the committed authoritative annotation for the second identity.
- Focused verification passed 2 files and 8 tests. The mounted campaign passed 38 checks and cleaned four synthetic identities with zero remaining annotation or relational fixture rows.
- Evidence: `.kbd-orchestrator/phases/runtime-architecture/evidence/ra-15-attributed-annotations/task-7-session-conflict-receipt.json`.

## 2026-09-15 — RA15 final review

- Phase boundary: runtime-architecture Execute, `ra-15-attributed-annotations` final review.
- The mounted local campaign passed 47 checks across Kratos, ASO, Postgres, Gate, FRF, Electric, PGlite, PEM and Chromium, with complete synthetic cleanup.
- Artifact-refiner passed 129 deterministic checks across a 125-file source manifest. The third fresh isolated critic returned PASS with no findings after the prior two reviews identified and prompted repairs to transitive harness, Gate trace and repository provenance evidence.
- A transient unchanged campaign run observed four HTTP 503 session-deletion responses; the UI stayed locked in `Server sign-out pending`, and the next unchanged run passed. The event remains recorded as an observed operational risk.
- Native Tauri session parity, physical mobile/OS IME certification and the RA11c PGlite RSS limit remain outside the RA15 completion claim.

## 2026-09-15 — RA16 task 1 eligibility

- Phase: runtime-architecture, Execute. Change: `ra-16-authorized-source-preview`. Task: 1 of 8.
- Confirmed RA15 is canonically DONE/COMPLETE, its eight-task OpenSpec checklist is archived, its mounted campaign passed 47 checks and its final isolated review passed without findings.
- Assigned RA16 implementation to ASO host/server/desktop contracts and the React source-preview/evidence-timeline surface. No sibling-repository edit is assigned.
- G-PIN needs no new dependency; G-REV remains binding; G-DATA permits synthetic source documents and transient bytes only; G-SYNC does not authorize source bodies in replicas; G-NATIVE permits a fail-closed wrapper contract only; G-MEASURE limits current claims to the named browser widths.
- The uncomfortable limit remains explicit: a browser preview does not certify native credentials, physical mobile behavior, production PGlite adoption or release readiness.

## 2026-09-16 — RA16 task 2 authorized source service

- Phase: runtime-architecture, Execute. Change: `ra-16-authorized-source-preview`. Task: 2 of 8.
- Added a shell-neutral bounded document-source contract, a PostgreSQL authority/read-audit boundary, a root-confined local object store, an authenticated no-store HTTP route, and a matching desktop command that remains fail closed until RA17 supplies native credentials.
- The final disposable PostgreSQL run passed seven checks: migration, storage-key refusal, runtime-role boundary, authorized bytes/hash/metadata, audit commit before return, foreign-practice refusal, and tampered-byte refusal without an audit. Cleanup removed the database, roles and source root.
- Focused T1 passed 3 host tests, 3 HTTP tests, 2 object-store tests and 1 desktop refusal test. Clippy with warnings denied, formatting, Python compilation and tracked diff whitespace checks passed.
- React rendering, provenance/focus behavior, mounted browser delivery and transient object-URL cleanup remain assigned to RA16 tasks 1.3–2.3. Native credential transport remains RA17 work.

## 2026-09-16 — RA16 task 3 scoped source preview UI

- Phase: runtime-architecture, Execute. Change: `ra-16-authorized-source-preview`. Task: 3 of 8.
- Added a private no-store binary client, provenance-validating feature API, per-view scoped Zustand selection, transient Blob/object-URL lifecycle, citation action and one adaptive Dialog-based source preview. The timeline now opens known-page citations without copying source bytes into graph or business stores.
- Scope changes synchronously hide old content, abort in-flight work and release object URLs. A controlled sabotage removed the current-scope render fence; the focused test failed with the old blob still ready, then passed after restoration.
- Focused T1 passed 30 tests in 6 files. TypeScript, oxlint, all six architecture audit checks, diff whitespace and the private-cache owner scan passed.
- The real mounted route, actual logout, focus-return, reduced-motion and 320/600/1200/1440 browser campaign remain RA16 task 1.4 and behavioral acceptance work. Native credentials and Tauri-window proof remain RA17 work.

## 2026-09-16T11:48:42.691398+00:00 — RA16 task 1.4 mounted source preview

The local Chromium campaign passed 34 checks across Kratos, ASO/Postgres, Gate, FRF, Electric, PGlite, PEM and React. It proved foreign-practice refusal, audited page reads, one adaptive preview at 1440/1200/600/320px, reduced motion, focus return, URL cleanup and cross-tab logout. Focused verification passed 16 tests, typecheck, lint, the six-check architecture audit and Python compilation.

## 2026-09-16T12:00:00Z — RA16 task 2.1 authorized-source acceptance

Recorded the passing mounted command, prerequisite availability, exact private-response metadata, committed source-read audit, visible provenance, 44px citation control, audited page navigation and cache exclusion in `task-5-authorized-source-acceptance.json`. The receipt is SHA-256 linked to the 34-check mounted campaign. No product code changed in this acceptance-recording task.

## 2026-09-16T11:52:20Z — Timestamp correction

The preceding `2026-09-16T12:00:00Z` session-log timestamp is superseded; it was a transcription error. The task 2.1 acceptance receipt records the authoritative observation time `2026-09-16T11:51:47.369617+00:00`.

## 2026-09-16T11:55:29.307905+00:00 — RA16 task 2.2 forbidden-source and logout acceptance

Recorded distinct mounted and hook-level proofs. A foreign-practice request returned 403 without a redirect or storage-key disclosure; the refused UI created no new object URL. A real logout in a second tab removed the first tab preview and old document content with three created URLs matched by three revocations. The focused hook test passed all three cases, including pending-request abort and rejection of late bytes after an epoch change. No product code changed.

## 2026-09-16T11:57:35.937505+00:00 — RA16 task 2.3 responsive-preview acceptance

Recorded the 1440/1200/600/320px mounted resize sequence with one stable iframe, contained dialog geometry, 44px controls, safe-area footer padding, effective reduced-motion suppression, audited page navigation and focus return. Four screenshot hashes and the campaign/script hashes are preserved in `task-7-responsive-preview-acceptance.json`. No product code changed.

## 2026-09-16 — RA16 authorized source preview final review

- Phase: runtime-architecture / Execute; change `ra-16-authorized-source-preview`, task 3.1.
- Focused web verification passed TypeScript, oxlint, 33 RA16 assertions, 12 schema/catalog/PGlite assertions, and the current mounted 34-check browser campaign with all cleanup passed.
- Focused Rust verification passed checks and scoped Clippy for four touched crates plus 4 host, 3 Axum and 1 desktop source tests. Scoped Clippy retained 15 advisory warnings; no broad T2/T3 ran.
- Artifact-refiner passed 8/8 constraints across 38 source files and six caller boundaries. The final isolated gpt-5.5 judge, distinct from the gpt-6-astra producer, returned PASS with no findings.
- Review repaired the shadcn desktop width cap, rejected partial 206 preview responses, and restored the immutable generation-3 PGlite base by moving annotations into revision 4.
- Browser source preview is complete. Native credential activation, a Tauri window and physical-device certification remain assigned to RA17 and later certification.

## 2026-09-16 — RA17 task 1.1 native-session eligibility

- Phase: runtime-architecture / Execute; change `ra-17-native-session-transport`, task 1 of 8.
- RA16 is canonically DONE/COMPLETE at 10/10, archived, and backed by a passing final receipt plus a zero-finding isolated closure review. Eight cited source hashes matched.
- Registered all eight RA17 tasks before closing task 1. Canonical revision 1274 records task 1 complete, tasks 2–8 pending, and the change in progress.
- Ownership is bounded to the desktop Tauri host/session/IPC, shell-neutral AppServices contracts, web composition-root transport/session projection, Kratos/Gate configuration and the Gate native credential path. Existing dirty work in these shared paths must be preserved.
- G-PIN, G-REV and prior sync conformance were confirmed. G-DATA remains unresolved for persistent real clinical data. G-NATIVE remains unresolved because no protected credential, encryption or native SSO facility is pinned; task 1.2 owns that decision and its end-to-end Kratos proof. G-MEASURE remains later certification work.
- Eligibility Passed for task 1.2. Credential storage and native activation remain disallowed until G-NATIVE is documented, pinned and tested. No renderer/plaintext fallback exists.
- T0 passed: valid eligibility JSON, eight matching source hashes, six recorded gates and clean diff whitespace. No product code, dependency, guard or test changed; no T1/T2/T3 ran.

## 2026-09-16 — RA17 task 1.2 native credential facility and live transport

- Phase: runtime-architecture / Execute; change `ra-17-native-session-transport`, task 2 of 8.
- Selected and pinned `keyring` 4.2.0, `secrecy` 0.10.3, Kratos 26.2.0 and the Tauri system-browser callback stack. ADR-010 and the runtime/related ADRs now state the same boundary.
- Added the host-only Kratos native transport, platform credential adapter, sanitized session projection and credential-owner bridge. No credential enters renderer serialization, Zustand, PEM, URLs or logs; the provider action cannot choose an unexpected path or origin.
- Synthetic local integration Passed against Kratos v26.2.0 and macOS Keychain: identity creation 201, native login, keychain reopen, protected credential-owner invocation, sanitized projection, credential removal and identity cleanup 204.
- Focused Rust tests Passed 3/3 with the live keychain case intentionally separate; formatting, desktop check, scoped Clippy, Python compilation, JSON validation, dependency pins and diff whitespace Passed.
- Negative control Passed: removing the expected login-path guard made the refusal test fail with exit 101; restoring the guard made it pass.
- Limits: typed Tauri IPC and protected-command parity, OIDC provider/callback activation, and Windows/Linux platform qualification remain pending.

## 2026-09-16 — RA17 task 1.3 constrained IPC and command transport

- Phase: runtime-architecture / Execute; change `ra-17-native-session-transport`, task 3 of 8.
- Mounted closed Tauri commands for eleven gate, signing, reassessment and annotation operations. The host checks the calling window and current epoch before reading its keyring-backed credential, and the web adapters pass no credential, actor, identity, principal or capability.
- Added the host HTTP transport to the existing Gate routes with bounded responses, redirects disabled and a sensitive `X-Session-Token` header. A local mounted endpoint observed every exact method, path, practice query and host credential while typed denials returned to IPC.
- Desktop T1 Passed: 12 tests, 0 failures and 1 intentionally ignored live Keychain/Kratos test; scoped Clippy with warnings denied, check and formatting Passed. Web T1 Passed: TypeScript, oxlint and 42 focused tests. Three mounted Gate tests Passed for fresh context, ignored identity headers, raw native-token ambiguity and sanitized denials.
- Negative control Passed: disabling the epoch comparison made the stale request reach transport and fail the assertion with `gate_not_found`; restoring the guard returned `native_epoch_stale` and passed.
- Limits: this task uses Tauri's mock runtime. A production Wry window, two-window behavior, OIDC, Windows/Linux facilities and phase-completion PostgreSQL integration remain unverified.

## 2026-09-16 — RA17 task 1.4 refusal matrix and two-window invalidation

- Phase: runtime-architecture / Execute; change `ra-17-native-session-transport`, task 4 of 8.
- Added a host-owned desktop session scope and invalidation epoch. Verified scope replacement, authentication failure after an active session and logout emit one sanitized `aso://session-invalidated` event to every authorized window.
- The web composition root now selects a native event listener under Tauri. Its payload parser accepts only schema, reason and epoch; native renderer publication is inert. Both independent session stores lock synchronously and revalidate through the authoritative session service.
- Desktop T1 Passed: 14 tests, 0 failures and 1 intentionally ignored live Keychain/Kratos test. The eleven-command matrix distinguished operation-specific policy denial, provider unavailability, native credential unavailability and lookup-based uncertain-command reconciliation. Two mock windows received the same three epoch transitions and a stale command was refused.
- Web T1 Passed after disabling Node 26's experimental Web Storage override: 8 files and 64 tests. TypeScript and oxlint Passed. The ambient Node 26 run failed because its undefined experimental `localStorage` shadowed jsdom; the controlled runner command used `--no-experimental-webstorage` and passed.
- Negative control Passed: removing the strict native-event key check caused the credential-bearing event test to fail; restoring it passed 4/4 tests.
- Limits: mock Tauri windows do not certify production Wry delivery. Kratos OIDC callback activation and Windows/Linux platform qualification remain pending. Full local database integration remains the phase-completion T2 gate.

## 2026-09-16 — RA17 task 2.1 native protected-command acceptance

- Phase: runtime-architecture / Execute; change `ra-17-native-session-transport`, task 5 of 8.
- A fresh synthetic Kratos identity completed native password login against Kratos 26.2.0. The macOS Keychain credential reopened the session, supplied the host credential owner, stayed absent from the serialized renderer projection and probe output, and was removed. Identity cleanup returned 204.
- The mounted desktop Gate transport passed all eleven native operations with a host-owned credential. Fresh Axum controls proved Gate policy could allow before AppServices independently denied.
- The disposable PostgreSQL upgrade fixture passed 18 real AppServices/repository assertions under a nonowner, nonbypass runtime role. Database triggers independently refused administrator, agent, expired and foreign-practice contexts; cleanup deleted the disposable database and login and preserved preexisting roles.
- An initial module-less `--exact` Gate test command selected zero tests. The corrected commands omitted `--exact`, selected one test each and passed. The receipt records both the diagnostic and corrected evidence.
- No product code or dependency pin changed. Production Wry, activated OIDC callbacks and Windows/Linux credential stores remain unverified.

## 2026-09-16 — RA17 task 2.2 renderer-authority refusal acceptance

- Phase: runtime-architecture / Execute; change `ra-17-native-session-transport`, task 6 of 8.
- The Tauri mock host rejected a stale epoch with `native_epoch_stale`, rejected a rogue window with `native_window_denied`, and rejected an actor-bearing closed input before any clinical transport invocation. All eleven commands preserved operation-specific foreign-practice policy refusals.
- The renderer adapter passed only bounded resource, mutation, requested-practice and noncredential epoch fields; two focused tests confirmed no token, actor, identity, principal or capability reached IPC.
- Mounted Axum tests proved fresh verified session context overrides forged identity/role headers, a body-selected signing actor is rejected before session access, an agent remains unable to sign even with `sign_letter`, and verified session context supplies the signer and practice.
- The prior epoch negative control and fresh task 2.1 PostgreSQL receipt are hash-linked. No product code, dependency or new guard changed.
- The six-minute Cargo delay was observed as uninterruptible I/O on the external target volume; the same live process completed both tests successfully. Production Wry remains unverified.

## 2026-09-16 — RA17 task 2.3 two-window lock acceptance

- Phase: runtime-architecture / Execute; change `ra-17-native-session-transport`, task 7 of 8.
- Two Tauri core mock windows each received the same sanitized sequence: `scope-change` epoch 1, `authentication-failed` epoch 2 and `logout` epoch 3. The failed authoritative session call returned `native_authentication_unavailable`, and an epoch-0 command was rejected as stale.
- Two independent native event buses synchronously locked and quiesced two authenticated Zustand stores. Focused web acceptance passed 22 tests across the event bus, provider and session store.
- Renderer credential scanning found no native token representation. The native event is owned only by the session bus, carries exactly schema/reason/epoch and has no URL or graph field. The restored strict parser rejects extra credential-bearing fields.
- TypeScript, oxlint, Rust formatting and diff whitespace checks passed. No product code, dependency or new guard changed.
- The evidence proves the synthetic failed-authentication boundary. A real OIDC provider/callback, production Wry windows and Windows/Linux credential stores remain unverified.

## 2026-09-16 — RA17 final review closure

- Phase: runtime-architecture / Execute; change `ra-17-native-session-transport`, task 9 of 9.
- Deterministic artifact refinement Passed all 8 constraints with 9 implementation receipts, 11 clinical commands and 9 real caller boundaries.
- The first isolated review exposed a stale six-projection Axum assertion; the test failed 7-versus-6 before repair and passed after selecting all seven registered projections by id. The second review exposed the incorrect native Kratos bearer header and missing desktop document-source path; both were repaired and focused checks passed. Its claim that signing and annotation callers were absent was disproved by the current production APIs.
- A bounded 311,494-byte closure packet supplied 32 current full source and acceptance files to a fresh-context `gpt-5.5` critic. The critic returned PASS with zero findings after checking 11 failure classes. The strict anti-sycophancy screen passed with score 0.01785714365541935.
- T0/T1 evidence Passed: desktop check/clippy and 14 tests with one separately covered live fixture ignored; web-server check/clippy and native Kratos header capture; repaired Axum grant test; web typecheck/lint and 71 focused tests; architecture audit 6/6; diff whitespace check.
- No broad Tier 2 or Tier 3 gate ran. Production Wry, activated OIDC, Windows/Linux credential stores, raw-byte IPC performance, RA18 PGlite baseline and RA22 runtime certification remain unverified by this task.

## 2026-09-16 — RA18 task 1.1 eligibility

- Phase: runtime-architecture / Execute; change `ra-18-tauri-pglite-baseline`, task 1 of 8.
- Verified RA17 is canonically DONE 9/9, archived, and its final review receipt is Passed with zero critical findings.
- Assigned ownership is limited to the Tauri host composition/IPC boundary, GraphProvider, shared sync ownership/storage adapters, and consumption of existing PEM contracts. No companion repository source edit is assigned.
- G-PIN permits the frozen PGlite 0.5.8 lock only; G-REV and G-NATIVE are satisfied; G-DATA permits synthetic memory-only qualification; G-SYNC prohibits production materializer adoption; G-MEASURE requires actual Tauri-window evidence in later RA18 tasks.
- Source inspection found renderer Web Locks plus a persistent localStorage lease, while memory mode uses a unique owner key per window. No Tauri host replica-ownership operation exists. Task 1.2 may implement that missing boundary without changing dependencies or persistence policy.
- Eligibility receipt JSON and diff whitespace checks passed. No product code, dependency, guard or broad verification tier changed.

## 2026-09-16 — RA18 task 1.2 native owner/follower adapter

- Phase: runtime-architecture / Execute; change `ra-18-tauri-pglite-baseline`, task 2 of 8.
- Added a host-owned Tauri replica coordinator and closed IPC commands. One authorized window owns PGlite and sync for the verified session scope; followers receive canonical graph projections and cannot publish.
- GraphProvider now composes the host election with the existing PGlite migration, FRF materializer and committed PEM projection. A follower opens only a local Zustand graph store. Canonical entities/lists converge while PEM patches and scoped selection/filter state remain independent.
- Desktop T1 Passed: three native replica tests, including two mock Tauri windows, owner/follower relay, stale claim replacement, follower denial, stale epoch and rogue window refusal. Web T1 Passed: five files and 18 tests covering relay buffering, canonical parity, local patches, follower database refusal, browser startup and session lifecycle.
- Negative control Passed: removing the host owner-window check made the IPC test fail because the follower published successfully; restoring it returned 3/3 tests to green.
- T0 Passed: desktop check, scoped Clippy, Rust formatting, TypeScript, oxlint and diff whitespace. The 16 MiB projection bound guards the real untrusted renderer IPC boundary.
- Limits: production Wry lifecycle/data conformance and actual macOS WebKit persistence/latency measurements remain tasks 1.3–2.3. Persistent clinical replicas remain unapproved.

## 2026-09-16 — RA18 task 1.3 actual Tauri lifecycle

- Phase: Execute / runtime-architecture / ra-18-tauri-pglite-baseline task 1.3.
- Enabled the already pinned Tauri 2.11.5 Wry runtime and added a fixture-only macOS native-window example plus local fixture page/config/icon.
- Actual `tauri-wry` run passed after one controlled window became owner, a second window received the same graph at revision 1, owner destruction elected a fresh graph, a duplicate revision was refused, and an identity change refused epoch-zero reads and writes before creating a new graph.
- Negative control retained the first owner; replacement election failed and the corrected fixture process exited 1. The restored run exited 0.
- Focused Rust tests passed 3/3, focused React tests passed 3/3, example Clippy passed with warnings denied, format and diff checks passed.
- Evidence: `.kbd-orchestrator/phases/runtime-architecture/evidence/ra-18-tauri-pglite-baseline/task-3-native-lifecycle.json`.
- Claim limit: this proves synthetic native window/IPC lifecycle behavior. Task 1.4 still owns persistence policy and cold/warm/catch-up/teardown measurements.

## 2026-09-16 — RA18 task 1.4 native PGlite measurements

Completed the actual WKWebView measurement path on macOS 26.7 arm64, WebKit 21624.5.1.11.3, Tauri 2.11.5, Wry 0.55.1, and PGlite 0.5.8. The native fixture served a Vite production bundle through its custom protocol, used production schema and `writeChunk`, and measured 2,524 ms cold first-row, 534 ms for 250 catch-up rows, 70 ms cold close, 432 ms reopen/read, and 86 ms warm close. The same IndexedDB namespace retained 251 rows before synthetic cleanup. Targeted TypeScript, lint, formatting, Clippy, storage-policy/chunk-writer tests, documentation checks, and the native run passed. Broader phase checks remain deferred to the phase boundary.

## 2026-09-16 — RA18 task 2.1 two-window graph and view-state acceptance

The actual macOS Tauri/WKWebView fixture now instantiates the production `createScopedViewStore` in both windows with the verified host session. The owner and follower received the same `Case:case-1` label and `replica:cases` identifier list at one canonical graph revision while retaining different view-instance IDs, citation selections, and evidence filters. The task-scoped native run passed. A controlled `RA18_FORCE_SHARED_VIEW_STATE=1` sabotage made the guard fail and exit 1; the restored environment passed. Vite/TypeScript/Oxlint, 6 focused web tests, rustfmt, Clippy with warnings denied, diff checks, and evidence hashes passed. The later unskipped PGlite stage timed out after the parity assertions and remains assigned to task 2.3.

## 2026-09-16 — RA18 task 2.2 native lifecycle acceptance

The current macOS Tauri/WKWebView binary passed the lifecycle acceptance with the PGlite measurement stage explicitly skipped. Destroying the original owner window released its claim and produced a fresh handover graph. The old claim returned `native_replica_claim_not_found`, a duplicate revision returned `native_replica_revision_conflict`, and changing to the second verified identity produced another fresh graph while old-epoch read and write returned `native_epoch_stale`. Retaining the original owner prevented `handover-ready` and exited 1. Three focused coordinator/IPC tests, Clippy with warnings denied, rustfmt, diff checks, and evidence hashes passed. The fixture skip label was corrected to `skipped-non-measurement-acceptance`; task 2.3 remains responsible for the unskipped PGlite stage.

## 2026-09-16 — RA18 task 2.3 native measurement acceptance

- Phase: Execute / runtime-architecture / `ra-18-tauri-pglite-baseline`, task 7 of 8.
- The existing actual macOS Tauri/WKWebView run remains a Passed capability measurement: 2,524 ms cold first row, 534 ms for 250 catch-up rows, 70 ms cold close, 432 ms reopen/read, 86 ms warm close, and 251 persisted rows.
- Fresh-store repetitions did not establish reliability. New measurement webviews stalled inside `PGlite.create()` after allocating roughly 39 MB; the established lifecycle webview later reached a 17,311 ms first row and stalled during catch-up. A five-by-50-row diagnostic committed 100 rows before the next transaction stopped returning with the runner and WebKit content process at 0% CPU.
- Failed synthetic stores were reversibly quarantined under ignored `.runtime/ra18-quarantine/`. The architecture record now names interrupted-open cleanup and repeatability as blockers for production PGlite adoption and acceptance inputs for RA19 native SQLite parity.
- Current-source T0/T1 Passed: RA18 TypeScript, Oxlint, Vite production fixture build, Rust check, Clippy with warnings denied, rustfmt, JSON validation, diff whitespace, and 28 focused storage-policy/chunk-writer tests.
- Task result is Passed for the exact requirement that actual native measurements be recorded without browser substitution. Production candidate adoption is Blocked, and the evidence explicitly does not claim a repeatable current-source run.

## 2026-09-16 — RA18 final review

RA18 scoped T0/T1 passed. The first isolated review rejected stale measurement acceptance; restoring the measured one-transaction, same-WebView PGlite lifecycle yielded current-source native passes. The second review found the production Tauri detector expected a function while the actual WKWebView injected a boolean. The adapter now uses `@tauri-apps/api/core.isTauri()`, unit coverage passed, and a second actual two-window run observed `isTauri=true` in both windows while completing owner/follower parity, handover, identity fencing, 250-row catch-up, close/reopen, 251 persisted rows, and synthetic cleanup. Artifact-refiner passed 17 checks across 107 files. The third distinct-model review passed with zero findings and strict sycophancy score 0.0. PGlite production adoption remains blocked for RA19 parity evaluation.

## 2026-09-17 — Web-01 safe command receipts

- Phase: Execute / runtime-architecture / web-case-to-letter / `web-01-case-command-core`, focused verification.
- Replaced full case command results with minimal `commandId`, `action`, `caseId`, and `committedAt` receipts across AppServices, HTTP, PostgreSQL, and command lookup.
- Fresh and populated-upgrade PostgreSQL probes passed through a restricted principal with `case_write` and no `case:read`. A protected-record sabotage failed and the migration restored byte-for-byte.
- Focused Rust tests, release check, strict OpenSpec, and artifact-refiner passed. The isolated artifact critic and cross-model judge returned PASS.
- Web UI and full browser workflow remain assigned to web-02 through web-17; no native or mobile claim was made.

## 2026-09-17 — Web-01 case command core archived

- Phase: Execute / runtime-architecture / web-case-to-letter / `web-01-case-command-core`, final task 3.1.
- Confirmed the production web mount from `aso-web-server` through `api_router`, the case handlers, shell-neutral `AppServices`, the restricted PostgreSQL adapter, and the durable case-command SQL functions.
- Reconciled the OpenSpec and runtime architecture contracts with the minimal write-only command receipt. The contract now uses the implemented `aso.practice_id` transaction setting and records plan revision 10: Tauri wrapper names are reserved, while implementation waits for RA19/RA21 after web-17.
- Current artifact-refiner result: Passed 11/11 across 34 hashed files. The final independent artifact critic matched all 34 hashes and returned PASS with zero findings.
- KBD task completion and OpenSpec verification passed. The change was archived to `openspec/changes/archive/2026-09-17-web-01-case-command-core`; strict validation passed for all 48 current OpenSpec items.
- Web-01 proves the durable case command boundary. The React case UI remains absent and starts in `web-02-case-publication-ui`; full actual-browser certification remains `web-17`.

## 2026-09-17 — Web-02 task 1.1 eligibility

- Phase: Execute / runtime-architecture / web-case-to-letter / `web-02-case-publication-ui`, task 1 of 6.
- Web-01 is complete and archived; strict Web-02 OpenSpec validation passed.
- Assigned exclusive ownership for publication/materialization, selectors/scoped Zustand state, and route/component work across tasks 1.2–1.4. Existing shared-worktree edits must be preserved.
- Web-02 will extend the existing `cases` shape to the exact frozen summary columns. It will not add a duplicate shape, invent display names, add a query cache, or route writes through PGlite.
- G-PIN and G-REV are satisfied. Focused work is limited to synthetic memory-only data; production materializer adoption and durable real-clinical persistence remain outside this change's claim.
- No product source, dependency, Tauri, or mobile file changed in task 1.1.

## 2026-09-17 — Web-02 task 1.2 case-summary publication

- Advanced the ASO/FRF projection contract to revision 4 with the frozen
  twelve-column case summary and practice-scoped expiring grant.
- Added the PGlite revision-6 migration, generation-4 namespace, exact Electric
  request, generic materializer target, and `Case` / `replica:cases` PEM
  bindings.
- Passed an over-wide synthetic row through real PGlite and proved forbidden
  fields did not materialize. The focused browser suite passed 28/28; ASO host
  projection tests passed 3/3; the mounted grant test passed 1/1; and the
  feature-enabled FRF gateway boundary passed 3/3 after exposing and correcting
  one stale revision-3 expectation.
- Production materializer adoption and durable real-clinical browser storage
  remain blocked by their existing gates. Web-02 selectors, Zustand view state,
  and React routes remain later tasks.

## 2026-09-17 — Web-02 task 1.3 case selectors and scoped Zustand state

- Added queue, detail, and intake selectors over the committed `replica:cases`
  list and normalized `Case` entities. They validate practice, list membership,
  exact lifecycle state, temporal values, and revision without inventing
  patient, payer, or surgeon display names.
- Added an identity/practice/epoch/view-scoped queue store for search, status
  filter, and selected case ID. Durable case rows remain in PEM.
- Initial focused tests passed 6/6. A controlled shared-store regression made
  the two-view isolation test fail with the second queue receiving the first
  queue's values. After restoring per-view ownership, the combined selector and
  scope suite passed 11/11; TypeScript and Oxlint passed.
- Product routes remain placeholders until Web-02 task 1.4.
## 2026-09-17 — Web-02 task 1.4 responsive case management

Mounted the browser case queue, case dashboard and intake editor over the committed case projection and authenticated case command/read APIs. Create, update and transition commands now wait for the PEM row before reporting success; uncertain results retain their command ID for lookup. Focused TypeScript, lint and 18 behavioral tests passed. Browser full-stack certification remains reserved for Web-17; no desktop or mobile source changed.

## 2026-09-17 — Web-02 task 2.1 focused review

- Foreign-practice sabotage failed 1/5 with the foreign row incorrectly `ready`; restoration passed 5/5.
- Review findings added a startup refusal for persistent plus experimental clinical materialization and full authorized-detail confirmation for case create/update. Uncertain reconciliation now preserves the submitted target. Both fixes have observed red-green tests.
- The focused browser suite passed 59/59 in 16 files; TypeScript and Oxlint passed. ASO projection passed 3/3, mounted grant 1/1, and FRF gateway 3/3.
- Artifact refinement passed 12/12 across 44 sources. The final distinct-model adversarial review returned PASS with 0 critical, 1 warning, and 0 suggestions; its sycophancy screen passed.
- Full browser scenario certification remains pending through Web-17. No Tauri or mobile implementation or certification ran.

## 2026-09-17 — Web-02 task 3.1 completion

- Confirmed nineteen production mount links from browser bootstrap through protected graph routes, case components/hooks/API, and the merged Axum case router.
- Updated the OpenSpec capability delta, web-case-to-letter architecture contract, and README verification claim to match the delivered browser boundary.
- The production web build completed after 2,345 modules. It retained non-fatal PGlite dependency and chunk-size warnings; no actual-browser claim was made.
- Final focused evidence remains 59/59 browser tests, TypeScript and Oxlint passing, ASO projection 3/3, mounted grant 1/1, FRF gateway 3/3, artifact-refiner 12/12, strict OpenSpec valid, and distinct-model adversarial PASS.
- Web-02 is ready to archive. Web-03 is next; Tauri and mobile remain deferred until Web-17 passes.

## 2026-09-17 — Web-03 task 1.1 eligibility

- Phase: Execute / runtime-architecture / web-case-to-letter / `web-03-administering-entity-resolution`, task 1 of 6.
- Confirmed Web-02 complete and archived, strict Web-03 OpenSpec validation passing, and the frozen browser HTTP, publication, fixture, authority, and invalidation contracts.
- Assigned task ownership for the additive rule schema and fixtures, shell-neutral resolver and server adapter, mounted browser routes, and the React/Zustand resolution panel.
- The generated child task summary's stale `HTTP/native` wording does not widen scope. OpenSpec and the architecture contract require browser HTTP only; Tauri and mobile remain deferred through Web-17.
- G-PIN and G-REV are satisfied. G-SYNC and G-DATA allow only focused synthetic memory-only browser qualification; production materializer adoption and persistent real-clinical browser storage remain blocked.
- No product source, schema, fixture, dependency, Tauri, or mobile file changed. The mounted browser still cannot resolve an administering entity, and the full case-to-letter scenario is not ready.

## 2026-09-17 — Web-03 task 1.2 resolution schema and fixtures

- Added server migration 2026090618 for practice-scoped administering entities, payer plans, delegation rules, five durable resolution states, and case resolution rows.
- Added directly loadable frozen fixtures for exact `resolved`, `missing`, `ambiguous`, `conflicting`, and `expired` outcomes and updated the manifest hashes and verifier.
- Fresh and populated-upgrade PostgreSQL probes passed. They proved deterministic classification, exact valid output, durable parked states, cross-practice source refusal, complete resolved-row enforcement, RLS, direct-role denial, local-input publication exclusion, migration rerun, checksum refusal/restoration, and cleanup.
- An ambiguous-to-conflicting fixture sabotage was rejected. The restored fixture verifier, Python compilation, targeted whitespace checks, and `cargo check -p aso-web-server` passed.
- The resolver service, command transaction, browser HTTP route, and responsive panel remain Web-03 tasks 1.3 and 1.4. No Tauri or mobile source changed.
2026-09-17 — Web-03 task 1.3 completed the shell-neutral administering-entity resolver, restricted PostgreSQL adapter, durable idempotent command/audit boundary, and monotonic invalidation token. Fresh and populated-upgrade AppServices/PostgreSQL probes passed for resolved, missing, ambiguous, conflicting, expired, retry, conflict, stale-revision, and controlling-input invalidation behavior. A first run exposed a missing synthetic member identifier in the frozen fixture; the fixture and lock were corrected. HTTP/React remain task 1.4; Tauri/mobile remain deferred through Web-17.

## 2026-09-17 — Web-03 task 1.4 browser resolution surface

- Mounted resolve/read/lookup routes in Axum and added independent gate-policy recognition for each route.
- Mounted a responsive shadcn resolution card in the case dashboard through a session-scoped Zustand hook and typed feature API. Evidence navigation remains locked for unresolved or parked states.
- Fresh and populated-upgrade disposable runs passed through the actual Axum router, AppServices, restricted PostgreSQL adapter, command lookup, reload, and foreign-practice refusal.
- Nineteen focused web tests, three focused Axum tests, TypeScript typecheck, lint, Rust checks, strict OpenSpec validation, and scoped diff checks passed.
- The complete actual-browser scenario remains Web-17. Tauri and mobile remain deferred.

## 2026-09-18 — Web-03 task 3.1 final review and completion evidence

- Froze 136 Web-03 sources at manifest digest `03f9035e699cb17bf8fb2bbeba1840b67fd46a23dc80773ca6744bc9239e3084`; all 136 current and snapshot hashes matched and the isolated artifact validator passed 17/17 checks.
- The final focused browser boundary suite passed 52/52 tests across thirteen files. TypeScript typecheck and lint passed. The mounted Axum case-detail authorization test, Rust check/formatting, strict OpenSpec validation, and fresh plus populated-upgrade PostgreSQL/AppServices probes passed.
- A fresh artifact critic and an independent judge each returned PASS with zero critical, major, or minor findings for the exact digest. The strict sycophancy screen scored 0.018, found only a low verbosity signal, and required no correction.
- The artifact state converged at iteration 17 with all 16 blocking constraints passed. Web-03 makes no full-browser or complete case-to-letter claim; Web-04 through Web-17 remain required. No Tauri or mobile implementation or certification ran.

## 2026-09-18 — Web-04 task 1.1 document-upload eligibility

- Confirmed Web-03 is canonically complete and archived, Web-04 strict OpenSpec validation passes, and the frozen Web-00 capability, route, error, revision, privacy, and fixture contracts are ready for implementation.
- Assigned the next additive migration and least-privilege command function to task 1.2, the shell-neutral upload service and bounded staged-byte store to task 1.3, and the mounted Axum multipart/read/lookup routes to task 1.4. React upload/status UI remains Web-05.
- G-PIN, G-DATA, and G-REV permit the server-authoritative upload boundary. Blocked PGlite materializer adoption does not apply because Web-04 publishes no bytes, page text, staging state, or new replica row. The existing Axum 0.8.8 dependency may enable its pinned `multipart` feature without a package-version change.
- The frozen fixture verifier passed all eleven checks. No implementation or broad integration test ran because task 1.1 changes no product source. Tauri and mobile remain deferred through Web-17.

## 2026-09-18 — Web-04 task 1.2 document upload schema and commit boundary

- Added server migration 2026090620 with bounded document metadata, processing
  states, case document-set revision, tenant- and identity-bound staging,
  immutable upload receipts, and least-privilege reserve, commit, abandon,
  metadata-read, and command-lookup functions.
- Fresh and populated-upgrade PostgreSQL probes passed. They proved migration
  rerun and checksum refusal, idempotency and conflict behavior, size,
  capability, and tenant refusal, rollback atomicity, queued commit, cleanup,
  metadata minimization, RLS, direct-role denial, human processor denial, and
  local-table publication exclusion.
- Retained three failed receipts. They exposed the staging lock's required owner
  `UPDATE` privilege, missing validator execute privileges inside the typed
  payload trigger, and an inherited upgrade comparison that counted the
  intentional additive revision token as legacy mutation. Each was corrected
  narrowly and the final fresh and upgrade runs passed.
- Rust formatting, `cargo check -p aso-web-server`, clippy, Python compilation,
  strict Web-04 OpenSpec validation, and targeted diff checks passed.
- DocumentStore writes, AppServices ingestion, multipart HTTP, React upload UI,
  and actual-browser certification remain later work. No Tauri or mobile source
  changed.

## 2026-09-18 — Web-04 task 1.3 bounded ingestion service

- Added shell-neutral upload/read/lookup operations, a restricted PostgreSQL
  adapter, content-addressed local storage writes, digest-guarded cleanup, and
  bounded PDF/plain-text inspection. `lopdf` 0.45.0 is pinned in
  `versions.toml`.
- Final fresh and populated-upgrade local integration receipts passed through
  AppServices, the restricted database functions, process restart, and the
  local DocumentStore. They cover idempotency, conflict, byte/page/type/digest
  refusal, tenant/capability/session refusal, cleanup, and PHI-free output.
- Focused store tests passed 4/4 after an observed parallel fixture-root
  collision was corrected with UUID isolation. PDF inspection tests passed
  2/2. Rust format/check/clippy, strict OpenSpec validation, Python compilation,
  and scoped diff checks passed.
- Multipart browser HTTP remains task 1.4. React upload/status and processing
  remain Web-05, and actual-browser end-to-end certification remains Web-17.
  No Tauri or mobile source changed.

## 2026-09-18 — Web-04 task 1.4 mounted browser HTTP

- Mounted the document upload, metadata read, and uncertain-command lookup
  routes in the production Axum browser router with exact multipart fields,
  route-specific limits, frozen errors, no-store responses, and independent
  Gate target authorization.
- Fresh and populated-upgrade local integration receipts passed through the
  actual router, verified session resolution, AppServices, restricted
  PostgreSQL functions, and local DocumentStore. Retry, conflict, integrity,
  anonymous, foreign-tenant, temporary-object, and PHI-output checks passed.
- The first focused route run exposed a test that assigned PDF parsing to the
  mock HTTP repository. Narrowing it to the route-owned MIME disagreement made
  the final document suite pass 6/6; the focused Gate suite passed 15/15.
- Rust format/check/clippy, strict OpenSpec validation, Python compilation, and
  scoped diff checks passed. Clippy exited 0 with the existing large-Response
  warning pattern.
- React upload/status UI and processing remain Web-05. Actual browser
  certification remains Web-17. No Tauri or mobile source changed.

## 2026-09-18 — Web-04 task 2.1 focused qualification and review

- Deliberate tamper and partial-commit controls went red and passed after byte-identical restoration. The final focused matrix passed Rust format/check/clippy, 4 document-store tests, 6 document-route tests, 15 Gate tests, strict OpenSpec validation, Python compilation, and scoped diff validation.
- The first isolated artifact critic found an object-publication cleanup gap, extensionless media-type loss, and three evidence defects. The adapter now acquires its finalize transaction before publication, cleans exact digest-matching objects on failure, reconciles expired staging at startup and before upload, and reads the authoritative database media type.
- Fresh and populated-upgrade local service runs proved post-write cleanup, clean retry, startup expired-stage reconciliation, and authoritative PDF and text reopening. Fresh and populated-upgrade mounted HTTP runs passed all expected browser boundary markers.
- The corrected Artifact Refiner package passed 11/11 checks over 66 current and frozen inputs. A repeat isolated artifact critic passed with zero findings; a distinct-model adversarial judge passed with zero critical findings; the strict anti-sycophancy score was 0.0.
- Web-05 retains canonical page-map and page-count materialization. Web-17 retains actual-browser end-to-end certification. No Tauri or mobile source changed.

## 2026-09-18 — Web-04 task 3.1 completion boundary

- Confirmed the production Axum router mounts upload, minimized metadata read, and command-result lookup and delegates them through `AppServices`. Retained fresh and populated-upgrade mounted HTTP and service results, the focused matrix, and both independent review outcomes.
- Expanded the Web-04 OpenSpec delta with the implemented input bounds, idempotency, conflict, recovery, mounted-route, privacy, and queued-processing contracts. Strict validation and scoped diff checks passed.
- Caller inspection found no React upload caller. Web-04 therefore completes the mounted browser service boundary only; Web-05 remains responsible for the rendered upload/processing status feature and canonical page materialization.
- Web-17 remains responsible for actual-browser case-to-letter certification. Tauri and mobile remain deferred.

## 2026-09-18 — Web-05 task 1.1 document-processing eligibility

- Confirmed Web-04 is complete and archived, Web-05 strict OpenSpec validation passes, and the frozen processing capability, service-principal, route, error, revision, privacy, and fixture contracts are eligible for browser-first implementation.
- Assigned task 1.2 to the replaceable processor, durable state transaction, and mounted internal job boundary; task 1.3 to the explicit `document_statuses` projection and PEM materialization; and task 1.4 to the responsive React upload/status feature with view-scoped Zustand state.
- G-PIN, G-DATA, G-REV, and the internal job-grant boundary permit the work. Browser qualification remains memory-only because the RA11c PGlite SQL materializer is still blocked from production adoption by its measured memory limit.
- The frozen fixture verifier passed all eleven checks. No implementation or broad integration test ran because task 1.1 changes no product source. Tauri and mobile remain deferred through Web-17.

## 2026-09-18 — Web-05 task 1.2 document processor lifecycle

- Added the shell-neutral service-principal processing command, replaceable
  bounded text/PDF processor, local page and command storage, exact retry, and
  queued/processing/ready/failed database transitions.
- Fresh and populated-upgrade local integration receipts passed through
  `AppServices`, the restricted PostgreSQL role, the local document store, and
  the actual processor. Ready, failure, deterministic page hash, retry,
  command-conflict, human-principal, and missing-job-grant checks passed.
- Retained failures exposed a missing narrow owner read, an invalid audit outcome,
  an unqualified pgcrypto call under a hardened search path, and an overly broad
  uniqueness handler. Each was corrected at the failing boundary.
- Processor tests passed 2/2. Focused Rust checks, formatting, Python compilation,
  strict OpenSpec validation, the frozen fixture verifier, and scoped diff checks
  passed.
- The production Kratos adapter does not mint a service principal. Web-05 task
  1.4 must mount a server-owned dispatcher before the browser path is complete.
  Projection, React status UI, full browser certification, Tauri, and mobile
  remain outside this task.
## 2026-09-18 — Web-05 task 1.3 document status projection

Completed projection revision 5 for the browser-first document lifecycle.
Added the case-scoped `aso.document_statuses` materialization, exact FRF shape,
PGlite revision 7/generation 5 table, `DocumentStatus` PEM binding, and timeline
join. Fresh and populated-upgrade PostgreSQL probes passed with current-source
hashes; 52 focused web tests, 24 replica-runtime tests, Rust projection/server
checks, and FRF identity/authorization/revocation checks passed. Page text,
object locations, parser output, and embeddings remain structurally absent.
The actual upload/status browser interface remains Web-05 task 1.4.

## 2026-09-18 — Web-05 task 1.4 mounted document intake UI

Mounted the browser document upload/status card in case intake. Added the exact
multipart client, session-scoped upload ownership and reconciliation, PEM status
selector, frozen error copy, responsive status cards, and authorized source
preview. Added additive migration 2026090623 so the case read supplies the
required document-set revision. Focused browser verification passed 45/45,
production build passed, and affected Rust tests passed 2/2, 9/9, and 6/6. The
known unrelated unavailable-storage lease test still fails when the full web
suite is invoked. Tauri and mobile remained deferred.

## 2026-09-18T15:49:48.526904+00:00 — Web-05 task 5 focused review

- Phase: Execute; child `runtime-architecture / web-case-to-letter`; change `web-05-document-processing-ui`; task 5/6.
- Tier 1 passed for fresh and upgrade document processing/status projection, focused web and Rust checks, exact forbidden-column sabotage/restore, and deterministic artifact validation.
- Defect found and repaired: populated revision-5 PGlite replicas could not add required case columns. Root cause was authoritative identifiers absent from older local rows. Revision 6 now cuts over by clearing synchronized rows and checkpoints before cold refetch.
- Defect found and repaired: the destructive cutover did not advance a stored generation already ahead of the static plan. `startsNewGeneration` now advances generation transactionally before destructive SQL.
- Security boundary repaired: default Compose published insecure raw Electric on host port 3000. Electric is now internal-only; browser reads cross Gate/FRF.
- Independent gpt-5.5 adversarial review returned PASS with no findings after repairs; anti-sycophancy score 0.0.
- Actual-browser end-to-end certification remains Web-17. Tauri and mobile remain deferred.

## 2026-09-18T15:57:21.518410+00:00 — Web-05 completion evidence

- Confirmed the current production mount chain from `/cases/:caseId/intake` through CaseIntake, DocumentIntake, typed upload HTTP, PEM status projection, Axum routes, PgGateRepository, and BoundedDocumentProcessor.
- Expanded the OpenSpec delta and architecture contract to match delivered lifecycle, privacy, job-authority, and reload behavior.
- Recorded the uncomfortable limit: Web-05 has no certified continuous scheduler or actual-browser upload-to-ready result; Web-16 and Web-17 own those proofs.
- Strict OpenSpec validation passed. No Tauri or mobile source changed.

## 2026-09-18 — Web-06 task 1 criteria catalog eligibility

- Phase: Execute; child `runtime-architecture / web-case-to-letter`; change `web-06-criteria-catalog-core`; task 1/6.
- Confirmed Web-03 and Web-05 dependencies complete and froze the Web-00 import/list/read/lookup contracts, `configure` authority, provenance rules, tenant publication shape, migration filename, task ownership, and deferred Tauri/mobile boundary.
- Strict OpenSpec validation passed. The frozen workflow fixture verifier passed 3 positive families, 4 negative controls, 96 disjoint command UUIDs, lifecycle/revision ownership, provenance, and manifest locks.
- No product code, schema, dependency pin, Tauri, or mobile source changed. Production still composes `UnavailableCriteriaRepository`; the full browser scenario remains unavailable until Web-06 implementation, Web-07 UI integration, downstream letter flow, and Web-17 browser certification complete.

## 2026-09-18 — Web-06 task 2 canonical criteria migration

- Added and registered server migration `2026090624_criteria_catalog.sql`. It creates the provenance-grade and canonical criteria runtime schema, migrates legacy policy criteria with stable IDs/hashes/effective ranges, rebinds evidence, protects the retained legacy table, and exposes a read-only compatibility view.
- Added the exact trusted `criteria_catalog` projection with RLS and explicit-publication protection. Criterion identity, provenance, text, and hash are immutable; overlapping payer/label validity ranges refuse.
- Current-source fresh and populated-upgrade PostgreSQL probes passed 21 and 29 checks. They covered checksummed rerun/refusal, stable evidence linkage, deterministic timestamps/hashes, exact projection columns, legacy-write refusal, canonical mutation refusal, overlap refusal, and cleanup.
- Rust check and clippy passed; clippy retained one pre-existing `chunks_exact_to_as_chunks` warning in `adapters/gate.rs:443`. Python compilation, strict OpenSpec validation, scoped diff checking, and evidence source-hash checks passed.
- No Tauri, mobile, React, Zustand, dependency pin, or `versions.toml` file changed. Production catalog repository and browser HTTP remain Web-06 tasks 3 and 4; the browser still cannot execute the full case-to-letter scenario.

## 2026-09-18 — Web-06 task 3 production criteria repository

- Added the shell-neutral criteria catalog command/read contract and wired the production `PgGateRepository` into `AppServices`; the unavailable criteria adapter is now test-only.
- Added and registered migration `2026090625_criteria_catalog_commands.sql` with restricted import/list/read/lookup functions, a local immutable command ledger, a serialized catalog revision, processed policy-document/page provenance, published and obtained tenant rules, audits, and correction by supersession.
- Fresh and populated-upgrade disposable PostgreSQL runs passed. Both exercised the actual `AppServices` and restricted runtime login and proved published visibility, obtained tenant scope, retry/lookup, conflicting and stale command refusal, grade laundering refusal, foreign source refusal, immutable original text, supersession, audits, and ledger immutability.
- Retained failures exposed an unqualified pgcrypto function under the hardened search path, a nondeferred materialized-catalog supersession foreign key, and a missing fixture search path. Each was repaired at the observed boundary before the passing runs.
- Rust check, test-target clippy, formatting, Python compilation, and scoped diff checks passed. Clippy retained the pre-existing `chunks_exact_to_as_chunks` warning in `adapters/gate.rs`.
- Browser HTTP catalog routes remain Web-06 task 1.4. No Tauri, mobile, React, Zustand, dependency pin, or `versions.toml` source changed.

## 2026-09-18 — Web-06 task 4 mounted criteria catalog HTTP

- Mounted the frozen catalog import/list/read/lookup routes in the production
  Axum router using the shell-neutral criteria DTOs and AppServices operations.
- Fresh and populated-upgrade disposable PostgreSQL runs passed through verified
  sessions, the actual router, restricted repository functions, and command
  lookup. Both emitted all eight required lifecycle markers.
- HTTP evidence covers exact retry, changed-command conflict, overlapping-range
  refusal, grade non-promotion, selected-practice scope, published visibility,
  and obtained-row foreign-practice exclusion.
- The initial test compile exposed that `ClinicalContext` cannot be cloned. The
  fixture was repaired to resolve authority from each synthetic identity.
- Tauri and mobile were not changed. Criteria selection UI remains Web-07 and
  complete actual-browser certification remains Web-17.

## 2026-09-19 — Local web demo Compose stack

- Phase: Execute; child `runtime-architecture / web-case-to-letter`.
- Added a default Docker Compose path that builds and starts PostgreSQL, SQLx and Kratos migrations, a synthetic demo identity and case, the restricted Axum API, Electric, Flint Gate, the realtime fabric, Redis, Iggy, and the Vite web application.
- The exact `docker compose up --build --wait` command passed from the isolated `aso-prior-auth-demo` project. Public-path verification returned login 200, session 200, case `DEMO-CASE-001`, and protected `cases` shape 200 containing the seeded row.
- PostgreSQL reported 30 successful SQLx migrations, one synthetic demo user, and one synthetic demo case. No real patient data was added.
- Fresh startup exposed and repaired duplicate bootstrap/migration column additions, Gate key ownership, and Gate projection revision/name drift. Tauri and mobile were not part of this demo stack.

## 2026-09-19 — Web case-to-letter demo completion

The composed web stack now initializes a synthetic case, processes uploaded text through the bounded document worker, records cited evidence, completes four surgeon affirmations, generates and reviews a cited letter, approves it, and applies a versioned surgeon signature. The public landing, authentication frame, responsive application shell, major workflow views, and later packet/custody/peer-review previews use the ASO brand and prototype system. Local browser verification covered desktop and mobile; no real patient data was used.

## 2026-09-19 — document-assembly agent landed beside the active child

`da-01-document-assembly-agent` added crates/clinical-docs and crates/aso-document-assembly with the D-1 decision. The web-case-to-letter child (web-10/web-14 "deterministic composer") predates it. Course correction is in docs/handoff/codex-document-assembly-adjust.md; findings in docs/handoff/document-assembly/FINDINGS-2026-09-19.md. Not run on this machine: cargo test --workspace, audit.sh check 2 (no cargo/pnpm in the Cowork VM) — T2 Build-only until run here.

## 2026-09-19 — Revision 12 implementation in progress

Web layout repair passed desktop/mobile/full-viewport/form-preservation and independent artifact review. FRF transient502 recovery passed in the browser. Repeat demo initialization preserved revisions and identity. Migration0637 applied through checksum-verified migrator; SQL stale/matching regression passed; browser policy selection, evidence r2 and clinical-appeal draft generation returned200. KBD plan12 registered without reset; completed statuses preserved. Host document generation contracts/source validation/digest binding passed5 focused tests, with a failing source-quote mutation and restored green run. New inference/assembly adapters compile but are not yet wired into runtime. SQL task persistence, protocol adapters, shared UI integration, corrected response classification, Compose integration and final certification remain underway. No full agent certification claim.

## 2026-09-19 — Web case-to-letter revision 12 complete

- Phase: Execute; child `runtime-architecture / web-case-to-letter` is complete at 22/22 changes. Parent implementation is 57/61; the four remaining changes are the explicitly deferred native phases.
- Commit `07208d1` freezes the browser-first implementation. A second ledger commit records the final certification transition.
- Local evidence passed: full Rust workspace, 689 web tests with mounted suites run separately, six architecture checks, mounted replica/browser campaigns, deterministic task/persistence/submission scenarios, repeat initialization, A2A/MCP/MCP App smoke, and strict validation for all 19 active OpenSpec changes.
- The fixture verifier passed three standalone positive families and four isolated negative controls. Actual browser evidence covered generation, review, approval, signing, submission acknowledgement, desktop/mobile overflow, and reduced motion.
- The public demo remains synthetic. Production patient-data inference remains disabled pending provider qualification.

## 2026-09-19 — web case-to-letter browser proof

- Phase: Execute, `runtime-architecture > web-case-to-letter`, plan revision 12.
- Browser evidence: initial request, corrected resubmission, and clinical appeal
  with fresh four-part surgeon affirmation each reached full payer
  acknowledgement against the local Compose stack.
- Observed and repaired the missing denial/response-mode case progression with
  additive migration 2026090647; the signing boundary remains narrow.
- Added a reusable Playwright video runner using only synthetic demo data.
- Verification: Rust workspace Passed; web 689 tests Passed with two existing
  fixture-gated skips; SQL determination/response/signing regressions Passed;
  architecture audit Passed 6/6.
