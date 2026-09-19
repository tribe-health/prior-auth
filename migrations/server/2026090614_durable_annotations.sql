-- RA-15. Attributed clinical annotations with immutable revision and command ledgers.
-- Annotation rows are an authorized projection. Revision, command and audit rows
-- are server-authoritative local records and are excluded from replication.

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_publication WHERE puballtables)
     OR EXISTS (
       SELECT FROM pg_catalog.pg_publication_namespace pn
       JOIN pg_catalog.pg_namespace n ON n.oid = pn.pnnspid
       WHERE n.nspname = 'aso'
     ) THEN
    RAISE EXCEPTION 'local annotation command data requires explicit-table publications';
  END IF;
END;
$$;

ALTER TABLE aso.annotations
  ADD COLUMN practice_id uuid REFERENCES aso.practices(id) ON DELETE RESTRICT,
  ADD COLUMN author_label text,
  ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0);

UPDATE aso.annotations annotation
SET practice_id = clinical_case.practice_id,
    author_label = actor.full_name
FROM aso.cases clinical_case, aso.users actor
WHERE clinical_case.id = annotation.case_id
  AND actor.id = annotation.author_id;

ALTER TABLE aso.annotations
  ALTER COLUMN practice_id SET NOT NULL,
  ALTER COLUMN author_label SET NOT NULL;

CREATE INDEX annotations_practice_case_ix ON aso.annotations(practice_id, case_id);
COMMENT ON TABLE aso.annotations IS
  'Lane: server-authoritative relational. Privacy: local. Authorized annotation projection; client persistence remains subject to G-DATA.';

CREATE TABLE aso.annotation_revisions (
  annotation_id uuid NOT NULL REFERENCES aso.annotations(id) ON DELETE RESTRICT,
  revision bigint NOT NULL CHECK (revision > 0),
  practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES aso.cases(id) ON DELETE RESTRICT,
  annotation_type_id uuid NOT NULL REFERENCES aso.annotation_types(id) ON DELETE RESTRICT,
  name text NOT NULL,
  data jsonb,
  body text NOT NULL,
  author_id uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  author_label text NOT NULL,
  provenance text NOT NULL CHECK (provenance = 'surgeon'),
  is_included boolean NOT NULL,
  target_evidence_id uuid REFERENCES aso.case_evidence(id) ON DELETE RESTRICT,
  target_document_id uuid REFERENCES aso.documents(id) ON DELETE RESTRICT,
  command_id uuid NOT NULL,
  committed_at timestamptz NOT NULL,
  PRIMARY KEY (annotation_id, revision),
  UNIQUE (practice_id, command_id),
  CHECK (num_nonnulls(target_evidence_id, target_document_id) <= 1)
);
COMMENT ON TABLE aso.annotation_revisions IS
  'Lane: append-only log. Privacy: local. Immutable annotation history; excluded from replication.';
ALTER TABLE aso.annotation_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.annotation_revisions FROM PUBLIC;

