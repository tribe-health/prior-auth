-- web-04. Durable, tenant-scoped document upload staging and commit boundary.
-- Source bytes remain in the server-owned DocumentStore. PostgreSQL records
-- the immutable storage identity and publishes no staging or command rows.

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_publication WHERE puballtables)
     OR EXISTS (
       SELECT FROM pg_catalog.pg_publication_namespace pn
       JOIN pg_catalog.pg_namespace n ON n.oid = pn.pnnspid
       WHERE n.nspname = 'aso'
     ) THEN
    RAISE EXCEPTION 'local document upload data requires explicit-table publications';
  END IF;
END;
$$;

INSERT INTO aso.capabilities (key, label, description, is_clinical) VALUES
  ('document_upload', 'Upload case documents',
   'Commit document metadata and protected bytes for an authorized case.', false),
  ('document_process', 'Process an authorized document job',
   'Narrow internal processor grant; never assigned to a human role.', false)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  is_clinical = EXCLUDED.is_clinical;

INSERT INTO aso.role_capabilities (role_id, capability_key)
SELECT role.id, 'document_upload'
FROM aso.roles role WHERE role.key IN ('staff', 'surgeon')
ON CONFLICT DO NOTHING;

-- Human roles never receive the processor capability.
DELETE FROM aso.role_capabilities grant_record
USING aso.roles role
WHERE grant_record.role_id = role.id
  AND grant_record.capability_key = 'document_process';

ALTER TABLE aso.cases
  ADD COLUMN document_set_revision bigint NOT NULL DEFAULT 0
    CHECK (document_set_revision >= 0);

COMMENT ON COLUMN aso.cases.document_set_revision IS
  'Monotonic token advanced only when the ready document set changes.';

CREATE TABLE aso.document_processing_statuses (
  key text PRIMARY KEY,
  label text NOT NULL,
  terminal boolean NOT NULL
);

INSERT INTO aso.document_processing_statuses (key, label, terminal) VALUES
  ('queued', 'Queued', false),
  ('processing', 'Processing', false),
  ('ready', 'Ready', true),
  ('failed', 'Failed', true);

REVOKE ALL ON aso.document_processing_statuses FROM PUBLIC;

ALTER TABLE aso.documents
  ADD COLUMN media_type text,
  ADD COLUMN byte_size bigint,
  ADD COLUMN processing_status text,
  ADD COLUMN processing_error_code text,
  ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN committed_at timestamptz;

UPDATE aso.documents document
SET processing_status = CASE
      WHEN document.storage_uri IS NOT NULL
       AND btrim(document.storage_uri) <> ''
       AND octet_length(document.content_sha256) = 32
       AND document.page_count > 0
      THEN 'ready'
      ELSE 'failed'
    END,
    processing_error_code = CASE
      WHEN document.storage_uri IS NOT NULL
       AND btrim(document.storage_uri) <> ''
       AND octet_length(document.content_sha256) = 32
       AND document.page_count > 0
      THEN NULL
      ELSE 'legacy_source_incomplete'
    END,
    committed_at = COALESCE(document.retrieved_at, document.created_at);

ALTER TABLE aso.documents
  ALTER COLUMN processing_status SET NOT NULL,
  ALTER COLUMN processing_status SET DEFAULT 'failed',
  ALTER COLUMN committed_at SET NOT NULL,
  ALTER COLUMN committed_at SET DEFAULT clock_timestamp(),
  ADD CONSTRAINT documents_processing_status_fkey
    FOREIGN KEY (processing_status)
    REFERENCES aso.document_processing_statuses(key) ON DELETE RESTRICT,
  ADD CONSTRAINT documents_media_type_check
    CHECK (media_type IS NULL OR media_type IN ('application/pdf', 'text/plain')),
  ADD CONSTRAINT documents_byte_size_check
    CHECK (byte_size IS NULL OR byte_size BETWEEN 1 AND 16777216),
  ADD CONSTRAINT documents_processing_error_check
    CHECK ((processing_status = 'failed') OR processing_error_code IS NULL),
  ADD CONSTRAINT documents_uploaded_source_check
    CHECK (ingest_method <> 'manual_upload' OR processing_status = 'failed' OR (
      storage_uri IS NOT NULL AND btrim(storage_uri) <> ''
      AND content_sha256 IS NOT NULL AND octet_length(content_sha256) = 32
      AND media_type IN ('application/pdf', 'text/plain')
      AND byte_size BETWEEN 1 AND 16777216));

