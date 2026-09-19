/**
 * The local PGlite schema.
 *
 * This is a **deliberate subset** of the server schema, not a convenience one.
 * A table is absent unless someone decided it should be present, and a column
 * is absent unless the evidence timeline needs it to render.
 *
 * See docs/architecture/adr-007-local-first-sync.md.
 *
 * ── The rule that shapes this file ──────────────────────────────────────────
 *
 * `docs/design/schema/schema-ai.sql:74-91`:
 *
 *   "Embeddings of clinical text ARE PHI. Text can be reconstructed from an
 *    embedding by inversion (IEEE S&P 2023), so an embedding fails both Safe
 *    Harbor and Expert Determination."
 *
 * The same reasoning applies one step earlier: the clinical text itself is
 * PHI before anyone embeds it. So the exclusions below are not only about
 * vector tables — they are about every column that carries chart content or
 * identifies a patient.
 *
 * PGlite has no pgvector, so an embedding table could not sync even by
 * accident. **That coincidence is not a control.** The control is this file
 * and the test that fails when an undeclared table appears.
 */

/** The eight tables the web replica reads. Nothing else syncs. */
export const PGLITE_TABLES = [
  "annotation_types",
  "evidence_states",
  "cases",
  "document_statuses",
  "document_task_statuses",
  "case_evidence",
  "evidence_citations",
  "annotations",
] as const;

export type PGliteTable = (typeof PGLITE_TABLES)[number];

/**
 * Columns deliberately omitted, and why.
 *
 * Kept as data rather than a comment so the exclusion test can assert it and
 * a reviewer can diff it. Removing an entry here is a decision about PHI, not
 * a cleanup.
 */
export const OMITTED_COLUMNS: Record<string, { column: string; reason: string }[]> = {
  cases: [
    {
      column: "member_id",
      reason:
        "Direct insurance member identifier. Intake editing reads it through the verified case API and never publishes it in the summary replica.",
    },
    {
      column: "facility_id",
      reason:
        "Facility identity is outside the frozen case-summary publication row and remains server-side until separately approved.",
    },
    {
      column: "procedure_code",
      reason:
        "The procedure can reveal clinical treatment and is excluded from the frozen case-summary projection.",
    },
    {
      column: "plan_key",
      reason:
        "Plan selection is a controlling intake input and is not part of the approved summary publication row.",
    },
    {
      column: "data",
      reason:
        "Untyped case JSON may contain arbitrary clinical or administrative PHI and cannot cross the replica boundary.",
    },
    {
      column: "gate_affirmed_by",
      reason:
        "The queue needs committed gate status, not the clinician identity behind the affirmation.",
    },
    {
      column: "case_input_revision",
      reason:
        "The command-specific optimistic token is obtained from an authorized case read and is not a summary field.",
    },
    {
      column: "status_revision",
      reason:
        "The command-specific lifecycle token is obtained from an authorized case read and is not a summary field.",
    },
    {
      column: "created_at",
      reason:
        "The frozen case-summary contract exposes updated time only; creation time has no approved queue behavior.",
    },
  ],
  annotation_types: [
    {
      column: "schema",
      reason:
        "The first-annotation control needs only the approved type identity and label; server-side JSON Schema validation remains authoritative.",
    },
  ],
  annotations: [
    {
      column: "data",
      reason:
        "Type-specific JSON may contain clinical details beyond the attributed opinion rendered by this slice, so it remains server-side.",
    },
  ],
  case_evidence: [
    {
      column: "rationale",
      reason:
        "Free clinical text written by a clinician arguing a gap. PHI. The timeline renders the state and the action, not the argument.",
    },
  ],
  evidence_citations: [
    {
      column: "quote",
      reason:
        "Verbatim excerpt from a chart document. PHI in the plainest form. The timeline shows that a citation exists with its page and date; reading the quote is a server-side, audited act.",
    },
  ],
  document_statuses: [
    {
      column: "practice_id",
      reason:
        "The verified-practice predicate is enforced by FRF against the server projection and is not part of the frozen browser row.",
    },
    {
      column: "patient_id",
      reason:
        "Direct patient identifier. The slice scopes by case; it never needs to resolve a patient.",
    },
    {
      column: "author_name",
      reason: "Identifies a clinician. Not needed to render an evidence row.",
    },
    {
      column: "author_npi",
      reason: "National Provider Identifier. Same.",
    },
    {
      column: "storage_uri",
      reason:
        "Object-store location of the PDF. A local copy would let the browser fetch chart content outside the audited path.",
    },
    {
      column: "data",
      reason:
        "Untyped jsonb whose contents vary by document type. Cannot be shown to be PHI-free, so it is excluded.",
    },
    {
      column: "text",
      reason:
        "Extracted chart text remains in the local document_pages relation and never enters an authorized replica.",
    },
    {
      column: "text_sha256",
      reason:
        "Page-level hashes are processing provenance for local source text and are not part of the reviewed document status row.",
    },
    {
      column: "embedding",
      reason:
        "An embedding of clinical text is PHI and remains structurally outside the browser replica.",
    },
    {
      column: "vector",
      reason:
        "Vector representations of clinical text are PHI regardless of the storage type used by the server.",
    },
  ],
  document_task_statuses: [
    {
      column: "practice_id",
      reason:
        "The verified-practice predicate is enforced by FRF and is not part of the browser task-status row.",
    },
    {
      column: "kratos_identity_id",
      reason: "Task ownership is enforced by the host; the identity does not enter the replica.",
    },
    {
      column: "actor_id",
      reason: "The actor identity is audit data and is not needed to render task progress.",
    },
    {
      column: "command_id",
      reason: "Command idempotency remains a protected host concern.",
    },
    {
      column: "request_payload",
      reason: "Generation requests can contain clinical context and remain local to the host.",
    },
    {
      column: "input_snapshot",
      reason: "The captured generation snapshot contains protected case and source data.",
    },
    {
      column: "result",
      reason: "Generated artifacts are retrieved through an authorized task read.",
    },
    {
      column: "error_code",
      reason: "Detailed task failures remain on the authorized task channel.",
    },
  ],
};

