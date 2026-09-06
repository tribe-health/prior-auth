# Plan — web-ui-architecture

**Phase** `web-ui-architecture` · **Stage** plan · **Date** 2026-09-05
**Change backend** native KBD (`openspec_available: false` in `project.json`;
the nested `web/openspec/` has no specs)

**8 changes.** Ordering is load-bearing: W1–W3 are decisions and contracts that
every later change reads. W7 is the only vertical slice; W8 records what the
phase decided.

---

## Inputs resolved since assess

Both BLOCKING gaps from `assessment.md` are closed.

**GAP-1 — sync engine: ElectricSQL 1.8.0.** Operator decision. Decisive
evidence: `prometheus-entity-sync`'s JS SDKs are v0.1.0, unpublished, with
`main`/`types` pointing at raw `src/*.ts`, no build script, and a peer range of
`@electric-sql/pglite ^0.2.0` against current 0.5.8. `entity-sync-tauri` is one
line. The Rust `pes-server` is real; the TypeScript client layer is a stub.

**GAP-2 — the package exists.** `@prometheus-ags/entity-graph-react@4.0.0` is
published and registry-verified. The child phase `pem-refresh-3-3-0` shipped it.

**GAP-8 — auth UI: hand-build.** Operator decision. Use
`@ory/kratos-client-fetch@26.2.0` (version-matched to the server) with the
existing shadcn primitives, rather than `@ory/elements-react`, which depends on
the Ory **Network** client and would import a second design system.

## What the child phase changed about this plan

| | |
|---|---|
| Install name | `@prometheus-ags/entity-graph-react@^4.0.0` |
| Currently declared in `web/package.json` | `prometheus-entity-management: ^3.2.0` — **deprecated alias** |
| Module format | **ESM-only.** No `.cjs`, no `require` condition |
| PGlite | `^0.5.8`, verified against the persistence adapter |
| `ColumnDef` | v9 widened it; use the package's `EntityColumnDef<T>`, not TanStack's |

**The ESM audit is nearly a no-op, and that is a finding, not an assumption.**
`web/package.json` already declares `"type": "module"`, `grep -rn 'require('`
over `web/src` and the root configs returns nothing, and there is no test script
to break. W2 confirms rather than converts.

---

## Change list

| # | Change | Goal | Depends on | Reversible |
|---|---|---|---|---|
| W1 | Adopt `entity-graph-react@^4.0.0`; retire the alias | G3 | — | yes |
| W2 | ESM conformance check | G1 | W1 | yes |
| W3 | ADRs: component model, navigation, entity binding, sync | G7 | — | yes |
| W4 | App shell: layout, providers, gated navigation | G1 | W2, W3 | yes |
| W5 | Base component library under `shared/ui` | G2 | W3 | yes |
| W6 | Entity graph + PGlite + Electric wiring | G3, G4 | W1, W3 | yes |
| W7 | `evidence-timeline` vertical slice | G5 | W4, W5, W6 | yes |
| W8 | `docker-compose.yaml` + schema bootstrap | G6 | — | yes |

Every change is reversible; nothing here publishes or deploys. That is the
difference between this phase and the child that preceded it.

---

### W1 · Adopt `entity-graph-react@^4.0.0`

**Why first.** Every later change imports from it, and the name currently in
`web/package.json` is deprecated.

**Tasks**

1. `web/package.json`: replace
   `"@prometheus-ags/prometheus-entity-management": "^3.2.0"` with
   `"@prometheus-ags/entity-graph-react": "^4.0.0"`.
2. `pnpm --dir web install`.
3. Grep `web/src` for the old specifier; there should be none (the entity graph
   is declared but never imported today — confirm that is still true).

**Verify**
```bash
pnpm --dir web install
grep -rn '@prometheus-ags/prometheus-entity-management' web/src   # expect: no matches
node -e "console.log(require('./web/node_modules/@prometheus-ags/entity-graph-react/package.json').version)"
pnpm --dir web typecheck
```
Report the **resolved** version, not the requested range.

---

### W2 · ESM conformance check

**Why it exists.** The dependency is now ESM-only. This is a *check*, not a
conversion — evidence gathered at plan time says the app is already conformant.

**Tasks**

1. Confirm `web/package.json` declares `"type": "module"`. (It does.)
2. Grep for `require(`, `module.exports`, `__dirname`, `__filename` across
   `web/src` and every root-level config. (Currently zero.)
3. If a match appears, convert it — `await import()`, `export`,
   `import.meta.dirname`.
4. Record the result either way. A check that finds nothing is still a result.

**Verify**
```bash
jq -r '.type' web/package.json                                    # module
grep -rn 'require(\|module\.exports\|__dirname' web/src web/*.ts  # expect: none
pnpm --dir web build
```

**If this change finds nothing to fix, say so plainly and close it.** Do not
manufacture work to justify the change existing.

---

### W3 · Architecture decisions (ADR-004 … ADR-007)

**Why before the code.** These four decisions constrain W4–W7. Writing them
after the code would be documentation, not decision-making.

