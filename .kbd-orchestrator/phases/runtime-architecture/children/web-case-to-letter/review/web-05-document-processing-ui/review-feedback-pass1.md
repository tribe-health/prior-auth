# Pass 1 resolution

The first packet omitted the runtime schema plans and Electric deployment configuration. Re-evaluate both critical findings against the added files and executable evidence.

## Publication registration

Electric 1.8 runs with automatic table publishing because `ELECTRIC_MANUAL_TABLE_PUBLISHING` is not set. Electric's official documentation states that automatic mode creates publications and adds tables when shapes are requested. The deployment uses the database owner in the local stack. The browser cannot name a table or columns: the FRF catalog maps the granted `document_statuses` shape to `aso.document_statuses` and its eleven-column allow-list.

The added `task-5-electric-auto-publication-live.json` is a local integration result against the running pinned Electric 1.8 service. An empty uniquely named synthetic table was requested with an explicit two-column projection. The HTTP response was 200, PostgreSQL showed the table only in `electric_publication_default`, and dropping the table removed its publication entry. No clinical row or production table was used.

Official source: `https://github.com/electric-sql/electric/blob/main/website/docs/sync/guides/postgres-permissions.md` and the `ELECTRIC_MANUAL_TABLE_PUBLISHING` configuration reference.

## Fresh PGlite ordering

The added `replica-browser-memory.ts` and `replica-mounted-runtime.ts` plans both apply migration `004-case-summary-publication` before `005-document-status-projection`. Each calls `migrateReplicaSchema` and requires `ready` before constructing the projector or calling `startReplicaRuntime`. `PGLITE_SCHEMA_SQL` is the immutable revision-3 migration, not the complete fresh schema. The complete current schema is the ordered migration plan and is also assembled as `PGLITE_CURRENT_SCHEMA_SQL` for boundary tests.

The Artifact Refiner now checks this order in both runtimes and passes 14/14 constraints across 109 current inputs and frozen snapshots.

## Task checkboxes

Task 2.1 remains unchecked while adversarial review is running. Task 3.1 is the next, separate KBD task and has not been executed. Marking either before its boundary would violate the one-task-at-a-time contract. This warning requires no source change.
