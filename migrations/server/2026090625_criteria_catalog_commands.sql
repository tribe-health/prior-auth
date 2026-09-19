-- web-06. Verified criteria catalog import and read boundary.
-- Imports reuse processed policy documents and pages. Command ledgers, raw
-- page text, and audit payloads remain local and are never published.

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_publication WHERE puballtables)
     OR EXISTS (
       SELECT FROM pg_catalog.pg_publication_namespace pn
       JOIN pg_catalog.pg_namespace n ON n.oid = pn.pnnspid
       WHERE n.nspname = 'aso'
     ) THEN
    RAISE EXCEPTION
      'criteria catalog commands require explicit-table publications';
  END IF;
END;
$$;

ALTER TABLE aso.policies
  ADD COLUMN source_document_id uuid
    REFERENCES aso.documents(id) ON DELETE RESTRICT;

COMMENT ON COLUMN aso.policies.source_document_id IS
  'Exact processed policy document that supplied this immutable policy version.';

ALTER TABLE aso.criteria
  DROP CONSTRAINT criteria_superseded_by_fkey,
  ADD CONSTRAINT criteria_superseded_by_fkey
    FOREIGN KEY (superseded_by) REFERENCES aso.criteria(id)
    ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE aso.criteria_catalog
  DROP CONSTRAINT criteria_catalog_superseded_by_fkey,
  ADD CONSTRAINT criteria_catalog_superseded_by_fkey
    FOREIGN KEY (superseded_by) REFERENCES aso.criteria(id)
    ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;

CREATE TABLE aso.criteria_catalog_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  revision_token text NOT NULL
    CHECK (revision_token ~ '^.+:criteriaCatalogRevision:r[0-9]+$'),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO aso.criteria_catalog_state(singleton, revision, revision_token)
VALUES (true, 0, 'catalog:criteriaCatalogRevision:r0');

COMMENT ON TABLE aso.criteria_catalog_state IS
  'Lane: server-authoritative relational. Privacy: local. Serialized catalog revision; excluded from replication.';

CREATE TABLE aso.criteria_catalog_commands (
  kratos_identity_id uuid NOT NULL,
  practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  command_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  policy_id uuid NOT NULL REFERENCES aso.policies(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  committed_at timestamptz NOT NULL,
  PRIMARY KEY (kratos_identity_id, practice_id, command_id)
);

COMMENT ON TABLE aso.criteria_catalog_commands IS
  'Lane: server-authoritative relational. Privacy: local. Immutable catalog command receipts; excluded from replication.';

ALTER TABLE aso.criteria_catalog_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE aso.criteria_catalog_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.criteria_catalog_state, aso.criteria_catalog_commands
  FROM PUBLIC;

CREATE OR REPLACE FUNCTION aso.criteria_actor_context(require_write boolean)
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
      RAISE EXCEPTION 'invalid criteria session context'
        USING ERRCODE = '42501';
  END;

  IF current_setting('aso.principal', true) IS DISTINCT FROM 'user'
     OR context_actor IS NULL OR context_identity IS NULL
     OR context_practice IS NULL OR context_expiry IS NULL
     OR NOT isfinite(context_expiry) OR context_expiry <= clock_timestamp() THEN
    RAISE EXCEPTION 'active human session required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT user_record.id, user_record.kratos_identity_id, context_practice,
           user_record.full_name
      FROM aso.users user_record
     WHERE user_record.id = context_actor
       AND user_record.kratos_identity_id = context_identity
       AND user_record.status = 'active'
       AND EXISTS (
         SELECT FROM aso.user_roles membership
          WHERE membership.user_id = user_record.id
            AND membership.practice_id = context_practice)
       AND EXISTS (
         SELECT FROM aso.user_capabilities capability
          WHERE capability.user_id = user_record.id
            AND capability.practice_id = context_practice
            AND NOT capability.is_clinical
            AND (
              (require_write AND capability.capability_key = 'configure')
              OR (NOT require_write AND capability.capability_key IN (
                'configure', 'case:read', 'criteria_select'))));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'criteria membership or capability denied'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION aso.criteria_catalog_record_json(
  criterion aso.criteria_catalog)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, aso, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', criterion.id,
    'payerId', criterion.payer_id,
    'practiceId', criterion.practice_id,
    'evidenceGrade', criterion.evidence_grade,
    'policyId', criterion.policy_id,
    'section', criterion.section,
    'ordinal', criterion.ordinal,
    'documentId', criterion.document_id,
    'sourcePageNumber', criterion.source_page_number,
    'label', criterion.label,
    'requirement', criterion.requirement,
    'contentSha256', criterion.content_sha256_text,
    'procedureFamily', criterion.procedure_family,
    'isMandatory', criterion.is_mandatory,
    'validFrom', lower(criterion.validity),
    'validTo', upper(criterion.validity),
    'supersededBy', criterion.superseded_by)