**Tasks** — four ADRs in `docs/architecture/`, matching the existing house style
(Decision / Why / Consequences, and the *reason* a rule exists so it survives
being inconvenient):

- **ADR-004 · Component model.** `shared/ui` is the token-driven library;
  `components/ui` holds unmodified shadcn primitives. Which layer a component
  belongs to, and why a feature component never reaches past its feature hook.
- **ADR-005 · Navigation and gating.** The 10-step case pipeline from
  `docs/design/prototype/assets/shell.js:377-390`. Steps **07–10 carry
  `gated: true`** — letter, packet, receipt, peer-to-peer — and the gate is the
  surgeon gate. Global nav is role-gated (`requires: 'configure'` on admin).
  This is ADR-002 expressed as navigation, and the ADR must say so.
- **ADR-006 · Entity graph binding.** `@prometheus-ags/entity-graph-react` owns
  durable state; Zustand owns transient interaction state only — selection,
  filters, stream buffers. Lists hold ordered identifiers; every view re-joins
  the canonical record. Restates ADR-001's rule at the binding layer.
- **ADR-007 · Local-first sync topology.** ElectricSQL 1.8.0 shapes →
  PGlite 0.5.8 → entity graph. Writes go through the Axum API, never the shape
  stream, because that is where clinical authority is checked. Records **why
  `prometheus-entity-sync` was not chosen**, with the v0.1.0 evidence — a
  rejected option with no recorded reason gets re-proposed.

**Verify** each ADR names its enforcement point (an `audit.sh` check, a test, or
an explicit "not mechanically enforced").

---

### W4 · App shell

**Tasks**

1. Root layout route in `web/src/app/routes/app-routes.tsx` wrapping the 13
   existing routes. They already carry correct case-scoped paths — do not
   rewrite them.
2. `web/src/app/providers/` (currently empty): entity graph provider, PGlite
   provider, session provider. Composition order matters and should be
   commented.
3. Navigation from `shell.js`: the 10-step pipeline with step numbers, plus
   role-gated global nav.
4. The gated-step model: steps 07–10 unreachable until the surgeon gate is
   affirmed. **Gate on session capability, not on a UI flag** — the affirmation
   is a clinical act (ADR-002), and a nav-only gate is decoration.
5. Error and loading boundaries at the layout level.
6. Theme wiring from the generated `web/src/theme.css`. Never hand-edit it.

**Verify**
```bash
pnpm --dir web typecheck && pnpm --dir web lint && pnpm --dir web build
bash scripts/audit.sh            # checks 1 and 3 cover this change
```
Plus: with the gate unaffirmed, steps 07–10 are unreachable — asserted by a
test, not by clicking.

---

### W5 · Base component library

**Tasks**

1. Promote what the slice needs from `components/ui` (61 shadcn primitives) into
   `web/src/shared/ui` as token-driven components. **Promote on demand.**
   Wrapping all 61 is speculative work.
2. Evidence-state treatments consuming `shared/model/evidence-state.ts` — which
   already carries the token role, label, and *action* per state. Do not restate
   those three tables in a component.
3. Every state renders a **text label**. Colour is reinforcement, never the
   signal.
4. Contrast: ember `#DF7C35` is 3.08:1 on white — fine at 24px+ or 19px bold,
   fails everything else. Body copy, small labels and table headers use
   `#A85417` (5.45:1).
5. Every filename kebab-case (`audit.sh` check 1).

**Verify**
```bash
bash scripts/audit.sh            # checks 1 and 6
pnpm --dir web typecheck && pnpm --dir web lint
```
Plus a rendering check that each of `met` / `gap` / `void` shows its label with
colour disabled.

---

### W6 · Entity graph, PGlite, Electric

**Tasks**

1. Add `@electric-sql/pglite@^0.5.8` and `@electric-sql/client@^1.5.27` to
   `web/package.json`.
2. Entity graph store via `entity-graph-react`, wired in `app/providers/`.
3. PGlite as the local store; Electric shapes as the read path.
4. **The PGlite schema is a deliberate subset, not a convenience subset.**
   Only the slice's five tables reach the browser: `cases`, `case_evidence`,
   `evidence_states`, `evidence_citations`, `documents`.
5. **Structural exclusion of PHI-bearing tables.** `schema-ai.sql:74-91` states
   that an embedding of clinical text *is* PHI — text can be reconstructed by
   inversion. `embedding_vectors` and any chart-text table must be absent from
   the PGlite schema, not filtered at query time. PGlite has no pgvector, which
   makes the exclusion natural — **that coincidence is not a control**, and the
   change must say so.
6. Zustand for transient state only.

**Verify**
```bash
bash scripts/audit.sh            # check 2 — no query cache
pnpm --dir web typecheck && pnpm --dir web build
```
Plus: the generated PGlite schema contains exactly the five tables, asserted by
a test that fails if a sixth appears.

---

### W7 · `evidence-timeline` vertical slice

The reference pattern every later feature copies. Chosen because it is the only
screen exercising all three evidence states.

