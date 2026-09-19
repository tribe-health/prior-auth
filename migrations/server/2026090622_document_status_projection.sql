-- web-05. Materialized document status projection for authorized browser sync.
-- The source table retains object locations and other local-only fields. This
-- table contains the exact reviewed status row plus an internal practice scope
-- column that Electric filters on but never returns.

CREATE TABLE aso.document_statuses (
  id uuid PRIMARY KEY,
  practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES aso.cases(id) ON DELETE CASCADE,
  document_type_id uuid NOT NULL REFERENCES aso.document_types(id) ON DELETE RESTRICT,
  name text NOT NULL,
  effective_date date NOT NULL,
  content_sha256_text text NOT NULL
    CHECK (content_sha256_text ~ '^[0-9a-f]{64}$'),
  page_count integer CHECK (page_count IS NULL OR page_count > 0),
  processing_status text NOT NULL
    REFERENCES aso.document_processing_statuses(key) ON DELETE RESTRICT,
  processing_error_code text,
  updated_at timestamptz NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  CHECK ((processing_status = 'failed') OR processing_error_code IS NULL)
);

COMMENT ON TABLE aso.document_statuses IS
  'Lane: server-authoritative relational. Privacy: trusted PHI. Exact document status projection; source text, object location, parser output, and embeddings are structurally absent.';
COMMENT ON COLUMN aso.document_statuses.practice_id IS
  'Internal verified-practice predicate. Excluded from the public status column projection.';

ALTER TABLE aso.document_statuses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.document_statuses FROM PUBLIC;

CREATE FUNCTION aso.refresh_document_status_projection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM aso.document_statuses status WHERE status.id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.case_id IS NULL THEN
    DELETE FROM aso.document_statuses status WHERE status.id = NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO aso.document_statuses (
    id, practice_id, case_id, document_type_id, name, effective_date,
    content_sha256_text, page_count, processing_status,
    processing_error_code, updated_at, revision)
  SELECT
    NEW.id, target_case.practice_id, NEW.case_id, NEW.document_type_id,
    NEW.name, NEW.effective_date, encode(NEW.content_sha256, 'hex'),
    NEW.page_count, NEW.processing_status, NEW.processing_error_code,
    clock_timestamp(), NEW.revision
  FROM aso.cases target_case
  WHERE target_case.id = NEW.case_id
  ON CONFLICT (id) DO UPDATE SET
    practice_id = EXCLUDED.practice_id,
    case_id = EXCLUDED.case_id,
    document_type_id = EXCLUDED.document_type_id,
    name = EXCLUDED.name,
    effective_date = EXCLUDED.effective_date,
    content_sha256_text = EXCLUDED.content_sha256_text,
    page_count = EXCLUDED.page_count,
    processing_status = EXCLUDED.processing_status,
    processing_error_code = EXCLUDED.processing_error_code,
    updated_at = EXCLUDED.updated_at,
    revision = EXCLUDED.revision;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION aso.refresh_document_status_projection() FROM PUBLIC;

CREATE TRIGGER document_status_projection_refresh
AFTER INSERT OR UPDATE OR DELETE ON aso.documents
FOR EACH ROW EXECUTE FUNCTION aso.refresh_document_status_projection();

CREATE FUNCTION aso.refresh_case_document_status_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  UPDATE aso.document_statuses
     SET practice_id = NEW.practice_id,
         updated_at = clock_timestamp()
   WHERE case_id = NEW.id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION aso.refresh_case_document_status_scope() FROM PUBLIC;

CREATE TRIGGER case_document_status_scope_refresh
AFTER UPDATE OF practice_id ON aso.cases
FOR EACH ROW
WHEN (OLD.practice_id IS DISTINCT FROM NEW.practice_id)
EXECUTE FUNCTION aso.refresh_case_document_status_scope();

INSERT INTO aso.document_statuses (
  id, practice_id, case_id, document_type_id, name, effective_date,
  content_sha256_text, page_count, processing_status,
  processing_error_code, updated_at, revision)
SELECT
  document.id, target_case.practice_id, document.case_id,
  document.document_type_id, document.name, document.effective_date,
  encode(document.content_sha256, 'hex'), document.page_count,
  document.processing_status, document.processing_error_code,
  COALESCE(document.committed_at, document.retrieved_at, document.created_at),
  document.revision
FROM aso.documents document
JOIN aso.cases target_case ON target_case.id = document.case_id;

CREATE INDEX document_statuses_case_ix ON aso.document_statuses(case_id);
CREATE INDEX document_statuses_practice_ix ON aso.document_statuses(practice_id);
