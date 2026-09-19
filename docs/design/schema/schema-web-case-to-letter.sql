-- Web case-to-letter criteria cutover.
-- Apply after schema.sql and schema-ai.sql, before web-06 readers or writers.

BEGIN;
SET search_path = aso, public;

LOCK TABLE policy_criteria, criteria, case_evidence IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM policy_criteria WHERE data ? '_web00_migration'
  ) THEN
    RAISE EXCEPTION
      'policy_criteria.data already owns reserved key _web00_migration';
  END IF;
END;
$$;

INSERT INTO criteria (
  id, payer_id, practice_id, evidence_grade, policy_id, section, ordinal,
  label, requirement, content_sha256, validity, is_mandatory, data,
  document_id, source_page_number, last_confirmed_at, created_at, updated_at
)
SELECT pc.id,
       p.payer_id,
       NULL,
       'published',
       pc.policy_id,
       pc.section,
       pc.ordinal,
       pc.label,
       pc.requirement,
       digest(convert_to(pc.requirement, 'UTF8'), 'sha256'),
       daterange(p.effective_from, p.effective_to, '[)'),
       pc.is_mandatory,
       pc.data || jsonb_build_object(
         '_web00_migration',
         jsonb_build_object(
           'legacy_relation', 'policy_criteria',
           'legacy_ordinal', pc.ordinal
         )
       ),
       NULL,
       NULL,
       COALESCE(pc.updated_at, pc.created_at),
       pc.created_at,
       pc.updated_at
  FROM policy_criteria pc
  JOIN policies p ON p.id = pc.policy_id
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF (SELECT count(*) FROM policy_criteria) <>
     (SELECT count(*)
        FROM criteria
       WHERE data->'_web00_migration'->>'legacy_relation' = 'policy_criteria')
  THEN
    RAISE EXCEPTION 'criteria migration row count mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM policy_criteria pc
      JOIN policies p ON p.id = pc.policy_id
      LEFT JOIN criteria c ON c.id = pc.id
     WHERE c.id IS NULL
        OR c.payer_id IS DISTINCT FROM p.payer_id
        OR c.practice_id IS NOT NULL
        OR c.evidence_grade IS DISTINCT FROM 'published'
        OR c.policy_id IS DISTINCT FROM pc.policy_id
        OR c.section IS DISTINCT FROM pc.section
        OR c.ordinal IS DISTINCT FROM pc.ordinal
        OR c.label IS DISTINCT FROM pc.label
        OR c.requirement IS DISTINCT FROM pc.requirement
        OR c.content_sha256 IS DISTINCT FROM digest(convert_to(pc.requirement, 'UTF8'), 'sha256')
        OR c.validity IS DISTINCT FROM daterange(p.effective_from, p.effective_to, '[)')
        OR c.is_mandatory IS DISTINCT FROM pc.is_mandatory
        OR (c.data - '_web00_migration') IS DISTINCT FROM pc.data
        OR c.data->'_web00_migration'->>'legacy_ordinal' IS DISTINCT FROM pc.ordinal::text
        OR c.document_id IS NOT NULL
        OR c.source_page_number IS NOT NULL
        OR c.last_confirmed_at IS DISTINCT FROM COALESCE(pc.updated_at, pc.created_at)
        OR c.created_at IS DISTINCT FROM pc.created_at
        OR c.updated_at IS DISTINCT FROM pc.updated_at
  ) THEN
    RAISE EXCEPTION 'criteria migration field reconciliation failed';
  END IF;
END;
$$;

ALTER TABLE case_evidence
  DROP CONSTRAINT case_evidence_policy_criterion_id_fkey;
ALTER TABLE case_evidence
  RENAME COLUMN policy_criterion_id TO criterion_id;
ALTER TABLE case_evidence
  ADD CONSTRAINT case_evidence_criterion_id_fkey
  FOREIGN KEY (criterion_id) REFERENCES criteria(id) ON DELETE RESTRICT;

ALTER TABLE policy_criteria RENAME TO policy_criteria_legacy;

CREATE OR REPLACE FUNCTION refuse_policy_criteria_legacy_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'policy_criteria is read-only after the web case-to-letter criteria cutover'
    USING ERRCODE = 'read_only_sql_transaction';
