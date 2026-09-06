# ADR-001 · No query cache in web and desktop clients

**Status** Accepted · **Date** 2026-09-04

**Runtime reconciliation** 2026-09-06; see the [ADR index](README.md).

## Decision

The web and desktop clients use **no query cache** — no TanStack Query, no SWR,
no Apollo cache. `scripts/audit.sh` fails the build if one is declared in
`web/package.json`.

## Why

A query cache models **requests**: *is this response stale?* A local-first
application models **data**, and a synced local store already knows its own
freshness — the sync engine owns staleness, deduplication and revalidation.

Putting a cache on top re-answers that question in the wrong layer, with a
second source of truth that drifts from the first. The failure is not dramatic;
it is a list row and a detail panel disagreeing about the same case, which in
this product means two clinicians reading different evidence counts.

## What replaces it

A normalized entity graph. Lists hold **ordered identifiers only**; every view
re-joins the same record at render time. One write therefore updates the queue
row, the detail panel and the badge together, because they were never separate
copies to begin with.

```
Component → feature hook → feature API → platform transport → application services
```

The PEM entity graph is itself a Zustand vanilla store. Separate Zustand stores
hold ephemeral interaction, verified-session, startup and update projections.
Durable business records, including preferences and local-only drafts, are graph
entities. Credentials, migration/checkpoint metadata and the noncredential
`logoutPending` marker belong to platform/storage services, not the graph.

Clinical reads arrive through the authorized SQL replica and atomic graph
projection. Platform transports dispatch commands; they do not create a second
clinical read cache. Server-side session-validation caching is outside this
client query-cache prohibition and remains subject to bounded revocation.
See [ADR-008](adr-008-shared-runtime-state-and-sessions.md) and
[ADR-009](adr-009-authorized-replicas-and-updates.md).

## Consequences

- A developer arriving from a React codebase will reach for `useQuery`. The
  audit refuses it with a pointer to this file, which is the intended behaviour.
- Optimistic updates are an overlay on the canonical record, not a cache write,
  so a rollback restores one value rather than reconciling two.
- We accept writing a little more transport code by hand in exchange for one
  answer to "what is true right now".
