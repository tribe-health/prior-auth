/**
 * Electric shape definitions for the local store.
 *
 * Reads flow: Postgres → Electric shapes → PGlite → entity graph.
 * Writes do NOT flow here. They go through the Axum API, because that is where
 * clinical authority is checked (ADR-002, ADR-007). A write path through the
 * shape stream would bypass the second of ADR-002's three layers.
 *
 * ── Why the tenant-scoped adapter ───────────────────────────────────────────
 *
 * `createTenantScopedElectricAdapter` refuses to attach a shape whose
 * `tenantColumn` is `undefined`, and refuses a `companyId` that is not a UUID.
 * It **fails closed**: a table added without a tenant decision throws at
 * construction rather than syncing every practice's rows.
 *
 * That property is the whole reason to prefer it over `createElectricAdapter`.
 * PGlite has no row-level security, so a shape without a predicate is the
 * entire table, for everyone.
 *
 * Here the tenant is the **practice** — this is a practice-boundary deployment
 * (`docs/aso-mvp-spec.html`), and `practice_id` is the scoping column.
 */
import type { PGliteTable } from "./pglite-schema";

/**
 * How each synced table reaches its practice.
 *
 * `null` means "this row IS the tenant root, filter by id". The adapter accepts
 * explicit `null` and **rejects `undefined`**, so every entry here is a
 * deliberate answer to "how does a row in this table belong to a practice?"
 */
export const TENANT_COLUMNS: Record<PGliteTable, string | null> = {
  annotation_types: null,
  annotations: "practice_id",
  cases: "practice_id",

  // These carry `practice_id` as a REAL COLUMN, denormalized from their
  // parent and kept correct by forced triggers —
  // docker/bootstrap/15-denormalize-practice-id.sql. A caller cannot set it
  // and cannot lie about it: the trigger overwrites the value from the parent
  // on INSERT and on any write that touches practice_id or the parent key.
  case_evidence: "practice_id",
  evidence_citations: "practice_id",
  document_statuses: "practice_id",
  document_task_statuses: "practice_id",

  // Reference data: the closed three-member set from ADR-003 — `key`, `label`,
  // `meaning`. No patient data, not practice-scoped. Explicit `null` rather
  // than omitted, so the adapter's fail-closed check still sees a decision.
  evidence_states: null,
};

/**
 * The columns Electric is asked for, per table — the PHI boundary.
 *
 * With views gone, the column projection moves to the shape request itself.
 * Verified against a canary row 2026-09-05: an UNPROJECTED shape shipped
 * `author_name`, `patient_id` and `storage_uri` on the wire, while the
 * PROJECTED shape returned the same row carrying only the listed columns.
 *
 * This list must stay in step with `pglite-schema.ts` — the local store has no
 * column to put an unlisted value in, but relying on that would make the
 * boundary an accident of the schema rather than a decision. Every column
 * absent here is absent for a reason recorded in `OMITTED_COLUMNS`.
 */
export const SYNC_COLUMNS: Record<PGliteTable, readonly string[]> = {
  annotation_types: ["id", "key", "name", "description"],
  annotations: [
    "id", "practice_id", "case_id", "annotation_type_id", "name", "body",
    "author_id", "author_label", "provenance", "is_included", "included_at",
    "target_evidence_id", "target_document_id", "revision", "created_at", "updated_at",
  ],
  cases: [
    "id", "practice_id", "case_number", "patient_id", "surgeon_id",
    "coordinator_id", "payer_id", "status", "date_of_service",
    "gate_affirmed_at", "updated_at", "revision",
  ],
  case_evidence: [
    "id", "practice_id", "case_id", "criterion_id",
    "state", "assessed_at", "created_at", "updated_at",
  ],
  evidence_citations: [
    "id", "practice_id", "case_evidence_id", "document_id",
    "page_number", "relevance", "created_at",
  ],
  document_statuses: [
    "id", "case_id", "document_type_id", "name", "effective_date",
    "content_sha256_text", "page_count", "processing_status",
    "processing_error_code", "updated_at", "revision",
  ],
  document_task_statuses: [
    "id", "case_id", "purpose", "state", "stage", "last_sequence", "updated_at",
  ],
  evidence_states: ["key", "label", "meaning"],
};

/** Entity type name in the graph, per table. */
export const ENTITY_TYPES: Record<PGliteTable, string> = {
  annotation_types: "AnnotationType",
  annotations: "Annotation",
  cases: "Case",
  case_evidence: "CaseEvidence",
  evidence_states: "EvidenceState",
  evidence_citations: "EvidenceCitation",
  document_statuses: "DocumentStatus",
  document_task_statuses: "DocumentTaskStatus",
};
