# Assessment — web-ui-architecture

**Phase** `web-ui-architecture` · **Stage** assess · **Date** 2026-09-04
**Verification** every version below was read from a registry or the filesystem
in this session. Nothing is quoted from training-era memory.

---

## 1 · What already exists

The README's "screens not built" understates the starting position. `web/src`
holds real structure, and the gap is narrower and more specific than "build the
UI".

| Area | State | Evidence |
|---|---|---|
| Routes | 13 routes, case-scoped paths, lazy-loaded | `web/src/app/routes/app-routes.tsx` |
| Route bodies | **all `RoutePlaceholder`** | `case-queue-route.tsx` is 5 lines |
| UI primitives | 61 shadcn files under `components/ui/` | `ls web/src/components/ui \| wc -l` → 61 |
| Feature dirs | 5 features × `api/hooks/model/components` | all `api/` and `hooks/` are **empty** |
| Real feature code | **139 lines total** | `evidence-tile.tsx` 37, `case-summary.ts` 21, `evidence-state.ts` 35, `http-client.ts` 46 |
| `app/providers/` | **empty directory** | `ls` returns nothing |
| Root layout / shell | **absent** | no layout route in `app-routes.tsx` |
| Entity graph | **declared and installed, never imported** | `package.json` `^3.2.0`; `node_modules` 3.2.0; zero imports in `src` |
| Zustand | declared; one incidental use | only `zustand/react/shallow` in `use-attachment-src.ts` |
| PGlite / Electric / Ory | **absent from `web/package.json`** | dependency scan |

`shared/model/evidence-state.ts` is already correct and load-bearing: three
states, a token role per state, a label per state, and an *action* per state
(`Cite it` / `Argue it` / `Obtain it`). The component library must consume this,
not restate it.

### The prototype is a specification, not a mockup

`docs/design/prototype/assets/shell.js:377-390` defines the navigation contract:

- A **10-step case pipeline** (`01` dashboard → `10` peer-to-peer).
- Steps **07–10 carry `gated: true`** — letter, packet, receipt, peer-to-peer.
- Global nav is **role-gated**: admin requires `requires: 'configure'`.

The gate is the surgeon gate. Steps 07–10 being unreachable until affirmation is
ADR-002 expressed as navigation. This is the shell's actual requirement, and
G1 implements it rather than inventing a nav model.

`web/src/app/routes/app-routes.tsx` already carries matching paths, so the
route table is not the gap — the **layout, gating, and providers** are.

---

## 2 · Verified version ground truth

Read from `registry.npmjs.org` and Docker Hub on 2026-09-04.

### Ory — self-hosted

| Package | Latest | Published | Note |
|---|---|---|---|
| `oryd/kratos` (image) | **`v26.2.0`** | — | also `v26.2.0-distroless` |
| `@ory/kratos-client-fetch` | **26.2.0** | 2026-03-24 | **self-hosted**; version-matches the server |
| `@ory/kratos-client` | 26.2.0 | 2026-03-24 | axios-era predecessor |
| `@ory/client-fetch` | 1.22.66 | 2026-07-28 | **Ory Network** — different product |
| `@ory/elements-react` | 1.2.1 | 2026-07-31 | `next` 1.3.0-rc.0 |
| `@ory/elements` | 0.9.1 | 2026-06-23 | pre-1.0 |

**Finding A — the two client packages are not interchangeable.** npm search
ranks `@ory/client-fetch` highly, and its description names an Ory Network host
(`playground.projects.oryapis.com`). Self-hosted Kratos takes
**`@ory/kratos-client-fetch`**. Choosing on download count picks the wrong one.

**Finding B — flint-gate's reference compose pins `oryd/kratos:v1.2`.** Current
is `v26.2.0`. That compose is a working example, not a maintained pin; copying
it forward would import a stale server.

**Finding C — `@ory/elements-react` depends on `@ory/client-fetch@1.22.22`,
the Ory Network client**, not the self-hosted one. Verified by reading the
published `dependencies` block. React peer is `^18 || ^19`, so React 19.2 is
fine. **This does not prove Elements is unusable self-hosted, and this
assessment does not claim it is** — the flow APIs are largely shared. It means
adoption requires a spike against a running `v26.2.0`, not an assumption. That
spike is a plan task, not an assess conclusion.