CREATE TABLE aso.annotation_commands (
  kratos_identity_id uuid NOT NULL,
  practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  command_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  annotation_id uuid NOT NULL REFERENCES aso.annotations(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES aso.cases(id) ON DELETE RESTRICT,
  annotation_type_id uuid NOT NULL REFERENCES aso.annotation_types(id) ON DELETE RESTRICT,
  name text NOT NULL,
  data jsonb,
  body text NOT NULL,
  target_evidence_id uuid REFERENCES aso.case_evidence(id) ON DELETE RESTRICT,
  target_document_id uuid REFERENCES aso.documents(id) ON DELETE RESTRICT,
  disposition text NOT NULL CHECK (disposition IN ('included', 'held')),
  expected_revision bigint NOT NULL CHECK (expected_revision >= 0),
  result jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  PRIMARY KEY (kratos_identity_id, practice_id, command_id),
  CHECK (num_nonnulls(target_evidence_id, target_document_id) <= 1)
);
COMMENT ON TABLE aso.annotation_commands IS
  'Lane: server-authoritative relational. Privacy: local. Immutable annotation command results; excluded from replication.';
ALTER TABLE aso.annotation_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.annotation_commands FROM PUBLIC;

GRANT SELECT ON aso.annotations, aso.annotation_types, aso.annotation_revisions,
  aso.annotation_commands, aso.documents, aso.case_evidence TO aso_gate_owner;
GRANT EXECUTE ON FUNCTION aso.validate_typed_payload(),
  aso.jsonschema_basic_check(jsonb,jsonb) TO aso_gate_owner;
GRANT INSERT (id, annotation_type_id, case_id, name, data, body, author_id,
  provenance, is_included, included_at, target_evidence_id, target_document_id,
  created_at, updated_at, practice_id, author_label, revision),
  UPDATE (annotation_type_id, name, data, body, author_id, is_included,
  included_at, target_evidence_id, target_document_id, updated_at, author_label,
  revision) ON aso.annotations TO aso_gate_owner;
GRANT INSERT ON aso.annotation_revisions, aso.annotation_commands TO aso_gate_owner;

CREATE POLICY annotations_gate_owner ON aso.annotations TO aso_gate_owner
  USING (true) WITH CHECK (true);
CREATE POLICY annotation_revisions_owner ON aso.annotation_revisions TO aso_gate_owner
  USING (true) WITH CHECK (true);
CREATE POLICY annotation_commands_owner ON aso.annotation_commands TO aso_gate_owner
  USING (true) WITH CHECK (true);

CREATE FUNCTION aso.annotation_history_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'annotation history is immutable' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER annotation_revisions_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON aso.annotation_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION aso.annotation_history_immutable();
CREATE TRIGGER annotation_commands_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON aso.annotation_commands
  FOR EACH STATEMENT EXECUTE FUNCTION aso.annotation_history_immutable();

CREATE FUNCTION aso.require_annotation_case(target_case uuid, clinical boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  case_practice uuid;
BEGIN
  SELECT * INTO STRICT actor FROM aso.gate_actor_context();
  SELECT clinical_case.practice_id INTO case_practice
  FROM aso.cases clinical_case WHERE clinical_case.id = target_case;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'annotation case not found' USING ERRCODE = 'P0002';
  END IF;
  IF case_practice <> actor.practice_id OR (clinical AND NOT EXISTS (
    SELECT FROM aso.user_capabilities capability
    WHERE capability.user_id = actor.actor_id
      AND capability.practice_id = actor.practice_id
      AND capability.capability_key = 'annotate'
      AND capability.is_clinical
  )) THEN
    RAISE EXCEPTION 'annotation authority denied' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION aso.may_annotate(target_case uuid, target_annotation uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  PERFORM aso.require_annotation_case(target_case, true);
  IF EXISTS (SELECT FROM aso.annotations annotation WHERE annotation.id = target_annotation)
     AND NOT EXISTS (
       SELECT FROM aso.annotations annotation
       WHERE annotation.id = target_annotation AND annotation.case_id = target_case
     ) THEN
    RETURN false;
  END IF;
  RETURN true;
EXCEPTION WHEN insufficient_privilege OR no_data_found THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION aso.enforce_annotation_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  case_practice uuid;
BEGIN
  SELECT * INTO STRICT actor FROM aso.gate_actor_context();
  PERFORM aso.require_annotation_case(NEW.case_id, true);
  SELECT clinical_case.practice_id INTO STRICT case_practice
  FROM aso.cases clinical_case WHERE clinical_case.id = NEW.case_id;
  IF NEW.author_id IS DISTINCT FROM actor.actor_id
     OR NEW.author_label IS DISTINCT FROM actor.actor_label
     OR NEW.practice_id IS DISTINCT FROM case_practice
     OR NEW.provenance IS DISTINCT FROM 'surgeon'
     OR (TG_OP = 'UPDATE' AND (
       NEW.id IS DISTINCT FROM OLD.id
       OR NEW.case_id IS DISTINCT FROM OLD.case_id
       OR NEW.revision IS DISTINCT FROM OLD.revision + 1
       OR NEW.updated_at IS NULL
       OR NEW.updated_at <= COALESCE(OLD.updated_at, OLD.created_at)
     )) THEN
    RAISE EXCEPTION 'invalid annotation attribution or revision' USING ERRCODE = 'A0310';
  END IF;
  IF NEW.target_evidence_id IS NOT NULL AND NOT EXISTS (
    SELECT FROM aso.case_evidence evidence
    WHERE evidence.id = NEW.target_evidence_id AND evidence.case_id = NEW.case_id
  ) THEN
    RAISE EXCEPTION 'annotation evidence target not found' USING ERRCODE = 'P0002';
  END IF;
  IF NEW.target_document_id IS NOT NULL AND NOT EXISTS (
    SELECT FROM aso.documents document
    WHERE document.id = NEW.target_document_id AND document.case_id = NEW.case_id
  ) THEN
    RAISE EXCEPTION 'annotation document target not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER annotations_authority ON aso.annotations;
CREATE TRIGGER annotations_authority
  BEFORE INSERT OR UPDATE ON aso.annotations
  FOR EACH ROW EXECUTE FUNCTION aso.enforce_annotation_authority();

CREATE FUNCTION aso.lookup_annotation_command(target_command uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  original jsonb;
BEGIN
  SELECT * INTO STRICT actor FROM aso.gate_actor_context();
  SELECT command.result INTO original
  FROM aso.annotation_commands command
  WHERE command.kratos_identity_id = actor.identity_id
    AND command.practice_id = actor.practice_id
    AND command.command_id = target_command;
  RETURN original;
END;
$$;

CREATE FUNCTION aso.apply_annotation_command(
  target_command uuid,
  target_annotation uuid,
  target_case uuid,
  target_annotation_type uuid,
  target_name text,
  target_data jsonb,
  target_body text,
  target_evidence uuid,
  target_document uuid,
  target_disposition text,
  target_expected_revision bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  original aso.annotation_commands%ROWTYPE;
  current_annotation aso.annotations%ROWTYPE;
  committed_at timestamptz;
  next_revision bigint;
  result jsonb;
BEGIN
  SELECT * INTO STRICT actor FROM aso.gate_actor_context();
  IF target_command IS NULL OR target_annotation IS NULL OR target_case IS NULL
     OR target_annotation_type IS NULL OR btrim(COALESCE(target_name, '')) = ''
     OR btrim(COALESCE(target_body, '')) = ''
     OR num_nonnulls(target_evidence, target_document) > 1
     OR target_disposition NOT IN ('included', 'held')
     OR target_expected_revision < 0 THEN
    RAISE EXCEPTION 'invalid annotation payload' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    actor.identity_id::text || ':' || actor.practice_id::text || ':' || target_command::text, 0));
  SELECT * INTO original FROM aso.annotation_commands command
  WHERE command.kratos_identity_id = actor.identity_id
    AND command.practice_id = actor.practice_id
    AND command.command_id = target_command;
  IF FOUND THEN
    PERFORM aso.require_annotation_case(original.case_id, true);
    IF original.actor_id IS DISTINCT FROM actor.actor_id
       OR original.annotation_id IS DISTINCT FROM target_annotation
       OR original.case_id IS DISTINCT FROM target_case
       OR original.annotation_type_id IS DISTINCT FROM target_annotation_type
       OR original.name IS DISTINCT FROM target_name
       OR original.data IS DISTINCT FROM target_data
       OR original.body IS DISTINCT FROM target_body
       OR original.target_evidence_id IS DISTINCT FROM target_evidence
       OR original.target_document_id IS DISTINCT FROM target_document
       OR original.disposition IS DISTINCT FROM target_disposition
       OR original.expected_revision IS DISTINCT FROM target_expected_revision THEN
      RAISE EXCEPTION 'annotation command ID has a different payload' USING ERRCODE = '23505';
    END IF;
    RETURN original.result;
  END IF;

  PERFORM aso.require_annotation_case(target_case, true);
  PERFORM annotation_type.id FROM aso.annotation_types annotation_type
  WHERE annotation_type.id = target_annotation_type;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'annotation type not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM clinical_case.id FROM aso.cases clinical_case
  WHERE clinical_case.id = target_case FOR UPDATE;
  SELECT * INTO current_annotation FROM aso.annotations annotation
  WHERE annotation.id = target_annotation FOR UPDATE;

  committed_at := clock_timestamp();
  IF target_expected_revision = 0 THEN
    IF FOUND THEN
      RAISE EXCEPTION 'annotation already exists' USING ERRCODE = 'A0310';
    END IF;
    next_revision := 1;
    INSERT INTO aso.annotations (
      id, annotation_type_id, case_id, name, data, body, author_id,
      provenance, is_included, included_at, target_evidence_id,
      target_document_id, created_at, updated_at, practice_id, author_label, revision)
    VALUES (
      target_annotation, target_annotation_type, target_case, target_name,
      target_data, target_body, actor.actor_id, 'surgeon',
      target_disposition = 'included',
      CASE WHEN target_disposition = 'included' THEN committed_at ELSE NULL END,
      target_evidence, target_document, committed_at, committed_at,
      actor.practice_id, actor.actor_label, next_revision);
  ELSE
    IF NOT FOUND THEN
      RAISE EXCEPTION 'annotation not found' USING ERRCODE = 'P0002';
    END IF;
    IF current_annotation.case_id IS DISTINCT FROM target_case
       OR current_annotation.practice_id IS DISTINCT FROM actor.practice_id THEN
      RAISE EXCEPTION 'annotation authority denied' USING ERRCODE = '42501';
    END IF;
    IF current_annotation.revision IS DISTINCT FROM target_expected_revision THEN
      RAISE EXCEPTION 'annotation changed after review' USING ERRCODE = 'A0310';
    END IF;
    next_revision := current_annotation.revision + 1;
    UPDATE aso.annotations
    SET annotation_type_id = target_annotation_type,
        name = target_name,
        data = target_data,
        body = target_body,
        author_id = actor.actor_id,
        author_label = actor.actor_label,
        is_included = target_disposition = 'included',
        included_at = CASE WHEN target_disposition = 'included' THEN committed_at ELSE NULL END,
        target_evidence_id = target_evidence,
        target_document_id = target_document,
        updated_at = committed_at,
        revision = next_revision
    WHERE id = target_annotation;
  END IF;

  result := jsonb_build_object(
    'commandId', target_command,
    'annotationId', target_annotation,
    'caseId', target_case,
    'annotationTypeId', target_annotation_type,
    'name', target_name,
    'data', target_data,
    'body', target_body,
    'authorId', actor.actor_id,
    'authorLabel', actor.actor_label,
    'provenance', 'surgeon',
    'targetEvidenceId', target_evidence,
    'targetDocumentId', target_document,
    'disposition', target_disposition,
    'expectedRevision', target_expected_revision,
    'revision', next_revision,
    'committedAt', committed_at);

  INSERT INTO aso.annotation_revisions (
    annotation_id, revision, practice_id, case_id, annotation_type_id,
    name, data, body, author_id, author_label, provenance, is_included,
    target_evidence_id, target_document_id, command_id, committed_at)
  VALUES (
    target_annotation, next_revision, actor.practice_id, target_case,
    target_annotation_type, target_name, target_data, target_body,
    actor.actor_id, actor.actor_label, 'surgeon', target_disposition = 'included',
    target_evidence, target_document, target_command, committed_at);
  INSERT INTO aso.audit_events (
    practice_id, occurred_at, actor_id, actor_kratos_id, actor_label, actor_role,
    action, outcome, entity_table, entity_id, case_id, summary, data)
  VALUES (
    actor.practice_id, committed_at, actor.actor_id, actor.identity_id,
    actor.actor_label, 'clinical:annotate', 'annotation.save', 'success',
    'annotations', target_annotation, target_case, 'Clinical annotation saved',
    jsonb_build_object('commandId', target_command, 'revision', next_revision,
      'disposition', target_disposition, 'targetEvidenceId', target_evidence,
      'targetDocumentId', target_document));
  INSERT INTO aso.annotation_commands (
    kratos_identity_id, practice_id, command_id, actor_id, annotation_id,
    case_id, annotation_type_id, name, data, body, target_evidence_id,
    target_document_id, disposition, expected_revision, result, committed_at)
  VALUES (
    actor.identity_id, actor.practice_id, target_command, actor.actor_id,
    target_annotation, target_case, target_annotation_type, target_name,
    target_data, target_body, target_evidence, target_document,
    target_disposition, target_expected_revision, result, committed_at);
  RETURN result;
END;
$$;

GRANT CREATE ON SCHEMA aso TO aso_gate_owner;
DO $$
DECLARE
  signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'aso.annotation_history_immutable()',
    'aso.require_annotation_case(uuid,boolean)',
    'aso.may_annotate(uuid,uuid)',
    'aso.enforce_annotation_authority()',
    'aso.lookup_annotation_command(uuid)',
    'aso.apply_annotation_command(uuid,uuid,uuid,uuid,text,jsonb,text,uuid,uuid,text,bigint)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', signature);
    EXECUTE format('ALTER FUNCTION %s OWNER TO aso_gate_owner', signature);
  END LOOP;
END;
$$;
REVOKE CREATE ON SCHEMA aso FROM aso_gate_owner;
GRANT EXECUTE ON FUNCTION
  aso.may_annotate(uuid,uuid),
  aso.lookup_annotation_command(uuid),
  aso.apply_annotation_command(uuid,uuid,uuid,uuid,text,jsonb,text,uuid,uuid,text,bigint)
  TO aso_gate_executor;
