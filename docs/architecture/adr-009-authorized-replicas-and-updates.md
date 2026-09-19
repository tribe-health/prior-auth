# ADR-009 · Authorized replicas, platform storage and coordinated updates

**Status** Accepted target design · **Date** 2026-09-06  
**Supersedes** [ADR-007](adr-007-local-first-sync.md).  
**Implementation** Not certified; the authorized FRF facade exists and the
synthetic PGlite baseline is measured in one macOS WKWebView runtime. Production
shape materialization, native SQLite parity, and cross-platform qualification
still require implementation and proof.

## Context

The shared browser/Tauri application requires a real local relational replica,
coherent graph hydration and one authorized replication owner. Snapshot storage
adapters and a graph event bridge do not by themselves populate SQL tables or
atomically persist a stream checkpoint. The earlier browser-only decision also
treated schema omission as a stronger privacy guarantee than it provides.

The [application runtime architecture](application-runtime-architecture.md)
sections 3, 6–8 and 10–14 specify this decision's detailed protocols and tests.
[ADR-008](adr-008-shared-runtime-state-and-sessions.md) owns session and graph
lifetime. [ADR-010](adr-010-native-session-credentials.md) owns the desktop
credential facility and sanitized renderer projection. [ADR-001](adr-001-no-query-cache.md)
remains the no-query-cache rule.

The [Web Case-to-Letter Workflow Contract](web-case-to-letter-contract.md)
governs the current execution order and complete browser product scenario.

## Decision

Relational reads follow:

```text
Flint Forge Postgres → ElectricSQL → authorized FRF shape facade
  → platform local database → atomic PEM graph projection → shared React UI

browser commands: feature API → Flint Gate → authoritative AppServices → Postgres
desktop commands: feature API → typed IPC → trusted host → Flint Gate
  → authoritative AppServices → Postgres
```

Desktop IPC commands obtain the opaque Kratos token from ADR-010's host-only
credential owner at invocation time. IPC payloads and results contain sanitized
application data only. The credential facility does not replace Gate,
`AppServices`, or PostgreSQL authorization.

The FRF facade preserves Electric's HTTP shape protocol, including snapshot,
offset, handle, continuation and refetch behavior. Gate and the facade derive
allowed rows, columns and practice scope server-side from verified identity.
Every continuation is authorized. A client predicate or tenant-scoped adapter
is useful validation but cannot enforce access against a modified client.

ASO persists session denials/logout retry state and membership authority events.
Gate performs a fresh ASO authority-fence decision for every protected
authorization and uses Redis only as a shared monotonic coherency fence. FRF
holds the returned grant through protected body production. The client receives
committed relational frames through one materializer; RA11c owns that caller's
replica-failure publication into the RA06 Zustand access fence.

The RA11c browser materializer exceeded its fixed RSS qualification budget and
is therefore disabled in the production GraphProvider path. Only the exact
`VITE_ASO_ENABLE_RA11C_MATERIALIZER=experimental` value enables it for local
qualification. No release configuration may set that value until a later
architecture decision resolves the failed browser database gate.

Use authorized base-table projections with server-maintained practice scoping.
Do not use ordinary or materialized SQL views as Electric replication sources
in the current deployment. Local-only records and their embeddings are excluded
from both Electric and FRF egress by the server-side lane/privacy boundary.
The local schema contains only the approved projection. IDs and document names
can still be sensitive; neither a small table set nor extension availability
proves that a replica contains no PHI.

Projection revision 5 retains attributed annotations as a practice-scoped
base table and `annotation_types` as an approved reference projection. The
annotation row includes the opinion body, author label, `surgeon` provenance,
include/hold state, revision, and evidence/document target needed by the UI.
The catalog exposes only `id`, `key`, `name`, and `description`, which lets the
UI select a server-owned type for first creation. Type-specific annotation JSON
Schema and `data`, immutable revision history, command receipts, and audit rows
remain server-side. Revision 5 also replaces the raw document metadata shape
with `document_statuses`: a case-scoped derived base table whose exact public
columns carry processing state and an immutable content digest while source
text, object locations, parser output, and embeddings remain structurally
absent. Until G-DATA approves durable private client storage, the
clinical projection is eligible only in the memory-only browser runtime and
synthetic verification.

### Web-first delivery gate

Complete `web-00` through `web-17`, safe browser updates in `ra-20`, and the
browser-scoped `ra-22` certification before resuming native SQLite parity or
native updater certification. Typed desktop wrappers remain part of each new
command contract, but no Tauri or mobile result may block or substitute for the
browser result. The browser campaign includes both denial-response paths and
requires every included generated assertion to resolve a source document,
positive page number and source date. Annotation and criterion links remain
auxiliary attribution.

### Platform storage

