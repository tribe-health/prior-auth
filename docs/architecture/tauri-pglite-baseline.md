# Tauri PGlite baseline

**Status:** Measured baseline, not a production storage approval
**Observed:** 2026-09-16 on macOS 26.7 (25G227), arm64, WebKit 21624.5.1.11.3

This record qualifies PGlite as the shared SQL baseline inside an actual Tauri
webview. It does not select persistent clinical storage for every desktop
deployment. [ADR-009](adr-009-authorized-replicas-and-updates.md) remains the
decision: PGlite establishes browser/desktop parity while trusted host-owned
SQLite remains the preferred Tauri production target after its materializer,
transactions, migrations, serialization, and multi-window behavior pass the
same acceptance contract.

## Observed runtime

The fixture ran Tauri 2.11.5, Wry 0.55.1, and PGlite 0.5.8 in two native
WKWebView windows. A custom local Tauri protocol served a Vite production
bundle containing the real PGlite WASM and data assets. The fixture imported
the production replica schema, checkpoint schema, annotation/source additions,
replica target catalog, memory configuration, and `writeChunk` transaction
path. It did not substitute a browser build, mock database, snapshot adapter,
or Node filesystem.

The secondary window used a unique synthetic `idb://aso-ra18-*` namespace. It
opened PGlite, applied the production schema, committed and read one synthetic
case, committed another 250 cases, closed the database, reopened the same
namespace, counted all 251 rows, closed it again, and deleted the synthetic
IndexedDB database. All records used synthetic identifiers and labels.

| Observation | Result |
|---|---:|
| Cold open, schema, first commit, and first-row read | 2,524 ms |
| Catch-up transaction | 250 rows in 534 ms |
| Cold-instance `close()` | 70 ms |
| Reopen and persisted-row count | 432 ms |
| Warm-instance `close()` | 86 ms |
| Persisted rows after reopen | 251 |
| Persistence round trip | Passed |

These are one debug-build qualification run on one host. Timings use
`performance.now()` inside WKWebView. The cold timer starts when the benchmark
calls `PGlite.create`; it excludes Tauri process startup, page navigation, and
JavaScript module loading. It includes database/WASM initialization, schema
execution, the first transactional write, and the first read. The warm result
is an in-process close/reopen of the same IndexedDB namespace, not a process or
machine restart. The numbers establish observed behavior and are not a latency
SLA or a Windows/Linux claim.

Task 2.3 attempted fresh-store repetitions on the same host. Those repetitions
did not complete the full sequence. Newly created measurement webviews stalled
inside `PGlite.create()` after allocating a roughly 39 MB IndexedDB file. A
later run in the established lifecycle webview opened PGlite and read its first
row in 17,311 ms, then stalled during the 250-row catch-up. A diagnostic that
kept the full 250-row workload but divided it into five 50-row Electric-style
chunks committed 100 rows before the WebKit content process became idle and the
next transaction stopped returning. Each failed synthetic store occupied about
39–42 MB and was moved to the ignored `.runtime/ra18-quarantine/` directory
rather than reused.

Final review found that those diagnostic attempts had changed two parts of the
measured contract at once: the 250-row catch-up was divided into five
transactions and the warm reopen moved into a new WKWebView. Neither change was
required by this baseline. The fixture restored the original one-transaction,
same-WKWebView close/reopen sequence and reran it from current source. That run
passed with a 2,379 ms cold first row, a 542 ms 250-row catch-up, an 84 ms cold
close, a 446 ms reopen/read, a 90 ms warm close, 251 persisted rows, and
confirmed deletion of the synthetic IndexedDB database. The retained failures
therefore qualify the experimental variants; they no longer leave the checked-in
acceptance fixture without current-source evidence.

Adversarial review then found that production runtime detection treated the
Tauri-injected `window.isTauri` value as a function. The pinned JavaScript API
exposes `isTauri()` from `@tauri-apps/api/core`, while the injected value in the
measured WKWebView is boolean. The production adapter now uses the API function.
A second current-source native run observed `isTauri=true` in both windows and
again passed the full sequence: 2,454 ms cold first row, 556 ms catch-up, 85 ms
cold close, 441 ms reopen/read, 77 ms warm close, 251 persisted rows, and
synthetic database deletion.

The two complete measurements prove that PGlite can execute this contract in
the recorded native environment. They do not establish repeatable process
startup or recovery behavior. Production adoption remains blocked, and the
native SQLite comparison must treat completion reliability and cleanup after an
interrupted open as acceptance criteria alongside latency and parity. The task
2.3 diagnostic logs are retained as `task-7-native-measurement*.log`; the
current-source pass is retained as
`task-8-current-source-native-requalification.log`.

The executable evidence is
[`task-4-native-pglite.log`](../../.kbd-orchestrator/phases/runtime-architecture/evidence/ra-18-tauri-pglite-baseline/task-4-native-pglite.log).
The native runner rejects missing/non-finite measurements, the wrong PGlite
version or storage mode, anything other than 250 catch-up rows and 251 reopened
rows, and a failed persistence round trip before it prints `Passed`.

## Persistence policy

The application continues to default to memory. Persistent PGlite uses an
identity/practice-scoped IndexedDB namespace only after an explicit
`persistent` decision for a managed device. Unset, empty, explicit `memory`,
and unrecognized values select memory; an unrecognized value also reports a
configuration error. There is no automatic switch between memory, IndexedDB,
OPFS, or a native database based on environment or failure.

This baseline used IndexedDB because PGlite documents `idb://` as its browser
persistence URI and WKWebView supplies that browser storage API. The synthetic
round trip proves that mechanism works on the recorded OS/WebKit pair. It does
not approve PHI at rest on an unmanaged or shared workstation. Device policy,
storage protection, deletion, backup, and incident-response requirements must
approve a deployment before it enables the persistent mode.

PGlite also documents `opfs-ahp://` for its OPFS access-handle-pool filesystem
and recommends running that mode in a Web Worker. This baseline did not measure
OPFS, so it is not a selected fallback. The default in-memory construction and
explicit `close()` lifecycle follow PGlite's documented API. See PGlite's
[getting-started guide](https://github.com/electric-sql/pglite/blob/main/docs/docs/index.md),
[filesystem guide](https://github.com/electric-sql/pglite/blob/main/docs/docs/filesystems.md),
and [`close()` API](https://github.com/electric-sql/pglite/blob/main/docs/docs/api.md).

## Consistent application boundary

React views do not select a database engine. They read the scoped PEM graph and
runtime Zustand stores through the same hooks in browser and Tauri. The elected
replica owner alone opens, migrates, catches up, projects, and closes the local
database. A future Tauri SQLite adapter must preserve the same logical schema,
entity identities, ordered lists, checkpoints, hydration states, revocation
fences, and atomic graph publication before composition selects it.

The uncomfortable result is that the shared baseline is viable but heavy. The
fixture ships about 16.8 MB of PGlite WASM/data before compression, and its two
complete cold database-to-first-row operations took 2.4–2.5 seconds even after
the page and module were loaded. An experimental repetition ranged to 17.3
seconds and then stalled during catch-up. Interrupted openings also left
roughly 40 MB synthetic stores that JavaScript cleanup could not reach because
`PGlite.create()` never returned.
Earlier browser materializer qualification exceeded its fixed RSS gate. A
native engine may therefore be the better Tauri production
implementation, but it is not a shortcut: choosing it requires a second proven
materializer and migration path. Until that proof exists, PGlite is the only
measured cross-environment SQL behavior and remains disabled for production
clinical materialization under the existing RA11c gate.