/**
 * DDL for the local store.
 *
 * Types are simplified from the server: PGlite runs Postgres, but the local
 * copy is a read cache, so server-side defaults, triggers and foreign keys to
 * excluded tables are not reproduced. Nothing here writes.
 */
export const PGLITE_SCHEMA_SQL = /* sql */ `
-- Evidence states: the closed three-member set. See ADR-003.
CREATE TABLE IF NOT EXISTS evidence_states (
  key     TEXT PRIMARY KEY,
  label   TEXT NOT NULL,
  meaning TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
  id                UUID PRIMARY KEY,
  practice_id       UUID NOT NULL,
  status            TEXT,
  -- When the clinical-authority gate was affirmed, or NULL if it has not been.
  -- A timestamp, not chart content: it records that a physician affirmed, never
  -- what they affirmed about. Present because the FRF replica grant includes it
  -- and the case queue reads it; without the column the row would arrive and be
  -- silently dropped by the writer's projection.
  gate_affirmed_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ
);

-- practice_id is DENORMALIZED on the server (15-denormalize-practice-id.sql)
-- and forced by trigger. It is here because an Electric shape WHERE clause is
-- flat and cannot join — the practice a row belongs to has to be ON the row.
-- rationale omitted: clinician free text (PHI).
CREATE TABLE IF NOT EXISTS case_evidence (
  id                  UUID PRIMARY KEY,
  practice_id         UUID NOT NULL,
  case_id             UUID NOT NULL,
  criterion_id UUID NOT NULL,
  state               TEXT NOT NULL REFERENCES evidence_states(key),
  assessed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ
);

-- quote omitted: verbatim chart excerpt (PHI).
CREATE TABLE IF NOT EXISTS evidence_citations (
  id               UUID PRIMARY KEY,
  practice_id      UUID NOT NULL,
  case_evidence_id UUID NOT NULL REFERENCES case_evidence(id),
  document_id      UUID NOT NULL,
  page_number      INTEGER,
  relevance        TEXT NOT NULL,
  created_at       TIMESTAMPTZ
);

-- patient_id, author_name, author_npi, storage_uri, data omitted: see
-- OMITTED_COLUMNS. What remains identifies a document and dates it.
CREATE TABLE IF NOT EXISTS documents (
  id               UUID PRIMARY KEY,
  practice_id      UUID NOT NULL,
  document_type_id UUID NOT NULL,
  case_id          UUID,
  name             TEXT NOT NULL,
  effective_date   DATE NOT NULL,
  page_count       INTEGER,
  content_sha256   BYTEA
);

CREATE INDEX IF NOT EXISTS case_evidence_case_ix   ON case_evidence(case_id);
CREATE INDEX IF NOT EXISTS citations_evidence_ix   ON evidence_citations(case_evidence_id);
CREATE INDEX IF NOT EXISTS documents_case_ix       ON documents(case_id);
`;