COMMENT ON COLUMN aso.documents.processing_status IS
  'Server-authoritative processing lifecycle. Only ready rows enter evidence.';
COMMENT ON COLUMN aso.documents.processing_error_code IS
  'Bounded diagnostic code. Source text and parser output are prohibited.';

CREATE TABLE aso.document_upload_staging (
  kratos_identity_id uuid NOT NULL,
  practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  command_id uuid NOT NULL,
  staging_id uuid NOT NULL UNIQUE,
  actor_id uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES aso.cases(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL UNIQUE,
  document_type_id uuid NOT NULL REFERENCES aso.document_types(id) ON DELETE RESTRICT,
  expected_case_input_revision bigint NOT NULL
    CHECK (expected_case_input_revision > 0),
  expected_document_set_revision bigint NOT NULL
    CHECK (expected_document_set_revision >= 0),
  name text NOT NULL CHECK (btrim(name) <> ''),
  effective_date date NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('application/pdf', 'text/plain')),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 16777216),
  content_sha256 bytea NOT NULL CHECK (octet_length(content_sha256) = 32),
  data jsonb CHECK (data IS NULL OR jsonb_typeof(data) = 'object'),
  storage_key text NOT NULL UNIQUE
    CHECK (storage_key ~ '^documents/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  reserved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  cleanup_claimed_at timestamptz,
  cleanup_attempts integer NOT NULL DEFAULT 0 CHECK (cleanup_attempts >= 0),
  PRIMARY KEY (kratos_identity_id, practice_id, command_id),
  CHECK (expires_at > reserved_at)
);

COMMENT ON TABLE aso.document_upload_staging IS
  'Lane: server-authoritative relational. Privacy: local. Pending storage identities; excluded from replication.';
ALTER TABLE aso.document_upload_staging ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.document_upload_staging FROM PUBLIC;

