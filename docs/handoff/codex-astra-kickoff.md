# Codex kickoff — Prior Authorization Workbench

> **SUPERSEDED for the runtime phase.** Task A is complete. To execute the
> `runtime-architecture` phase, use
> [codex-runtime-architecture-execute.md](codex-runtime-architecture-execute.md)
> instead. This file is retained for the Task A record and its Astra rationale.

Paste the block below into Codex running `gpt-6-astra`. It is structured for
Astra's documented behaviours: it grants autonomy explicitly (the model asks
more than its predecessors), sets instruction precedence (it is sensitive to
`AGENTS.md` and skills), fixes the writing style, and gives a stop condition.

Set reasoning effort **high** through the API. Do not ask for it in prose.

**Revised 2026-09-06** after the application was rendered in a browser for the
first time and after `docs/architecture/application-runtime-architecture.md`
landed. Both change what the next agent should do.

---

```
GOAL
Two pieces of work, in order. Task A closes the `web-ui-architecture` phase.
Task B is the next phase: implement the runtime architecture.

CONTEXT
Read first, in this order:
  1. AGENTS.md — especially the final section, "Working as GPT-6 Astra"
  2. docs/architecture/README.md — the decision index, reconciled 2026-09-06
     across all five project directories. Read this BEFORE any ADR: it tells
     you which are current and which are historical.
  3. docs/architecture/application-runtime-architecture.md (455 lines) —
     sections 13 (seven-row cross-repository sequence) and 14 (19-row
     acceptance matrix) are Task B's work items.
  4. docs/architecture/react-ui-component-architecture.md (404 lines) — the
     component/runtime contract. Its section 11 stage table is the PRESENTATION
     view of the same sequence; see the coupling table below.
  5. docs/architecture/react-ui-component-architecture-review.md — its review
     receipt. Five judge passes, zero critical findings, nine dispositions.
     This is the standard for what "reviewed" means in this project.
  6. .kbd-orchestrator/phases/web-ui-architecture/reflection.md — all SIX
     addenda. This is the honest record, not a status report.
  7. .prometheus/gotchas.md and .prometheus/decisions.md
  8. The ADRs — but per the README, note the supersessions:

       ADR-001 … ADR-005   Accepted, current
       ADR-006             SUPERSEDED BY ADR-008
       ADR-007             SUPERSEDED BY ADR-009
       ADR-008             Accepted target — shared runtime, state, sessions
       ADR-009             Accepted target — authorized replicas and updates

     ADR-006 framed the boundary as "entity graph versus Zustand". ADR-008
     records why that obscured things: PEM's normalized graph IS a Zustand
     vanilla store, so the distinction was never store technology but
     ownership. ADR-008's ownership table line 32 names per-view interaction
     state (selection, expansion, filter) as a legitimate Zustand store — which
     is what web/src/shared/store/interaction-store.ts already holds.

     "Accepted target design" means a decision was taken. It is NOT a runtime
     test result and does not mean the behaviour exists.

State of play, verified 2026-09-06. All eight changes (W1-W8) are implemented,
all seven goals MET. Right now: 49/49 tests, typecheck 0, lint clean, build
green, `bash scripts/audit.sh` 6/6 PASS. Stack runs: db and electric healthy,
kratos and flint-gate up. The app RENDERS — light and dark, 320-1440 with no
overflow, AA contrast sampled from rendered pixels, 12/12 focusable elements
showing a focus ring.

THE APP USED TO RENDER A BLANK PAGE, and every check above was green while it
did. `main.tsx` shipped `session={null}`, so `GraphProvider` sat in its
fallback forever. Six defects followed, none catchable by any test:

  1. session={null} — nothing rendered at all
  2. PGlite died under Vite pre-bundling: "Invalid FS bundle size: 637 !==
     6295316". Needs optimizeDeps.exclude — see vite.config.ts
  3. theme.css generated ZERO utilities. Tailwind 4 only processes @theme in
     files reachable from the `@import "tailwindcss"` CSS graph, and it was
     imported from JavaScript. Every brand variable resolved empty
  4. shadcn's --accent shadowed the brand #A85417 through an indirect var().
     The eyebrow rendered white on white. shadcn's scale is now `ui-accent` /
     `ui-muted`; the bare names belong to tokens.toml
  5. nested <main> landmark
  6. no visible keyboard focus on any element

Treat that list as calibration: a green suite says the code runs, not that the
application works. Open a browser.

TASK A — DONE 2026-09-06. Read the results, do not redo the work.

  Both gates ran. See:
    .kbd-orchestrator/phases/web-ui-architecture/review/a1-adversarial-review.md
    .kbd-orchestrator/phases/web-ui-architecture/review/a2-screen-reader.md
    .refiner/artifacts/web-ui-architecture/refinement_log.md

  Certification is COMPLETE. Publication is BLOCKED, and the reason is the
  first item of Task B below.

  THE FINDING THAT MATTERS: the web READ PATH IS DISCONNECTED.
  `createEvidenceSyncAdapter` — the sole tenant boundary, in a file that says
  of itself that it "fails closed" and calls SYNC_COLUMNS "the PHI boundary" —
  has exactly one occurrence in the codebase: its own definition. Nothing
  writes rows into PGlite. Every case renders "No evidence has been recorded
  for this case." regardless of the chart. `audit.sh` prints PASS because its
  six checks grep for the presence of strings, not for a call graph.

  Read the critic's closing paragraph in a1-adversarial-review.md before you
  trust any comment in this codebase. Its pattern: controls are written down
  precisely and confidently, and in the three most important cases the thing
  being described is not wired to anything.

TASK A — ORIGINAL SCOPE, now complete (kept for reference)

A1. Certification is BLOCKED. Run artifact-refiner QA and adversarial-review
    across W1-W8. Neither has ever run; `.refiner/` and `review/` do not exist
    and every change is pending_review. The project's anti-sycophancy rule says
    the model that produced the work is not the sole judge of it. Act on what
    review finds, then set the dimension with `prometheus kbd completion set`.

A2. Screen-reader pass on the evidence timeline. Each evidence state must
    announce its LABEL — "Met", "Not met", "Not documented" — because colour is
    reinforcement and never the signal (ADR-003). The three states also carry
    distinct SHAPES (circle, square, diamond); confirm the shape marker is
    aria-hidden so it is not announced twice.

TASK B — implement the runtime architecture

TWO documents, ONE sequence. Do not read them separately.

  application-runtime-architecture.md  section 13  seven-row cross-repository order
  react-ui-component-architecture.md   section 11  six-stage UI sequence

The UI document states the coupling itself: "Runtime section 13 order numbers
refer to the seven-row cross-repository sequence." Every UI stage is blocked on
specific runtime orders:

  UI stage 2  product foundation, live auth   <- runtime orders 1, 2
  UI stage 3  reference slice                 <- runtime orders 2, 3, 4
  UI stage 3  native claim                    <- additionally order 5
  UI stage 4  clinical views                  <- orders 1, 3, 4
  UI stage 5  supporting views                <- orders 1-4 + credential services
  UI stage 6  release                         <- orders 6, 7

READ THIS TWICE: the UI document names the reference slice as "the evidence
timeline with annotations and authorized source preview". That is W7 — already
built as presentation, sitting on runtime orders 2-4 that DO NOT EXIST. UI
stage 3 before runtime orders 2-4 rebuilds the exact defect that closed the
previous phase. Do the runtime orders first.

The UI document also draws the line the previous phase kept crossing: "Inert
presentation work may proceed with synthetic fixtures while runtime work is
pending, but its status is visual/contract-only. Do not let a successful fixture
demo certify replication or clinical commands."

Nothing in either document is implemented or certified. "Accepted target
design" is a decision, not a test result.

ASYMMETRY WORTH KNOWING: the UI document has a review receipt recording five
judge passes and zero critical findings. The runtime document has none, and its
section 14 acceptance matrix has never been run by anyone. Treat the runtime
document as less settled than the UI one, not more.

Start a new KBD phase. `/kbd-new-phase runtime-architecture`, then assess and
plan against that document rather than inventing scope.

THREE FINDINGS CARRIED FROM THE ADVERSARIAL REVIEW — these are Task B's first
work items, not background:

  1. The read path is disconnected (CRITICAL). Sections 7 and 8 of the runtime
     document are the design for it. Publication is blocked on this.
  2. `GraphProvider` renders ONE fallback for three distinct states — no
     session, store still opening, and error. In a production build
     `resolveStartupSession()` returns null, so the app shows "Loading..."
     forever: the same defect that already shipped once. There are also NO
     public routes — every route sits under AppShell behind GraphProvider,
     which ADR-005 requires not to be the case for login and recovery.
     Sections 7 and 9.
  3. `startLocalFirstGraph` returns a `LocalFirstGraphRuntime` that
     `graph-provider.tsx` discards. Section 7's hydration protocol depends on
     retaining it.

Three further findings from this session that the document should be read
against:

  - Its evidence table says "web/src/main.tsx supplies a null session". THAT IS
    NOW FIXED — see web/src/app/providers/dev-session.ts, gated on
    import.meta.env.DEV with a runtime assertion. Update the doc's baseline.

  - Its observation that graph-provider.tsx "does not await or retain the
    local-first runtime" IS STILL TRUE and still a defect. `startLocalFirstGraph`
    returns a `LocalFirstGraphRuntime` and web/src/app/providers/
    graph-provider.tsx discards it. Section 7 (startup and hydration) depends
    on retaining it. Fix this early.

  - PEM MUST BE 4.0.0 ACROSS THE BOARD. entity-graph-react@4.0.0 peer-requires
    entity-graph-core ^4.0.0, but nothing declared core directly and pnpm
    resolved 3.2.0 — a second copy of the graph one major behind the hooks
    wrapping it, with every gate still green. Fixed 2026-09-06 by adding
    "@prometheus-ags/entity-graph-core": "4.0.0" as a direct dependency.
    Any transitive resolution below 4.0.0 is a DEFECT, not a warning. Verify
    with: node -p "require('@prometheus-ags/entity-graph-core/package.json').version"

  - versions.toml pins are CLOSED as of 2026-09-06. Both packages agree across
    versions.toml, web/package.json and node_modules at 4.0.0. Note that
    package.json now uses EXACT specifiers, not carets — a caret against an
    exact pin is itself a contradiction of that file. Do not loosen them.
    versions.toml remains deny-listed for agent edits.

The document's own sequencing puts the server contract first (step 1: verified
session/membership, privacy-approved replica schema, clinical command
transport). Respect that order. Section 3 already records this project's live
finding that Electric cannot serve views — the base-table plus denormalized
practice_id path is settled, so do not relitigate it.

CONSTRAINTS
- Twelve of thirteen routes are `RoutePlaceholder` BY DESIGN. Task B is runtime
  plumbing, not new screens. Adding a fourteenth screen before the first
  carries real data multiplies an unverified pattern.
- Four rules do not bend, each with an ADR and an audit check: three evidence
  states (met/gap/void, never two); clinical authority checked at three
  independent layers; one design-token source; no query cache. If a task seems
  to need one weakened, stop and say so. ADR-001's no-cache rule survives the
  supersessions intact — PEM's incremental-query ceiling note is a dated v2
  performance record, NOT a mandate to add a cache (README, "Other project
  directories").
- Never write real patient data into a fixture, test, log, or commit.
- web/src/theme.css and mobile/lib/core/theme/tokens.dart are GENERATED. Edit
  assets/templates/design-tokens/tokens.toml, then run
  `bash scripts/gen-design-tokens.sh .`
- `realtime-fabric` is behind `profiles: ["realtime"]` deliberately — it needs
  15 env settings and four more services (iggy-server, keto, keto-migrate,
  surrealdb) and nothing consumes it. Section 3 of the runtime doc proposes an
  Electric shape facade there; that is NEW work, not wiring up what exists.
- Build Rust services ONE AT A TIME. Two concurrent release builds exhaust
  memory on this machine and get killed.
- Postgres runs on host port 55432 (a native postgresql@16 holds 5432). See
  the gitignored .env. Services reach it as db:5432 internally.

INSTRUCTION PRIORITY
Operator instruction > AGENTS.md > any skill > your default. If a skill or a
rule makes you pause or leave work unfinished, name the file, quote the line,
and explain how it applies. A pause without a citation is an unexplained stop.

AUTONOMY
Bias to action. Proceed on the most reasonable reading and state your
assumption. Ask only when two readings lead to genuinely different work, or
before something destructive or hard to reverse. Finish the authorized work
first so any question you do ask attaches to a concrete, reviewable result.
Do not add unsolicited warnings or compliance checklists for hypothetical risk;
the PHI and clinical-authority rules are not hypothetical, so apply those
exactly.

VERIFICATION
Tier per .claude/rules/typescript.md. Do not write tests that mirror the
implementation. DO write one when it guards a rule no audit check covers, and
prove it fails: break the rule, watch it go red, revert.

Test at the level where the rule can actually break. Two measurements from this
project:
  - Changing `countStates(entries)` to `countStates(visible)` left 18/18 green
    because the tests exercised functions, not wiring. Only a rendering test
    caught it.
  - Every gate was green while the application rendered a blank page.

OPEN A BROWSER for anything user-facing. Section 14 of the runtime document is
an acceptance matrix of runtime scenarios — cold start, account switch during
hydration, two tabs with the leader closing, revocation mid-stream. Those are
not unit-testable from jsdom.

DELEGATION
Parallelize genuinely independent work — the review dimensions in A1, the
acceptance-matrix rows in Task B that touch different repositories. Do not
delegate steps that depend on each other. You reconcile conflicting subagent
findings and own the final answer.

OUTPUT
Clear paragraphs. Lists only for genuinely parallel items, tables only for
comparison. State the result first, then the evidence. Paste the command and
its actual output; "looks correct" is not a result. Avoid "delve", "leverage",
"it's worth noting", "Bottom Line:", and "X, not Y" framing.

Report results in exactly four words: Passed, Build-only, Blocked, Failed.
Only the first means finished. A check that could not run is unverified — say
which claims are therefore unproven.

STOP CONDITION
Task A is COMPLETE — certification is COMPLETE and web-ui-architecture has been
reflected on (five addenda). Do not redo it.

Task B is a full phase: done when its own plan's exit criteria pass, not when
the runtime document has been read. Its first exit criterion is that a real row
reaches a rendered screen — the read path being connected is what unblocks
publication.

Finalization standard, set by the UI document's own receipt: an isolated
adversarial critic, an independent judge, explicit disposition of every finding,
and deterministic checks. A document that has not been through that is not
finished, whatever its prose claims.
```