$$;

CREATE OR REPLACE FUNCTION aso.import_criteria_catalog(
  target_command uuid,
  expected_catalog_revision text,
  target_policy jsonb,
  target_criteria jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  original aso.criteria_catalog_commands%ROWTYPE;
  catalog_state aso.criteria_catalog_state%ROWTYPE;
  token_match text[];
  expected_revision bigint;
  next_revision bigint;
  next_token text;
  payload jsonb;
  result jsonb;
  committed_at timestamptz;
  policy_id uuid;
  payer_id uuid;
  policy_type_key text;
  policy_type_id uuid;
  policy_name text;
  policy_number text;
  policy_version text;
  policy_effective_from date;
  policy_effective_to date;
  source_document_id uuid;
  source_document record;
  import_grade text;
  criterion jsonb;
  criterion_id uuid;
  criterion_ids uuid[] := ARRAY[]::uuid[];
  criterion_grade text;
  criterion_label text;
  criterion_requirement text;
  criterion_document_id uuid;
  criterion_page integer;
  criterion_valid_from date;
  criterion_valid_to date;
  criterion_payer_id uuid;
  criterion_policy_id uuid;
  criterion_section text;
  criterion_hash bytea;
  criterion_last_confirmed timestamptz;
  criterion_supersedes uuid;
  old_criterion aso.criteria%ROWTYPE;
BEGIN
  SELECT * INTO STRICT actor FROM aso.criteria_actor_context(true);
  IF target_command IS NULL
     OR expected_catalog_revision IS NULL
     OR jsonb_typeof(target_policy) IS DISTINCT FROM 'object'
     OR jsonb_typeof(target_criteria) IS DISTINCT FROM 'array'
     OR jsonb_array_length(target_criteria) = 0 THEN
    RAISE EXCEPTION 'invalid criteria catalog import'
      USING ERRCODE = '22023';
  END IF;

  token_match := regexp_match(
    expected_catalog_revision,
    '^(.+:criteriaCatalogRevision:r)([0-9]+)$');
  IF token_match IS NULL THEN
    RAISE EXCEPTION 'invalid criteria catalog revision token'
      USING ERRCODE = '22023';
  END IF;
  expected_revision := token_match[2]::bigint;

  payload := jsonb_build_object(
    'expectedRevisions', jsonb_build_object(
      'criteriaCatalogRevision', expected_catalog_revision),
    'policy', target_policy,
    'criteria', target_criteria);

  SELECT * INTO original
    FROM aso.criteria_catalog_commands command
   WHERE command.kratos_identity_id = actor.identity_id
     AND command.practice_id = actor.practice_id
     AND command.command_id = target_command;
  IF FOUND THEN
    IF original.actor_id IS DISTINCT FROM actor.actor_id
       OR original.payload IS DISTINCT FROM payload THEN
      RAISE EXCEPTION 'criteria command ID has a different payload'
        USING ERRCODE = '23505';
    END IF;
    RETURN original.result;
  END IF;

  SELECT * INTO STRICT catalog_state
    FROM aso.criteria_catalog_state WHERE singleton FOR UPDATE;
  IF expected_revision IS DISTINCT FROM catalog_state.revision
     OR (catalog_state.revision > 0
         AND expected_catalog_revision IS DISTINCT FROM catalog_state.revision_token)
  THEN
    RAISE EXCEPTION 'criteria catalog revision changed'
      USING ERRCODE = '40001';
  END IF;

  BEGIN
    policy_id := (target_policy->>'id')::uuid;
    payer_id := (target_policy->>'payer_id')::uuid;
    policy_type_key := target_policy->>'policy_type_key';
    policy_name := target_policy->>'name';
    policy_number := target_policy->>'policy_number';
    policy_version := target_policy->>'version';
    policy_effective_from := (target_policy->>'effective_from')::date;
    policy_effective_to := NULLIF(target_policy->>'effective_to', '')::date;
    source_document_id := (target_policy->>'document_id')::uuid;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    RAISE EXCEPTION 'invalid criteria policy identity or date'
      USING ERRCODE = '22023';
  END;

  IF policy_id IS NULL OR payer_id IS NULL OR source_document_id IS NULL
     OR NULLIF(btrim(policy_type_key), '') IS NULL
     OR NULLIF(btrim(policy_name), '') IS NULL
     OR NULLIF(btrim(policy_number), '') IS NULL
     OR NULLIF(btrim(policy_version), '') IS NULL
     OR policy_effective_from IS NULL
     OR (policy_effective_to IS NOT NULL
         AND policy_effective_to <= policy_effective_from) THEN
    RAISE EXCEPTION 'invalid criteria policy'
      USING ERRCODE = '22023';
  END IF;

  SELECT type_record.id INTO policy_type_id
    FROM aso.policy_types type_record WHERE type_record.key = policy_type_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'policy type not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT document.id, document.content_sha256, document.effective_date,
         document.page_count, document.processing_status,
         document.committed_at,
         type_record.key AS document_type_key,
         COALESCE(target_case.practice_id, patient.practice_id) AS practice_id
    INTO source_document
    FROM aso.documents document
    JOIN aso.document_types type_record ON type_record.id = document.document_type_id
    JOIN aso.patients patient ON patient.id = document.patient_id
    LEFT JOIN aso.cases target_case ON target_case.id = document.case_id
   WHERE document.id = source_document_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'policy source document not found' USING ERRCODE = 'P0002';
  END IF;
  IF source_document.practice_id IS DISTINCT FROM actor.practice_id THEN
    RAISE EXCEPTION 'policy source document tenant denied'
      USING ERRCODE = '42501';
  END IF;
  IF source_document.document_type_key IS DISTINCT FROM 'policy-document'
     OR source_document.processing_status IS DISTINCT FROM 'ready'
     OR source_document.content_sha256 IS NULL
     OR octet_length(source_document.content_sha256) <> 32
     OR source_document.page_count IS NULL
     OR source_document.page_count <= 0 THEN
    RAISE EXCEPTION 'policy source document is not provenance-complete'
      USING ERRCODE = '23514';
  END IF;

  SELECT item->>'evidence_grade' INTO import_grade
    FROM jsonb_array_elements(target_criteria) item LIMIT 1;
  IF import_grade NOT IN ('published', 'obtained_by_request')
     OR EXISTS (
       SELECT FROM jsonb_array_elements(target_criteria) item
        WHERE item->>'evidence_grade' IS DISTINCT FROM import_grade) THEN
    RAISE EXCEPTION 'catalog import grade is invalid or mixed'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO aso.policies (
    id, policy_type_id, payer_id, name, policy_number, version,
    effective_from, effective_to, source_sha256, retrieved_at, is_published,
    source_document_id)
  VALUES (
    policy_id, policy_type_id, payer_id, btrim(policy_name),
    btrim(policy_number), btrim(policy_version), policy_effective_from,
    policy_effective_to, source_document.content_sha256,
    source_document.committed_at, import_grade = 'published',
    source_document_id);

  SET CONSTRAINTS criteria_superseded_by_fkey,
    criteria_catalog_superseded_by_fkey DEFERRED;
  FOR criterion IN SELECT value FROM jsonb_array_elements(target_criteria)
  LOOP
    BEGIN
      criterion_id := (criterion->>'id')::uuid;
      criterion_grade := criterion->>'evidence_grade';
      criterion_label := criterion->>'label';
      criterion_requirement := criterion->>'requirement';
      criterion_document_id := (criterion->>'document_id')::uuid;
      criterion_page := (criterion->>'source_page_number')::integer;
      criterion_valid_from := (criterion->>'valid_from')::date;
      criterion_valid_to := NULLIF(criterion->>'valid_to', '')::date;
      criterion_payer_id := (criterion->>'payer_id')::uuid;
      criterion_policy_id := (criterion->>'policy_id')::uuid;
      criterion_section := criterion->>'section';
      criterion_hash := decode(criterion->>'content_sha256', 'hex');
      criterion_last_confirmed :=
        (criterion->>'last_confirmed_at')::timestamptz;
      criterion_supersedes :=
        NULLIF(criterion->>'supersedes_criterion_id', '')::uuid;
    EXCEPTION
      WHEN invalid_text_representation OR invalid_datetime_format
        OR datetime_field_overflow OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'invalid criterion identity, hash, page, or date'
          USING ERRCODE = '22023';
    END;

    IF criterion_id IS NULL OR criterion_payer_id IS DISTINCT FROM payer_id
       OR criterion_policy_id IS DISTINCT FROM policy_id
       OR criterion_document_id IS DISTINCT FROM source_document_id
       OR criterion_grade IS DISTINCT FROM import_grade
       OR NULLIF(btrim(criterion_label), '') IS NULL
       OR NULLIF(btrim(criterion_requirement), '') IS NULL
       OR NULLIF(btrim(criterion_section), '') IS NULL
       OR (criterion->>'ordinal')::integer <= 0
       OR criterion_page <= 0
       OR criterion_page > source_document.page_count
       OR criterion_valid_from < policy_effective_from
       OR (criterion_valid_to IS NOT NULL
           AND criterion_valid_to <= criterion_valid_from)
       OR (policy_effective_to IS NOT NULL
           AND (criterion_valid_to IS NULL
                OR criterion_valid_to > policy_effective_to))
       OR octet_length(criterion_hash) <> 32
       OR criterion_hash IS DISTINCT FROM
          public.digest(convert_to(criterion_requirement, 'UTF8'), 'sha256')
       OR criterion_last_confirmed IS NULL THEN
      RAISE EXCEPTION 'criterion provenance is invalid'
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT FROM aso.document_pages page
       WHERE page.document_id = source_document_id
         AND page.page_number = criterion_page
         AND position(criterion_requirement IN page.text) > 0) THEN
      RAISE EXCEPTION 'criterion text is absent from its source page'
        USING ERRCODE = '23514';
    END IF;

    IF criterion_supersedes IS NOT NULL THEN
      SELECT * INTO old_criterion
        FROM aso.criteria existing
       WHERE existing.id = criterion_supersedes FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'superseded criterion not found'
          USING ERRCODE = 'P0002';
      END IF;
      IF old_criterion.payer_id IS DISTINCT FROM payer_id
         OR old_criterion.label IS DISTINCT FROM criterion_label
         OR old_criterion.evidence_grade IS DISTINCT FROM criterion_grade
         OR old_criterion.superseded_by IS NOT NULL
         OR lower(old_criterion.validity) >= criterion_valid_from
         OR (upper(old_criterion.validity) IS NOT NULL
             AND criterion_valid_from >= upper(old_criterion.validity)) THEN
        RAISE EXCEPTION 'criterion supersession is invalid'
          USING ERRCODE = '23514';
      END IF;
      UPDATE aso.criteria
         SET validity = daterange(
               lower(old_criterion.validity), criterion_valid_from, '[)'),
             superseded_by = criterion_id
       WHERE id = criterion_supersedes;
    END IF;

    INSERT INTO aso.criteria (
      id, payer_id, practice_id, evidence_grade, policy_id, section,
      document_id, label, requirement, ordinal, source_page_number,
      content_sha256, procedure_family, is_mandatory, validity,
      last_confirmed_at, data)
    VALUES (
      criterion_id, payer_id,
      CASE WHEN criterion_grade = 'published' THEN NULL
           ELSE actor.practice_id END,
      criterion_grade, policy_id, btrim(criterion_section),
      source_document_id, btrim(criterion_label), criterion_requirement,
      (criterion->>'ordinal')::integer, criterion_page, criterion_hash,
      NULLIF(btrim(criterion->>'procedure_family'), ''),
      COALESCE((criterion->>'is_mandatory')::boolean, true),
      daterange(criterion_valid_from, criterion_valid_to, '[)'),
      criterion_last_confirmed,
      jsonb_build_object('_catalog_import', jsonb_build_object(
        'command_id', target_command,
        'source_document_id', source_document_id,
        'source_page_number', criterion_page)));
    criterion_ids := array_append(criterion_ids, criterion_id);
  END LOOP;

  next_revision := catalog_state.revision + 1;
  next_token := token_match[1] || next_revision::text;
  committed_at := clock_timestamp();
  UPDATE aso.criteria_catalog_state
     SET revision = next_revision,
         revision_token = next_token,
         updated_at = committed_at
   WHERE singleton;

  result := jsonb_build_object(
    'commandId', target_command,
    'action', 'import',
    'criteriaCatalogRevision', next_token,
    'criterionIds', to_jsonb(criterion_ids),
    'committedAt', committed_at);
  INSERT INTO aso.criteria_catalog_commands (
    kratos_identity_id, practice_id, command_id, actor_id, policy_id,
    payload, result, committed_at)
  VALUES (
    actor.identity_id, actor.practice_id, target_command, actor.actor_id,
    policy_id, payload, result, committed_at);
  INSERT INTO aso.audit_events (
    practice_id, occurred_at, actor_id, actor_kratos_id, actor_label,
    actor_role, action, outcome, entity_table, entity_id, summary, data)
  VALUES (
    actor.practice_id, committed_at, actor.actor_id, actor.identity_id,
    actor.actor_label, 'criteria:configure', 'criteria_catalog.import',
    'success', 'policies', policy_id, 'Criteria catalog imported',
    jsonb_build_object(
      'commandId', target_command,
      'criteriaCatalogRevision', next_token,
      'criterionCount', cardinality(criterion_ids),
      'sourceDocumentId', source_document_id,
      'evidenceGrade', import_grade));
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION aso.list_criteria_catalog(target_payer uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  revision_token text;
  records jsonb;
BEGIN
  SELECT * INTO STRICT actor FROM aso.criteria_actor_context(false);
  SELECT state.revision_token INTO STRICT revision_token
    FROM aso.criteria_catalog_state state WHERE singleton;
  SELECT COALESCE(
    jsonb_agg(aso.criteria_catalog_record_json(catalog)
      ORDER BY catalog.payer_id, catalog.label, lower(catalog.validity),
               catalog.ordinal, catalog.id),
    '[]'::jsonb)
    INTO records
    FROM aso.criteria_catalog catalog
   WHERE (target_payer IS NULL OR catalog.payer_id = target_payer)
     AND (catalog.practice_id IS NULL
          OR catalog.practice_id = actor.practice_id);
  RETURN jsonb_build_object(
    'criteriaCatalogRevision', revision_token,
    'criteria', records);
END;
$$;

CREATE OR REPLACE FUNCTION aso.read_catalog_criterion(target_criterion uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  result jsonb;
BEGIN
  SELECT * INTO STRICT actor FROM aso.criteria_actor_context(false);
  SELECT aso.criteria_catalog_record_json(catalog) INTO result
    FROM aso.criteria_catalog catalog
   WHERE catalog.id = target_criterion
     AND (catalog.practice_id IS NULL
          OR catalog.practice_id = actor.practice_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'criterion not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION aso.lookup_criteria_import_command(
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
  SELECT * INTO STRICT actor FROM aso.criteria_actor_context(true);
  SELECT command.result INTO result
    FROM aso.criteria_catalog_commands command
   WHERE command.kratos_identity_id = actor.identity_id
     AND command.practice_id = actor.practice_id
     AND command.command_id = target_command;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION aso.criteria_catalog_commands_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'criteria catalog command receipts are immutable'
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER criteria_catalog_commands_immutable
BEFORE UPDATE OR DELETE OR TRUNCATE ON aso.criteria_catalog_commands
FOR EACH STATEMENT EXECUTE FUNCTION aso.criteria_catalog_commands_immutable();

REVOKE ALL ON FUNCTION aso.criteria_actor_context(boolean),
  aso.criteria_catalog_record_json(aso.criteria_catalog),
  aso.import_criteria_catalog(uuid,text,jsonb,jsonb),
  aso.list_criteria_catalog(uuid),
  aso.read_catalog_criterion(uuid),
  aso.lookup_criteria_import_command(uuid),
  aso.criteria_catalog_commands_immutable() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  aso.import_criteria_catalog(uuid,text,jsonb,jsonb),
  aso.list_criteria_catalog(uuid),
  aso.read_catalog_criterion(uuid),
  aso.lookup_criteria_import_command(uuid)
  TO aso_case_executor;
