-- Local integration proof against the synthetic docker/demo-init.sh fixture.
-- Run: docker compose exec -T db psql -U flint -d flint -X -v ON_ERROR_STOP=1 < scripts/test-criteria-selection-revision.sql
-- Commands use the real executor role and all changes are rolled back.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  fixture_case uuid := '10000000-0000-4000-8000-000000000005';
  fixture_actor uuid := '10000000-0000-4000-8000-000000000002';
  fixture_practice uuid := '10000000-0000-4000-8000-000000000001';
  fixture_identity uuid;
  command_payload jsonb;
BEGIN
  IF NOT EXISTS (SELECT FROM aso.practices
      WHERE id = fixture_practice AND key = 'aso-demo') THEN
    RAISE EXCEPTION 'synthetic demo fixture required';
  END IF;
  SELECT kratos_identity_id INTO STRICT fixture_identity
    FROM aso.users WHERE id = fixture_actor;
  SELECT jsonb_build_object(
      'caseId', clinical_case.id,
      'resolutionRevision', aso.criteria_resolution_revision_token(
        clinical_case.id, clinical_case.resolution_revision),
      'staleResolutionRevision', aso.criteria_resolution_revision_token(
        clinical_case.id, clinical_case.resolution_revision + 1),
      'criteriaCatalogRevision', catalog_state.revision_token,
      'criterionIds', selection.selected_criterion_ids)
    INTO STRICT command_payload
    FROM aso.cases clinical_case
    JOIN aso.case_criteria_selections selection ON selection.case_id = clinical_case.id
    CROSS JOIN aso.criteria_catalog_state catalog_state
   WHERE clinical_case.id = fixture_case
     AND clinical_case.practice_id = fixture_practice
     AND catalog_state.singleton;
  PERFORM set_config('aso.actor_id', fixture_actor::text, true);
  PERFORM set_config('aso.kratos_identity_id', fixture_identity::text, true);
  PERFORM set_config('aso.practice_id', fixture_practice::text, true);
  PERFORM set_config('aso.principal', 'user', true);
  PERFORM set_config('aso.session_expires_at',
    (clock_timestamp() + interval '5 minutes')::text, true);
  PERFORM set_config('aso_test.criteria_command', command_payload::text, true);
END;
$$;

SET LOCAL ROLE aso_case_executor;
SET LOCAL search_path = pg_catalog, aso, pg_temp;

DO $$
DECLARE
  command_payload jsonb := current_setting('aso_test.criteria_command')::jsonb;
  fixture_case uuid := (command_payload->>'caseId')::uuid;
  criterion_ids uuid[];
  snapshot jsonb;
BEGIN
  SELECT array_agg(value::uuid) INTO STRICT criterion_ids
    FROM jsonb_array_elements_text(command_payload->'criterionIds');

  BEGIN
    PERFORM aso.select_case_criteria(gen_random_uuid(), fixture_case,
      command_payload->>'staleResolutionRevision',
      command_payload->>'criteriaCatalogRevision', criterion_ids);
    RAISE EXCEPTION 'stale resolution revision was accepted';
  EXCEPTION WHEN serialization_failure THEN
    RAISE NOTICE 'Passed: stale resolution revision rejected';
  END;

  BEGIN
    PERFORM aso.select_case_criteria(gen_random_uuid(), fixture_case,
      command_payload->>'resolutionRevision',
      'stale:' || (command_payload->>'criteriaCatalogRevision'), criterion_ids);
    RAISE EXCEPTION 'stale catalog revision was accepted';
  EXCEPTION WHEN serialization_failure THEN
    RAISE NOTICE 'Passed: stale catalog revision rejected';
  END;

  PERFORM aso.select_case_criteria(gen_random_uuid(), fixture_case,
    command_payload->>'resolutionRevision',
    command_payload->>'criteriaCatalogRevision', criterion_ids);
  RAISE NOTICE 'Passed: matching revisions accepted';

  snapshot := aso.read_case_criteria_selection(fixture_case);
  IF snapshot->>'state' IS DISTINCT FROM 'current'
      OR snapshot->>'criteriaCatalogRevision' IS DISTINCT FROM
        command_payload->>'criteriaCatalogRevision' THEN
    RAISE EXCEPTION 'committed criteria snapshot is not current';
  END IF;
  RAISE NOTICE 'Passed: selected catalog token retained and snapshot current';
END;
$$;

ROLLBACK;