END;
$$;

CREATE TRIGGER policy_criteria_legacy_write_refusal
  BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON policy_criteria_legacy
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_policy_criteria_legacy_write();

CREATE VIEW policy_criteria AS
SELECT c.id,
       c.policy_id,
       c.section,
       c.ordinal,
       c.label,
       c.requirement,
       c.data - '_web00_migration' AS data,
       c.is_mandatory,
       c.created_at,
       c.updated_at
  FROM criteria c
 WHERE c.evidence_grade = 'published'
   AND c.policy_id IS NOT NULL;

CREATE TRIGGER policy_criteria_view_write_refusal
  INSTEAD OF INSERT OR UPDATE OR DELETE ON policy_criteria
  FOR EACH ROW EXECUTE FUNCTION refuse_policy_criteria_legacy_write();

CREATE OR REPLACE FUNCTION verify_web00_criteria_rollback()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT count(*) FROM policy_criteria_legacy) <>
     (SELECT count(*)
        FROM criteria
       WHERE data->'_web00_migration'->>'legacy_relation' = 'policy_criteria')
  THEN
    RAISE EXCEPTION 'rollback refused: canonical/legacy row count mismatch';
  END IF;

  IF EXISTS (
    (SELECT id FROM policy_criteria_legacy
     EXCEPT
     SELECT id FROM criteria
      WHERE data->'_web00_migration'->>'legacy_relation' = 'policy_criteria')
    UNION ALL
    (SELECT id FROM criteria
      WHERE data->'_web00_migration'->>'legacy_relation' = 'policy_criteria'
     EXCEPT
     SELECT id FROM policy_criteria_legacy)
  ) THEN
    RAISE EXCEPTION 'rollback refused: canonical/legacy UUID set mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM criteria c
      JOIN policy_criteria_legacy pc ON pc.id = c.id
     WHERE c.requirement IS DISTINCT FROM pc.requirement
        OR c.content_sha256 IS DISTINCT FROM digest(convert_to(pc.requirement, 'UTF8'), 'sha256')
        OR c.last_confirmed_at IS DISTINCT FROM COALESCE(pc.updated_at, pc.created_at)
  ) THEN
    RAISE EXCEPTION 'rollback refused: canonical/legacy criterion mismatch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM case_evidence ce
    LEFT JOIN policy_criteria_legacy pc ON pc.id = ce.criterion_id
    WHERE pc.id IS NULL
  ) THEN
    RAISE EXCEPTION 'rollback refused: case evidence lacks a legacy criterion';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM criterion_observations o
      JOIN policy_criteria_legacy pc ON pc.id = o.criterion_id
  ) THEN
    RAISE EXCEPTION 'rollback refused: migrated criteria gained observations';
  END IF;
END;
$$;

-- Web-03 administering-entity inputs and durable resolution state. Resolver
-- commands are mounted by the application migration after this shape exists.
ALTER TABLE cases
  ADD CONSTRAINT cases_id_practice_unique UNIQUE (id, practice_id);

CREATE TABLE administering_entities (
  id uuid PRIMARY KEY,
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (key ~ '^[a-z0-9]+(?:[-_][a-z0-9]+)*$'),
  name text NOT NULL CHECK (btrim(name) <> ''),
  active boolean NOT NULL DEFAULT true,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz,
  UNIQUE (practice_id, key),
  UNIQUE (id, practice_id)
);

CREATE TABLE payer_plans (
  id uuid PRIMARY KEY,
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  payer_id uuid NOT NULL REFERENCES payers(id) ON DELETE RESTRICT,
  plan_key text NOT NULL CHECK (plan_key ~ '^[a-z0-9]+(?:[-_][a-z0-9]+)*$'),
  name text NOT NULL CHECK (btrim(name) <> ''),
  valid_from date NOT NULL,
  valid_to date,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz,
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  UNIQUE (practice_id, payer_id, plan_key, valid_from),
  UNIQUE (id, practice_id)
);

