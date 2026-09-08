# ADR-007 · ElectricSQL for reads, the API for writes, and a schema that cannot hold PHI

**Status** Superseded on 2026-09-06 by [ADR-009](adr-009-authorized-replicas-and-updates.md) · **Date** 2026-09-05

## Current authority

This record is retained as decision history. Its original decision, rationale
and consequences below are superseded, not parallel implementation instructions.
The successor is an accepted target design; implementation is not certified.

Current design requires authorized FRF-mediated Electric access and a desktop
storage branch. The historical claims that projections cannot contain PHI and
that PGlite cannot support pgvector are not current security or capability
claims. Projection privacy requires server enforcement; snapshot persistence
adapters do not establish relational materialization.

## Historical record — original text follows

## Decision

```
Postgres 18 (flint-forge)
     │  logical replication, shape subscriptions
     ▼
ElectricSQL 1.8.0
     │  HTTP shape streams — READ PATH ONLY
     ▼
PGlite 0.5.8 in the browser
     │
entity graph  (createTenantScopedElectricAdapter, createPGlitePersistenceAdapter)

writes:  component → feature api → Axum → Postgres
```

**Writes never travel the shape stream.** They go through the Axum API, because
that is where clinical authority is checked — `AppServices::execute_gate_command`,
`sign_letter`, and the capability seam ADR-002 describes. A write path that
bypassed the API would bypass the second of ADR-002's three layers.

## The PGlite schema is a deliberate subset

Only the evidence path reaches the browser:

`cases` · `case_evidence` · `evidence_states` · `evidence_citations` ·
`documents`

Not "the tables we happened to need." A table is absent unless it was decided
to be present.

### Embeddings are PHI and are structurally excluded

`docs/design/schema/schema-ai.sql:74-91` states it plainly:

> *Embeddings of clinical text ARE PHI. Text can be reconstructed from an
> embedding by inversion (IEEE S&P 2023), so an embedding fails both Safe
> Harbor and Expert Determination.*

backed by `CONSTRAINT embedding_models_phi_requires_cover`, and a seeded
registry that marks OpenAI's `text-embedding-3-small` and `-large` as **not**
PHI-cleared.

`embedding_vectors`, and any table holding raw chart text, are **absent from the
PGlite schema** — not filtered at query time. Absent.

**PGlite has no pgvector, so the exclusion is also natural. That coincidence is
not a control.** If PGlite gained pgvector tomorrow, nothing in the runtime
would stop a vector table syncing. The control is the explicit schema subset and
the test that fails when a sixth table appears — not the absence of an
extension.

## Why ElectricSQL and not prometheus-entity-sync

`prometheus-entity-sync` was the earlier choice and is the better *conceptual*
fit: it is bidirectional, ships a `BucketAssigner` mapping JWT claims to
authorized data buckets with parameterized SQL only, and has Dart and Rust SDKs
that would serve the Flutter and Tauri surfaces.

It was rejected on the state of its client layer, measured 2026-09-04:

| | |
|---|---|
| `@prometheus-ags/entity-sync-{core,pglite,react,tauri}` | **not published** to npm |
| version | `0.1.0` |
| `main` / `types` | point at raw `src/*.ts` — no build |
| build script | none |
| `entity-sync-pglite` peer | `@electric-sql/pglite ^0.2.0` (current: 0.5.8) |
| `entity-sync-tauri` source | **one line** |

The Rust `pes-server` is real and has recent commits fixing bucket scoping. The
TypeScript client is a stub. Publishing it would have shipped the stub.

ElectricSQL 1.8.0 is published, versioned, and the entity graph ships tested
`createElectricAdapter` and `createTenantScopedElectricAdapter` — the tenant
variant matters because this is a practice-boundary deployment.

**This record exists so the decision is not silently re-proposed.** If
`prometheus-entity-sync` builds and publishes its client SDKs, revisit. The
bidirectional model and the Dart SDK are genuine advantages this ADR gives up.

## What this ADR does not settle

**Whether Electric's shape authorization can express the per-record privacy
class that `docs/plan/build-order.md` phase 1 requires.** Phase 1 says a record
carries a privacy class (`public` / `trusted` / `local`) and that local data is
*structurally refused* at the sync boundary rather than filtered.

Shapes are defined per-table with a where-clause. Whether that is expressive
enough for per-record refusal, or whether the refusal has to live in the Axum
layer that defines the shapes, is **unverified**. It is the largest open
question in this phase, and it is named here rather than assumed away.

## Consequences

- PHI at rest stays inside the practice boundary and inside the United States
  (Texas SB 1188, effective 2026-01-01). No service in this topology moves it.
- Electric requires `wal_level=logical` on the Postgres instance.
- The Flutter surface has no Electric client. When mobile arrives it needs its
  own decision — this ADR does not cover it.

## Enforcement

`scripts/audit.sh` check 2 (no query cache). A test asserting the PGlite schema
contains exactly the five named tables and fails when a sixth appears.

The PHI exclusion has **no runtime enforcement** — it is a build-time schema
decision plus that test. If someone adds a table to the PGlite schema without
reading this ADR, the test is the only thing that catches it.
