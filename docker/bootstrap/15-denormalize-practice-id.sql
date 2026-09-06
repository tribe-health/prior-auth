-- ═══════════════════════════════════════════════════════════════════════════
-- Denormalized `practice_id` — the tenant boundary Electric can actually see.
--
-- ── Why this file exists ──────────────────────────────────────────────────
--
-- 20-electric-sync-views.sql solved the tenant join with views. Measured
-- 2026-09-05 against a live stack, that does not work:
--
--   GET /v1/shape?table=aso.sync_cases  -> 400  "does not exist"
--   GET /v1/shape?table=aso.cases       -> 200  [control]
--
-- Electric replicates from the logical replication stream. A view emits no WAL
-- of its own, so it can never join a publication. Materialized views fail for
-- the same reason, and Postgres says so directly:
--
--   CREATE PUBLICATION p FOR TABLE aso.probe_mv_cases;
--   ERROR: cannot add relation ... not supported for materialized views
--
-- An Electric shape `where` is FLAT — it cannot join. So the practice a row
-- belongs to has to be ON the row.
--
-- ── What is NOT solved here ───────────────────────────────────────────────
--
-- The PHI column projection is NOT this file's job and must not be folded in.
-- Electric's `columns=` parameter does it, proven against a canary row: an
-- unprojected shape shipped author_name / patient_id / storage_uri, while the
-- projected shape returned the same row with only id / name / effective_date.
--
-- ── The cost, stated plainly ──────────────────────────────────────────────
--
-- 20-electric-sync-views.sql argued against exactly this: denormalization
-- duplicates the fact of practice membership and needs triggers to keep the
-- copies agreeing. That argument was correct — it is simply outranked by the
-- copy being the only form Electric can read.
--
-- So the triggers below are not a convenience. They are the mechanism that
-- makes the duplicate safe, and every one of them is FORCED: the value is
-- overwritten from the parent on INSERT and on any UPDATE that moves the row
-- to a different parent. A caller cannot set practice_id, and a caller cannot
-- lie about it. That is the difference between a denormalized column and a
-- cached one.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path = aso, public;

-- ── Columns ───────────────────────────────────────────────────────────────
-- Nullable at first so the backfill can run; constrained NOT NULL afterwards.
ALTER TABLE case_evidence      ADD COLUMN IF NOT EXISTS practice_id uuid;
ALTER TABLE evidence_citations ADD COLUMN IF NOT EXISTS practice_id uuid;
ALTER TABLE documents          ADD COLUMN IF NOT EXISTS practice_id uuid;

-- ── Derivation ────────────────────────────────────────────────────────────
--
--   case_evidence       case_id           -> cases.practice_id
--   evidence_citations  case_evidence_id  -> case_evidence.practice_id
--   documents           patient_id        -> patients.practice_id
--
-- documents derives from the PATIENT, not the case. `documents.case_id` is
-- NULLABLE — a document can be ingested before it is attached to a case — and
-- deriving from a null case_id would leave a row with no practice, which is
-- precisely the row that must not sync. `patient_id` is NOT NULL, so the
-- practice is always determinable.
--
-- This is a real difference from 20-electric-sync-views.sql, whose INNER JOIN
-- on cases silently dropped unattached documents. Dropping them failed closed
-- and was safe; deriving from the patient is correct AND fails closed.

CREATE OR REPLACE FUNCTION set_practice_id_from_case() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  SELECT c.practice_id INTO NEW.practice_id FROM cases c WHERE c.id = NEW.case_id;
  IF NEW.practice_id IS NULL THEN
    RAISE EXCEPTION 'cannot derive practice_id: case % not found', NEW.case_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION set_practice_id_from_case_evidence() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  SELECT ce.practice_id INTO NEW.practice_id
    FROM case_evidence ce WHERE ce.id = NEW.case_evidence_id;
  IF NEW.practice_id IS NULL THEN
    RAISE EXCEPTION 'cannot derive practice_id: case_evidence % not found',
      NEW.case_evidence_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION set_practice_id_from_patient() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  SELECT p.practice_id INTO NEW.practice_id
    FROM patients p WHERE p.id = NEW.patient_id;
  IF NEW.practice_id IS NULL THEN
    RAISE EXCEPTION 'cannot derive practice_id: patient % not found', NEW.patient_id;
  END IF;
  RETURN NEW;
END $$;

-- ── Triggers ──────────────────────────────────────────────────────────────
-- BEFORE INSERT OR UPDATE OF <parent key>, practice_id.
--
-- Listing practice_id in the column list is NOT redundant, and leaving it out
-- was a real hole — measured 2026-09-06:
--
--   UPDATE case_evidence SET practice_id = '<other practice>' WHERE id = ...;
--   -> SUCCEEDED. The row moved tenants.
--
-- A trigger declared `UPDATE OF case_id` does not fire for an UPDATE that
-- touches only practice_id, so the forced re-derivation never ran. Naming
-- practice_id makes any direct write to it re-derive from the parent and
-- overwrite the attempt.
--
-- Firing on these columns specifically still means an ordinary UPDATE
-- (changing `state`, say) costs nothing, while REPARENTING a row re-derives
-- the practice.