CREATE TABLE payer_plan_enrollments (
  id uuid PRIMARY KEY,
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  payer_plan_id uuid NOT NULL,
  member_id text NOT NULL CHECK (btrim(member_id) <> ''),
  source_document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  valid_from date NOT NULL,
  valid_to date,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz,
  CONSTRAINT payer_plan_enrollments_plan_fkey
    FOREIGN KEY (payer_plan_id, practice_id)
    REFERENCES payer_plans(id, practice_id) ON DELETE CASCADE,
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  UNIQUE (practice_id, member_id, payer_plan_id, valid_from),
  UNIQUE (id, practice_id)
);

CREATE TABLE plan_delegation_rules (
  id uuid PRIMARY KEY,
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  payer_plan_id uuid NOT NULL,
  procedure_code text NOT NULL CHECK (btrim(procedure_code) <> ''),
  administering_entity_id uuid NOT NULL,
  criteria_set_key text NOT NULL
    CHECK (criteria_set_key ~ '^[a-z0-9]+(?:[-_][a-z0-9]+)*$'),
  submission_channel_key text NOT NULL
    CHECK (submission_channel_key ~ '^[a-z0-9]+(?:[-_][a-z0-9]+)*$'),
  appeal_path_key text NOT NULL
    CHECK (appeal_path_key ~ '^[a-z0-9]+(?:[-_][a-z0-9]+)*$'),
  source_document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  valid_from date NOT NULL,
  valid_to date,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz,
  CONSTRAINT plan_delegation_rules_plan_fkey
    FOREIGN KEY (payer_plan_id, practice_id)
    REFERENCES payer_plans(id, practice_id) ON DELETE CASCADE,
  CONSTRAINT plan_delegation_rules_entity_fkey
    FOREIGN KEY (administering_entity_id, practice_id)
    REFERENCES administering_entities(id, practice_id) ON DELETE RESTRICT,
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  UNIQUE (
    payer_plan_id, procedure_code, administering_entity_id, criteria_set_key,
    submission_channel_key, appeal_path_key, source_document_id, valid_from
  ),
  UNIQUE (id, practice_id)
);

CREATE TABLE administering_entity_resolution_states (
  key text PRIMARY KEY,
  label text NOT NULL,
  blocks_downstream boolean NOT NULL
);

INSERT INTO administering_entity_resolution_states
  (key, label, blocks_downstream) VALUES
  ('resolved', 'Resolved', false),
  ('missing', 'No matching rule', true),
  ('ambiguous', 'More than one administering entity', true),
  ('conflicting', 'Conflicting paths for one entity', true),
  ('expired', 'Coverage path expired', true);

CREATE TABLE administering_entity_resolutions (
  case_id uuid PRIMARY KEY,
  practice_id uuid NOT NULL,
  entity_id uuid,
  criteria_set_key text,
  submission_channel_key text,
  appeal_path_key text,
  source_document_id uuid REFERENCES documents(id) ON DELETE RESTRICT,
  valid_from date,
  valid_to date,
  state text NOT NULL REFERENCES administering_entity_resolution_states(key),
  revision bigint NOT NULL CHECK (revision > 0),
  case_input_revision bigint NOT NULL CHECK (case_input_revision > 0),
  matched_rule_id uuid,
  resolved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz,
  CONSTRAINT administering_entity_resolutions_case_fkey
    FOREIGN KEY (case_id, practice_id)
    REFERENCES cases(id, practice_id) ON DELETE CASCADE,
  CONSTRAINT administering_entity_resolutions_entity_fkey
    FOREIGN KEY (entity_id, practice_id)
    REFERENCES administering_entities(id, practice_id) ON DELETE RESTRICT,
  CONSTRAINT administering_entity_resolutions_rule_fkey
    FOREIGN KEY (matched_rule_id, practice_id)
    REFERENCES plan_delegation_rules(id, practice_id) ON DELETE RESTRICT,
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from),
  CHECK (
    (state = 'resolved'
      AND entity_id IS NOT NULL
      AND criteria_set_key IS NOT NULL
      AND submission_channel_key IS NOT NULL
      AND appeal_path_key IS NOT NULL
      AND source_document_id IS NOT NULL
      AND valid_from IS NOT NULL
      AND matched_rule_id IS NOT NULL)
    OR
    (state <> 'resolved'
      AND entity_id IS NULL
      AND criteria_set_key IS NULL
      AND submission_channel_key IS NULL
      AND appeal_path_key IS NULL
      AND source_document_id IS NULL
      AND valid_from IS NULL
      AND valid_to IS NULL
      AND matched_rule_id IS NULL)
  )
);

