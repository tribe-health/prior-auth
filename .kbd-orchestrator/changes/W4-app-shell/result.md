# W4 — App shell: layout, providers, gated navigation

**Status** complete · **Date** 2026-09-05

## What was built

| File | Purpose |
|---|---|
| `shared/model/session.ts` | capabilities, principal kind, `can()` |
| `app/navigation/pipeline.ts` | the 10 steps and global nav, as data |
| `app/providers/session-provider.tsx` | session context |
| `app/providers/graph-provider.tsx` | entity graph + PGlite, scoped to the practice |
| `app/shell/app-shell.tsx` | layout, nav, Suspense and error boundaries |
| `app/navigation/pipeline.test.ts` | 12 gating assertions |

`app-routes.tsx` now nests all 13 routes under `AppShell`. **The paths were not
changed** — they already matched the prototype pipeline.

## Gating is on capability and case state, never a flag

ADR-005's rule, implemented. Two independent conditions, and conflating them is
the bug the design avoids:

- **Case state** — is the surgeon gate affirmed for *this case*?
- **Session capability** — does this session hold `configure` for admin?

A coordinator holds no `affirm_gate` and still reaches the letter screen on an
affirmed case, because they do the drafting. Gating the screen on "can this
user affirm" would have hidden it from exactly the person who needs it. That is
asserted by a test, not left to reading.

Blocked steps render **visible and disabled with a reason** — *"Awaiting surgeon
affirmation. Step 06 must be completed first."* A missing step is a confusing
interface; a step that says why is an accurate one.

## An agent holds no clinical capability

`can()` refuses every clinical capability to an `agent` principal regardless of
the capability list. ADR-002: an AI assistant acting for a surgeon is a
different principal, and flint-gate already implements it — a Kratos session
maps to `User`, never `Agent`.

This is belt-and-braces. The gateway should never issue a clinical capability to
an agent, and if it did the three server layers would still refuse. Refusing
here too means the interface does not offer a door the system will not open.

Non-clinical capabilities are retained: the rule is about medical acts, not a
blanket downgrade. Asserted both ways.

## The guard was proved to fail

Disabling the gate — `if (false && step.requires === "affirm_gate" && …)` —
produced:

```
× locks every gated step when the gate is not affirmed
× states a reason a human can read
  Tests  2 failed | 16 passed (18)
```

Two independent assertions caught it. Reverted; 18/18 pass. ADR-005 says this
rule is **not** covered by `audit.sh`, so this test is the only thing standing
between it and a refactor that reintroduces a flag.

## Two deliberate stubs, both failing closed

**`useGateAffirmed` returns `false`.** W7 replaces it with a read of
`gate_affirmations` through the entity graph. It returns false so gated steps
are locked by default — a stub defaulting to *open* would be a stub that
silently disables the gate, and this is the one place a wrong default is unsafe.

**`SessionProvider session={null}`** until `@ory/kratos-client-fetch` is wired.
`GraphProvider` then renders its fallback rather than opening an unscoped local
store. Also failing closed: an unscoped store is precisely what the composition
order exists to prevent.

## Composition order is load-bearing

```
SessionProvider   knows practiceId and what this session may do
  GraphProvider   scopes the local store and its sync to that practice
    Router        screens, which assume both above them
```

A graph mounted before the practice is known would sync the wrong tenant.
Documented in `main.tsx` rather than left as an accident of nesting.

PGlite is **in-memory**, deliberately. A persisted store (`idb://`) survives
reloads and is the point of local-first — but it also means PHI at rest in the
browser, a decision this phase has not taken.

## Verification — observed

```
pnpm --dir web test        Tests 18 passed (18)   [12 new + 6 from W6]
pnpm --dir web typecheck   0 errors
pnpm --dir web lint        clean
pnpm --dir web build       ✓ built in 5.52s
bash scripts/audit.sh      audit: PASS
```

## Not verified

The shell has **not been rendered in a browser**. Tests assert the gating logic
and the build succeeds, but no one has seen the layout, checked focus order, or
confirmed the pipeline is legible at any breakpoint. Per the four-word contract,
the visual result is **Build-only**.
