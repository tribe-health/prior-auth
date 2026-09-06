# Codex execution prompt — `runtime-architecture` phase

Paste the fenced block into Codex running `gpt-6-astra` at the repository root
`/Users/gqadonis/Projects/TribeHealth/kevin/prior-auth`.

Set reasoning effort **high** through the API. Do not ask for it in prose.

Open `prior-auth.code-workspace` first — this phase spans five repositories and
four of them are siblings under `/Users/gqadonis/Projects/prometheus/`.

The previous phase (`web-ui-architecture`) is closed: implementation, evidence
and certification COMPLETE, publication BLOCKED. This prompt is what unblocks it.

---

```
GOAL
Implement the runtime architecture so a real clinical row reaches a rendered
screen through an authorized path. That single outcome unblocks publication of
the previous phase and is the phase's first exit criterion.

Start by creating the phase:

    /kbd-new-phase runtime-architecture

then /kbd-assess and /kbd-plan against the documents below. Do not invent
scope — both specs already carry sequences, and they are the plan.

CONTEXT — read in this order, before planning

  1. AGENTS.md, especially the final section "Working as GPT-6 Astra".

  2. docs/architecture/README.md — the decision index, reconciled across all
     five repositories. Read it BEFORE any ADR. It tells you which decisions
     are current and which are historical:

         ADR-001 … ADR-005   Accepted, current
         ADR-006             SUPERSEDED BY ADR-008
         ADR-007             SUPERSEDED BY ADR-009
         ADR-008             Accepted target — shared runtime, state, sessions
         ADR-009             Accepted target — authorized replicas and updates

     "Accepted target design" records a decision. It is NOT a runtime test
     result and does not mean the behaviour exists.

  3. docs/architecture/application-runtime-architecture.md (455 lines).
     Section 13 is a seven-row cross-repository sequence. Section 14 is a
     19-row acceptance matrix. Section 7 contains the startup state machine you
     will implement first.

  4. docs/architecture/react-ui-component-architecture.md (404 lines).
     Section 11 is a six-stage UI sequence. It is the PRESENTATION view of
     section 13's order, not an independent plan.

  5. docs/architecture/react-ui-component-architecture-review.md — its review
     receipt: five judge passes, zero critical findings, nine dispositions.
     This is the standard for what "reviewed" means in this project.

  6. .kbd-orchestrator/phases/web-ui-architecture/reflection.md — SEVEN addenda.
     The honest record of the previous phase, including what it got wrong.

  7. .kbd-orchestrator/phases/web-ui-architecture/review/a1-adversarial-review.md
     Read the closing paragraph before you trust any comment in this codebase.

  8. .prometheus/gotchas.md and .prometheus/decisions.md

TWO DOCUMENTS, ONE SEQUENCE

The UI document states the coupling itself: "Runtime section 13 order numbers
refer to the seven-row cross-repository sequence." Every UI stage is blocked on
specific runtime orders:

    UI stage 2  product foundation, live auth  <- runtime orders 1, 2
    UI stage 3  reference slice                <- runtime orders 2, 3, 4
    UI stage 3  native claim                   <- additionally order 5
    UI stage 4  clinical views                 <- orders 1, 3, 4
    UI stage 5  supporting views               <- orders 1-4 + credential services
    UI stage 6  release                        <- orders 6, 7

The UI document names the reference slice as "the evidence timeline with
annotations and authorized source preview". That already exists as presentation
— and its read path is disconnected. UI stage 3 before runtime orders 2-4
rebuilds the exact defect that closed the previous phase.

Do the runtime orders first.

WHY THIS PHASE EXISTS — the defect, stated precisely

    $ grep -rn "createEvidenceSyncAdapter" web/src
    web/src/shared/sync/electric-shapes.ts:131:export function createEvidenceSyncAdapter(...)

One occurrence: its own definition. Nothing writes rows into PGlite —
graph-provider.tsx:78 runs the schema and stops. So electric-shapes.ts, a file
that says of itself that it "fails closed" and calls SYNC_COLUMNS "the PHI
boundary", is never constructed and never transmitted. readTimeline queries five
permanently empty tables, and every case renders "No evidence has been recorded
for this case." regardless of the chart.

scripts/audit.sh prints PASS on this, because its six checks grep for the
presence of strings, not for the existence of a call graph. 57 tests, typecheck,
lint and build were all green with the read path disconnected.

THREE CARRIED DEFECTS — verified present 2026-09-06, with line numbers

  D1. The sync layer has no callers.
      web/src/shared/sync/electric-shapes.ts:131
      Runtime document sections 7 and 8. Publication is blocked on this.

  D2. web/src/app/providers/graph-provider.tsx:82 calls
      startLocalFirstGraph({...}) and DISCARDS its return value.
      It returns a LocalFirstGraphRuntime. Section 7's hydration protocol
      depends on retaining it — you need the handle to cancel hydration, drain
      persistence and tear down on identity change.

  D3. graph-provider.tsx:102-104 renders ONE fallback for three distinct states:

          if (!session) return <>{fallback ?? null}</>;
          if (error)   return <>{onError?.(error) ?? null}</>;
          if (!runtime) return <>{fallback ?? null}</>;

      In a production build resolveStartupSession() returns null, so the app
      shows "Loading…" forever — the same defect that already shipped once.
      There are also NO public routes: every route in app-routes.tsx is a child
      of AppShell behind GraphProvider, which ADR-005 and runtime section 7
      both require not to be the case for login and recovery.

FIRST WORK ITEM — runtime order 1, then 2-4

Runtime section 13 puts the server contract first, and that ordering is not
negotiable: "Define verified session/membership contract, privacy-approved
replica schema and clinical command transport. Prove unauthorized users cannot
broaden a shape or clinical action."

Then orders 2-4 give you the read path: the authorized Electric facade, a
scoped and cancellable PEM lifecycle, exclusive worker database ownership, real
table materialization, and coherent graph hydration.

Implement section 7's startup state machine as the concrete shape of orders
3-4. It is specified as a stateDiagram with these states, and the transitions
are the contract:

    DetectEnvironment -> CheckingSession
    CheckingSession   -> Anonymous | SessionUnavailable | OpeningReplica
    OpeningReplica    -> Migrating -> Hydrating -> CatchingUp -> Ready
    CatchingUp        -> OfflineLimited
    Ready             -> Quiescing (logout, account or practice change)
    Migrating         -> RecoveryRequired

Anonymous and SessionUnavailable are DIFFERENT states and must render
differently. That distinction is D3's fix.

WHAT IS ALREADY SETTLED — do not relitigate

  - Electric CANNOT serve a Postgres view. Measured against a live stack:
    GET /v1/shape?table=aso.sync_cases -> 400 "does not exist";
    ?table=aso.cases -> 200 as a control. A view emits no WAL so it can never
    join a publication; materialized views fail identically and Postgres
    refuses them outright. Runtime section 3 records this.

  - The tenant boundary is the denormalized, trigger-forced practice_id column
    (docker/bootstrap/15-denormalize-practice-id.sql). Seven trigger tests pass,
    including a caller supplying a FALSE practice_id being overwritten, and a
    direct UPDATE of practice_id being forced back.

  - The PHI boundary is the per-shape `columns=` projection. Verified against a
    canary row: an unprojected shape shipped author_name, patient_id and
    storage_uri; the projected shape returned the same row with only the listed
    columns. That projection is currently never transmitted — see D1.

  - docker/bootstrap/20-electric-sync-views.sql is SUPERSEDED as the sync path
    and kept only as documentation plus a PHI assertion over itself.

  - PEM is 4.0.0 across the board, pinned in versions.toml AND declared with
    EXACT specifiers in web/package.json. Do not loosen them to carets: a caret
    against an exact pin contradicts the pin file. versions.toml is deny-listed
    for agent edits.

CONSTRAINTS

  - Four rules do not bend, each with an ADR and an audit check: three evidence
    states (met/gap/void, never two); clinical authority checked at three
    independent layers; one design-token source; no query cache. If a task
    seems to need one weakened, stop and say so. ADR-001 survives the
    supersessions intact — PEM's incremental-query ceiling note is a dated v2
    performance record, NOT a mandate to add a cache.

  - Neither a local SQL write nor a Zustand action can affirm a gate or sign a
    letter. Clinical commands go to the Axum API, which reaches AppServices and
    Postgres. The Postgres trigger was OBSERVED refusing an administrator at
    bootstrap: "user a0000000-…-0002 may not affirm the surgeon gate;
    affirm_gate is a clinical capability."

  - Never write real patient data into a fixture, test, log or commit.

  - web/src/theme.css and mobile/lib/core/theme/tokens.dart are GENERATED. Edit
    assets/templates/design-tokens/tokens.toml, then run
    bash scripts/gen-design-tokens.sh .

  - Twelve of thirteen routes are RoutePlaceholder BY DESIGN. This phase is
    runtime plumbing, not new screens.

  - realtime-fabric is behind profiles: ["realtime"] because it needs 15 env
    settings and four more services and nothing consumes it. Runtime section 3
    proposes an Electric shape facade there — that is NEW work, not wiring up
    what exists.

  - Build Rust services ONE AT A TIME. Two concurrent release builds exhaust
    memory on this machine and get killed.

  - Postgres runs on host port 55432; a native postgresql@16 holds 5432. See
    the gitignored .env. Services reach it as db:5432 internally.

ENVIRONMENT

    docker compose up -d          db, electric, kratos, flint-gate
    pnpm --dir web dev            Vite on 5173/5174

Verify the stack before assuming a failure is yours:

    docker compose ps
    docker compose exec -T db psql -U flint -d flint -tAc "select count(*) from information_schema.tables where table_schema='aso'"    # 60

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

VERIFICATION — the lesson of the previous phase

Tier per .claude/rules/typescript.md. Do not write tests that mirror the
implementation. DO write one when it guards a rule no audit check covers, and
prove it fails: break the rule, watch it go red, revert.

Test at the level where the rule can actually break. Three measurements from
this project, each of which passed every gate:

  - Changing countStates(entries) to countStates(visible) left 18/18 green
    because the tests exercised functions, not wiring.
  - Every gate was green while the application rendered a BLANK PAGE.
  - Every gate was green while the read path had NO CALLERS.

So: for anything user-facing, OPEN A BROWSER. For anything structural, ask
whether the thing you built has a caller. `grep -rn "<yourNewExport>" web/src`
and count the occurrences — if the answer is 1, you have built the same defect
again.

Runtime section 14 is a 19-row acceptance matrix of scenarios that are not
unit-testable from jsdom: cold start logged-out and logged-in, account switch
during hydration, two tabs with the leader closing, revocation mid-stream,
crash between data and checkpoint, expired Electric handle. Those are the real
exit criteria.

DELEGATION
Parallelize genuinely independent work — acceptance-matrix rows touching
different repositories, the five repos' source inventories. Do not delegate
steps that depend on each other. You reconcile conflicting subagent findings
and own the final answer.

OUTPUT
Clear paragraphs. Lists only for genuinely parallel items, tables only for
comparison. State the result first, then the evidence. Paste the command and
its actual output; "looks correct" is not a result. Avoid "delve", "leverage",
"it's worth noting", "Bottom Line:", and "X, not Y" framing.

Report results in exactly four words: Passed, Build-only, Blocked, Failed.
Only the first means finished. A check that could not run is unverified — say
which claims are therefore unproven.

STOP CONDITION
The phase is done when its own plan's exit criteria pass. Its FIRST exit
criterion is concrete and testable: a real clinical row, stored in Postgres,
reaches a rendered screen through an authorized shape, scoped to its practice,
with PHI columns absent from the wire. Demonstrate it in a browser with the
network payload shown.

Then run the two review gates before /kbd-reflect — artifact-refiner against
.kbd-orchestrator/constraints.md, and an adversarial review by a fresh-context
critic that has not seen your work. The previous phase skipped both and shipped
a disconnected read path with every gate green. Do not repeat that.
```

