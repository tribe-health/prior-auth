-- A service worker may discover only the next queued document inside its
-- verified practice. Direct table SELECT remains unavailable to the executor.
CREATE FUNCTION aso.next_document_processing_job()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  processor record;
  queued record;
BEGIN
  SELECT * INTO STRICT processor FROM aso.document_processor_context();
  SELECT document.case_id, document.id AS document_id,
         clinical_case.document_set_revision
    INTO queued
    FROM aso.documents document
    JOIN aso.cases clinical_case ON clinical_case.id = document.case_id
   WHERE document.practice_id = processor.practice_id
     AND document.processing_status = 'queued'
   ORDER BY document.committed_at, document.id
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'caseId', queued.case_id,
    'documentId', queued.document_id,
    'documentSetRevision', queued.document_set_revision);
END;
$$;

REVOKE ALL ON FUNCTION aso.next_document_processing_job() FROM PUBLIC;
ALTER FUNCTION aso.next_document_processing_job() OWNER TO aso_case_owner;
GRANT EXECUTE ON FUNCTION aso.next_document_processing_job() TO aso_case_executor;
