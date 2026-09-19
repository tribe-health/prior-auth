-- CURRENT_CATALOG is a SQL value expression that returns the database name.
-- Rename the PL/pgSQL local so revision checks and stored snapshots use the
-- selected catalog token. CREATE OR REPLACE preserves existing owners and ACLs.

CREATE OR REPLACE FUNCTION aso.criteria_selection_snapshot_json(target_case uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  selection aso.case_criteria_selections%ROWTYPE;
  clinical_case aso.cases%ROWTYPE;
  current_catalog_revision text;
  criteria_rows jsonb;
  current_state text;
BEGIN
  SELECT * INTO STRICT clinical_case FROM aso.cases WHERE id = target_case;
  SELECT * INTO selection FROM aso.case_criteria_selections WHERE case_id = target_case;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'criteria selection not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT revision_token INTO STRICT current_catalog_revision
    FROM aso.criteria_catalog_state WHERE singleton;
  current_state := CASE
    WHEN selection.resolution_revision = clinical_case.resolution_revision
      AND selection.criteria_catalog_revision = current_catalog_revision
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

CREATE OR REPLACE FUNCTION aso.select_case_criteria(
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
  current_catalog_revision text;
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
  SELECT revision_token INTO STRICT current_catalog_revision
    FROM aso.criteria_catalog_state WHERE singleton FOR UPDATE;
  IF clinical_case.resolution_revision <> expected_resolution
     OR current_catalog_revision IS DISTINCT FROM expected_catalog_revision THEN
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
    current_catalog_revision, target_command, selected_policy, target_criteria,
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
