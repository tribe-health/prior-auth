---
name: sync-doctrine
description: ALWAYS invoke before ANY sync, replication, realtime, offline, or local-first work on any surface — choosing what data syncs, adding a synced table, wiring a subscription, designing onboarding data loads, or touching the write queue. The device NEVER mirrors the server database; every datum belongs to exactly one lane (server-authoritative relational, CRDT doc, or append-only log) and one privacy class, and getting the lane wrong is the root cause of most sync defects. Triggers on sync, replication, offline, local-first, realtime, subscription, write queue, offline write, conflict, LWW, CRDT, bucket, shape, scope, lookup data, reference data, metatype, seed data, onboarding load, initial load, hydration, boot order, sync status, SyncChip, ElectricSQL, PES, FRF, sync engine.
---
<!-- TJ-ARCH-MOB-001 compliant -->

> **Binding:** The full doctrine lives in
> [`doctrine.md`](references/doctrine.md),
> [`partial-replication.md`](references/partial-replication.md), and
> [`decisions.md`](references/decisions.md). Read them before
> designing; the invariants below remain usable when references are unavailable.

# Sync Doctrine

## First question, always: which lane?

| If the data is… | Lane | Merge | Where it lives |
|---|---|---|---|
| Shared app data (entities, messages, settings rows, lookups) | **Relational** | Server-authoritative LWW + upload queue | synced local tables |
| Intrinsically collaborative or user-owned (scratchpads, profile vault) | **CRDT (Loro)** | CRDT merge | `crdt_state` blobs; see `peer-profile-sync` skill |
| History that only appends (runs, telemetry, sessions) | **Event log** | none | local append table, batched upload |

CRDT is not a default and never applies to relational rows. If you are about to
put CRDT semantics on an entity table, stop — you picked the wrong lane.

## Second question: which privacy class?

`public` | `trusted` (both server-synced, tenant-bound) | `local` (NEVER
server-synced — structurally refused at the enqueue boundary, fail closed).
Unknown class = `local`. Secrets are always `local`. An embedding or derived
value of `local` data is itself `local`.

## The seven invariants (review-blocking)

1. Server is authority for shared relational data — client optimism is UI overlay.
2. Client-generated UUID PKs; every write idempotent/replayable.
3. Additive-only local migrations (`deprecated_at`, never destructive).
4. Secrets and `local`-class data never enqueue for server sync.
5. Boot order: migrations → seed/lookup → pre-onboarding load → [onboarding] →
   post-onboarding load → sync attach. Surface as idle→hydrating→syncing→ready.
6. One abstraction, many transports: features talk to `SyncTransport` /
   repositories — never to a specific gateway or socket.
7. Assume per-event authz re-check server-side; never widen subscriptions past
   the user's scopes; fail closed when authz is unreachable.

## Partial replication (what the device actually holds)

- **User subset**: declared `SyncScope`s with tenant predicates bound to the
  verified JWT. No "sync everything" scope exists. Params are parameterized-
  query inputs (allowlisted), never interpolated SQL.
- **Shared lookup/metatype data**: versioned bundles + ETag/304 re-validation
  + version-bump events over the sync stream — lookups CHANGE and must stay
  current; clients never write lookup tables.
- **One-time loads**: `pre_onboarding_load` (anonymous-safe) and
  `post_onboarding_load` (after preferences/personal data exist), idempotent
  via the local `_load_ledger`, pull-only, never block onboarding on failure.

Full mechanics: `references/partial-replication.md`.

## Write path (one queue, not two)

All offline writes go through the durable `_operation_queue`
(`PENDING → IN_FLIGHT → SYNCED / RETRYABLE_ERROR / FATAL_ERROR → DEAD_LETTER`).
PEM pending-action optimism reads THIS queue's state — never build a parallel
queue. DEAD_LETTER is user-visible (SyncChip detail), never silent.

## Standing rejections (do not re-litigate)

- No ElectricSQL backbone (c106 pivot; FRF owns CDC). ADR-LFS-1.
- No TanStack Query / TanStack DB — PEM 3.x owns entity state. ADR-LFS-4.
- No Yjs/Automerge — Loro only, no interop layer. ADR-LFS-5.
- No per-client replication slots; no binaries through the sync engine; no
  second protocol vocabulary.
- Always keep the thin-client (server-only) fallback working — feature code
  talks to repositories and must not assume a local store exists.

## Checklist before you write code

- [ ] Lane chosen and stated in the change description
- [ ] Privacy class declared for every new entity type / column
- [ ] New tables: client-UUID PK, `updated_at`, additive migration
- [ ] Synced? → scope defined with tenant predicate; lookup? → bundle + version
- [ ] Writes go through the queue; reads through PEM/repositories
- [ ] Boot-order stage identified for any new load
- [ ] Behavior tests at the transport/repository boundary (loopback transport;
      no mocks of internal sync code)