CREATE TABLE aso.document_upload_commands (
  kratos_identity_id uuid NOT NULL,
  practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  command_id uuid NOT NULL,
  staging_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES aso.cases(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES aso.documents(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  committed_at timestamptz NOT NULL,
  PRIMARY KEY (kratos_identity_id, practice_id, command_id)
);

COMMENT ON TABLE aso.document_upload_commands IS
  'Lane: server-authoritative relational. Privacy: local. Immutable upload receipts; excluded from replication.';
ALTER TABLE aso.document_upload_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.document_upload_commands FROM PUBLIC;

GRANT SELECT ON aso.document_types, aso.document_processing_statuses
  TO aso_case_owner;
GRANT EXECUTE ON FUNCTION aso.validate_typed_payload(),
  aso.jsonschema_basic_check(jsonb,jsonb) TO aso_case_owner;
GRANT SELECT, INSERT ON aso.documents TO aso_case_owner;
-- PostgreSQL requires UPDATE privilege for SELECT ... FOR UPDATE even when the
-- function only locks and later deletes the staging row.
GRANT SELECT, INSERT, UPDATE, DELETE ON aso.document_upload_staging
  TO aso_case_owner;
GRANT SELECT, INSERT ON aso.document_upload_commands TO aso_case_owner;

CREATE POLICY document_upload_staging_case_owner
  ON aso.document_upload_staging TO aso_case_owner
  USING (true) WITH CHECK (true);
CREATE POLICY document_upload_commands_case_owner
  ON aso.document_upload_commands TO aso_case_owner
  USING (true) WITH CHECK (true);

CREATE FUNCTION aso.document_upload_payload(
  target_document uuid,
  target_case uuid,
  expected_case_input_revision bigint,
  expected_document_set_revision bigint,
  target_document_type_key text,
  target_name text,
  target_effective_date date,
  target_media_type text,
  target_byte_size bigint,
  target_content_sha256 bytea,
  target_data jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, aso, pg_temp
AS $$
  SELECT jsonb_build_object(
    'documentId', target_document,
    'caseId', target_case,
    'expectedCaseInputRevision', expected_case_input_revision,
    'expectedDocumentSetRevision', expected_document_set_revision,
    'documentTypeKey', target_document_type_key,
    'name', target_name,
    'effectiveDate', target_effective_date,
    'mediaType', target_media_type,
    'byteSize', target_byte_size,
    'contentSha256', encode(target_content_sha256, 'hex'),
    'data', target_data)
$$;

CREATE FUNCTION aso.reserve_document_upload_staging(
  target_command uuid,
  target_document uuid,
  target_case uuid,
  expected_case_input_revision bigint,
  expected_document_set_revision bigint,
  target_document_type_key text,
  target_name text,
  target_effective_date date,
  target_media_type text,
  target_byte_size bigint,
  target_content_sha256 bytea,
  target_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  current_case aso.cases%ROWTYPE;
  original aso.document_upload_commands%ROWTYPE;
  pending aso.document_upload_staging%ROWTYPE;
  type_id uuid;
  payload jsonb;
  storage_key text;
  reserved_at timestamptz;
BEGIN
  SELECT * INTO STRICT actor FROM aso.case_actor_context('document_upload');
  IF target_command IS NULL OR target_document IS NULL OR target_case IS NULL
     OR expected_case_input_revision IS NULL OR expected_case_input_revision <= 0
     OR expected_document_set_revision IS NULL OR expected_document_set_revision < 0
     OR NULLIF(btrim(target_document_type_key), '') IS NULL
     OR NULLIF(btrim(target_name), '') IS NULL OR target_effective_date IS NULL
     OR target_media_type NOT IN ('application/pdf', 'text/plain')
     OR target_byte_size IS NULL OR target_byte_size < 1
     OR target_byte_size > 16777216
     OR target_content_sha256 IS NULL OR octet_length(target_content_sha256) <> 32
     OR (target_data IS NOT NULL AND jsonb_typeof(target_data) <> 'object') THEN
    RAISE EXCEPTION 'invalid document upload staging payload'
      USING ERRCODE = '22023';
  END IF;

  payload := aso.document_upload_payload(
    target_document, target_case, expected_case_input_revision,
    expected_document_set_revision, btrim(target_document_type_key),
    btrim(target_name), target_effective_date, target_media_type,
    target_byte_size, target_content_sha256, target_data);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    actor.identity_id::text || ':' || actor.practice_id::text || ':' ||
    target_command::text, 0));

  SELECT * INTO original FROM aso.document_upload_commands command
   WHERE command.kratos_identity_id = actor.identity_id
     AND command.practice_id = actor.practice_id
     AND command.command_id = target_command;
  IF FOUND THEN
    PERFORM aso.require_case(original.case_id, 'document_upload');
    IF original.case_id IS DISTINCT FROM target_case
       OR original.document_id IS DISTINCT FROM target_document
       OR original.actor_id IS DISTINCT FROM actor.actor_id
       OR original.payload IS DISTINCT FROM payload THEN
      RAISE EXCEPTION 'document upload command ID has a different payload'
        USING ERRCODE = '23505';
    END IF;
    RETURN original.result || jsonb_build_object('state', 'committed');
  END IF;

  SELECT * INTO pending FROM aso.document_upload_staging staging
   WHERE staging.kratos_identity_id = actor.identity_id
     AND staging.practice_id = actor.practice_id
     AND staging.command_id = target_command;
  IF FOUND THEN
    PERFORM aso.require_case(pending.case_id, 'document_upload');
    IF pending.case_id IS DISTINCT FROM target_case
       OR pending.document_id IS DISTINCT FROM target_document
       OR pending.actor_id IS DISTINCT FROM actor.actor_id
       OR pending.payload IS DISTINCT FROM payload THEN
      RAISE EXCEPTION 'document upload command ID has a different payload'
        USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'state', 'staged', 'commandId', target_command,
      'stagingId', pending.staging_id, 'caseId', target_case,
      'documentId', target_document, 'storageKey', pending.storage_key,
      'expiresAt', pending.expires_at);
  END IF;

  PERFORM aso.require_case(target_case, 'document_upload');
  SELECT * INTO STRICT current_case FROM aso.cases clinical_case
    WHERE clinical_case.id = target_case FOR UPDATE;
  PERFORM aso.require_case(target_case, 'document_upload');
  IF current_case.case_input_revision <> expected_case_input_revision
     OR current_case.document_set_revision <> expected_document_set_revision THEN
    RAISE EXCEPTION 'document upload revision is stale' USING ERRCODE = '40001';
  END IF;
  SELECT type.id INTO type_id FROM aso.document_types type
   WHERE type.key = btrim(target_document_type_key);
  IF type_id IS NULL THEN
    RAISE EXCEPTION 'document type is unsupported' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT FROM aso.documents document WHERE document.id = target_document) THEN
    RAISE EXCEPTION 'document ID already exists' USING ERRCODE = '23505';
  END IF;

  storage_key := 'documents/' || actor.practice_id::text || '/' ||
    target_document::text || '/' || encode(target_content_sha256, 'hex');
  reserved_at := clock_timestamp();
  INSERT INTO aso.document_upload_staging (
    kratos_identity_id, practice_id, command_id, staging_id, actor_id,
    case_id, document_id, document_type_id, expected_case_input_revision,
    expected_document_set_revision, name, effective_date, media_type,
    byte_size, content_sha256, data, storage_key, payload, reserved_at,
    expires_at)
  VALUES (
    actor.identity_id, actor.practice_id, target_command, target_command,
    actor.actor_id, target_case, target_document, type_id,
    expected_case_input_revision, expected_document_set_revision,
    btrim(target_name), target_effective_date, target_media_type,
    target_byte_size, target_content_sha256, target_data, storage_key, payload,
    reserved_at, reserved_at + interval '1 hour');
  RETURN jsonb_build_object(
    'state', 'staged', 'commandId', target_command,
    'stagingId', target_command, 'caseId', target_case,
    'documentId', target_document, 'storageKey', storage_key,
    'expiresAt', reserved_at + interval '1 hour');