### Local-first stack

| Package | Latest | Published |
|---|---|---|
| `@electric-sql/pglite` | **0.5.8** | 2026-08-26 |
| `@electric-sql/client` | **1.5.27** | 2026-09-01 |
| `@electric-sql/react` | **1.0.56** | 2026-09-01 |
| `electricsql/electric` (image) | **1.8.0** | 2026-09-01 |
| `@prometheus-ags/entity-graph-core` | **3.2.0** | 2026-08-30 |
| `@prometheus-ags/entity-graph-sync` | **3.2.0** | 2026-08-30 |
| `@prometheus-ags/prometheus-entity-management` | **3.2.0** | 2026-08-30 |

**Finding D — `@prometheus-ags/entity-graph-react` does not exist on npm.**
A scope search returns 12 packages: core, sync, sdl, a2a, alpine, solid, svelte,
htmx, tauri, web-components, a2ui-react, and the umbrella. **No React binding
under that name.**

The React binding lives at `packages/entity-graph-react/` but its
`package.json` is named **`@prometheus-ags/prometheus-entity-management`**, with
peer `react >=19.0.0 <20.0.0` — matching this project's 19.2.0.

This repo **already depends on the correct name** (`^3.2.0`, installed 3.2.0).
The G3 goal text names `entity-graph-react`, which would produce an unresolvable
import. **G3's wording must be corrected before planning.**

The PEM README's "all twelve npm packages are public" is consistent with the
registry — but the twelve do not include a React-named package. A reader
trusting the directory name would be wrong.

---

## 3 · The unresolved architectural decision

The phase now carries **two sync mechanisms**, and the goals do not say how they
relate.

```
Postgres (flint-forge)
   ├── prometheus-entity-sync ── WAL → buckets → PSyncV1/MessagePack ──┐
   └── ElectricSQL 1.8.0 ─────── shape subscriptions → HTTP ───────────┤
                                                                       ▼
                                                        PGlite 0.5.8 (browser)
                                                                       │
                                            @prometheus-ags/prometheus-entity-management
```

Both are supported by entity-graph-core — `src/adapters/electricsql.ts`,
`electricsql-tenant.ts`, and `pglite-persistence.ts` exist with integration
tests, and `@electric-sql/pglite@0.5.4` is a devDependency. Neither is
speculative.

They differ where it matters here:

| | prometheus-entity-sync | ElectricSQL |
|---|---|---|
| Authorization | `BucketAssigner` maps JWT claims → buckets, parameterized SQL only | shape definitions, gateway-enforced |
| Direction | bidirectional (Postgres ↔ PGlite ↔ SQLite) | read-path shapes; writes via the API |
| Transport | WebSocket + MessagePack (PSyncV1) | HTTP shape streams |
| Multi-surface | TS, Dart, Rust, Tauri SDKs | TS-first |

**Why this is not a preference.** Phase 1 of `docs/plan/build-order.md` requires
a **privacy class per record**, with local data *structurally refused* at the
sync boundary rather than filtered. Whichever engine is chosen becomes the place
that refusal is implemented. `BucketAssigner` and Electric shapes are different
enforcement surfaces, and a system carrying both has two places to get PHI
scoping wrong.

The prior phase decision selected `prometheus-entity-sync`; this phase's
instruction adds ElectricSQL. **Both cannot be the boundary.** Resolving this is
the first planning task, and it blocks G4.

The mobile surface is a tiebreaker input: Flutter is a claimed surface, and
entity-sync ships a Dart SDK where Electric is TS-first.

---

## 4 · Identity boundary — already decided, do not re-litigate

`docs/design/schema/schema.sql:230-257` settles it:

```sql
CREATE TABLE users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kratos_identity_id  uuid NOT NULL UNIQUE,
  ...
  email               citext NOT NULL,
```

with the comment: *"Kratos identity is exactly one application user, forever.
Email is mirrored for display, search and letterhead only — Kratos remains the
authority on the verified address, and a mirrored copy that drifts is a display
bug, never an authentication one."*