DROP TRIGGER IF EXISTS trg_case_evidence_practice_id ON case_evidence;
CREATE TRIGGER trg_case_evidence_practice_id
  BEFORE INSERT OR UPDATE OF case_id, practice_id ON case_evidence
  FOR EACH ROW EXECUTE FUNCTION set_practice_id_from_case();

DROP TRIGGER IF EXISTS trg_evidence_citations_practice_id ON evidence_citations;
CREATE TRIGGER trg_evidence_citations_practice_id
  BEFORE INSERT OR UPDATE OF case_evidence_id, practice_id ON evidence_citations
  FOR EACH ROW EXECUTE FUNCTION set_practice_id_from_case_evidence();

DROP TRIGGER IF EXISTS trg_documents_practice_id ON documents;
CREATE TRIGGER trg_documents_practice_id
  BEFORE INSERT OR UPDATE OF patient_id, practice_id ON documents
  FOR EACH ROW EXECUTE FUNCTION set_practice_id_from_patient();

-- ── Cascade: a case moving practice must carry its children ───────────────
-- Rare, but if it is not handled the children keep a stale practice_id and
-- leak across the tenant boundary. AFTER UPDATE so the parent's new value is
-- already committed to the row.
CREATE OR REPLACE FUNCTION cascade_practice_id_from_case() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE case_evidence SET practice_id = NEW.practice_id WHERE case_id = NEW.id;
  UPDATE evidence_citations ec SET practice_id = NEW.practice_id
    FROM case_evidence ce
   WHERE ec.case_evidence_id = ce.id AND ce.case_id = NEW.id;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_cases_cascade_practice_id ON cases;
CREATE TRIGGER trg_cases_cascade_practice_id
  AFTER UPDATE OF practice_id ON cases
  FOR EACH ROW WHEN (OLD.practice_id IS DISTINCT FROM NEW.practice_id)
  EXECUTE FUNCTION cascade_practice_id_from_case();

CREATE OR REPLACE FUNCTION cascade_practice_id_from_patient() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE documents SET practice_id = NEW.practice_id WHERE patient_id = NEW.id;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_patients_cascade_practice_id ON patients;
CREATE TRIGGER trg_patients_cascade_practice_id
  AFTER UPDATE OF practice_id ON patients
  FOR EACH ROW WHEN (OLD.practice_id IS DISTINCT FROM NEW.practice_id)
  EXECUTE FUNCTION cascade_practice_id_from_patient();

-- ── Backfill ──────────────────────────────────────────────────────────────
-- Ordered: case_evidence before evidence_citations, which reads from it.
UPDATE case_evidence ce SET practice_id = c.practice_id
  FROM cases c WHERE c.id = ce.case_id AND ce.practice_id IS DISTINCT FROM c.practice_id;

UPDATE evidence_citations ec SET practice_id = ce.practice_id
  FROM case_evidence ce
 WHERE ce.id = ec.case_evidence_id AND ec.practice_id IS DISTINCT FROM ce.practice_id;

UPDATE documents d SET practice_id = p.practice_id
  FROM patients p WHERE p.id = d.patient_id AND d.practice_id IS DISTINCT FROM p.practice_id;

-- ── Constraints ───────────────────────────────────────────────────────────
-- NOT NULL is the structural half of the guarantee: a row with no practice
-- cannot exist, so it cannot be missed by a tenant-scoped shape and silently
-- treated as belonging to everyone.
ALTER TABLE case_evidence      ALTER COLUMN practice_id SET NOT NULL;
ALTER TABLE evidence_citations ALTER COLUMN practice_id SET NOT NULL;
ALTER TABLE documents          ALTER COLUMN practice_id SET NOT NULL;

ALTER TABLE case_evidence
  DROP CONSTRAINT IF EXISTS case_evidence_practice_id_fkey,
  ADD  CONSTRAINT case_evidence_practice_id_fkey
       FOREIGN KEY (practice_id) REFERENCES practices(id);
ALTER TABLE evidence_citations
  DROP CONSTRAINT IF EXISTS evidence_citations_practice_id_fkey,
  ADD  CONSTRAINT evidence_citations_practice_id_fkey
       FOREIGN KEY (practice_id) REFERENCES practices(id);
ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_practice_id_fkey,
  ADD  CONSTRAINT documents_practice_id_fkey
       FOREIGN KEY (practice_id) REFERENCES practices(id);

-- Every synced read is `WHERE practice_id = $1`. Without these it is a seq scan.
CREATE INDEX IF NOT EXISTS case_evidence_practice_ix      ON case_evidence(practice_id);
CREATE INDEX IF NOT EXISTS evidence_citations_practice_ix ON evidence_citations(practice_id);
CREATE INDEX IF NOT EXISTS documents_practice_ix          ON documents(practice_id);