---

## Why the prompt is shaped this way

| Astra behaviour (OpenAI guidance) | What the prompt does |
|---|---|
| Asks more often; may stop where you expect it to persist | AUTONOMY grants explicit permission to assume and continue, narrowing asking to two cases |
| Sensitive to `AGENTS.md` and skills; may pause on conflicting guidance | INSTRUCTION PRIORITY fixes the order and requires a citation for any pause |
| Detailed, list-heavy, formatted prose by default | OUTPUT specifies paragraphs and names the phrases to avoid |
| Delegates less than a harness may want | DELEGATION names what is genuinely parallel here |
| Over-tests small changes | VERIFICATION points at the tier ladder, bans mirror tests, and redirects effort to the acceptance matrix |

## What this prompt deliberately does not do

It does not restate the two architecture documents. They are 859 lines of
reviewed specification with their own sequences, and summarizing them into a
prompt would create a third, lossier source. The prompt's job is to say which
document governs what, in which order, and which three defects are already
known — then get out of the way.

It also does not assign the whole seven-row sequence. Runtime orders 1 and 2
belong to server and gateway work across `flint-gate`, `flint-forge` and
`flint-realtime-fabric`; a single agent starting there without the operator's
sequencing decision would be guessing. The prompt names the first work item and
the first exit criterion, and lets the plan stage do the rest.