So:

- **Kratos owns** credentials, sessions, MFA, the verified address.
- **`aso.users` owns** practice membership, NPI, job title, status.
- `capabilities` / `roles` / `role_capabilities` / `user_roles` own authority,
  with `is_clinical` marking `affirm_gate`, `sign_letter`, `annotate`.

The schema comment states the rule plainly: *"An administrator holds every
configuration power in the system and must still be unable to perform them."*

flint-gate already implements the third principal: a Kratos session maps to
**`User`**, never `Agent` (`README.md:739,747` — *"`act` promotes only
token-derived identities, never a Kratos session"*). ADR-002's
agent-is-a-different-principal rule is enforced at the gateway today.

**Shared-database instruction.** Kratos on the flint-forge Postgres is
straightforward — Kratos takes a `DSN` and owns its own tables. flint-gate's
reference compose already does this, pointing Kratos at a `kratos` database on
the shared instance. The constraint to carry forward: Kratos owns its schema and
migrates it independently; `aso.*` must never FK into Kratos tables.
`kratos_identity_id` is a **soft reference by design** — the schema already
treats it that way.

---

## 5 · Schema population from `docs/`

`docs/design/schema/` is 3,011 lines across four files:

| File | Lines | Content |
|---|---|---|
| `schema.sql` | 1,844 | **49 tables** in schema `aso`; `pgcrypto`, `citext`, `pg_trgm` |
| `schema-checks.sql` | 120 | executable assertions |
| `schema-ai.sql` | 892 | `vector` + `btree_gist`; embedding registry, corpora, chunks |
| `schema-ai-checks.sql` | 155 | assertions |

The README says "60 tables"; the count in `schema.sql` is **49**, with the
remainder in `schema-ai.sql`. Not a defect — but a plan budgeting by "60 tables
in one file" works from the wrong number.

**No migration tooling exists.** `sqlx` 0.8.3 is pinned in the workspace and
`flint-forge/migrations/` exists, but this repo has no `migrations/` directory
and no runner. The schema is currently a document, not a deployable artifact.
G6 implies a database that starts populated; that requires an ordering contract
(`schema.sql` → `schema-ai.sql` → checks) and a runner decision.

**The PHI rule is already enforced in SQL.** `schema-ai.sql:74-91`:

> *"Embeddings of clinical text ARE PHI. Text can be reconstructed from an
> embedding by inversion (IEEE S&P 2023), so an embedding fails both Safe
> Harbor and Expert Determination."*

backed by `CONSTRAINT embedding_models_phi_requires_cover`. The seeded registry
marks OpenAI `text-embedding-3-small` and `-large` as **not PHI-cleared**.

**Consequence for PGlite.** A PGlite schema is not a subset of the server schema
chosen for convenience. `embedding_vectors` and any table holding chart text
must be **structurally excluded** from the browser store — not filtered at query
time. PGlite has no pgvector, which makes the exclusion natural rather than
enforced; that coincidence must not be mistaken for a control.

---

## 6 · docker-compose sources — verified present

| Service | Source | Build input |
|---|---|---|
| flint-forge | `/Users/gqadonis/Projects/prometheus/flint-forge` | `docker-compose.yml` + `images/postgres18/Dockerfile` |
| flint-gate | `.../flint-gate` | `Dockerfile` + `docker-compose.yml` |
| flint-realtime-fabric | `.../flint-realtime-fabric` | `Dockerfile` |
| prometheus-entity-sync | `.../prometheus-entity-sync` | `Dockerfile` |
| Ory Kratos | Docker Hub | `oryd/kratos:v26.2.0` |
| ElectricSQL | Docker Hub | `electricsql/electric:1.8.0` — *pending §3* |

`flint-realtime-sync` **does not exist**; `prometheus-entity-sync` is the
Postgres→PGlite engine and `flint-realtime-fabric` is its event spine.

**Postgres version conflict.** flint-forge builds a custom **postgres18** image;
flint-gate's compose uses **`postgres:16-alpine`**. The instruction is one
shared database. Resolution: flint-forge's postgres18 image is the single
instance, with flint-gate and Kratos each taking their own database on it.
flint-gate's compose is a reference to adapt, not to copy.

Electric requires **logical replication** (`wal_level=logical`); entity-sync
reads the WAL. If both run, both need replication slots on the same instance.
Another reason §3 must resolve first.

---

## 7 · Gap register

| ID | Gap | Goal | Severity |
|---|---|---|---|
| **GAP-1** | Sync engine undecided — entity-sync vs ElectricSQL | G4 | **BLOCKING** |
| **GAP-2** | G3 names `entity-graph-react`, which is unpublished | G3 | **BLOCKING** (fabricated import) |
| GAP-3 | No root layout, no gated-step model, no providers | G1 | HIGH |
| GAP-4 | No migration tooling; schema is a document | G6 | HIGH |
| GAP-5 | PGlite subset undefined; PHI exclusion unstated | G4 | HIGH |
| GAP-6 | Kratos pin `v1.2` in reference compose vs `v26.2.0` | G6 | HIGH |
| GAP-7 | 61 shadcn primitives unaudited against tokens/contrast | G2 | MEDIUM |
| GAP-8 | Elements-react self-hosted fit unproven | G1 | MEDIUM |
| GAP-9 | Postgres 16 vs 18 across compose sources | G6 | MEDIUM |
| GAP-10 | Entity graph installed but never imported | G3 | MEDIUM |
| GAP-11 | Zustand boundary undefined vs entity graph | G3 | MEDIUM |
| GAP-12 | No ADRs drafted | G7 | LOW |

---

## 8 · Open questions for plan

1. **GAP-1** — entity-sync, Electric, or both? Decides where privacy-class
   refusal lives. Mobile Dart SDK favours entity-sync; Electric has a tested
   tenant adapter. *Recommendation: one engine; entity-sync unless a spike shows
   Electric enforces bucket scoping equivalently.*
2. **GAP-2** — confirm G3 is rewritten to
   `@prometheus-ags/prometheus-entity-management` before planning.
3. **GAP-4** — `sqlx migrate` (already pinned) or flint-forge's runner?
4. **GAP-5** — which of the 49+ tables reach the browser, and is the exclusion
   generated from the privacy class or hand-maintained?
5. **GAP-8** — spike Elements-react against `v26.2.0`, or hand-build the flow UI
   on `@ory/kratos-client-fetch` with the existing shadcn library?

---

## 9 · Scope check against the phase contract

The phase says: shell, component library, **one** vertical slice
(`evidence-timeline`), compose, ADRs. Everything else stays a placeholder.

Two items in this assessment invite scope creep and are called out so plan can
refuse them:

- **Schema population (G6)** can expand into modelling all 49 tables as
  entities. The slice needs the evidence path only — `cases`, `case_evidence`,
  `evidence_states`, `evidence_citations`, `documents`. The rest waits.
- **Kratos** can expand into a full auth implementation. This phase needs the
  container, the session boundary, and a gated shell — not registration,
  recovery, or MFA flows.

---

## 10 · Self-review

Applied `sycophancy-correction` S-01…S-08 to this document before writing it.

- **S-02 (unearned agreement):** the instruction named ElectricSQL and
  `flint-realtime-sync`. Rather than adopting both silently, §3 records a real
  conflict and §6 records that one service does not exist. Accepting both would
  have produced a compose file with two PHI boundaries.
- **S-04 (scope inflation):** §9 exists to bound the work the earlier sections
  make tempting.
- **S-06 (confidence beyond evidence):** Finding C states Elements-react's
  Network-client dependency as *observed*, and declines to conclude it is
  unusable self-hosted. The firecrawl search that would have settled it was
  interrupted; the honest output is a plan spike, not a verdict.

**Unverified in this assessment:** whether `@ory/elements-react` functions
against self-hosted Kratos v26.2.0 (GAP-8); whether Electric and entity-sync can
share replication slots on one instance (GAP-1); whether all 61 shadcn
primitives are token-driven (GAP-7). Each is a plan task with a named check, not
an assumption carried forward.