---

## Why the prompt is shaped this way

| Astra behaviour (OpenAI guidance) | What the prompt does |
|---|---|
| Asks more often than predecessors; may stop where you expect it to persist | AUTONOMY grants explicit permission to assume and continue, and narrows asking to two cases |
| More sensitive to `AGENTS.md` and skills; may pause on conflicting guidance | INSTRUCTION PRIORITY fixes the order and requires a citation for any pause |
| Detailed, list-heavy, formatted prose by default | OUTPUT specifies paragraphs, and names the phrases to avoid |
| Delegates less than a harness may want | DELEGATION names what is parallel here |
| Over-tests small changes | VERIFICATION points at the tier ladder and bans mirror tests |

`AGENTS.md` was audited on 2026-09-06 as OpenAI's guide strongly recommends. It
holds six stop-directives. All are legitimate and none were removed; the
"Working as GPT-6 Astra" section resolves how they interact with bias-to-action
so the model does not read a safety rule as a licence to stop early.

## What changed in this revision

The previous version told Codex the app had never been rendered and made that
Task 2. It has now been rendered, and six defects were found and fixed in the
process — so the prompt carries that list as calibration instead, and the
browser instruction moved into VERIFICATION where it applies to all work.

Task B is new: `application-runtime-architecture.md` landed 2026-09-06 and is
the next phase. Three of its stated baselines were checked against the code
this session; one is now stale, one is still an open defect, and one (the PEM
version pair) was fixed here.
