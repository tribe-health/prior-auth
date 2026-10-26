# Design

## Context

KnowMe runs fastembed 5.17.3 with all-MiniLM-L6-v2 and embedded SurrealDB on
RocksDB on iOS and Android (`gen_ui_ffi/src/api/boot.rs:200`). The hybrid mobile
architecture doctrine names SQLite + sqlite-vec as the mobile primary store
(`references/sync/doctrine.md:33`, cited by analysis; that checkout is missing on
this machine, so the citation is carried from `analysis.md`, not re-read).
PatientGPT desktop already runs SurrealDB 3.3.0 `kv-rocksdb` in
`crates/patient-gpt-storage`.

## Goals / Non-Goals

**Goals:** one embedder everywhere; a durable mobile store for conversations and
settings; a recorded rule against comparing vectors across embedders.

**Non-Goals:** persisting PatientGPT vectors or local semantic search (no consumer
this phase; the `docs/design` search stays on its deterministic vectors);
sync of any local record.

## Decisions

1. **fastembed with a user-defined model.** Load `onnx/model_int8.onnx` and the
   tokenizer files from the catalog directory through fastembed's user-defined
   model path; default features off, `ort-download-binaries-rustls-tls` on,
   `hf-hub-rustls-tls` off (analysis → Embedder).
2. **Query/document prefixes.** arctic-embed uses a query prefix for retrieval
   queries. The `purpose` field selects it; the exact prefix string is taken from
   the model card at the pinned revision in task 1.2.
3. **Separate vector spaces (two-embedder rule).** UAR's memory embedder (candle,
   when UAR is embedded) and PatientGPT's embedder stay separate. No comparison
   code is written this phase because nothing compares vectors; the first vector
   consumer must enforce the rule. Alternative: configure UAR memory to use PatientGPT's
   embedder — deferred, it needs a UAR-side port that does not exist.
4. **Mobile SurrealDB reuses `patient-gpt-storage`.** The `surreal` feature
   compiles for the mobile targets; the FFI boot opens `rocksdb://<app data>/store`.
   No in-memory fallback.
5. **ADR content.** Context (doctrine row, KnowMe precedent), decision (operator
   decision 7, D-016), consequences (one engine on desktop and mobile; RocksDB
   C++ in mobile builds; binary size; BSL 1.1 use grant excludes offering a
   Database Service, converts to Apache-2.0 on 2030-01-01; legal review
   recommended), alternative (rusqlite 0.41.0 + sqlite-vec 0.1.9).

## Risks / Trade-offs

- [`tokenizers` `onig` C build fails in iOS/Android cross-compiles] → try fastembed's
  feature set without `onig` first; if both fail, embedder on mobile is Blocked and
  reported.
- [ort release-candidate breakage (#545, #514)] → exact `=2.0.0-rc.15` pin.
- [Build-time download from `cdn.pyke.io`] → hash-pinned by ort; offline builds use
  a vendored runtime with `ORT_LIB_LOCATION`.
- [RocksDB adds size and build time on mobile] → measured by the first mobile
  build and recorded in the runbook; no budget is set by this change.
