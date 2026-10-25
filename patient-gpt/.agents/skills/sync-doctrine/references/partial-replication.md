# Partial Replication — Scopes, Lookup Currency, Onboarding Loads

> A user's device never mirrors the server database. It holds exactly three
> kinds of lane-1 data: **the user's subset**, **shared lookup/metatype data**,
> and **one-time loads**. This doc defines each. Doctrine:
> [doctrine.md](doctrine.md); decisions: [decisions.md](decisions.md).

## 1. Scope descriptors (the user's subset)

Replication is declared, never ad-hoc. A client attaches *scopes* — the
bucket concept from the PowerSync/PES lineage — through the frozen seam:

```rust
// gen_ui_types::sync (frozen seam — extend, never break)
pub struct SyncScope {
    /// Stable scope id, e.g. "user-tasks", "org-projects", "lookup-metatypes".
    pub name: String,
    /// Parameters resolved CLIENT-side from identity, e.g. {"sub": "<user-id>"}.
    /// The server re-derives them from the verified JWT — client values are
    /// hints, never authority (LFS-INV-7).
    pub params: BTreeMap<String, String>,
    pub kind: ScopeKind, // UserSubset | SharedLookup
}

pub trait SyncTransport {
    /// Attach scopes; transport streams row ops until stopped.
    fn start(&self, scopes: Vec<SyncScope>, ...) -> Result<SyncHandle>;
    fn enqueue_write(&self, op: WriteOp) -> Result<()>;
    fn status(&self) -> SyncStatus;
}
```

Rules (mirroring the PES sync-rules discipline, enforced server-side):

- Every `UserSubset` scope definition MUST contain a tenant predicate bound to
  the verified JWT subject. Tenantless definitions are refused at load time
  (fail closed) — there is no "sync everything" scope.
- Scope parameters are parameterized-query inputs only (allowlist
  `^[a-zA-Z0-9_-]{1,128}$`); never string-interpolated into SQL. The Electric
  ORDER-BY SQLi (CVE-2026-40906) is the standing lesson.
- Clients may attach many small scopes; the server owns which rows each scope
  yields. Move-in/move-out (a row entering/leaving a scope) arrives as
  insert/delete ops — clients never diff scopes themselves.
- First attach hydrates via snapshot (begin/batch/complete with checksums),
  then streams deltas from the client's stored offset. Offsets are per-scope.

## 2. Shared lookup / metatype data — and keeping it CURRENT

Lookup data (types, categories, units, feature flags, metatype registries) is
read-only on clients, shared by all users, and **changes over time**. It gets
its own machinery — a `SharedLookup` scope backed by *versioned bundles*, not
row-level user sync:

- **Bundle**: a named, versioned JSON payload (`lookups/<name>@<version>`),
  fetched via `gen_ui_db::relational`'s seed loader (bundled file, HTTP, or
  IPFS CID — all exist since C-003). Every bundle response carries an ETag.
- **Currency loop** (the part naive designs miss):
  1. On boot (hydrating phase), each subscribed bundle re-validates with
     `If-None-Match`; 304 = still current, 200 = atomically replace the
     bundle's table contents inside one transaction.
  2. While online, the transport's `SharedLookup` scope delivers *bump events*
     (`lookup:<name> → version N`) over the same stream as user data — a bump
     triggers the ETag re-fetch. No polling loops in feature code.
  3. Applied bundle versions are recorded in the local `_lookup_versions`
     table; UI can render "catalog updated" from PEM reactivity because bundle
     tables are registered PEM entities like any other.
- Lookup tables are **never** written by clients (audit gate). A client that
  needs to extend a lookup writes a lane-1 user row that references it.
- Deletions/renames in lookups follow LFS-INV-3: additive with `deprecated_at`
  columns, so offline clients referencing an old value still hydrate.

## 3. One-time loads — pre- and post-onboarding

Some data loads exactly once from the server, at well-defined moments:

| Stage | When | Examples | Gate |
|---|---|---|---|
| `pre_onboarding_load` | after migrations+lookups, before the user sees onboarding | app manifest, plan limits, onboarding copy, model catalog | none (anonymous or device credential) |
| `post_onboarding_load` | immediately after onboarding completes (preferences/personal data captured) | preference-derived starter content, personalization seeds, initial recommendations | requires authenticated user + completed-onboarding flag |

Design rules:

- Both stages are **explicit typestate states** in the startup orchestrator
  (extending LFS-INV-5's boot order): `migrations → seed/lookup →
  pre_onboarding_load → [onboarding UI] → post_onboarding_load → sync attach`.
  Sync never attaches before the post-onboarding stage has either run or been
  recorded as not-applicable.
- **Idempotence via a load ledger.** Each completed load writes a row to the
  local `_load_ledger` (`load_name, version, completed_at`). A load runs only
  if its ledger row is absent or its declared version is newer. Re-running is
  always safe (LFS-INV-2 applies to any server writes these loads trigger).
- One-time loads are pull-only HTTP/RPC fetches, not sync scopes — they must
  work in thin-client mode too. After the load lands, the written rows behave
  like any other local data (and may *then* be covered by scopes).
- A failed post-onboarding load degrades: the app proceeds with defaults, the
  ledger row is absent, and the load retries on next boot (never blocks the
  user in onboarding).

## 4. What flows where (summary)

```
server Postgres ──CDC──▶ gateway ──scope streams──▶ local store (user subset)
server bundles  ──ETag/304 + bump events─────────▶ local lookup tables
server APIs     ──once, ledgered────────────────▶ pre/post-onboarding rows
local writes    ──_operation_queue (FIFO, idempotent)──▶ server write path
```

PEM sits above the local store on every surface: scopes/bundles/loads all land
in tables that PEM transports expose as entities — feature code only ever sees
PEM hooks (React) / providers (Flutter), never the sync machinery.
