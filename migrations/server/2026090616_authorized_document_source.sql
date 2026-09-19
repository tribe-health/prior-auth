-- RA-16. Authorize every document-source read against fresh verified context,
-- then append an audit record before the host releases bytes to a shell.
-- Storage keys remain inside the trusted server adapter and are never a client
-- capability.

CREATE FUNCTION aso.require_document_source(
  target_case uuid,
  target_document uuid,
  target_page integer
)
RETURNS TABLE (
  storage_key text,
  document_name text,
  effective_date date,
  page_count integer,
  content_sha256 bytea
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  case_practice uuid;
  source record;
BEGIN
  SELECT * INTO STRICT actor FROM aso.gate_actor_context();
  SELECT clinical_case.practice_id INTO STRICT case_practice
  FROM aso.cases clinical_case
  WHERE clinical_case.id = target_case;
  IF case_practice <> actor.practice_id THEN
    RAISE EXCEPTION 'document source access denied' USING ERRCODE = '42501';
  END IF;

  SELECT document.storage_uri AS storage_key,
         document.name AS document_name,
         document.effective_date,
         document.page_count,
         document.content_sha256
  INTO STRICT source
  FROM aso.documents document
  WHERE document.id = target_document
    AND document.case_id = target_case;
  IF target_page < 1 THEN
    RAISE EXCEPTION 'document source page is invalid' USING ERRCODE = '22023';
  END IF;
  IF source.storage_key IS NULL OR btrim(source.storage_key) = ''
     OR source.page_count IS NULL OR target_page > source.page_count
     OR source.content_sha256 IS NULL OR octet_length(source.content_sha256) <> 32 THEN
    RAISE EXCEPTION 'document source is unavailable' USING ERRCODE = 'A0311';
  END IF;
  storage_key := source.storage_key;
  document_name := source.document_name;
  effective_date := source.effective_date;
  page_count := source.page_count;
  content_sha256 := source.content_sha256;
  RETURN NEXT;
EXCEPTION WHEN no_data_found THEN
  RAISE EXCEPTION 'document source not found' USING ERRCODE = 'P0002';
END;
$$;

CREATE FUNCTION aso.read_document_source_grant(
  target_case uuid,
  target_document uuid,
  target_page integer
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
  SELECT jsonb_build_object(
    'storageKey', source.storage_key,
    'name', source.document_name,
    'effectiveDate', source.effective_date,
    'pageCount', source.page_count,
    'contentSha256', encode(source.content_sha256, 'hex'))
  FROM aso.require_document_source(target_case, target_document, target_page) source;
$$;

CREATE FUNCTION aso.record_document_source_read(
  target_case uuid,
  target_document uuid,
  target_page integer,
  expected_sha256 bytea,
  delivered_bytes bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  source record;
BEGIN
  IF delivered_bytes < 1 OR delivered_bytes > 16777216 THEN
    RAISE EXCEPTION 'document source byte count is invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT actor FROM aso.gate_actor_context();
  SELECT * INTO STRICT source
  FROM aso.require_document_source(target_case, target_document, target_page);
  IF source.content_sha256 IS DISTINCT FROM expected_sha256 THEN
    RAISE EXCEPTION 'document source changed during read' USING ERRCODE = 'A0312';
  END IF;

  INSERT INTO aso.audit_events (
    practice_id, occurred_at, actor_id, actor_kratos_id, actor_label, actor_role,
    action, outcome, entity_table, entity_id, case_id, summary, data)
  VALUES (
    actor.practice_id, clock_timestamp(), actor.actor_id, actor.identity_id,
    actor.actor_label, 'user:source_preview', 'document.source.read', 'success',
    'documents', target_document, target_case, 'Document source page opened',
    jsonb_build_object(
      'pageNumber', target_page,
      'deliveredBytes', delivered_bytes,
      'contentSha256', encode(expected_sha256, 'hex')));
END;
$$;

GRANT CREATE ON SCHEMA aso TO aso_gate_owner;
DO $$
DECLARE
  signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'aso.require_document_source(uuid,uuid,integer)',
    'aso.read_document_source_grant(uuid,uuid,integer)',
    'aso.record_document_source_read(uuid,uuid,integer,bytea,bigint)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', signature);
    EXECUTE format('ALTER FUNCTION %s OWNER TO aso_gate_owner', signature);
  END LOOP;
END;
$$;
REVOKE CREATE ON SCHEMA aso FROM aso_gate_owner;

GRANT EXECUTE ON FUNCTION
  aso.read_document_source_grant(uuid,uuid,integer),
  aso.record_document_source_read(uuid,uuid,integer,bytea,bigint)
TO aso_gate_executor;
