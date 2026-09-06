# A1 — Adversarial review of W1–W8

**Date** 2026-09-06 · **Method** fresh-context critic, no generation history,
judging the artifact alone against ADR-001…007.
**Verdict** **DEFECTS FOUND — 2 CRITICAL, 3 HIGH, 3 MEDIUM, 1 LOW.**

Every finding below was independently reproduced before being acted on.

## The pattern the critic named

> "This codebase is unusually good at *writing down* controls and unusually
> weak at *connecting* them. Every dangerous seam carries a comment explaining
> why it is safe, citing an ADR, often citing a measurement with a date — and
> in the three most important cases the thing being described is not wired to
> anything."

That is correct and it is the finding that matters. `audit.sh` greps for the
*presence of strings*, not the existence of a call graph, so it prints PASS on
an application whose entire read path is disconnected.

## CRITICAL 1 — the sync layer is dead code. NOT FIXED; it defines the next phase.

```
$ grep -rn "createEvidenceSyncAdapter" web/src
web/src/shared/sync/electric-shapes.ts:131:export function createEvidenceSyncAdapter(...)
```

One occurrence: its own definition. Nothing writes rows into PGlite —
`graph-provider.tsx:78` runs the schema and stops. No `VITE_ELECTRIC*` variable
exists.

So `electric-shapes.ts` — which says of itself that it "**fails closed**" and
calls `SYNC_COLUMNS` "**the PHI boundary**" — is never constructed and never
transmitted. `readTimeline` queries five permanently empty tables, and every
case renders *"No evidence has been recorded for this case."* regardless of the
truth. That is the exact false-negative the codebase works hardest elsewhere to
prevent.

**Not fixed here, deliberately.** Wiring the read path is the substance of
`application-runtime-architecture.md` sections 7 and 8 — startup, hydration,
materialization. Doing it as a review patch would be the third time this phase
built a mechanism without connecting it. It is now the first work item of the
next phase, and the honest status of the web read path is **Blocked**.

## CRITICAL 2 — compose documented a control its own SQL disproves. FIXED.

`docker-compose.yaml` said *"Serves the sync_* views, never the base tables.
Those views are the server-side half of the PHI boundary"*. The SQL file it
pointed at says, with HTTP status codes, that Electric **cannot serve those
views** — and `electric-shapes.ts` binds every shape to base tables carrying
`quote`, `rationale`, `patient_id`, `author_name`, `storage_uri`.

The `DO $$` PHI assertion scans only `sync_%` relations, so it guards tables
nobody reads.

Fixed: the comment now states the measured reality, names the two real
boundaries (trigger-forced `practice_id`; per-shape `columns=`), and carries an
explicit warning that `ELECTRIC_INSECURE` with port 3000 published means
anything reaching `localhost:3000` can request an unprojected base-table shape.
Acceptable on a developer machine only.

## HIGH 1 — the gate read failed open. FIXED.

`use-surgeon-gate.ts` had no `.catch`. On a 500 or a dropped connection,
`loading` went false, `state` stayed `null`, and any caller writing
`state?.affirmed ?? false` showed an **affirmed case as unaffirmed** — a
runtime failure masquerading as domain state, which ADR-003 forbids. The gate
is the highest-stakes read in the product and was the one hook with no error
path, while its sibling `use-evidence-timeline.ts` had one and commented why.

Fixed: added `error: string | null` to the interface and a `.catch` that sets
it.

## HIGH 2 — the worklist hid a gap behind a void. FIXED.

`blockedOn` returned on the first non-zero state, so `{met:4, gap:3, void:1}`
read *"1 document to obtain"* and never mentioned three contradictions needing
a surgeon's argument. Worse than ADR-003's collapse warning: the gap was not
merged into the void, it was **hidden behind** it. A coordinator obtains the
document, the case still does not advance, and nobody can see why.

There was **no test file for `case-summary.ts` at all**. Fixed, and 7 tests
added covering both-states, each-alone, ordering against the gate, and plurals.

## HIGH 3 — `useGateAffirmed` hard-codes the gate closed.

`return caseId ? false : false` — a tautology that discards its argument.
Simplified to `return false` with the parameter marked unused.

The **direction is correct** and stays: a stub defaulting open would silently
disable the gate. But the critic is right that no test renders `AppShell`, so
the shipped behaviour — no case can reach step 07 even after a real
affirmation — is fully green. Replacing it with a real read of
`gate_affirmations` belongs to the next phase, with the runtime that supplies it.

## MEDIUM 1 — a type permitted a state its function could not produce. FIXED.

`StepBlockReason` declared `no-capability`; `isStepReachable` takes no session
and cannot construct it. The doc comment claimed a capability check the
function does not perform, inviting a caller to assume it happens there.
Variant removed; the comment now says plainly that capability gating lives in
`GLOBAL_NAV` and is applied in `app-shell.tsx`.

## MEDIUM 2 — a test comment claimed verification the test does not perform. FIXED.

`pipeline.test.ts` asserted the lock message and claimed *"Verified in a
browser… on all four locked steps"*. No test in the suite mounts `AppShell`.
The browser check is real but lives in `review/a2-screen-reader.md`; the
comment now says so and disclaims the wiring.

## MEDIUM 3 — `GraphProvider` renders one fallback for three states. NOT FIXED.

`!session`, `!runtime` and an unset `onError` are indistinguishable. In a
production build `resolveStartupSession()` returns `null`, so the app renders
"Loading…" forever — **the same defect that already shipped once**, with a dev
session added rather than the three states separated. There are also no public
routes: every route sits under `AppShell` behind `GraphProvider`, which ADR-005
requires not to be the case for login and recovery.

Carried to the next phase. `application-runtime-architecture.md` section 7 is
the startup-stage protocol that resolves it, and section 9 covers the public
authentication routes. Patching it here would pre-empt that design.

## MEDIUM 4 — two tests mirror the implementation.

- `interaction-store.test.ts` "holds only primitives" checks `typeof` on fields
  TypeScript already types `string | null`. It cannot fail without a type error
  first.
- `pglite-schema.test.ts` compares two constants exported from the same file.
  Adding a sixth table to both — the likely way one gets added — passes.

Left as-is and recorded. Both are weak rather than wrong, and rewriting tests
during a review that found live defects is the lower-value use of the finding.

## LOW — a double negative. FIXED.

The filter empty-state read *"No criteria are not documented."* on the one
screen whose purpose is telling a silent chart from a contradicted one. Now:
*"Nothing matches the Not documented filter. Hiding all N criteria."*

## What the critic confirmed sound

Not praise — scope. The three evidence states do not collapse in
`evidence-state.ts`, `timeline-entry-row.tsx` or `evidence-state-chip.tsx`;
`toEvidenceState` throws on an unknown wire value rather than defaulting;
`can()` refuses clinical capability to an `agent` principal and to a null
session; and the client capability list is used only to hide navigation, never
to authorize.

## Gates after the fixes

```
test        57 passed (57)   [50 + 7 new for case-summary]
typecheck   0 errors
lint        clean
build       ✓ 3.83s
audit.sh    PASS (6/6)
browser     evidence timeline still renders
```

## Verdict

Six findings fixed. Three carried into `runtime-architecture` with reasons.
The web read path is **Blocked**, not Build-only — and this review is the
reason that is now known.
