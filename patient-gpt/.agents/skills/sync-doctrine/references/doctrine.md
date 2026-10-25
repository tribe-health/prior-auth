# Sync Doctrine — Local-First Invariants (TJ-ARCH-MOB-001)

> Read this before any sync, replication, realtime, or offline-storage work.
> Derived from `docs/knowme-local-first-realtime-master-plan.md` and the ten
> research briefs in `docs/research/`; ratified decisions live in
> [decisions.md](decisions.md). Companion docs:
> [partial-replication.md](partial-replication.md),
> [peer-crdt.md](peer-crdt.md), [client-rag.md](client-rag.md).

## The three-way data split

Every piece of client-visible data belongs to exactly one lane. Deciding the
lane is the FIRST design act for any feature; mixing lanes is the root cause of
most sync defects.

| Lane | Authority | Merge model | Examples |
|---|---|---|---|
| **Relational app data** | Server (Postgres) | Server-authoritative LWW + client upload queue | entities, conversations, messages, settings rows, shared lookup/metatype data |
| **Collaborative / user-owned documents** | CRDT (Loro) | CRDT merge (commutative, no conflicts) | agent scratchpads, collaborative artifacts, the peer-only profile vault |
| **Append-only histories** | Local, then batched | Append/event-log (no merge) | telemetry, agent run logs, session histories |

CRDT is NOT a default. It is reserved for data that is intrinsically
collaborative or intrinsically user-owned (see [peer-crdt.md](peer-crdt.md)).
Relational rows never carry CRDT semantics; CRDT state crosses boundaries only
as opaque bytes (`crdt_state BYTEA` / `Vec<u8>`), never as parsed structures.

## Store matrix (per target — non-negotiable)

| Target | Relational store | Vector | Notes |
|---|---|---|---|
| Web | Electric PGlite (`idb://`) | pgvector in PGlite | single-connection; SharedWorker leader election for multi-tab |
| Tauri desktop | pglite-oxide → sqlx `PgPool` (pool=1) | pgvector | embedded-engine singleton lifecycle (see `references/rust/patterns.md`) |
| iOS / Android | SQLite (sqlx-sqlite) | sqlite-vec | **PGlite is structurally impossible on mobile** — never propose it |
| Cloud | Postgres 18 (flint-forge) | pgvector | the single write authority for lane 1 |

The **repository trait, not the connection string, is the portability seam**.
Feature code depends on `gen_ui_db` traits; only adapters know which engine is
underneath. Graph/RAG indices (SurrealDB or sqlite-vec+FTS5) are derived,
rebuildable, and never on the sync critical path.

## Invariants (LFS-INV-1 … 7)

Violating any of these is a blocking review finding.

1. **LFS-INV-1 — Server authority for shared relational data.** Postgres is
   the source of truth for lane-1 data. Clients never "win" a conflict; they
   converge to what the server accepted. Client-side optimism is a UI overlay
   (PEM pending actions), not a truth claim.
2. **LFS-INV-2 — Client-generated UUID PKs + idempotent writes.** Every client
   write carries a client-generated UUID and is safe to replay. The write queue
   may deliver at-least-once; the server must deduplicate on that UUID.
3. **LFS-INV-3 — Additive-only client migrations.** Local schemas evolve by
   adding tables/columns, never by destructive rewrites, so an old device can
   always catch up after months offline.
4. **LFS-INV-4 — Secrets and `local`-class data never sync.** Exclusion is
   *structural*, enforced at the enqueue boundary (the write queue refuses the
   row), not by server filtering. Fail closed: unknown privacy class = local.
   See [peer-crdt.md](peer-crdt.md) for the privacy-class taxonomy.
5. **LFS-INV-5 — Boot order is migrations → seed/lookup → sync attach.**
   Enforced by the typestate startup orchestrator in `gen_ui_db::relational`.
   Sync never attaches to an unmigrated or unseeded store. Boot phases surface
   to UI as `idle → hydrating → syncing → ready`.
6. **LFS-INV-6 — One sync abstraction, many transports.** All read sync goes
   through the frozen `gen_ui_types::sync::SyncTransport` seam; all writes go
   through the `gen_ui_db::sync` write queue. Transports (dev loopback, FRF/PES
   gateway, peer lanes) are swappable behind these seams. Never wire a feature
   directly to a transport.
7. **LFS-INV-7 — Per-event authorization re-check on every server fan-out.**
   WAL/CDC replication bypasses RLS, so every event delivered to a client must
   be re-authorized at fan-out time (Keto/RLS re-query pattern). Client code
   must assume the server enforces this and must never widen a subscription
   beyond the user's scopes. Fail closed on authz-service unreachable.

## The write queue (lane 1 writes)

Offline writes live in a durable local `_operation_queue` with this state
machine — implemented in `gen_ui_db::sync::write_queue`; do not invent a
second one:

```
PENDING → IN_FLIGHT → SYNCED
                    ↘ RETRYABLE_ERROR → (backoff) → PENDING
                    ↘ FATAL_ERROR → DEAD_LETTER (user-visible, never silent)
```

Rules:

- One queue per store. PEM's pending-action replay and the sync write queue
  must be reconciled ("one queue, not two") — PEM optimism reads FROM this
  queue's state; it does not maintain a parallel truth.
- DEAD_LETTER is surfaced in UI (SyncChip detail), never silently dropped.
- The queue is append-only while offline; draining order is FIFO per entity.

## Fail-closed catalogue

| Situation | Behavior |
|---|---|
| Unknown privacy class | treat as `local`, never enqueue |
| Authz service unreachable at fan-out | drop the event, not the check |
| Unknown ContentBlock / A2UI component | render fallback, never execute |
| Sync token expired | pause queue, re-auth; never send on stale identity |
| Bucket/scope definition without tenant predicate | refuse at load time |

## Thin-client fallback (the LobeChat lesson)

Every scaffolded app MUST keep a server-only mode where the local store is
bypassed (pooled Postgres-over-WS, juit-pgproxy pattern). PGlite adds ~3.5 MB
gz and 200–800 ms cold start; some deployments will turn local-first OFF, and
the app must degrade to thin-client cleanly. Feature code cannot assume the
local store exists — it talks to repositories, which may be remote.

## What NOT to build (standing rejections)

- **No ElectricSQL as the sync backbone** (c106 pivot, user decision): FRF owns
  CDC; two logical-replication consumers on one WAL is rejected. The C-005
  Electric consumer in `gen_ui_db::sync` is legacy/fallback reference only.
- **No TanStack Query** — PEM 3.x owns entity/server state (ADR-LFS-4).
- **No Yjs/Automerge** — Loro is the CRDT (ADR-LFS-5); no interop layer.
- **No second protocol vocabulary, no per-client replication slots, no
  syncing of binaries through the sync engine** (sync metadata, fetch
  content-addressed payloads separately).
- **No mocks of internal sync code in tests** — fake at the transport boundary
  (loopback transport), wiremock only for real HTTP edges.