-- The executable migration adds this token to `cases`. It advances when a
-- resolver result is committed and again when controlling case inputs change.
ALTER TABLE cases
  ADD COLUMN resolution_revision bigint NOT NULL DEFAULT 0
    CHECK (resolution_revision >= 0);

CREATE TABLE administering_entity_resolution_commands (
  kratos_identity_id uuid NOT NULL,
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  command_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  committed_at timestamptz NOT NULL,
  PRIMARY KEY (kratos_identity_id, practice_id, command_id)
);

COMMENT ON TABLE administering_entity_resolution_commands IS
  'Lane: server-authoritative relational. Privacy: local. Immutable resolver command receipts; excluded from replication.';

CREATE OR REPLACE FUNCTION assert_resolution_source_practice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  source_practice uuid;
BEGIN
  IF NEW.source_document_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT patient.practice_id INTO source_practice
    FROM aso.documents document
    JOIN aso.patients patient ON patient.id = document.patient_id
   WHERE document.id = NEW.source_document_id;

  IF source_practice IS NULL OR source_practice IS DISTINCT FROM NEW.practice_id THEN
    RAISE EXCEPTION 'resolution source document belongs to another practice'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER plan_delegation_rule_source_practice
  BEFORE INSERT OR UPDATE OF practice_id, source_document_id
  ON plan_delegation_rules
  FOR EACH ROW EXECUTE FUNCTION assert_resolution_source_practice();
CREATE TRIGGER payer_plan_enrollment_source_practice
  BEFORE INSERT OR UPDATE OF practice_id, source_document_id
  ON payer_plan_enrollments
  FOR EACH ROW EXECUTE FUNCTION assert_resolution_source_practice();
CREATE TRIGGER administering_resolution_source_practice
  BEFORE INSERT OR UPDATE OF practice_id, source_document_id
  ON administering_entity_resolutions
  FOR EACH ROW EXECUTE FUNCTION assert_resolution_source_practice();

CREATE INDEX payer_plans_lookup_ix
  ON payer_plans(practice_id, payer_id, plan_key, valid_from, valid_to);
CREATE INDEX payer_plan_enrollments_lookup_ix
  ON payer_plan_enrollments(
    practice_id, member_id, payer_plan_id, valid_from, valid_to
  );
CREATE INDEX plan_delegation_rules_lookup_ix
  ON plan_delegation_rules(
    practice_id, payer_plan_id, procedure_code, valid_from, valid_to
  );
CREATE INDEX administering_entity_resolutions_practice_ix
  ON administering_entity_resolutions(practice_id, state);

CREATE OR REPLACE FUNCTION bump_resolver_input_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER administering_entities_touch BEFORE UPDATE ON administering_entities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER administering_entities_revision BEFORE UPDATE ON administering_entities
  FOR EACH ROW EXECUTE FUNCTION bump_resolver_input_revision();
CREATE TRIGGER payer_plans_touch BEFORE UPDATE ON payer_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER payer_plans_revision BEFORE UPDATE ON payer_plans
  FOR EACH ROW EXECUTE FUNCTION bump_resolver_input_revision();
CREATE TRIGGER payer_plan_enrollments_touch BEFORE UPDATE ON payer_plan_enrollments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER payer_plan_enrollments_revision BEFORE UPDATE ON payer_plan_enrollments
  FOR EACH ROW EXECUTE FUNCTION bump_resolver_input_revision();
CREATE TRIGGER plan_delegation_rules_touch BEFORE UPDATE ON plan_delegation_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER plan_delegation_rules_revision BEFORE UPDATE ON plan_delegation_rules
  FOR EACH ROW EXECUTE FUNCTION bump_resolver_input_revision();
CREATE TRIGGER administering_entity_resolutions_touch
  BEFORE UPDATE ON administering_entity_resolutions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE administering_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE payer_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE payer_plan_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_delegation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE administering_entity_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE administering_entity_resolution_commands ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON administering_entities FROM PUBLIC;
