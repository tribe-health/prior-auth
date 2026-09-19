-- web-07. Immutable, tenant-scoped case criteria selection.

ALTER TABLE aso.cases
  ADD COLUMN criteria_selection_revision bigint NOT NULL DEFAULT 0
    CHECK (criteria_selection_revision >= 0);

CREATE TABLE aso.case_criteria_selections (
  case_id uuid PRIMARY KEY,
  practice_id uuid NOT NULL,
  resolution_revision bigint NOT NULL CHECK (resolution_revision > 0),
  criteria_catalog_revision text NOT NULL
    CHECK (criteria_catalog_revision ~ '^.+:criteriaCatalogRevision:r(0|[1-9][0-9]*)$'),
  criteria_snapshot_id uuid NOT NULL UNIQUE,
  policy_id uuid NOT NULL REFERENCES aso.policies(id) ON DELETE RESTRICT,
  selected_criterion_ids uuid[] NOT NULL CHECK (cardinality(selected_criterion_ids) > 0),
  selected_by uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  selected_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'current' CHECK (state = 'current'),
  revision bigint NOT NULL CHECK (revision > 0),
  CONSTRAINT case_criteria_selections_case_fkey
    FOREIGN KEY (case_id, practice_id)
    REFERENCES aso.cases(id, practice_id) ON DELETE CASCADE
);

CREATE TABLE aso.criteria_selection_commands (
  kratos_identity_id uuid NOT NULL,
  practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  command_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  committed_at timestamptz NOT NULL,
  PRIMARY KEY (kratos_identity_id, practice_id, command_id),
  FOREIGN KEY (case_id, practice_id)
    REFERENCES aso.cases(id, practice_id) ON DELETE RESTRICT
);

COMMENT ON TABLE aso.case_criteria_selections IS
  'Lane: server-authoritative relational. Privacy: trusted PHI. Exact selected policy snapshot; publication requires verified-practice scope and the reviewed column allowlist.';
COMMENT ON TABLE aso.criteria_selection_commands IS
  'Lane: server-authoritative relational. Privacy: local. Immutable command receipts; excluded from replication.';

ALTER TABLE aso.case_criteria_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE aso.criteria_selection_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.case_criteria_selections, aso.criteria_selection_commands FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON aso.case_criteria_selections TO aso_case_owner;
GRANT SELECT, INSERT ON aso.criteria_selection_commands TO aso_case_owner;
GRANT SELECT (id, payer_id, date_of_service, practice_id, resolution_revision,
  criteria_selection_revision) ON aso.cases TO aso_case_owner;
GRANT UPDATE (criteria_selection_revision) ON aso.cases TO aso_case_owner;
GRANT SELECT ON aso.administering_entity_resolutions, aso.criteria_catalog_state,
  aso.criteria_catalog, aso.policies TO aso_case_owner;
GRANT EXECUTE ON FUNCTION aso.criteria_catalog_record_json(aso.criteria_catalog)
  TO aso_case_owner;

CREATE POLICY case_criteria_selections_owner ON aso.case_criteria_selections
  TO aso_case_owner USING (true) WITH CHECK (true);
CREATE POLICY criteria_selection_commands_owner ON aso.criteria_selection_commands
  TO aso_case_owner USING (true) WITH CHECK (true);

CREATE FUNCTION aso.criteria_selection_revision_token(target_case uuid, revision bigint)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, aso, pg_temp
AS $$ SELECT target_case::text || ':criteriaSelectionRevision:r' || revision::text $$;

CREATE FUNCTION aso.criteria_resolution_revision_token(target_case uuid, revision bigint)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, aso, pg_temp
AS $$ SELECT target_case::text || ':resolutionRevision:r' || revision::text $$;