**Tasks**

1. `features/evidence-timeline/model` — types over the five tables.
2. `.../api` — read through Electric shapes; write through the Axum API.
3. `.../hooks` — entity-graph-backed; **no direct `fetch` or `invoke`**
   (`audit.sh` check 3).
4. `.../components` — consuming `shared/ui`, rendering met / gap / void with
   their actions (`Cite it` / `Argue it` / `Obtain it`).
5. Replace the `RoutePlaceholder` in `evidence-timeline-route.tsx`. **Every
   other route stays a placeholder.**

**Verify**
```bash
bash scripts/audit.sh            # checks 1, 2, 3, 6
pnpm --dir web typecheck && pnpm --dir web lint && pnpm --dir web build
```
Plus a test asserting a `void` row renders "Obtain it" and never collapses into
`gap`.

---

### W8 · `docker-compose.yaml` and schema bootstrap

**Tasks**

1. Compose services, all verified present at assess time:
   - **flint-forge** — built from its `images/postgres18/Dockerfile`. This is
     the single Postgres instance.
   - **Ory Kratos** `oryd/kratos:v26.2.0`. **Not `v1.2`** — flint-gate's
     reference compose is a working example, not a maintained pin.
   - **flint-gate** — its compose uses `postgres:16-alpine`; adapt it to the
     postgres18 instance rather than copying it.
   - **flint-realtime-fabric**
   - **electricsql/electric:1.8.0** — needs `wal_level=logical`.
2. Kratos takes its own database on the shared instance. It owns and migrates
   its own schema; `aso.*` must never FK into Kratos tables.
   `kratos_identity_id` is a **soft reference by design**.
3. Schema bootstrap ordering: `schema.sql` (49 tables) → `schema-ai.sql` →
   `schema-checks.sql` → `schema-ai-checks.sql`. The README says "60 tables";
   the count in `schema.sql` is 49, with the rest in `schema-ai.sql`.
4. Migration runner: `sqlx migrate` (already pinned at 0.8.3) unless a spike
   shows flint-forge's runner is a better fit.
5. **PHI stays inside the practice boundary and inside the United States**
   (Texas SB 1188, effective 2026-01-01). No service in this compose sends PHI
   outside it.

**Verify**
```bash
docker compose config          # parses, no unresolved variables
docker compose up -d && docker compose ps
psql -c "\dt aso.*"            # 49 tables present
```
Plus the executable checks in `schema-checks.sql` pass against the live database.

---

## Ordering rationale

W1 first because every import depends on the name, and the current one is
deprecated. W2 immediately after, since the format change came with it.

W3 before any code: four decisions that constrain W4–W7. Written after, they
would be documentation of whatever happened to get built.

W4, W5 and W6 are independent of each other and could run in parallel by
separate agents; all three gate W7.

W8 is independent of the entire web stack and could run first or last. It is
placed last because the slice does not need it — Electric and PGlite can be
exercised against a local instance — and because a compose file nobody has run
is the least useful thing to build early.

## Recommended agent per change

| Change | Agent | Why |
|---|---|---|
| W1, W2 | `general-purpose` | dependency and conformance |
| W3 | `architect` | decisions with downstream constraints |
| W4, W5 | `typescript-reviewer` | React structure, layering, a11y |
| W6 | `architect` then `typescript-reviewer` | PHI boundary is a design decision before it is code |
| W7 | `typescript-reviewer` | the reference pattern everything copies |
| W8 | `devops-engineer` | compose, Postgres, migrations |

## What this plan does not do

- **Build 12 more screens.** One slice. Every other route stays a placeholder.
- **Implement auth flows.** W4 needs the session boundary and a gated shell —
  not registration, recovery, or MFA.
- **Model all 49 tables.** The slice needs five.
- **Touch `crates/`, `mobile/`, or `desktop/`.** Web only, per the phase goals.
- **Fix `prometheus-entity-sync`.** Rejected with reasons recorded in ADR-007.

## Unverified at plan time

Named so execute checks rather than assumes:

1. Whether `@ory/kratos-client-fetch@26.2.0` covers every flow the shell needs,
   or only session validation (W4).
2. Whether Electric's shape authorization can express the per-record privacy
   class build-order phase 1 requires, or whether that must live in the Axum
   layer (W6). **This is the phase's largest open risk.**
3. Whether `sqlx migrate` or flint-forge's runner is the right bootstrap (W8).
4. Whether the 61 shadcn primitives are token-driven or carry hardcoded colour
   (W5) — assessment flagged this and it was never measured.

## The uncomfortable thing

This phase builds the shell and one slice against an entity-graph binding that
no application code has ever used. The child phase raised that library to 4.0.0
on the strength of its published contract, not on evidence that it fits this
product's shape.

W7 is the first honest test of that fit. If the evidence-timeline slice fights
the entity graph — if the three-state model or the citation-per-assertion rule
turns out to need something the graph does not offer — the right response is to
say so in reflection, not to bend the slice around the library.