REVOKE ALL ON payer_plans FROM PUBLIC;
REVOKE ALL ON payer_plan_enrollments FROM PUBLIC;
REVOKE ALL ON plan_delegation_rules FROM PUBLIC;
REVOKE ALL ON administering_entity_resolution_states FROM PUBLIC;
REVOKE ALL ON administering_entity_resolutions FROM PUBLIC;
REVOKE ALL ON administering_entity_resolution_commands FROM PUBLIC;
REVOKE ALL ON FUNCTION assert_resolution_source_practice() FROM PUBLIC;
REVOKE ALL ON FUNCTION bump_resolver_input_revision() FROM PUBLIC;

-- Web-04: durable document upload boundary. Upload bytes remain in the
-- server-owned DocumentStore. These tables retain only bounded metadata,
-- server-generated storage identity, and immutable command receipts.
ALTER TABLE cases
  ADD COLUMN document_set_revision bigint NOT NULL DEFAULT 0
    CHECK (document_set_revision >= 0);

CREATE TABLE document_processing_statuses (
  key text PRIMARY KEY,
  label text NOT NULL,
  terminal boolean NOT NULL
);

INSERT INTO document_processing_statuses (key, label, terminal) VALUES
  ('queued', 'Queued', false),
  ('processing', 'Processing', false),
  ('ready', 'Ready', true),
  ('failed', 'Failed', true);

ALTER TABLE documents
  ADD COLUMN media_type text
    CHECK (media_type IS NULL OR media_type IN ('application/pdf', 'text/plain')),
  ADD COLUMN byte_size bigint
    CHECK (byte_size IS NULL OR byte_size BETWEEN 1 AND 16777216),
  ADD COLUMN processing_status text NOT NULL DEFAULT 'failed'
    REFERENCES document_processing_statuses(key) ON DELETE RESTRICT,
  ADD COLUMN processing_error_code text,
  ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD CONSTRAINT documents_processing_error_check
    CHECK ((processing_status = 'failed') OR processing_error_code IS NULL),
  ADD CONSTRAINT documents_uploaded_source_check
    CHECK (ingest_method <> 'manual_upload' OR processing_status = 'failed' OR (
      storage_uri IS NOT NULL AND btrim(storage_uri) <> ''
      AND content_sha256 IS NOT NULL AND octet_length(content_sha256) = 32
      AND media_type IN ('application/pdf', 'text/plain')
      AND byte_size BETWEEN 1 AND 16777216));

CREATE TABLE document_upload_staging (
  kratos_identity_id uuid NOT NULL,
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  command_id uuid NOT NULL,
  staging_id uuid NOT NULL UNIQUE,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL UNIQUE,
  document_type_id uuid NOT NULL REFERENCES document_types(id) ON DELETE RESTRICT,
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
  PRIMARY KEY (kratos_identity_id, practice_id, command_id),
  CHECK (expires_at > reserved_at)
);

COMMENT ON TABLE document_upload_staging IS
  'Lane: server-authoritative relational. Privacy: local. Pending storage identities; excluded from replication.';

CREATE TABLE document_upload_commands (
  kratos_identity_id uuid NOT NULL,
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  command_id uuid NOT NULL,
  staging_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  committed_at timestamptz NOT NULL,
  PRIMARY KEY (kratos_identity_id, practice_id, command_id)
);

COMMENT ON TABLE document_upload_commands IS
  'Lane: server-authoritative relational. Privacy: local. Immutable upload receipts; excluded from replication.';

ALTER TABLE document_upload_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_upload_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON document_processing_statuses FROM PUBLIC;
REVOKE ALL ON document_upload_staging FROM PUBLIC;
REVOKE ALL ON document_upload_commands FROM PUBLIC;

-- The executable migration owns these SECURITY DEFINER functions with the
-- non-login aso_case_owner role and grants only their bounded entry points to
-- aso_case_executor:
--   reserve_document_upload_staging(uuid,uuid,uuid,bigint,bigint,text,text,
--     date,text,bigint,bytea,jsonb)
--   commit_document_upload_command(uuid,uuid)
--   abandon_document_upload_staging(uuid,uuid)
--   read_case_document_metadata(uuid,uuid)
--   lookup_document_upload_command(uuid,uuid)
-- Direct executor writes to documents, staging, and command receipts remain
-- revoked. document_process is an internal processor capability and is not
-- assigned to any human role.

COMMIT;
