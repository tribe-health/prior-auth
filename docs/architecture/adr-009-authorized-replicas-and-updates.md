# ADR-009 · Authorized replicas, platform storage and coordinated updates

**Status** Accepted target design · **Date** 2026-09-06  
**Supersedes** [ADR-007](adr-007-local-first-sync.md).  
**Implementation** Not certified; native materialization and the FRF shape facade require implementation and parity proof.

## Context

The shared browser/Tauri application requires a real local relational replica,
coherent graph hydration and one authorized replication owner. Snapshot storage
adapters and a graph event bridge do not by themselves populate SQL tables or
atomically persist a stream checkpoint. The earlier browser-only decision also
treated schema omission as a stronger privacy guarantee than it provides.

The [application runtime architecture](application-runtime-architecture.md)
sections 3, 6–8 and 10–14 specify this decision's detailed protocols and tests.
[ADR-008](adr-008-shared-runtime-state-and-sessions.md) owns session and graph
lifetime. [ADR-001](adr-001-no-query-cache.md) remains the no-query-cache rule.

## Decision

Relational reads follow:

```text
Flint Forge Postgres → ElectricSQL → authorized FRF shape facade
  → platform local database → atomic PEM graph projection → shared React UI

browser commands: feature API → Flint Gate → authoritative AppServices → Postgres
desktop commands: feature API → typed IPC → trusted host → Flint Gate
  → authoritative AppServices → Postgres
```

The FRF facade preserves Electric's HTTP shape protocol, including snapshot,
offset, handle, continuation and refetch behavior. Gate and the facade derive
allowed rows, columns and practice scope server-side from verified identity.
Every continuation is authorized. A client predicate or tenant-scoped adapter
is useful validation but cannot enforce access against a modified client.

Use authorized base-table projections with server-maintained practice scoping.
Do not use ordinary or materialized SQL views as Electric replication sources
in the current deployment. Local-only records and their embeddings are excluded
from both Electric and FRF egress by the server-side lane/privacy boundary.
The local schema contains only the approved projection. IDs and document names
can still be sensitive; neither a small table set nor extension availability
proves that a replica contains no PHI.

### Platform storage

| Platform | Decision | Condition |
|---|---|---|
| Browser | Worker-owned PGlite, with one elected DB/sync owner per authorized namespace | Persistent IndexedDB only where device policy permits; unmanaged/shared use is memory-only; measure OPFS separately |
| Tauri baseline | Worker-owned PGlite | Establish shared SQL and replication behavior before claiming native parity |
| Tauri preferred production target | Trusted host-owned SQLite and typed repositories/IPC | Native Electric materialization, transactions, migrations, serialization and multi-window parity must pass first |

Database files and migration SQL are platform-specific. The logical schema,
entity identities, ordered lists, checkpoints and acceptance contracts are
shared. No silent runtime fallback changes storage or inference lanes.
PEM's PGlite/Tauri SQL persistence adapters store graph snapshots; its native
in-memory mirror is not a durable relational database. Keep that distinction
explicit when using either bridge.

### Commit and hydration ordering

Migrate under exclusive ownership before replication and hydration. Apply each
replication batch and its resume checkpoint in one database transaction, then
publish the coherent related entities and lists atomically into PEM. One
relational feed owns each clinical entity type. FRF agent/CRDT events may
coordinate separate lanes; they cannot become a second clinical row writer.

Hydrate from committed SQL. Use graph snapshots only when namespace, schema,
projection version and checkpoint agree with the replica. Initial-sync
completion is separate from database-open and graph-hydration completion.
Expired shapes/refetch rebuild the affected generation and remove obsolete
rows. Establish a revision handshake between hydration and subscriptions to
avoid dropping changes at the boundary.

Clinical writes always pass the three independent authority layers in ADR-002.
Local optimistic overlays can show pending intent but cannot invent a committed
affirmation or signature. Use server-validated revision/idempotency/correlation
contracts and do not automatically replay signing through a generic offline
queue. These contracts are design requirements, not claims about current APIs.

### Migration, update and recovery

Version server schema, logical replica schema, storage-engine format, graph
snapshot, shape projection and application/host compatibility independently.
Use ordered/checksummed migrations, refuse unsupported newer schemas, and
fence old tabs/windows during migration. Rebuild a disposable replica generation
when needed; preserve separately scoped unsent drafts under ADR-008.

Web updates stage immutable assets and coordinate a safe reload; private data
and credentials are excluded from service-worker caches. Tauri updates ship
signed matching frontend/host packages and relaunch before migration. Do not
replace privileged desktop JavaScript independently from the host. Preserve or
resolve unsent work and in-flight command results before a routine update.
Rollback requires data compatibility or controlled restore/rebuild. Server
deployments follow expand/migrate/contract across the supported client window.

## Consequences and alternatives

Native SQLite is the preferred desktop ownership model, not a proven performance
win or a drop-in Electric adapter. The difficult cost is implementing and proving
a second materializer and SQL dialect. Keep PGlite as the baseline until that
cost is paid. A snapshot-only client cannot satisfy SQL-backed reads, while a
bundled PostgreSQL service adds operational burden not justified for this replica.

The historical evaluation of `prometheus-entity-sync` in ADR-007 remains a dated
record. This decision selects Electric plus FRF integration without asserting
the old package-publication observations are still current. Flutter retains the
domain contracts but requires a separate storage/sync decision; this ADR does
not certify a Flutter client.

## Verification

Use runtime architecture section 14 for browser/native parity, cold and warm
hydration, atomic entity/list publication, checkpoint crashes, refetch deletion,
revocation, account changes, migrations and coordinated updates. Server boundary
tests must show that modified client shape requests cannot widen the projection.
The existing six structural audit checks are necessary for implementation but
do not certify any of these end-to-end guarantees.
