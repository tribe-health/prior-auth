# Sync Decisions — ADR-LFS-1 … 5

> Ratified 2026-07-18 for the local-first-realtime-sync phase. Each ADR
> resolves an open decision (OD-n) from
> `docs/knowme-local-first-realtime-master-plan.md` §9, consistent with the
> recorded c106 pivot (user decision, 2026-07-16). Status: **accepted** for
> this repo and its scaffolded projects; the master plan's owner can override,
> in which case the seams named under "Blast radius" are what re-shapes.

## ADR-LFS-1 — Sync gateway lane: FRF substrate, PES buckets (resolves OD-2)

**Decision.** The realtime/CDC substrate is flint-realtime-fabric; the durable
sync gateway model is PES-style buckets deployed as an FRF edge module.
ElectricSQL is not the backbone (c106: two CDC consumers on one WAL rejected);
the C-005 Electric consumer remains as legacy/fallback reference code only.

**Consequence for this repo.** Client code targets the frozen
`gen_ui_types::sync::SyncTransport` seam exclusively. Until the PES gateway
ships upstream, slices run on a dev loopback transport; the PES client is a
drop-in transport later. No feature may depend on Electric-specific semantics
(shape handles, 409 rotation) outside the legacy module.

**Blast radius if overridden.** Transport adapters only; scope descriptors and
the write queue are gateway-agnostic by construction.

## ADR-LFS-2 — PEM's sync adapter: PES-canonical (resolves OD-3)

**Decision.** PEM 3.x bridges to sync through ONE canonical path: local-store
transports hydrated by the sync engine (scope streams → local tables → PEM
entities). PEM's legacy `flint.ts` event adapter is on a one-release
deprecation clock and must not appear in new scaffolds.

**Consequence.** `registerEntityTransport` implementations read the local
store; they never open their own sockets. Sync status/optimism surfaces
through the write queue's state (one queue, not two — PEM pending-action
replay reads queue state rather than maintaining parallel truth).

## ADR-LFS-3 — Wire shape: envelope default, columnar opt-in (resolves OD-4)

**Decision.** Synced rows travel as `(id, payload JSONB, metadata)` envelopes
by default. An entity type may opt into columnar sync (real columns on the
local table) via its schema declaration when local SQL needs the columns —
notably `vector(384)` embedding columns and columns used in local indexes.

**Consequence.** Derived/embedding columns default to device-local recompute
(see [client-rag.md](client-rag.md)); opting a column into sync is a schema
decision reviewed against payload size and privacy class.

## ADR-LFS-4 — Entity/server state layer: PEM only (resolves OD-7)

**Decision.** `@prometheus-ags/prometheus-entity-management` 3.x is the only
client entity/server-state layer. TanStack Query (and TanStack DB) are
prohibited in scaffolded projects — the sync plane owns staleness,
deduplication, and revalidation, which is precisely the layer a query cache
would duplicate incorrectly. `audit.mjs` enforces this.

**Rationale.** Query caches model *requests*; local-first apps model *data*.
Once a synced local store exists, "is it stale?" is the sync engine's fact,
not a per-hook cache policy. PEM's normalized graph + transports sit at that
data layer; TanStack Query would sit above it re-answering a question the
store already answers, in the wrong layer of the client.

## ADR-LFS-5 — CRDT: Loro, everywhere, exclusively (adopts FRF ADR-001)

**Decision.** Loro 1.13.x is the CRDT for doc-lane data (agent scratchpads,
profile vault). Yjs/Yrs and Automerge are rejected; Loro does not speak the
Yjs wire protocol and no interop layer will be written. CRDT bytes are opaque
outside the vault/doc modules (`crdt_state BYTEA`).

**Consequence.** The web surface uses `loro-crdt` (npm) driven by the same
protocol state machine as the Rust `loro` crate on native surfaces; version
vectors + `export_updates_since` deltas are the only exchange primitives
(see [peer-crdt.md](peer-crdt.md)). Any dependency on y-* packages is a
review-blocking finding.

---

Standing items deliberately NOT decided here (out of phase scope): OD-1 (A2UI
naming), OD-2c (Flutter sync client lane — blocked on upstream frb/uniffi
async ABI; mobile ships doctrine + stubs this phase), OD-5/OD-10/OD-11 (WASM,
DID, iOS distribution), OD-6 (SurrealDB benchmark gate — the graph-RAG module
stays optional), OD-8 (Tauri sidecar criteria), OD-13 (SDK publication).
