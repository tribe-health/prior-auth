# ADR-006 · The entity graph owns durable state; Zustand owns nothing durable

**Status** Superseded on 2026-09-06 by [ADR-008](adr-008-shared-runtime-state-and-sessions.md) · **Date** 2026-09-05

## Current authority

This record is retained as decision history. Its original decision, rationale
and consequences below are superseded, not parallel implementation instructions.
The successor is an accepted target design; implementation is not certified.

The graph is itself Zustand. Separate ephemeral verified-session, startup and
update stores are valid; the historical disagreement test below is not a
universal state-ownership rule.

## Historical record — original text follows

## Decision

`@prometheus-ags/entity-graph-react@^4.0.0` is the normalized entity layer.
Every durable record — cases, evidence, citations, documents — lives there,
addressed by `type + id`.

Zustand holds **transient interaction state only**: selection, filter inputs,
stream buffers, whether a panel is open. Nothing that survives a reload, and
nothing another view needs to agree about.

The dividing question is not "does this change often?" It is: **if two views
disagreed about this value, would that be a bug?** If yes, it is an entity.

## Why this ADR exists when ADR-001 already said no query cache

ADR-001 rejected TanStack Query, SWR and Apollo, and named the entity graph as
the replacement. It did not say where the boundary sits between the graph and
the local store the app still needs — and Zustand is already a dependency, so
that boundary is the next thing to get wrong.

Without a stated rule, the failure is gradual: a `selectedCaseId` becomes a
`selectedCase` object, which becomes a cached copy of the record, which drifts.
That is the same two-sources-of-truth failure ADR-001 refused, arriving through
a different door.

## Shape

```
component
  └─ feature hook          useEntity / useEntityList / useEntityQuery
       └─ feature api      reads via adapters, writes via the Axum API
            └─ shared http client
```

Lists hold **ordered identifiers only**. Every view re-joins the canonical
record at render time, which is why one write updates the queue row, the detail
panel and the badge together — they were never separate copies.

Optimistic updates are an overlay on the canonical record, not a cache write, so
a rollback restores one value rather than reconciling two.

## API surface actually available

Read from the installed 4.0.0 package rather than assumed:

- `GraphStoreProvider`, `createGraphStore` — the store
- `useEntity`, `useEntityList`, `useEntityQuery`, `useEntityCRUD` — hooks
- `createPGlitePersistenceAdapter`, `usePGliteQuery` — local persistence
- `createElectricAdapter`, `createTenantScopedElectricAdapter` — sync
- `EntityColumnDef<T>` — the table column type (see below)

**Use `EntityColumnDef<T>`, never TanStack's `ColumnDef` directly.** The package
upgraded to react-table v9, which widened `ColumnDef<TData, TValue>` to
`ColumnDef<TFeatures, TData, TValue>`. `EntityColumnDef` supplies `TFeatures`
so consumer code keeps one type parameter. Importing TanStack's type directly
means owning that widening.

## Consequences

- Adding Zustand state is a decision that needs the disagreement test applied.
  In review, "why is this not an entity?" is a fair question with a real answer.
- `useEntityQuery` owns a mutable query — filter, sort, search, pagination. That
  is interaction state the graph reads, not state the graph stores.
- The package is **ESM-only** as of 4.0.0. `web/` is already `type: module`, so
  this costs nothing here, but any Node-side tooling added later must be ESM.

## Enforcement

`scripts/audit.sh` check 2 fails the build if a query cache is declared in
`web/package.json`, and check 3 fails on a component reaching for the network
directly.

The Zustand boundary itself is **not mechanically enforced**. Nothing detects a
durable value smuggled into a store. It is held by this record and by review —
and it is the rule in this ADR most likely to erode, because each individual
violation looks harmless.