CREATE FUNCTION aso.criteria_selected_policy_json(target_policy uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', policy.id, 'payerId', policy.payer_id, 'name', policy.name,
    'policyNumber', policy.policy_number, 'version', policy.version,
    'effectiveFrom', policy.effective_from, 'effectiveTo', policy.effective_to,
    'sourceDocumentId', policy.source_document_id)
  FROM aso.policies policy WHERE policy.id = target_policy
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
  policy_records jsonb;
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
     AND (catalog.practice_id IS NULL OR catalog.practice_id = actor.practice_id);
  SELECT COALESCE(jsonb_agg(aso.criteria_selected_policy_json(policy.id)
      ORDER BY policy.effective_from DESC, policy.id), '[]'::jsonb)
    INTO policy_records
    FROM aso.policies policy
   WHERE policy.source_document_id IS NOT NULL
     AND (target_payer IS NULL OR policy.payer_id = target_payer)
     AND EXISTS (
       SELECT FROM aso.criteria_catalog catalog
        WHERE catalog.policy_id = policy.id
          AND (catalog.practice_id IS NULL OR catalog.practice_id = actor.practice_id));
  RETURN jsonb_build_object(
    'criteriaCatalogRevision', revision_token,
    'criteria', records,
    'policies', policy_records);
END;
$$;