END;
$$;

CREATE FUNCTION aso.commit_document_upload_command(
  target_command uuid,
  target_staging uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  current_case aso.cases%ROWTYPE;
  pending aso.document_upload_staging%ROWTYPE;
  original aso.document_upload_commands%ROWTYPE;
  result jsonb;
  committed_at timestamptz;
BEGIN
  SELECT * INTO STRICT actor FROM aso.case_actor_context('document_upload');
  IF target_command IS NULL OR target_staging IS NULL THEN
    RAISE EXCEPTION 'invalid document upload commit payload'
      USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    actor.identity_id::text || ':' || actor.practice_id::text || ':' ||
    target_command::text, 0));

  SELECT * INTO original FROM aso.document_upload_commands command
   WHERE command.kratos_identity_id = actor.identity_id
     AND command.practice_id = actor.practice_id
     AND command.command_id = target_command;
  IF FOUND THEN
    PERFORM aso.require_case(original.case_id, 'document_upload');
    IF original.staging_id IS DISTINCT FROM target_staging
       OR original.actor_id IS DISTINCT FROM actor.actor_id THEN
      RAISE EXCEPTION 'document upload command ID has a different staging identity'
        USING ERRCODE = '23505';
    END IF;
    RETURN original.result;
  END IF;

  SELECT * INTO pending FROM aso.document_upload_staging staging
   WHERE staging.kratos_identity_id = actor.identity_id
     AND staging.practice_id = actor.practice_id
     AND staging.command_id = target_command
     AND staging.staging_id = target_staging
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'document upload staging not found' USING ERRCODE = 'P0002';
  END IF;
  IF pending.actor_id IS DISTINCT FROM actor.actor_id
     OR pending.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'document upload staging is unavailable' USING ERRCODE = '42501';
  END IF;

  PERFORM aso.require_case(pending.case_id, 'document_upload');
  SELECT * INTO STRICT current_case FROM aso.cases clinical_case
    WHERE clinical_case.id = pending.case_id FOR UPDATE;
  PERFORM aso.require_case(pending.case_id, 'document_upload');
  IF current_case.case_input_revision <> pending.expected_case_input_revision
     OR current_case.document_set_revision <>
        pending.expected_document_set_revision THEN
    RAISE EXCEPTION 'document upload revision is stale' USING ERRCODE = '40001';
  END IF;

  committed_at := clock_timestamp();
  INSERT INTO aso.documents (
    id, document_type_id, patient_id, case_id, name, data, effective_date,
    storage_uri, content_sha256, document_version, page_count, retrieved_at,
    ingest_method, media_type, byte_size, processing_status,
    processing_error_code, revision, committed_at)
  VALUES (
    pending.document_id, pending.document_type_id, current_case.patient_id,
    pending.case_id, pending.name, pending.data, pending.effective_date,
    pending.storage_key, pending.content_sha256, 1, NULL, committed_at,
    'manual_upload', pending.media_type, pending.byte_size, 'queued', NULL, 1,
    committed_at);
  result := jsonb_build_object(
    'commandId', target_command, 'action', 'upload',
    'caseId', pending.case_id, 'documentId', pending.document_id,
    'committedAt', committed_at);
  INSERT INTO aso.document_upload_commands (
    kratos_identity_id, practice_id, command_id, staging_id, actor_id,
    case_id, document_id, payload, result, committed_at)
  VALUES (
    actor.identity_id, actor.practice_id, target_command, target_staging,
    actor.actor_id, pending.case_id, pending.document_id, pending.payload,
    result, committed_at);
  INSERT INTO aso.audit_events (
    practice_id, occurred_at, actor_id, actor_kratos_id, actor_label,
    actor_role, action, outcome, entity_table, entity_id, case_id, summary, data)
  VALUES (
    actor.practice_id, committed_at, actor.actor_id, actor.identity_id,
    actor.actor_label, 'case:document_upload', 'document.upload', 'success',
    'documents', pending.document_id, pending.case_id,
    'Case document upload committed',
    jsonb_build_object('commandId', target_command,
      'documentId', pending.document_id));
  DELETE FROM aso.document_upload_staging staging
   WHERE staging.kratos_identity_id = actor.identity_id
     AND staging.practice_id = actor.practice_id
     AND staging.command_id = target_command;
  RETURN result;
