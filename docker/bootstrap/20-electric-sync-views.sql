-- ═══════════════════════════════════════════════════════════════════════════
-- SUPERSEDED AS THE SYNC PATH — 2026-09-06.
--
-- These views can NOT be served by Electric. Measured against a live stack:
--
--   GET /v1/shape?table=aso.sync_cases -> 400 "does not exist"
--   GET /v1/shape?table=aso.cases      -> 200 snapshot-end     [control]
--
-- Electric replicates from the logical replication stream and a view emits no
-- WAL, so it can never join a publication. Materialized views fail the same
-- way, and Postgres refuses them outright.
--
-- The sync path is now BASE TABLES with a denormalized practice_id
-- (15-denormalize-practice-id.sql) plus Electric's own `columns=` projection
-- for the PHI boundary. See web/src/shared/sync/electric-shapes.ts.
--
-- The views are KEPT because they remain a correct, readable statement of the
-- intended column set, and the PHI assertion at the bottom of this file still
-- guards them. They are documentation and a check — not the sync path.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- Electric sync views — the practice boundary, made expressible as a shape.
--
-- W6 configured `case_evidence`, `evidence_citations` and `documents` with
-- `tenantColumn: "practice_id"`. None of them has that column. They reach a
-- practice by join:
--
--   case_evidence       → case_id            → cases.practice_id
--   evidence_citations  → case_evidence_id   → case_id → cases.practice_id
--   documents           → case_id            → cases.practice_id
--
-- An Electric shape is per-relation with a flat `where` clause. It cannot
-- express a join. So the join happens here, once, in the database, and Electric
-- syncs a relation that carries `practice_id` directly.
--
-- ── Why views rather than denormalized columns ─────────────────────────────
--
-- Adding `practice_id` to three tables would duplicate the fact of practice
-- membership in four places and need triggers to keep them agreeing. A view
-- has one source of truth — `cases.practice_id` — and cannot drift from it.
--
-- The cost is that these are read-only. That is correct: ADR-007 routes every
-- write through the Axum API, never the shape stream.
--
-- ── The column list is the PHI boundary ────────────────────────────────────
--
-- Each view selects EXACTLY the columns in web/src/shared/sync/pglite-schema.ts.
-- Columns absent here are absent for the reasons recorded in OMITTED_COLUMNS,
-- and this file is the server-side half of that decision: even if a client
-- asked for `quote`, the relation Electric serves does not contain it.
--
-- Two layers, agreeing. Neither assumes the other ran.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path = aso, public;

-- ── case_evidence ─────────────────────────────────────────────────────────
-- Omitted: `rationale` (clinician free text arguing a gap — PHI),
--          `data` (untyped jsonb), `assessed_by` (identifies a user).
CREATE OR REPLACE VIEW sync_case_evidence AS
SELECT
  ce.id,
  c.practice_id,
  ce.case_id,
  ce.policy_criterion_id,
  ce.state,
  ce.assessed_at,
  ce.created_at,
  ce.updated_at
FROM case_evidence ce
JOIN cases c ON c.id = ce.case_id;

-- ── evidence_citations ────────────────────────────────────────────────────
-- Two hops from a case. Omitted: `quote` — the verbatim chart excerpt. The
-- timeline shows that a citation exists, with its page and date; reading the
-- quote is a server-side, audited act.
CREATE OR REPLACE VIEW sync_evidence_citations AS
SELECT
  ec.id,
  c.practice_id,
  ec.case_evidence_id,
  ec.document_id,
  ec.page_number,
  ec.relevance,
  ec.created_at
FROM evidence_citations ec
JOIN case_evidence ce ON ce.id = ec.case_evidence_id
JOIN cases c          ON c.id  = ce.case_id;

-- ── documents ─────────────────────────────────────────────────────────────
-- Omitted: `patient_id` (direct identifier), `author_name` / `author_npi`
-- (identify a clinician), `storage_uri` (would let a browser fetch chart
-- content outside the audited path), `data` (untyped jsonb).
--
-- `content_sha256` is kept deliberately: it is the basis of custody proof and
-- is a hash, not content.
--
-- INNER JOIN, not LEFT: a document with a NULL case_id has no practice this
-- view can attest to, so it does not sync. Failing closed.
CREATE OR REPLACE VIEW sync_documents AS
SELECT
  d.id,
  c.practice_id,
  d.document_type_id,
  d.case_id,
  d.name,
  d.effective_date,
  d.page_count,
  d.content_sha256
FROM documents d
JOIN cases c ON c.id = d.case_id;

-- ── cases ─────────────────────────────────────────────────────────────────
-- Already carries practice_id. A view anyway, so the column list is stated in
-- one place rather than relying on the base table never gaining a PHI column.
CREATE OR REPLACE VIEW sync_cases AS
SELECT
  id,
  practice_id,
  status,
  created_at,
  updated_at
FROM cases;

-- ── evidence_states ───────────────────────────────────────────────────────
-- Reference data: the closed three-member set from ADR-003. No patient data,
-- not practice-scoped. Synced whole.
CREATE OR REPLACE VIEW sync_evidence_states AS
SELECT key, label, meaning FROM evidence_states;

-- ── Assertion: no synced relation exposes a known PHI column ──────────────
-- Runs at bootstrap. If someone widens a view later, this fails loudly rather
-- than shipping chart text to a browser.
DO $$
DECLARE
  offender text;
BEGIN
  SELECT format('%s.%s', table_name, column_name)
    INTO offender
    FROM information_schema.columns
   WHERE table_schema = 'aso'
     AND table_name LIKE 'sync\_%'
     AND column_name IN (
       'quote', 'rationale', 'patient_id', 'author_name',
       'author_npi', 'storage_uri', 'data'
     )
   LIMIT 1;

  IF offender IS NOT NULL THEN
    RAISE EXCEPTION
      'sync view exposes a PHI column: %. See web/src/shared/sync/pglite-schema.ts OMITTED_COLUMNS.',
      offender;
  END IF;
END $$;