/** Revision-4 additive migration. The revision-3 base SQL above is immutable. */
export const PGLITE_ANNOTATION_TYPES_SQL = /* sql */ `
CREATE TABLE annotation_types (
  id          UUID PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT
);

-- This is clinician-authored opinion, identified as such by provenance and
-- attribution. It is never presented as chart text. Type-specific data stays
-- server-side. This table exists in either storage mode, but startup refuses
-- to run the only row materializer with persistent storage. The body can
-- therefore be populated only inside the authorized memory-only client
-- runtime until G-DATA approves durable client persistence.
CREATE TABLE annotations (
  id                 UUID PRIMARY KEY,
  practice_id        UUID NOT NULL,
  case_id            UUID NOT NULL,
  annotation_type_id UUID NOT NULL,
  name               TEXT NOT NULL,
  body               TEXT NOT NULL,
  author_id          UUID NOT NULL,
  author_label       TEXT NOT NULL,
  provenance         TEXT NOT NULL,
  is_included        BOOLEAN NOT NULL,
  included_at        TIMESTAMPTZ,
  target_evidence_id UUID,
  target_document_id UUID,
  revision           BIGINT NOT NULL,
  created_at         TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ
);

CREATE INDEX annotations_case_ix ON annotations(case_id);
`;

/**
 * Revision-5 compatibility migration.
 *
 * Electric serializes PostgreSQL BYTEA as a `\\x…` hex string. PGlite's BYTEA
 * parameter serializer accepts byte arrays, not that wire representation, so
 * the first non-null document digest would abort the whole committed batch.
 * The browser only compares and projects this immutable digest; keeping the
 * exact wire-safe hexadecimal value as text avoids a lossy client conversion.
 */
export const PGLITE_SOURCE_HASH_SQL = /* sql */ `
ALTER TABLE documents
  ALTER COLUMN content_sha256 TYPE TEXT
  USING CASE
    WHEN content_sha256 IS NULL THEN NULL
    ELSE '\\x' || encode(content_sha256, 'hex')
  END;
`;

/** Revision-6 case-summary publication migration. */
export const PGLITE_CASE_SUMMARY_SQL = /* sql */ `
-- Revision 3 did not carry the identifiers required by the approved case
-- summary. They cannot be reconstructed from the local replica. Discard the
-- old generation and its cursor before making those columns required; the
-- authorized shape transport will then repopulate every table from a cold
-- snapshot. Keeping any child row or checkpoint would mix revisions.
TRUNCATE TABLE
  annotations,
  annotation_types,
  evidence_citations,
  case_evidence,
  evidence_states,
  documents,
  cases;

-- Boundary tests assemble only the synchronized tables, while the runtime
-- creates the checkpoint ledger beside them. Clear it when present without
-- making that bookkeeping table part of the replica schema contract.
DO $cutover$
BEGIN
  IF to_regclass('public._replica_checkpoints') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE _replica_checkpoints';
  END IF;
END
$cutover$;

ALTER TABLE cases
  ADD COLUMN case_number TEXT NOT NULL,
  ADD COLUMN patient_id UUID NOT NULL,
  ADD COLUMN surgeon_id UUID NOT NULL,
  ADD COLUMN coordinator_id UUID,
  ADD COLUMN payer_id UUID NOT NULL,
  ADD COLUMN date_of_service DATE,
  ADD COLUMN revision BIGINT NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  DROP COLUMN created_at;
`;

/** Revision-7 document-status projection cutover. */
export const PGLITE_DOCUMENT_STATUS_SQL = /* sql */ `
DROP TABLE documents;

CREATE TABLE document_statuses (
  id                    UUID PRIMARY KEY,
  case_id               UUID NOT NULL,
  document_type_id      UUID NOT NULL,
  name                  TEXT NOT NULL,
  effective_date        DATE NOT NULL,
  content_sha256_text   TEXT NOT NULL,
  page_count            INTEGER,
  processing_status     TEXT NOT NULL,
  processing_error_code TEXT,
  updated_at            TIMESTAMPTZ NOT NULL,
  revision              BIGINT NOT NULL
);

CREATE INDEX document_statuses_case_ix ON document_statuses(case_id);
`;

/** Revision-8 sanitized document-task status projection. */
export const PGLITE_DOCUMENT_TASK_STATUS_SQL = /* sql */ `
CREATE TABLE document_task_statuses (
  id            UUID PRIMARY KEY,
  case_id       UUID NOT NULL,
  purpose       TEXT NOT NULL,
  state         TEXT NOT NULL,
  stage         TEXT NOT NULL,
  last_sequence BIGINT NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX document_task_statuses_case_ix
  ON document_task_statuses(case_id, purpose, updated_at DESC);
`;

/** Complete current schema used by boundary tests and disposable fixtures. */
export const PGLITE_CURRENT_SCHEMA_SQL = [
  PGLITE_SCHEMA_SQL,
  PGLITE_ANNOTATION_TYPES_SQL,
  PGLITE_SOURCE_HASH_SQL,
  PGLITE_CASE_SUMMARY_SQL,
  PGLITE_DOCUMENT_STATUS_SQL,
  PGLITE_DOCUMENT_TASK_STATUS_SQL,
].join("\n");