| Platform | Decision | Condition |
|---|---|---|
| Browser | Worker-owned PGlite, with one elected DB/sync owner per authorized namespace | Persistent IndexedDB only where device policy permits; unmanaged/shared use is memory-only; measure OPFS separately |
| Tauri baseline | Worker-owned PGlite | Establish shared SQL and replication behavior before claiming native parity |
| Tauri preferred production target | Trusted host-owned SQLite and typed repositories/IPC | Native Electric materialization, transactions, migrations, serialization and multi-window parity must pass first |

The measured [Tauri PGlite baseline](tauri-pglite-baseline.md) records the exact
macOS/WebKit runtime, cold/warm/catch-up/teardown timings, and the limit of its
synthetic IndexedDB persistence claim.

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

### Revocation ordering

Session denial binds deployment, Kratos issuer and verified Kratos session ID.
Membership authority binds deployment, ASO incarnation and monotonic global
authorization revision. The revision and replayable authority event commit in
the same transaction. Every event allocation holds the authority singleton
through commit, so a replay cursor cannot advance past an uncommitted lower
sequence. Logout commits denial plus retry intent before contacting Kratos and
retains denial through original expiry plus skew. Retry and confirmation writes
require the matching lease to remain live when the transition is observed. A
restarted Gate bootstraps the ASO snapshot and durable outbox before using L1/L2; a running Gate
disables those caches on event lag, Redis loss or regression. Duplicate or
reordered events cannot lower the fence.

FRF uses a shell-neutral protected-body lease. It revalidates at most every
750 ms, bounds the authority RPC at 750 ms and propagates cancellation within
250 ms. The trusted shell samples monotonic time before sub-second Unix time and
passes the pair, so FRF anchors integer JWT expiry to its exact Unix-second
boundary without adding dispatch delay. The response stream checks its monotonic
deadline before and after receiver polling as well as relying on the background
cancellation owner, so scheduler order cannot release a queued late frame. The
5,000 ms contract starts at the authoritative ASO commit or verified
expiry and ends at the final protected frame produced by the server or
cancellation that prevents the next frame, followed by denial of a subsequent
request. Kernel/proxy buffering, network transit and client receipt are outside
the claim. For direct Kratos revocation, the observable interval begins at the
first mounted server observation, which records the same ASO denial before reuse.

Clinical writes always pass the three independent authority layers in ADR-002.
Local optimistic overlays can show pending intent but cannot invent a committed
affirmation, signature or evidence state. Gate affirmation, signing and evidence
reassessment use server-validated command IDs and identity/practice-scoped result
lookup; changed payloads conflict before mutable target state is evaluated.
Signing binds expected letter, QA and signature revisions, while database
triggers and shared transaction locks make the approved claim set, QA rows and
cited document versions immutable. Approval is terminal except for signing.
Approval also locks the QA and claim relations against truncation and
revalidates the complete required QA and cited-document sets before binding its
revision.
Reassessment binds the observed assessment timestamp and preserves `met`, `gap`
and `void` as distinct values. Their authoritative transactions store immutable
results and audit events. Do not automatically replay these operations through
a generic offline queue or PEM action replay.

The mounted ASO server refuses startup unless Kratos, the restricted session
database login and the restricted clinical-command database login are all
configured against the same database. One PostgreSQL adapter supplies case,
evidence, letter and authority command ports; no production path substitutes
process-local clinical state. The legacy actor-less evidence-count route is
unmounted until it is converted to fresh verified context. It must not regain
synthetic memory data as a compatibility fallback.

### Migration, update and recovery

The server migration entry point rejects all-table, `aso` schema and explicit
table publications containing a local command ledger before any separately
committed migration runs, and repeats the check afterward. Migration
`2026090600` and `2026090607` run in a pre-ledger pass. They install the OID
registry, end validation, and a DDL-start advisory-lock protocol. Table creation
and alteration take the shared lock; publication creation and alteration take
the exclusive lock. A waiter aborts with SQLSTATE `40001` after the winner
commits so its DDL can be retried with a fresh catalog snapshot. The relation
identity remains protected across a rename or schema move. The guard compares
registered relation namespaces with schema publications as well as inspecting
explicit table membership. The preflight also recognizes the durable local
privacy comment on an older renamed or moved ledger before the registry exists.
After an unsafe publication is repaired and possible exposure is checked, the
same checksummed migration set can be rerun. Fixtures prove first-install
refusal leaves no server migration ledger or signing table, legacy explicit or
schema exposure blocks upgrades, and direct, rename, schema-move and concurrent
table/publication attempts are refused. Migration `2026090608` repairs existing
deployments additively by serializing approval with QA and claim truncation,
then rechecking required QA rows and every included claim's document, positive
page number and source-date provenance.

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

Use runtime architecture section 14 first for the complete browser workflow,
cold and warm hydration, atomic entity/list publication, checkpoint crashes,
refetch deletion, distributed revocation, final-frame cancellation,
materializer failure publication, account changes, migrations and coordinated
browser updates. Server boundary tests must show that modified client shape
requests cannot widen the projection. Native parity and updater qualification
run later as their own platform campaign. The existing six structural audit
checks are necessary for implementation but do not certify any end-to-end
guarantee.
