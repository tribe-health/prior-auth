# Web-05 task 3 — document status projection

Result: **Passed** at Tier 1.

The public replica contract now uses projection revision 5 and the public
shape `document_statuses`. PostgreSQL materializes the exact status row into a
WAL-producing base table, derives the internal scope from the controlling
case, and refreshes the row after every document mutation. FRF filters on the
internal `practice_id` but returns only the frozen eleven fields. PGlite stores
those fields in `document_statuses`, PEM publishes them as `DocumentStatus`,
and the evidence timeline joins through `replica:document_statuses`.

Source text, page hashes, object locations, parser output, and embeddings have
no column in the server projection, FRF column grant, PGlite table, or PEM
binding. The processing tables remain unpublished.

## Verification

- `RUSTUP_TOOLCHAIN=1.97.1 cargo fmt --all -- --check` — exited 0.
- `RUSTUP_TOOLCHAIN=1.97.1 cargo test -p aso-host projection::tests` — 3
  passed, 0 failed.
- `RUSTUP_TOOLCHAIN=1.97.1 cargo check -p aso-web-server` — exited 0.
- `pnpm --dir web typecheck` — exited 0.
- `pnpm --dir web lint` — exited 0.
- Focused PGlite/catalog/transport/wiring/storage-key/timeline suite — 52
  passed across 7 files, 0 failed.
- `src/shared/sync/replica-runtime.test.ts` — 24 passed, 0 failed.
- FRF identity claim suite — 3 passed, 0 failed.
- FRF shape authorization unit suite — 12 passed, 0 failed.
- FRF revocation and lease integration tests — 10 passed, 0 failed.
- Fresh PostgreSQL receipt
  `task-3-status-projection-fresh.json` — **Passed**; exact columns, lifecycle
  refresh, case-derived scope, local-data publication exclusions, migration
  rerun/checksum refusal, service processing lifecycle, and cleanup passed.
- Populated-upgrade PostgreSQL receipt
  `task-3-status-projection-upgrade.json` — **Passed** with the same projection
  and cleanup checks. Both receipts record the current
  `crates/aso-host/src/projection.rs` SHA-256
  `d0a6be7e53420e5acccee5e20997e9d16deab8f9564dd85ceb6b24d711faee37`.

No Tier 2 phase or browser scenario ran. Web-05 task 1.4 owns the actual
upload/status interface and browser reload, source-preview, keyboard, and
responsive-resize proof. The uncomfortable limitation is that this task proves
the database, authorization contract, local materializer, and graph mapping in
isolation; it does not yet prove an actual FRF/Electric response reaches the
rendered status UI.

## Completion self-check

1. `migrations/server/2026090622_document_status_projection.sql` adds the
   derived status table and maintenance triggers; `migrations.rs` registers it.
2. `projection.rs`, the FRF projection revision/claim fixtures, and the deployed
   catalog advance to revision 5 and `document_statuses`.
3. The PGlite schema, schema ledger, storage generation, graph bindings, and
   evidence-timeline selector cut over from the raw document shape to the
   exact status shape.
4. Projection-dependent probes and architecture records now name the revision
   5 contract.
5. No unrequested feature was added. The new status projection is the minimum
   source-to-store contract required by task 1.3.
6. The case-derived scope, exact column allowlist, RLS, publication exclusions,
   and generation bump guard real tenant, PHI, and stale-schema boundaries.
   No speculative retry, fallback, or validation guard was added.
7. Actual browser UI behavior remains unverified here because it belongs to
   tasks 1.4 through 3.1 and has not been claimed as complete.