END;
$$;

CREATE FUNCTION aso.abandon_document_upload_staging(
  target_command uuid,
  target_staging uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  pending aso.document_upload_staging%ROWTYPE;
BEGIN
  SELECT * INTO STRICT actor FROM aso.case_actor_context('document_upload');
  PERFORM pg_advisory_xact_lock(hashtextextended(
    actor.identity_id::text || ':' || actor.practice_id::text || ':' ||
    target_command::text, 0));
  SELECT * INTO pending FROM aso.document_upload_staging staging
   WHERE staging.kratos_identity_id = actor.identity_id
     AND staging.practice_id = actor.practice_id
     AND staging.command_id = target_command
     AND staging.staging_id = target_staging
     AND staging.actor_id = actor.actor_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  PERFORM aso.require_case(pending.case_id, 'document_upload');
  DELETE FROM aso.document_upload_staging staging
   WHERE staging.kratos_identity_id = actor.identity_id
     AND staging.practice_id = actor.practice_id
     AND staging.command_id = target_command;
  RETURN pending.storage_key;
END;
$$;

CREATE FUNCTION aso.read_case_document_metadata(
  target_case uuid,
  target_document uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE result jsonb;
BEGIN
  PERFORM aso.require_case(target_case, 'case:read');
  SELECT jsonb_build_object(
    'id', document.id, 'caseId', document.case_id,
    'documentTypeId', document.document_type_id, 'name', document.name,
    'effectiveDate', document.effective_date,
    'contentSha256', encode(document.content_sha256, 'hex'),
    'mediaType', document.media_type, 'byteSize', document.byte_size,
    'pageCount', document.page_count,
    'processingStatus', document.processing_status,
    'processingErrorCode', document.processing_error_code,
    'documentVersion', document.document_version,
    'revision', document.revision, 'committedAt', document.committed_at)
  INTO result
  FROM aso.documents document
  WHERE document.id = target_document AND document.case_id = target_case;
  IF result IS NULL THEN
    RAISE EXCEPTION 'case document not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN result;
END;
$$;

CREATE FUNCTION aso.lookup_document_upload_command(
  target_case uuid,
  target_command uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  result jsonb;
BEGIN
  SELECT * INTO STRICT actor FROM aso.case_actor_context('document_upload');
  PERFORM aso.require_case(target_case, 'document_upload');
  SELECT command.result INTO result
  FROM aso.document_upload_commands command
  WHERE command.kratos_identity_id = actor.identity_id
    AND command.practice_id = actor.practice_id
    AND command.command_id = target_command
    AND command.case_id = target_case;
  RETURN result;
END;
$$;

-- Expired staging is a durable crash-recovery queue. The trusted server first
-- claims a bounded batch, removes only the digest-matching object, and then
-- acknowledges that exact row. A crash between object deletion and completion
-- leaves the row reclaimable; deleting an already-absent object is idempotent.
CREATE FUNCTION aso.claim_expired_document_upload_cleanup(target_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  result jsonb;
BEGIN
  IF target_limit IS NULL OR target_limit < 1 OR target_limit > 32 THEN
    RAISE EXCEPTION 'invalid document cleanup batch size' USING ERRCODE = '22023';
  END IF;
  WITH candidates AS (
    SELECT staging.kratos_identity_id, staging.practice_id, staging.command_id
    FROM aso.document_upload_staging staging
    WHERE staging.expires_at <= clock_timestamp()
      AND (staging.cleanup_claimed_at IS NULL
        OR staging.cleanup_claimed_at <= clock_timestamp() - interval '5 minutes')
    ORDER BY staging.expires_at, staging.command_id
    FOR UPDATE SKIP LOCKED
    LIMIT target_limit
  ), claimed AS (
    UPDATE aso.document_upload_staging staging
    SET cleanup_claimed_at = clock_timestamp(),
        cleanup_attempts = staging.cleanup_attempts + 1
    FROM candidates candidate
    WHERE staging.kratos_identity_id = candidate.kratos_identity_id
      AND staging.practice_id = candidate.practice_id
      AND staging.command_id = candidate.command_id
    RETURNING staging.kratos_identity_id, staging.practice_id,
      staging.command_id, staging.staging_id, staging.storage_key,
      staging.content_sha256, staging.expires_at
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'identityId', claimed.kratos_identity_id,
    'practiceId', claimed.practice_id,
    'commandId', claimed.command_id,
    'stagingId', claimed.staging_id,
    'storageKey', claimed.storage_key,
    'contentSha256', encode(claimed.content_sha256, 'hex'))
    ORDER BY claimed.expires_at, claimed.command_id), '[]'::jsonb)
  INTO result
  FROM claimed;
  RETURN result;
END;
$$;

CREATE FUNCTION aso.complete_expired_document_upload_cleanup(
  target_identity uuid,
  target_practice uuid,
  target_command uuid,
  target_staging uuid,
  target_storage_key text,
  target_content_sha256 bytea)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  IF target_identity IS NULL OR target_practice IS NULL OR target_command IS NULL
     OR target_staging IS NULL OR NULLIF(btrim(target_storage_key), '') IS NULL
     OR target_content_sha256 IS NULL OR octet_length(target_content_sha256) <> 32 THEN
    RAISE EXCEPTION 'invalid document cleanup completion' USING ERRCODE = '22023';
  END IF;
  DELETE FROM aso.document_upload_staging staging
  WHERE staging.kratos_identity_id = target_identity
    AND staging.practice_id = target_practice
    AND staging.command_id = target_command
    AND staging.staging_id = target_staging
    AND staging.storage_key = target_storage_key
    AND staging.content_sha256 = target_content_sha256
    AND staging.expires_at <= clock_timestamp()
    AND staging.cleanup_claimed_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'document cleanup staging not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- Web-04 storage keys are content addressed and deliberately extensionless.
-- Preserve the authoritative database media type through the existing source
-- grant rather than inferring it from a storage implementation detail.
CREATE OR REPLACE FUNCTION aso.read_document_source_grant(
  target_case uuid,
  target_document uuid,
  target_page integer)
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
    'mediaType', document.media_type,
    'contentSha256', encode(source.content_sha256, 'hex'))
  FROM aso.require_document_source(target_case, target_document, target_page) source
  JOIN aso.documents document
    ON document.id = target_document AND document.case_id = target_case;
$$;
ALTER FUNCTION aso.read_document_source_grant(uuid,uuid,integer)
  OWNER TO aso_gate_owner;

CREATE FUNCTION aso.document_upload_commands_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'document upload command results are immutable'
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER document_upload_commands_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON aso.document_upload_commands
  FOR EACH STATEMENT EXECUTE FUNCTION aso.document_upload_commands_immutable();

GRANT CREATE ON SCHEMA aso TO aso_case_owner;
DO $$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'aso.document_upload_payload(uuid,uuid,bigint,bigint,text,text,date,text,bigint,bytea,jsonb)',
    'aso.reserve_document_upload_staging(uuid,uuid,uuid,bigint,bigint,text,text,date,text,bigint,bytea,jsonb)',
    'aso.commit_document_upload_command(uuid,uuid)',
    'aso.abandon_document_upload_staging(uuid,uuid)',
    'aso.claim_expired_document_upload_cleanup(integer)',
    'aso.complete_expired_document_upload_cleanup(uuid,uuid,uuid,uuid,text,bytea)',
    'aso.read_case_document_metadata(uuid,uuid)',
    'aso.lookup_document_upload_command(uuid,uuid)',
    'aso.document_upload_commands_immutable()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', signature);
    EXECUTE format('ALTER FUNCTION %s OWNER TO aso_case_owner', signature);
  END LOOP;
END;
$$;
REVOKE CREATE ON SCHEMA aso FROM aso_case_owner;

GRANT EXECUTE ON FUNCTION
  aso.reserve_document_upload_staging(
    uuid,uuid,uuid,bigint,bigint,text,text,date,text,bigint,bytea,jsonb),
  aso.commit_document_upload_command(uuid,uuid),
  aso.abandon_document_upload_staging(uuid,uuid),
  aso.claim_expired_document_upload_cleanup(integer),
  aso.complete_expired_document_upload_cleanup(uuid,uuid,uuid,uuid,text,bytea),
  aso.read_case_document_metadata(uuid,uuid),
  aso.lookup_document_upload_command(uuid,uuid)
TO aso_case_executor;
