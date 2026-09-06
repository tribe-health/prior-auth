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
 * and the test that fails when a sixth table appears.
 */

/** The five tables the evidence-timeline slice reads. Nothing else syncs. */
export const PGLITE_TABLES = [
  "cases",
  "case_evidence",
  "evidence_states",
  "evidence_citations",
  "documents",
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
  documents: [
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
  id           UUID PRIMARY KEY,
  practice_id  UUID NOT NULL,
  status       TEXT,
  created_at   TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ
);

-- practice_id is DENORMALIZED on the server (15-denormalize-practice-id.sql)
-- and forced by trigger. It is here because an Electric shape WHERE clause is
-- flat and cannot join — the practice a row belongs to has to be ON the row.
-- rationale omitted: clinician free text (PHI).
CREATE TABLE IF NOT EXISTS case_evidence (
  id                  UUID PRIMARY KEY,
  practice_id         UUID NOT NULL,
  case_id             UUID NOT NULL,
  policy_criterion_id UUID NOT NULL,
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