CREATE FUNCTION aso.criteria_selection_snapshot_json(target_case uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  selection aso.case_criteria_selections%ROWTYPE;
  clinical_case aso.cases%ROWTYPE;
  current_catalog text;
  criteria_rows jsonb;
  current_state text;
BEGIN
  SELECT * INTO STRICT clinical_case FROM aso.cases WHERE id = target_case;
  SELECT * INTO selection FROM aso.case_criteria_selections WHERE case_id = target_case;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'criteria selection not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT revision_token INTO STRICT current_catalog
    FROM aso.criteria_catalog_state WHERE singleton;
  current_state := CASE
    WHEN selection.resolution_revision = clinical_case.resolution_revision
      AND selection.criteria_catalog_revision = current_catalog
    THEN 'current' ELSE 'stale' END;
  SELECT COALESCE(jsonb_agg(aso.criteria_catalog_record_json(catalog)
      ORDER BY catalog.ordinal, catalog.id), '[]'::jsonb)
    INTO criteria_rows
    FROM aso.criteria_catalog catalog
   WHERE catalog.id = ANY(selection.selected_criterion_ids);
  RETURN jsonb_build_object(
    'caseId', selection.case_id,
    'resolutionRevision', aso.criteria_resolution_revision_token(
      selection.case_id, selection.resolution_revision),
    'criteriaCatalogRevision', selection.criteria_catalog_revision,
    'criteriaSelectionRevision', aso.criteria_selection_revision_token(
      selection.case_id, selection.revision),
    'criteriaSnapshotId', selection.criteria_snapshot_id,
    'policy', aso.criteria_selected_policy_json(selection.policy_id),
    'criteria', criteria_rows,
    'selectedBy', selection.selected_by,
    'selectedAt', selection.selected_at,
    'state', current_state);
END;
$$;

CREATE FUNCTION aso.read_case_criteria_selection(target_case uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  PERFORM aso.require_case(target_case, 'case:read');
  RETURN aso.criteria_selection_snapshot_json(target_case);
END;
$$;

CREATE FUNCTION aso.select_case_criteria(
  target_command uuid,
  target_case uuid,
  expected_resolution_revision text,
  expected_catalog_revision text,
  target_criteria uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  original aso.criteria_selection_commands%ROWTYPE;
  clinical_case aso.cases%ROWTYPE;
  resolution aso.administering_entity_resolutions%ROWTYPE;
  current_catalog text;
  expected_resolution bigint;
  token_match text[];
  payload jsonb;
  result jsonb;
  committed_at timestamptz;
  selected_policy uuid;
  selected_count bigint;
  next_revision bigint;
BEGIN
  SELECT * INTO STRICT actor FROM aso.case_actor_context('criteria_select');
  PERFORM aso.require_case(target_case, 'criteria_select');
  IF target_command IS NULL OR target_case IS NULL
     OR expected_resolution_revision IS NULL OR expected_catalog_revision IS NULL
     OR target_criteria IS NULL OR cardinality(target_criteria) = 0
     OR cardinality(target_criteria) <> (SELECT count(DISTINCT value) FROM unnest(target_criteria) value)
  THEN
    RAISE EXCEPTION 'invalid criteria selection' USING ERRCODE = '22023';
  END IF;
  token_match := regexp_match(expected_resolution_revision,
    '^.+:resolutionRevision:r(0|[1-9][0-9]*)$');
  IF token_match IS NULL THEN
    RAISE EXCEPTION 'invalid resolution revision token' USING ERRCODE = '22023';
  END IF;
  expected_resolution := token_match[1]::bigint;
  IF expected_catalog_revision !~ '^.+:criteriaCatalogRevision:r(0|[1-9][0-9]*)$' THEN
    RAISE EXCEPTION 'invalid criteria catalog revision token' USING ERRCODE = '22023';
  END IF;

  payload := jsonb_build_object(
    'expectedRevisions', jsonb_build_object(
      'resolutionRevision', expected_resolution_revision,
      'criteriaCatalogRevision', expected_catalog_revision),
    'criterionIds', to_jsonb(target_criteria));
  SELECT * INTO original FROM aso.criteria_selection_commands command
   WHERE command.kratos_identity_id = actor.identity_id
     AND command.practice_id = actor.practice_id
     AND command.command_id = target_command;
  IF FOUND THEN
    IF original.case_id IS DISTINCT FROM target_case
       OR original.payload IS DISTINCT FROM payload THEN
      RAISE EXCEPTION 'criteria selection command conflict' USING ERRCODE = '23505';
    END IF;
    RETURN original.result;
  END IF;

  SELECT * INTO STRICT clinical_case FROM aso.cases
   WHERE id = target_case AND practice_id = actor.practice_id FOR UPDATE;
  SELECT * INTO resolution FROM aso.administering_entity_resolutions
   WHERE case_id = target_case AND practice_id = actor.practice_id;
  IF NOT FOUND OR resolution.state <> 'resolved' THEN
    RAISE EXCEPTION 'resolved coverage path required' USING ERRCODE = 'P0003';
  END IF;
  SELECT revision_token INTO STRICT current_catalog
    FROM aso.criteria_catalog_state WHERE singleton FOR UPDATE;
  IF clinical_case.resolution_revision <> expected_resolution
     OR current_catalog IS DISTINCT FROM expected_catalog_revision THEN
    RAISE EXCEPTION 'criteria selection revision changed' USING ERRCODE = '40001';
  END IF;

  SELECT count(*), (array_agg(catalog.policy_id ORDER BY catalog.policy_id))[1]
    INTO selected_count, selected_policy
    FROM aso.criteria_catalog catalog
   WHERE catalog.id = ANY(target_criteria)
     AND catalog.payer_id = clinical_case.payer_id
     AND (catalog.practice_id IS NULL OR catalog.practice_id = actor.practice_id)
     AND catalog.policy_id IS NOT NULL
     AND catalog.document_id IS NOT NULL
     AND catalog.source_page_number IS NOT NULL
     AND catalog.superseded_by IS NULL
     AND catalog.validity @> clinical_case.date_of_service;
  IF selected_count <> cardinality(target_criteria)
     OR selected_policy IS NULL
     OR EXISTS (
       SELECT FROM aso.criteria_catalog catalog
        WHERE catalog.id = ANY(target_criteria)
          AND catalog.policy_id IS DISTINCT FROM selected_policy)
     OR NOT EXISTS (
       SELECT FROM aso.policies policy
        WHERE policy.id = selected_policy
          AND policy.payer_id = clinical_case.payer_id
          AND policy.source_document_id IS NOT NULL
          AND policy.effective_from <= clinical_case.date_of_service
          AND (policy.effective_to IS NULL OR policy.effective_to > clinical_case.date_of_service))
  THEN
    RAISE EXCEPTION 'criteria do not form one effective policy snapshot'
      USING ERRCODE = '23514';
  END IF;

  UPDATE aso.cases SET criteria_selection_revision = criteria_selection_revision + 1
   WHERE id = target_case RETURNING criteria_selection_revision INTO next_revision;
  committed_at := clock_timestamp();
  INSERT INTO aso.case_criteria_selections (
    case_id, practice_id, resolution_revision, criteria_catalog_revision,
    criteria_snapshot_id, policy_id, selected_criterion_ids, selected_by,
    selected_at, state, revision)
  VALUES (target_case, actor.practice_id, clinical_case.resolution_revision,
    current_catalog, target_command, selected_policy, target_criteria,
    actor.actor_id, committed_at, 'current', next_revision)
  ON CONFLICT (case_id) DO UPDATE SET
    resolution_revision = EXCLUDED.resolution_revision,
    criteria_catalog_revision = EXCLUDED.criteria_catalog_revision,
    criteria_snapshot_id = EXCLUDED.criteria_snapshot_id,
    policy_id = EXCLUDED.policy_id,
    selected_criterion_ids = EXCLUDED.selected_criterion_ids,
    selected_by = EXCLUDED.selected_by,
    selected_at = EXCLUDED.selected_at,
    state = EXCLUDED.state,
    revision = EXCLUDED.revision;

  result := jsonb_build_object(
    'commandId', target_command, 'caseId', target_case,
    'criteriaSelectionRevision', aso.criteria_selection_revision_token(
      target_case, next_revision), 'committedAt', committed_at);
  INSERT INTO aso.criteria_selection_commands (
    kratos_identity_id, practice_id, command_id, actor_id, case_id,
    payload, result, committed_at)
  VALUES (actor.identity_id, actor.practice_id, target_command, actor.actor_id,
    target_case, payload, result, committed_at);
  INSERT INTO aso.audit_events (
    practice_id, occurred_at, actor_id, actor_kratos_id, actor_label,
    actor_role, action, outcome, entity_table, entity_id, case_id, summary, data)
  VALUES (actor.practice_id, committed_at, actor.actor_id, actor.identity_id,
    actor.actor_label, 'case:criteria_select', 'criteria_selection.select',
    'success', 'case_criteria_selections', target_case, target_case,
    'Controlling criteria snapshot selected',
    jsonb_build_object('commandId', target_command, 'policyId', selected_policy,
      'criteriaSelectionRevision', next_revision));
  RETURN result;
END;
$$;

CREATE FUNCTION aso.lookup_criteria_selection_command(
  target_case uuid, target_command uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE actor record; result jsonb;
BEGIN
  SELECT * INTO STRICT actor FROM aso.case_actor_context('criteria_select');
  PERFORM aso.require_case(target_case, 'criteria_select');
  SELECT command.result INTO result FROM aso.criteria_selection_commands command
   WHERE command.kratos_identity_id = actor.identity_id
     AND command.practice_id = actor.practice_id
     AND command.case_id = target_case
     AND command.command_id = target_command;
  RETURN result;
END;
$$;

CREATE FUNCTION aso.criteria_selection_commands_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, aso, pg_temp
AS $$ BEGIN
  RAISE EXCEPTION 'criteria selection command receipts are immutable'
    USING ERRCODE = '42501';
END $$;
CREATE TRIGGER criteria_selection_commands_immutable
BEFORE UPDATE OR DELETE OR TRUNCATE ON aso.criteria_selection_commands
FOR EACH STATEMENT EXECUTE FUNCTION aso.criteria_selection_commands_immutable();

GRANT CREATE ON SCHEMA aso TO aso_case_owner;
DO $$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'aso.criteria_selection_revision_token(uuid,bigint)',
    'aso.criteria_resolution_revision_token(uuid,bigint)',
    'aso.criteria_selected_policy_json(uuid)',
    'aso.list_criteria_catalog(uuid)',
    'aso.criteria_selection_snapshot_json(uuid)',
    'aso.read_case_criteria_selection(uuid)',
    'aso.select_case_criteria(uuid,uuid,text,text,uuid[])',
    'aso.lookup_criteria_selection_command(uuid,uuid)',
    'aso.criteria_selection_commands_immutable()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', signature);
    EXECUTE format('ALTER FUNCTION %s OWNER TO aso_case_owner', signature);
  END LOOP;
END;
$$;
REVOKE CREATE ON SCHEMA aso FROM aso_case_owner;

GRANT EXECUTE ON FUNCTION
  aso.read_case_criteria_selection(uuid),
  aso.select_case_criteria(uuid,uuid,text,text,uuid[]),
  aso.lookup_criteria_selection_command(uuid,uuid)
TO aso_case_executor;
