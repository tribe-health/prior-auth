-- web-05. Service-only document processing and local page provenance.
-- Extracted page text is local PHI and is structurally excluded from every
-- publication. Only the reviewed document status view may be published later.

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_publication WHERE puballtables)
     OR EXISTS (
       SELECT FROM pg_catalog.pg_publication_namespace pn
       JOIN pg_catalog.pg_namespace n ON n.oid = pn.pnnspid
       WHERE n.nspname = 'aso'
     ) THEN
    RAISE EXCEPTION 'local document processing data requires explicit-table publications';
  END IF;
END;
$$;

CREATE TABLE aso.document_processor_grants (
  service_identity_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES aso.users(id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE CASCADE,
  grant_key text NOT NULL
    CHECK (grant_key = 'authorized_document_job_only'),
  enabled boolean NOT NULL DEFAULT true,
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (service_identity_id, practice_id),
  UNIQUE (actor_id, practice_id)
);

COMMENT ON TABLE aso.document_processor_grants IS
  'Lane: server-authoritative relational. Privacy: local. Exact service job grants; excluded from replication.';
ALTER TABLE aso.document_processor_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.document_processor_grants FROM PUBLIC;

CREATE TABLE aso.document_pages (
  document_id uuid NOT NULL REFERENCES aso.documents(id) ON DELETE CASCADE,
  page_number integer NOT NULL CHECK (page_number > 0 AND page_number <= 500),
  text text NOT NULL CHECK (btrim(text) <> '' AND octet_length(text) <= 1048576),
  text_sha256 bytea NOT NULL CHECK (octet_length(text_sha256) = 32),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (document_id, page_number)
);

COMMENT ON TABLE aso.document_pages IS
  'Lane: server-authoritative relational. Privacy: local. Extracted chart text and page hashes; excluded from replication.';
ALTER TABLE aso.document_pages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.document_pages FROM PUBLIC;

CREATE TABLE aso.document_processing_commands (
  service_identity_id uuid NOT NULL,
  practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  command_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES aso.cases(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES aso.documents(id) ON DELETE RESTRICT,
  expected_document_set_revision bigint NOT NULL
    CHECK (expected_document_set_revision >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  state text NOT NULL CHECK (state IN ('processing', 'ready', 'failed')),
  result jsonb CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  processing_error_code text,
  claimed_at timestamptz NOT NULL,
  committed_at timestamptz,
  PRIMARY KEY (service_identity_id, practice_id, command_id),
  CHECK ((state = 'processing' AND result IS NULL AND committed_at IS NULL
          AND processing_error_code IS NULL)
      OR (state = 'ready' AND result IS NOT NULL AND committed_at IS NOT NULL
          AND processing_error_code IS NULL)
      OR (state = 'failed' AND result IS NOT NULL AND committed_at IS NOT NULL
          AND processing_error_code IS NOT NULL))
);

CREATE UNIQUE INDEX document_processing_one_active_revision_ix
  ON aso.document_processing_commands (case_id, expected_document_set_revision)
  WHERE state = 'processing';

COMMENT ON TABLE aso.document_processing_commands IS
  'Lane: server-authoritative relational. Privacy: local. Service-only processing command ledger; excluded from replication.';
ALTER TABLE aso.document_processing_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.document_processing_commands FROM PUBLIC;

GRANT SELECT ON aso.document_processor_grants, aso.users TO aso_case_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON aso.document_pages TO aso_case_owner;
GRANT SELECT, INSERT, UPDATE ON aso.document_processing_commands TO aso_case_owner;
GRANT SELECT, UPDATE ON aso.documents, aso.cases TO aso_case_owner;
GRANT INSERT ON aso.audit_events TO aso_case_owner;

CREATE POLICY document_processor_grants_owner
  ON aso.document_processor_grants TO aso_case_owner USING (true);
CREATE POLICY document_pages_owner
  ON aso.document_pages TO aso_case_owner USING (true) WITH CHECK (true);
CREATE POLICY document_processing_commands_owner
  ON aso.document_processing_commands TO aso_case_owner
  USING (true) WITH CHECK (true);
CREATE POLICY audit_document_processor_insert
  ON aso.audit_events FOR INSERT TO aso_case_owner
  WITH CHECK (
    actor_id = NULLIF(current_setting('aso.actor_id', true), '')::uuid
    AND actor_kratos_id =
      NULLIF(current_setting('aso.kratos_identity_id', true), '')::uuid
    AND practice_id = NULLIF(current_setting('aso.practice_id', true), '')::uuid
    AND current_setting('aso.principal', true) = 'service'
    AND action = 'document.process'
    AND EXISTS (
      SELECT FROM aso.document_processor_grants processor
       WHERE processor.service_identity_id = actor_kratos_id
         AND processor.actor_id = audit_events.actor_id
         AND processor.practice_id = audit_events.practice_id
         AND processor.grant_key = 'authorized_document_job_only'
         AND processor.enabled));

CREATE FUNCTION aso.document_processor_context()
RETURNS TABLE (
  actor_id uuid,
  identity_id uuid,
  practice_id uuid,
  actor_label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  context_actor uuid;
  context_identity uuid;
  context_practice uuid;
  context_expiry timestamptz;
BEGIN
  BEGIN
    context_actor := NULLIF(current_setting('aso.actor_id', true), '')::uuid;
    context_identity :=
      NULLIF(current_setting('aso.kratos_identity_id', true), '')::uuid;
    context_practice :=
      NULLIF(current_setting('aso.practice_id', true), '')::uuid;
    context_expiry :=
      NULLIF(current_setting('aso.session_expires_at', true), '')::timestamptz;
  EXCEPTION
    WHEN invalid_text_representation OR invalid_datetime_format
      OR datetime_field_overflow THEN
      RAISE EXCEPTION 'invalid document processor context' USING ERRCODE = '42501';
  END;

  IF current_setting('aso.principal', true) IS DISTINCT FROM 'service'
     OR context_actor IS NULL OR context_identity IS NULL
     OR context_practice IS NULL OR context_expiry IS NULL
     OR NOT isfinite(context_expiry) OR context_expiry <= clock_timestamp() THEN
    RAISE EXCEPTION 'active document processor required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT user_record.id, user_record.kratos_identity_id, context_practice,
           COALESCE(user_record.display_name, user_record.full_name)
      FROM aso.users user_record
      JOIN aso.document_processor_grants processor
        ON processor.actor_id = user_record.id
       AND processor.service_identity_id = user_record.kratos_identity_id
       AND processor.practice_id = context_practice
     WHERE user_record.id = context_actor
       AND user_record.kratos_identity_id = context_identity
       AND user_record.practice_id = context_practice
       AND user_record.status = 'active'
       AND processor.grant_key = 'authorized_document_job_only'
       AND processor.enabled;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'document processor job grant denied' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION aso.document_processing_payload(
  target_document uuid,
  target_case uuid,
  expected_document_set_revision bigint)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, aso, pg_temp
AS $$
  SELECT jsonb_build_object(
    'documentId', target_document,
    'caseId', target_case,
    'expectedDocumentSetRevision', expected_document_set_revision)
$$;

CREATE FUNCTION aso.claim_document_processing_command(
  target_command uuid,
  target_case uuid,
  target_document uuid,
  expected_document_set_revision bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  processor record;
  current_case aso.cases%ROWTYPE;
  source aso.documents%ROWTYPE;
  original aso.document_processing_commands%ROWTYPE;
  payload jsonb;
  claimed_at timestamptz;
BEGIN
  SELECT * INTO STRICT processor FROM aso.document_processor_context();
  IF target_command IS NULL OR target_case IS NULL OR target_document IS NULL
     OR expected_document_set_revision IS NULL
     OR expected_document_set_revision < 0 THEN
    RAISE EXCEPTION 'invalid document processing claim' USING ERRCODE = '22023';
  END IF;
  payload := aso.document_processing_payload(
    target_document, target_case, expected_document_set_revision);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    processor.practice_id::text || ':' || target_case::text || ':' ||
    target_document::text, 0));

  SELECT * INTO original FROM aso.document_processing_commands command
   WHERE command.service_identity_id = processor.identity_id
     AND command.practice_id = processor.practice_id
     AND command.command_id = target_command;
  IF FOUND THEN
    IF original.actor_id IS DISTINCT FROM processor.actor_id
       OR original.case_id IS DISTINCT FROM target_case
       OR original.document_id IS DISTINCT FROM target_document
       OR original.payload IS DISTINCT FROM payload THEN
      RAISE EXCEPTION 'document processing command ID has a different payload'
        USING ERRCODE = '23505';
    END IF;
    IF original.state IN ('ready', 'failed') THEN
      RETURN original.result || jsonb_build_object('state', 'committed');
    END IF;
    SELECT * INTO STRICT source FROM aso.documents document
     WHERE document.id = original.document_id
       AND document.case_id = original.case_id;
    RETURN jsonb_build_object(
      'state', 'claimed', 'commandId', target_command,
      'caseId', target_case, 'documentId', target_document,
      'storageKey', source.storage_uri, 'mediaType', source.media_type,
      'contentSha256', encode(source.content_sha256, 'hex'));
  END IF;

  SELECT * INTO current_case FROM aso.cases clinical_case
   WHERE clinical_case.id = target_case
     AND clinical_case.practice_id = processor.practice_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'processing case not found' USING ERRCODE = 'P0002';
  END IF;
  IF current_case.document_set_revision <> expected_document_set_revision THEN
    RAISE EXCEPTION 'document processing revision is stale' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO source FROM aso.documents document
   WHERE document.id = target_document AND document.case_id = target_case
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'processing document not found' USING ERRCODE = 'P0002';
  END IF;
  IF source.processing_status NOT IN ('queued', 'failed')
     OR source.storage_uri IS NULL OR btrim(source.storage_uri) = ''
     OR source.media_type NOT IN ('application/pdf', 'text/plain')
     OR source.content_sha256 IS NULL
     OR octet_length(source.content_sha256) <> 32 THEN
    RAISE EXCEPTION 'document is not an authorized queued job'
      USING ERRCODE = '22023';
  END IF;

  claimed_at := clock_timestamp();
  UPDATE aso.documents document
     SET processing_status = 'processing', processing_error_code = NULL,
         revision = revision + 1
   WHERE document.id = target_document;
  BEGIN
    INSERT INTO aso.document_processing_commands (
      service_identity_id, practice_id, command_id, actor_id, case_id,
      document_id, expected_document_set_revision, payload, state, claimed_at)
    VALUES (
      processor.identity_id, processor.practice_id, target_command,
      processor.actor_id, target_case, target_document,
      expected_document_set_revision, payload, 'processing', claimed_at);
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'document processing revision already has an active job'
        USING ERRCODE = '40001';
  END;
  RETURN jsonb_build_object(
    'state', 'claimed', 'commandId', target_command,
    'caseId', target_case, 'documentId', target_document,
    'storageKey', source.storage_uri, 'mediaType', source.media_type,
    'contentSha256', encode(source.content_sha256, 'hex'));
END;
$$;

CREATE FUNCTION aso.complete_document_processing_command(
  target_command uuid,
  target_pages jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  processor record;
  current_case aso.cases%ROWTYPE;
  current_command aso.document_processing_commands%ROWTYPE;
  processed_page_count integer;
  completed_at timestamptz;
  command_result jsonb;
BEGIN
  SELECT * INTO STRICT processor FROM aso.document_processor_context();
  IF target_command IS NULL OR jsonb_typeof(target_pages) <> 'array' THEN
    RAISE EXCEPTION 'invalid processed page set' USING ERRCODE = '22023';
  END IF;
  processed_page_count := jsonb_array_length(target_pages);
  IF processed_page_count < 1 OR processed_page_count > 500 OR EXISTS (
    SELECT FROM jsonb_array_elements(target_pages) WITH ORDINALITY page(value, ordinal)
     WHERE jsonb_typeof(page.value) <> 'object'
        OR (page.value->>'pageNumber') IS NULL
        OR (page.value->>'pageNumber') !~ '^[0-9]+$'
        OR (page.value->>'pageNumber')::bigint <> page.ordinal
        OR NULLIF(btrim(page.value->>'text'), '') IS NULL
        OR octet_length(page.value->>'text') > 1048576
        OR COALESCE(page.value->>'textSha256', '') !~ '^[0-9a-f]{64}$'
        OR public.digest(convert_to(page.value->>'text', 'UTF8'), 'sha256')
           IS DISTINCT FROM decode(page.value->>'textSha256', 'hex')) THEN
    RAISE EXCEPTION 'invalid processed page set' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO current_command FROM aso.document_processing_commands command
   WHERE command.service_identity_id = processor.identity_id
     AND command.practice_id = processor.practice_id
     AND command.command_id = target_command
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'document processing command not found' USING ERRCODE = 'P0002';
  END IF;
  IF current_command.actor_id IS DISTINCT FROM processor.actor_id THEN
    RAISE EXCEPTION 'document processing command denied' USING ERRCODE = '42501';
  END IF;
  IF current_command.state IN ('ready', 'failed') THEN
    RETURN current_command.result;
  END IF;
  SELECT * INTO STRICT current_case FROM aso.cases clinical_case
   WHERE clinical_case.id = current_command.case_id
     AND clinical_case.practice_id = processor.practice_id
   FOR UPDATE;
  IF current_case.document_set_revision <>
     current_command.expected_document_set_revision THEN
    RAISE EXCEPTION 'document processing revision is stale' USING ERRCODE = '40001';
  END IF;

  DELETE FROM aso.document_pages page
   WHERE page.document_id = current_command.document_id;
  INSERT INTO aso.document_pages (
    document_id, page_number, text, text_sha256)
  SELECT current_command.document_id, page.ordinal::integer,
         page.value->>'text', decode(page.value->>'textSha256', 'hex')
    FROM jsonb_array_elements(target_pages) WITH ORDINALITY page(value, ordinal)
   ORDER BY page.ordinal;

  UPDATE aso.documents document
     SET page_count = processed_page_count, processing_status = 'ready',
         processing_error_code = NULL, revision = revision + 1
   WHERE document.id = current_command.document_id
     AND document.case_id = current_command.case_id
     AND document.processing_status = 'processing';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'document processing state changed' USING ERRCODE = '40001';
  END IF;
  UPDATE aso.cases clinical_case
     SET document_set_revision = document_set_revision + 1,
         revision = revision + 1, updated_at = clock_timestamp()
   WHERE clinical_case.id = current_command.case_id
   RETURNING * INTO current_case;

  completed_at := clock_timestamp();
  command_result := jsonb_build_object(
    'commandId', target_command, 'action', 'process',
    'caseId', current_command.case_id,
    'documentId', current_command.document_id, 'status', 'ready',
    'pageCount', processed_page_count,
    'documentSetRevision', current_case.document_set_revision,
    'committedAt', completed_at);
  UPDATE aso.document_processing_commands command
     SET state = 'ready', result = command_result, committed_at = completed_at
   WHERE command.service_identity_id = processor.identity_id
     AND command.practice_id = processor.practice_id
     AND command.command_id = target_command;
  INSERT INTO aso.audit_events (
    practice_id, occurred_at, actor_id, actor_kratos_id, actor_label,
    actor_role, action, outcome, entity_table, entity_id, case_id, summary, data)
  VALUES (
    processor.practice_id, completed_at, processor.actor_id,
    processor.identity_id, processor.actor_label, 'service:document_process',
    'document.process', 'success', 'documents', current_command.document_id,
    current_command.case_id, 'Case document processing completed',
    jsonb_build_object('commandId', target_command,
      'documentId', current_command.document_id,
      'pageCount', processed_page_count));
  RETURN command_result;
END;
$$;

CREATE FUNCTION aso.fail_document_processing_command(
  target_command uuid,
  target_error_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  processor record;
  current_case aso.cases%ROWTYPE;
  current_command aso.document_processing_commands%ROWTYPE;
  completed_at timestamptz;
  command_result jsonb;
BEGIN
  SELECT * INTO STRICT processor FROM aso.document_processor_context();
  IF target_command IS NULL OR target_error_code NOT IN (
    'empty_page_text', 'page_limit_exceeded', 'source_integrity_failed',
    'source_unavailable', 'text_extraction_failed') THEN
    RAISE EXCEPTION 'invalid document processing failure code'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO current_command FROM aso.document_processing_commands command
   WHERE command.service_identity_id = processor.identity_id
     AND command.practice_id = processor.practice_id
     AND command.command_id = target_command
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'document processing command not found' USING ERRCODE = 'P0002';
  END IF;
  IF current_command.actor_id IS DISTINCT FROM processor.actor_id THEN
    RAISE EXCEPTION 'document processing command denied' USING ERRCODE = '42501';
  END IF;
  IF current_command.state IN ('ready', 'failed') THEN
    RETURN current_command.result;
  END IF;
  SELECT * INTO STRICT current_case FROM aso.cases clinical_case
   WHERE clinical_case.id = current_command.case_id
     AND clinical_case.practice_id = processor.practice_id;
  DELETE FROM aso.document_pages page
   WHERE page.document_id = current_command.document_id;
  UPDATE aso.documents document
     SET page_count = NULL, processing_status = 'failed',
         processing_error_code = target_error_code, revision = revision + 1
   WHERE document.id = current_command.document_id
     AND document.case_id = current_command.case_id
     AND document.processing_status = 'processing';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'document processing state changed' USING ERRCODE = '40001';
  END IF;

  completed_at := clock_timestamp();
  command_result := jsonb_build_object(
    'commandId', target_command, 'action', 'process',
    'caseId', current_command.case_id,
    'documentId', current_command.document_id, 'status', 'failed',
    'pageCount', NULL,
    'documentSetRevision', current_case.document_set_revision,
    'committedAt', completed_at);
  UPDATE aso.document_processing_commands command
     SET state = 'failed', result = command_result,
         processing_error_code = target_error_code,
         committed_at = completed_at
   WHERE command.service_identity_id = processor.identity_id
     AND command.practice_id = processor.practice_id
     AND command.command_id = target_command;
  INSERT INTO aso.audit_events (
    practice_id, occurred_at, actor_id, actor_kratos_id, actor_label,
    actor_role, action, outcome, entity_table, entity_id, case_id, summary, data)
  VALUES (
    processor.practice_id, completed_at, processor.actor_id,
    processor.identity_id, processor.actor_label, 'service:document_process',
    'document.process', 'error', 'documents', current_command.document_id,
    current_command.case_id, 'Case document processing failed',
    jsonb_build_object('commandId', target_command,
      'documentId', current_command.document_id,
      'processingErrorCode', target_error_code));
  RETURN command_result;
END;
$$;

CREATE FUNCTION aso.lookup_document_processing_command(
  target_case uuid,
  target_document uuid,
  target_command uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  processor record;
  original aso.document_processing_commands%ROWTYPE;
BEGIN
  SELECT * INTO STRICT processor FROM aso.document_processor_context();
  SELECT * INTO original FROM aso.document_processing_commands command
   WHERE command.service_identity_id = processor.identity_id
     AND command.practice_id = processor.practice_id
     AND command.command_id = target_command;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF original.actor_id IS DISTINCT FROM processor.actor_id
     OR original.case_id IS DISTINCT FROM target_case
     OR original.document_id IS DISTINCT FROM target_document THEN
    RAISE EXCEPTION 'document processing command denied' USING ERRCODE = '42501';
  END IF;
  RETURN original.result;
END;
$$;

GRANT CREATE ON SCHEMA aso TO aso_case_owner;
DO $$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'aso.document_processor_context()',
    'aso.document_processing_payload(uuid,uuid,bigint)',
    'aso.claim_document_processing_command(uuid,uuid,uuid,bigint)',
    'aso.complete_document_processing_command(uuid,jsonb)',
    'aso.fail_document_processing_command(uuid,text)',
    'aso.lookup_document_processing_command(uuid,uuid,uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', signature);
    EXECUTE format('ALTER FUNCTION %s OWNER TO aso_case_owner', signature);
  END LOOP;
END;
$$;
REVOKE CREATE ON SCHEMA aso FROM aso_case_owner;

GRANT EXECUTE ON FUNCTION
  aso.claim_document_processing_command(uuid,uuid,uuid,bigint),
  aso.complete_document_processing_command(uuid,jsonb),
  aso.fail_document_processing_command(uuid,text),
  aso.lookup_document_processing_command(uuid,uuid,uuid)
TO aso_case_executor;
