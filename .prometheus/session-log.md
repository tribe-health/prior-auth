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
