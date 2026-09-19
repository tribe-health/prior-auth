-- web-03. Verified and idempotent administering-entity resolution commands.

INSERT INTO aso.capabilities (key, label, description, is_clinical) VALUES
  ('resolve_administering_entity', 'Resolve administering entity',
   'Resolve the controlling entity and its effective paths for an authorized case.', false)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  is_clinical = EXCLUDED.is_clinical;

INSERT INTO aso.role_capabilities (role_id, capability_key)
SELECT role.id, 'resolve_administering_entity'
FROM aso.roles role WHERE role.key IN ('staff', 'surgeon')
ON CONFLICT DO NOTHING;

ALTER TABLE aso.cases
  ADD COLUMN resolution_revision bigint NOT NULL DEFAULT 0
    CHECK (resolution_revision >= 0);

COMMENT ON COLUMN aso.cases.resolution_revision IS
  'Monotonic invalidation token for the current administering-entity resolution.';

CREATE TABLE aso.administering_entity_resolution_commands (
  kratos_identity_id uuid NOT NULL,
  practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  command_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES aso.cases(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  committed_at timestamptz NOT NULL,
  PRIMARY KEY (kratos_identity_id, practice_id, command_id)
);

COMMENT ON TABLE aso.administering_entity_resolution_commands IS
  'Lane: server-authoritative relational. Privacy: local. Immutable resolver command receipts; excluded from replication.';

ALTER TABLE aso.administering_entity_resolution_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.administering_entity_resolution_commands FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON aso.administering_entity_resolutions
  TO aso_case_owner;
GRANT SELECT ON aso.administering_entities, aso.payer_plans,
  aso.payer_plan_enrollments,
  aso.plan_delegation_rules TO aso_case_owner;
GRANT SELECT (id, name, effective_date, document_version)
  ON aso.documents TO aso_case_owner;
GRANT MAINTAIN ON aso.administering_entities, aso.payer_plans,
  aso.payer_plan_enrollments, aso.plan_delegation_rules, aso.documents
  TO aso_case_owner;
GRANT SELECT, INSERT ON aso.administering_entity_resolution_commands
  TO aso_case_owner;
GRANT UPDATE (resolution_revision) ON aso.cases TO aso_case_owner;

CREATE POLICY administering_resolutions_case_owner
  ON aso.administering_entity_resolutions TO aso_case_owner
  USING (true) WITH CHECK (true);
CREATE POLICY administering_resolution_commands_case_owner
  ON aso.administering_entity_resolution_commands TO aso_case_owner
  USING (true) WITH CHECK (true);
CREATE POLICY administering_entities_case_owner
  ON aso.administering_entities TO aso_case_owner USING (true);
CREATE POLICY payer_plans_case_owner
  ON aso.payer_plans TO aso_case_owner USING (true);
CREATE POLICY payer_plan_enrollments_case_owner
  ON aso.payer_plan_enrollments TO aso_case_owner USING (true);
CREATE POLICY plan_delegation_rules_case_owner
  ON aso.plan_delegation_rules TO aso_case_owner USING (true);
CREATE POLICY resolution_source_documents_case_owner
  ON aso.documents TO aso_case_owner USING (true);

CREATE FUNCTION aso.invalidate_administering_entity_resolution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  IF NEW.case_input_revision IS DISTINCT FROM OLD.case_input_revision THEN
    NEW.resolution_revision := OLD.resolution_revision + 1;
    DELETE FROM aso.administering_entity_resolutions
      WHERE case_id = OLD.id AND practice_id = OLD.practice_id;
  ELSE
    NEW.resolution_revision := COALESCE(NEW.resolution_revision, OLD.resolution_revision);
  END IF;
  RETURN NEW;
END;
$$;

-- PostgreSQL runs same-kind triggers alphabetically. This name deliberately
-- follows cases_revisions so it observes the newly advanced input revision.
CREATE TRIGGER cases_zz_resolution_invalidation
  BEFORE UPDATE ON aso.cases
  FOR EACH ROW EXECUTE FUNCTION aso.invalidate_administering_entity_resolution();

CREATE FUNCTION aso.invalidate_administering_entity_cases(target_cases uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  IF COALESCE(cardinality(target_cases), 0) = 0 THEN
    RETURN;
  END IF;

  -- Serialize every authoritative-input mutation with resolution through the
  -- case row, including the first resolution when no current row exists.
  PERFORM clinical_case.id
    FROM aso.cases clinical_case
   WHERE clinical_case.id IN (
     SELECT DISTINCT target_case FROM unnest(target_cases) AS target_case
   )
   ORDER BY clinical_case.id
   FOR UPDATE;

  UPDATE aso.cases clinical_case
     SET resolution_revision = clinical_case.resolution_revision + 1
   WHERE clinical_case.id IN (
     SELECT DISTINCT target_case FROM unnest(target_cases) AS target_case
   ) AND EXISTS (
     SELECT FROM aso.administering_entity_resolutions resolution
      WHERE resolution.case_id = clinical_case.id
        AND resolution.practice_id = clinical_case.practice_id
   );
  DELETE FROM aso.administering_entity_resolutions resolution
   WHERE resolution.case_id IN (
     SELECT DISTINCT target_case FROM unnest(target_cases) AS target_case
   );
END;
$$;

CREATE FUNCTION aso.invalidate_cases_for_administering_entity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  affected uuid[];
BEGIN
  IF ROW(NEW.key, NEW.name, NEW.active)
     IS NOT DISTINCT FROM ROW(OLD.key, OLD.name, OLD.active) THEN
    RETURN NEW;
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT clinical_case.id
      FROM aso.plan_delegation_rules rule
      JOIN aso.payer_plans plan
        ON plan.id = rule.payer_plan_id
       AND plan.practice_id = rule.practice_id
      JOIN aso.cases clinical_case
        ON clinical_case.practice_id = plan.practice_id
       AND clinical_case.payer_id = plan.payer_id
       AND clinical_case.plan_key = plan.plan_key
       AND clinical_case.procedure_code = rule.procedure_code
     WHERE rule.practice_id = OLD.practice_id
       AND rule.administering_entity_id = OLD.id
  ) INTO affected;
  PERFORM aso.invalidate_administering_entity_cases(affected);
  RETURN NEW;
END;
$$;

CREATE FUNCTION aso.invalidate_cases_for_payer_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  affected uuid[] := '{}'::uuid[];
BEGIN
  affected := affected || ARRAY(
    SELECT clinical_case.id FROM aso.cases clinical_case
     WHERE clinical_case.practice_id = OLD.practice_id
       AND clinical_case.payer_id = OLD.payer_id
       AND clinical_case.plan_key = OLD.plan_key
  );
  IF TG_OP = 'UPDATE' THEN
    affected := affected || ARRAY(
      SELECT clinical_case.id FROM aso.cases clinical_case
       WHERE clinical_case.practice_id = NEW.practice_id
         AND clinical_case.payer_id = NEW.payer_id
         AND clinical_case.plan_key = NEW.plan_key
    );
  END IF;
  PERFORM aso.invalidate_administering_entity_cases(affected);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE FUNCTION aso.invalidate_cases_for_plan_enrollment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  affected uuid[] := '{}'::uuid[];
BEGIN
  IF TG_OP <> 'INSERT' THEN
    affected := affected || ARRAY(
      SELECT clinical_case.id
        FROM aso.payer_plans plan
        JOIN aso.cases clinical_case
          ON clinical_case.practice_id = plan.practice_id
         AND clinical_case.payer_id = plan.payer_id
         AND clinical_case.plan_key = plan.plan_key
         AND clinical_case.member_id = OLD.member_id
       WHERE plan.id = OLD.payer_plan_id
         AND plan.practice_id = OLD.practice_id
    );
  END IF;
  IF TG_OP <> 'DELETE' THEN
    affected := affected || ARRAY(
      SELECT clinical_case.id
        FROM aso.payer_plans plan
        JOIN aso.cases clinical_case
          ON clinical_case.practice_id = plan.practice_id
         AND clinical_case.payer_id = plan.payer_id
         AND clinical_case.plan_key = plan.plan_key
         AND clinical_case.member_id = NEW.member_id
       WHERE plan.id = NEW.payer_plan_id
         AND plan.practice_id = NEW.practice_id
    );
  END IF;
  PERFORM aso.invalidate_administering_entity_cases(affected);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE FUNCTION aso.invalidate_cases_for_delegation_rule_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  affected uuid[] := '{}'::uuid[];
BEGIN
  IF TG_OP <> 'INSERT' THEN
    affected := affected || ARRAY(
      SELECT clinical_case.id
        FROM aso.payer_plans plan
        JOIN aso.cases clinical_case
          ON clinical_case.practice_id = plan.practice_id
         AND clinical_case.payer_id = plan.payer_id
         AND clinical_case.plan_key = plan.plan_key
         AND clinical_case.procedure_code = OLD.procedure_code
       WHERE plan.id = OLD.payer_plan_id
         AND plan.practice_id = OLD.practice_id
    );
  END IF;
  IF TG_OP <> 'DELETE' THEN
    affected := affected || ARRAY(
      SELECT clinical_case.id
        FROM aso.payer_plans plan
        JOIN aso.cases clinical_case
          ON clinical_case.practice_id = plan.practice_id
         AND clinical_case.payer_id = plan.payer_id
         AND clinical_case.plan_key = plan.plan_key
         AND clinical_case.procedure_code = NEW.procedure_code
       WHERE plan.id = NEW.payer_plan_id
         AND plan.practice_id = NEW.practice_id
    );
  END IF;
  PERFORM aso.invalidate_administering_entity_cases(affected);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER administering_entities_resolution_invalidation
  BEFORE UPDATE OF key, name, active ON aso.administering_entities
  FOR EACH ROW EXECUTE FUNCTION aso.invalidate_cases_for_administering_entity_change();
CREATE TRIGGER payer_plans_resolution_invalidation
  BEFORE UPDATE OR DELETE ON aso.payer_plans
  FOR EACH ROW EXECUTE FUNCTION aso.invalidate_cases_for_payer_plan_change();
CREATE TRIGGER payer_plan_enrollments_resolution_invalidation
  BEFORE INSERT OR UPDATE OR DELETE ON aso.payer_plan_enrollments
  FOR EACH ROW EXECUTE FUNCTION aso.invalidate_cases_for_plan_enrollment_change();
CREATE TRIGGER plan_delegation_rules_resolution_invalidation
  BEFORE INSERT OR UPDATE OR DELETE ON aso.plan_delegation_rules
  FOR EACH ROW EXECUTE FUNCTION aso.invalidate_cases_for_delegation_rule_change();

CREATE FUNCTION aso.invalidate_cases_for_resolution_source_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  affected uuid[];
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(
       NEW.name, NEW.data, NEW.effective_date, NEW.storage_uri,
       NEW.content_sha256, NEW.document_version, NEW.page_count)
     IS NOT DISTINCT FROM ROW(
       OLD.name, OLD.data, OLD.effective_date, OLD.storage_uri,
       OLD.content_sha256, OLD.document_version, OLD.page_count) THEN
    RETURN NEW;
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT affected_case.id
      FROM (
        SELECT clinical_case.id
          FROM aso.plan_delegation_rules rule
          JOIN aso.payer_plans plan
            ON plan.id = rule.payer_plan_id
           AND plan.practice_id = rule.practice_id
          JOIN aso.cases clinical_case
            ON clinical_case.practice_id = plan.practice_id
           AND clinical_case.payer_id = plan.payer_id
           AND clinical_case.plan_key = plan.plan_key
           AND clinical_case.procedure_code = rule.procedure_code
         WHERE rule.source_document_id = OLD.id
        UNION
        SELECT clinical_case.id
          FROM aso.payer_plan_enrollments enrollment
          JOIN aso.payer_plans plan
            ON plan.id = enrollment.payer_plan_id
           AND plan.practice_id = enrollment.practice_id
          JOIN aso.cases clinical_case
            ON clinical_case.practice_id = plan.practice_id
           AND clinical_case.payer_id = plan.payer_id
           AND clinical_case.plan_key = plan.plan_key
           AND clinical_case.member_id = enrollment.member_id
         WHERE enrollment.source_document_id = OLD.id
      ) affected_case
  ) INTO affected;
  PERFORM aso.invalidate_administering_entity_cases(affected);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER documents_resolution_source_invalidation
  BEFORE UPDATE OR DELETE ON aso.documents
  FOR EACH ROW EXECUTE FUNCTION aso.invalidate_cases_for_resolution_source_change();

REVOKE ALL ON FUNCTION aso.invalidate_administering_entity_cases(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION aso.invalidate_cases_for_administering_entity_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION aso.invalidate_cases_for_payer_plan_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION aso.invalidate_cases_for_plan_enrollment_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION aso.invalidate_cases_for_delegation_rule_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION aso.invalidate_cases_for_resolution_source_change() FROM PUBLIC;

CREATE FUNCTION aso.authorize_administering_entity_target(target_case uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  PERFORM aso.require_case(target_case, 'resolve_administering_entity');
END;
$$;

CREATE FUNCTION aso.administering_entity_resolution_json(target_case uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
  SELECT jsonb_build_object(
    'caseId', resolution.case_id,
    'entityId', resolution.entity_id,
    'entityName', entity.name,
    'criteriaSetKey', resolution.criteria_set_key,
    'submissionChannelKey', resolution.submission_channel_key,
    'appealPathKey', resolution.appeal_path_key,
    'sourceDocumentId', resolution.source_document_id,
    'sourceDocumentName', source.name,
    'sourceDocumentEffectiveDate', source.effective_date,
    'sourceDocumentVersion', resolution.source_document_version,
    'entityRevision', resolution.entity_revision,
    'planRevision', resolution.plan_revision,
    'enrollmentRevision', resolution.enrollment_revision,
    'ruleRevision', resolution.rule_revision,
    'validFrom', resolution.valid_from,
    'validTo', resolution.valid_to,
    'state', resolution.state,
    'revision', resolution.revision,
    'caseInputRevision', resolution.case_input_revision,
    'resolvedAt', resolution.resolved_at)
  FROM aso.administering_entity_resolutions resolution
  LEFT JOIN aso.administering_entities entity
    ON entity.id = resolution.entity_id
   AND entity.practice_id = resolution.practice_id
  LEFT JOIN aso.documents source ON source.id = resolution.source_document_id
  WHERE resolution.case_id = target_case;
$$;

CREATE FUNCTION aso.read_administering_entity_resolution(target_case uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  result jsonb;
BEGIN
  PERFORM aso.require_case(target_case, 'case:read');
  result := aso.administering_entity_resolution_json(target_case);
  IF result IS NULL THEN
    RAISE EXCEPTION 'administering-entity resolution not found'
      USING ERRCODE = 'P0002';
  END IF;
  RETURN result;
END;
$$;

CREATE FUNCTION aso.lookup_administering_entity_resolution_command(
  target_case uuid, target_command uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  original jsonb;
BEGIN
  SELECT * INTO STRICT actor
    FROM aso.case_actor_context('resolve_administering_entity');
  PERFORM aso.require_case(target_case, 'resolve_administering_entity');
  SELECT command.result INTO original
    FROM aso.administering_entity_resolution_commands command
   WHERE command.kratos_identity_id = actor.identity_id
     AND command.practice_id = actor.practice_id
     AND command.command_id = target_command
     AND command.case_id = target_case;
  RETURN original;
END;
$$;

CREATE FUNCTION aso.resolve_administering_entity_command(
  target_command uuid, target_case uuid, expected_case_input_revision bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  clinical_case aso.cases%ROWTYPE;
  original aso.administering_entity_resolution_commands%ROWTYPE;
  payload jsonb;
  candidate_count integer;
  entity_count integer;
  historical_count integer;
  inactive_current_count integer;
  candidate_rule_id uuid;
  candidate_entity_id uuid;
  candidate_entity_name text;
  candidate_criteria_set_key text;
  candidate_submission_channel_key text;
  candidate_appeal_path_key text;
  candidate_source_document_id uuid;
  candidate_source_document_name text;
  candidate_source_document_effective_date date;
  candidate_valid_from date;
  candidate_valid_to date;
  candidate_entity_revision bigint;
  candidate_plan_revision bigint;
  candidate_enrollment_revision bigint;
  candidate_rule_revision bigint;
  candidate_source_document_version integer;
  resolution_state text;
  next_revision bigint;
  committed_at timestamptz;
  result jsonb;
BEGIN
  SELECT * INTO STRICT actor
    FROM aso.case_actor_context('resolve_administering_entity');
  IF target_command IS NULL OR target_case IS NULL
     OR expected_case_input_revision IS NULL OR expected_case_input_revision <= 0 THEN
    RAISE EXCEPTION 'invalid administering-entity resolution command'
      USING ERRCODE = '22023';
  END IF;

  payload := jsonb_build_object(
    'caseId', target_case,
    'expectedCaseInputRevision', expected_case_input_revision);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    actor.identity_id::text || ':' || actor.practice_id::text || ':' ||
    target_command::text, 0));
  PERFORM aso.require_case(target_case, 'resolve_administering_entity');

  SELECT * INTO original
    FROM aso.administering_entity_resolution_commands command
   WHERE command.kratos_identity_id = actor.identity_id
     AND command.practice_id = actor.practice_id
     AND command.command_id = target_command;
  IF FOUND THEN
    IF original.actor_id IS DISTINCT FROM actor.actor_id
       OR original.case_id IS DISTINCT FROM target_case
       OR original.payload IS DISTINCT FROM payload THEN
      RAISE EXCEPTION 'resolution command ID has a different payload'
        USING ERRCODE = '23505';
    END IF;
    RETURN original.result;
  END IF;

  -- Input mutations take ROW EXCLUSIVE table locks before their row triggers
  -- lock affected cases. Take compatible read locks first so resolution and
  -- mutation always acquire table then case locks in the same order.
  LOCK TABLE aso.administering_entities, aso.payer_plans,
    aso.payer_plan_enrollments, aso.plan_delegation_rules, aso.documents
    IN SHARE MODE;

  SELECT * INTO STRICT clinical_case FROM aso.cases
    WHERE id = target_case AND practice_id = actor.practice_id FOR UPDATE;
  IF clinical_case.case_input_revision IS DISTINCT FROM expected_case_input_revision THEN
    RAISE EXCEPTION 'case inputs changed after they were loaded'
      USING ERRCODE = 'A0314';
  END IF;
  IF clinical_case.member_id IS NULL OR clinical_case.payer_id IS NULL
     OR clinical_case.date_of_service IS NULL
     OR clinical_case.procedure_code IS NULL OR clinical_case.plan_key IS NULL THEN
    RAISE EXCEPTION 'required case inputs are incomplete'
      USING ERRCODE = 'A0313';
  END IF;

  SELECT count(*), count(DISTINCT rule.administering_entity_id)
    INTO candidate_count, entity_count
    FROM aso.payer_plans plan
    JOIN aso.payer_plan_enrollments enrollment
      ON enrollment.payer_plan_id = plan.id
     AND enrollment.practice_id = plan.practice_id
    JOIN aso.plan_delegation_rules rule
      ON rule.payer_plan_id = plan.id AND rule.practice_id = plan.practice_id
    JOIN aso.administering_entities entity
      ON entity.id = rule.administering_entity_id
     AND entity.practice_id = rule.practice_id AND entity.active
   WHERE plan.practice_id = actor.practice_id
     AND plan.payer_id = clinical_case.payer_id
     AND plan.plan_key = clinical_case.plan_key
     AND enrollment.member_id = clinical_case.member_id
     AND clinical_case.date_of_service >= enrollment.valid_from
     AND (enrollment.valid_to IS NULL
       OR clinical_case.date_of_service < enrollment.valid_to)
     AND clinical_case.date_of_service >= plan.valid_from
     AND (plan.valid_to IS NULL OR clinical_case.date_of_service < plan.valid_to)
     AND rule.procedure_code = clinical_case.procedure_code
     AND clinical_case.date_of_service >= rule.valid_from
     AND (rule.valid_to IS NULL OR clinical_case.date_of_service < rule.valid_to);

  SELECT count(*) INTO historical_count
    FROM aso.payer_plans plan
    JOIN aso.payer_plan_enrollments enrollment
      ON enrollment.payer_plan_id = plan.id
     AND enrollment.practice_id = plan.practice_id
    JOIN aso.plan_delegation_rules rule
      ON rule.payer_plan_id = plan.id AND rule.practice_id = plan.practice_id
   WHERE plan.practice_id = actor.practice_id
     AND plan.payer_id = clinical_case.payer_id
     AND plan.plan_key = clinical_case.plan_key
     AND enrollment.member_id = clinical_case.member_id
     AND rule.procedure_code = clinical_case.procedure_code
     AND GREATEST(plan.valid_from, enrollment.valid_from, rule.valid_from)
       <= clinical_case.date_of_service
     AND GREATEST(plan.valid_from, enrollment.valid_from, rule.valid_from)
       < (SELECT min(value) FROM unnest(ARRAY[
            plan.valid_to, enrollment.valid_to, rule.valid_to
          ]) AS value WHERE value IS NOT NULL)
     AND (SELECT min(value) FROM unnest(ARRAY[
           plan.valid_to, enrollment.valid_to, rule.valid_to
         ]) AS value WHERE value IS NOT NULL) <= clinical_case.date_of_service;

  SELECT count(*) INTO inactive_current_count
    FROM aso.payer_plans plan
    JOIN aso.payer_plan_enrollments enrollment
      ON enrollment.payer_plan_id = plan.id
     AND enrollment.practice_id = plan.practice_id
    JOIN aso.plan_delegation_rules rule
      ON rule.payer_plan_id = plan.id AND rule.practice_id = plan.practice_id
    JOIN aso.administering_entities entity
      ON entity.id = rule.administering_entity_id
     AND entity.practice_id = rule.practice_id AND NOT entity.active
   WHERE plan.practice_id = actor.practice_id
     AND plan.payer_id = clinical_case.payer_id
     AND plan.plan_key = clinical_case.plan_key
     AND enrollment.member_id = clinical_case.member_id
     AND clinical_case.date_of_service >= enrollment.valid_from
     AND (enrollment.valid_to IS NULL
       OR clinical_case.date_of_service < enrollment.valid_to)
     AND clinical_case.date_of_service >= plan.valid_from
     AND (plan.valid_to IS NULL OR clinical_case.date_of_service < plan.valid_to)
     AND rule.procedure_code = clinical_case.procedure_code
     AND clinical_case.date_of_service >= rule.valid_from
     AND (rule.valid_to IS NULL OR clinical_case.date_of_service < rule.valid_to);

  IF candidate_count = 1 THEN
    resolution_state := 'resolved';
    SELECT rule.id AS rule_id, rule.administering_entity_id AS entity_id,
           entity.name AS entity_name,
           rule.criteria_set_key, rule.submission_channel_key,
           rule.appeal_path_key, rule.source_document_id,
           source.name AS source_document_name,
           source.effective_date AS source_document_effective_date,
           GREATEST(plan.valid_from, enrollment.valid_from, rule.valid_from) AS valid_from,
           (SELECT min(value) FROM unnest(ARRAY[
              plan.valid_to, enrollment.valid_to, rule.valid_to
            ]) AS value WHERE value IS NOT NULL) AS valid_to,
           entity.revision, plan.revision, enrollment.revision, rule.revision,
           source.document_version
      INTO STRICT candidate_rule_id, candidate_entity_id, candidate_entity_name,
        candidate_criteria_set_key, candidate_submission_channel_key,
        candidate_appeal_path_key, candidate_source_document_id,
        candidate_source_document_name,
        candidate_source_document_effective_date,
        candidate_valid_from, candidate_valid_to, candidate_entity_revision,
        candidate_plan_revision, candidate_enrollment_revision,
        candidate_rule_revision, candidate_source_document_version
      FROM aso.payer_plans plan
      JOIN aso.payer_plan_enrollments enrollment
        ON enrollment.payer_plan_id = plan.id
       AND enrollment.practice_id = plan.practice_id
      JOIN aso.plan_delegation_rules rule
        ON rule.payer_plan_id = plan.id AND rule.practice_id = plan.practice_id
      JOIN aso.administering_entities entity
        ON entity.id = rule.administering_entity_id
       AND entity.practice_id = rule.practice_id AND entity.active
      JOIN aso.documents source ON source.id = rule.source_document_id
     WHERE plan.practice_id = actor.practice_id
       AND plan.payer_id = clinical_case.payer_id
       AND plan.plan_key = clinical_case.plan_key
       AND enrollment.member_id = clinical_case.member_id
       AND clinical_case.date_of_service >= enrollment.valid_from
       AND (enrollment.valid_to IS NULL
         OR clinical_case.date_of_service < enrollment.valid_to)
       AND clinical_case.date_of_service >= plan.valid_from
       AND (plan.valid_to IS NULL OR clinical_case.date_of_service < plan.valid_to)
       AND rule.procedure_code = clinical_case.procedure_code
       AND clinical_case.date_of_service >= rule.valid_from
       AND (rule.valid_to IS NULL OR clinical_case.date_of_service < rule.valid_to);
  ELSIF candidate_count = 0 AND inactive_current_count > 0 THEN
    resolution_state := 'missing';
  ELSIF candidate_count = 0 AND historical_count = 0 THEN
    resolution_state := 'missing';
  ELSIF candidate_count = 0 THEN
    resolution_state := 'expired';
  ELSIF entity_count > 1 THEN
    resolution_state := 'ambiguous';
  ELSE
    resolution_state := 'conflicting';
  END IF;

  UPDATE aso.cases SET resolution_revision = resolution_revision + 1
   WHERE id = target_case AND practice_id = actor.practice_id
   RETURNING resolution_revision INTO next_revision;
  committed_at := clock_timestamp();

  INSERT INTO aso.administering_entity_resolutions (
    case_id, practice_id, entity_id, criteria_set_key, submission_channel_key,
    appeal_path_key, source_document_id, entity_revision, plan_revision,
    enrollment_revision, rule_revision, source_document_version, valid_from,
    valid_to, state, revision, case_input_revision, matched_rule_id, resolved_at)
  VALUES (
    target_case, actor.practice_id,
    CASE WHEN resolution_state = 'resolved' THEN candidate_entity_id END,
    CASE WHEN resolution_state = 'resolved' THEN candidate_criteria_set_key END,
    CASE WHEN resolution_state = 'resolved' THEN candidate_submission_channel_key END,
    CASE WHEN resolution_state = 'resolved' THEN candidate_appeal_path_key END,
    CASE WHEN resolution_state = 'resolved' THEN candidate_source_document_id END,
    CASE WHEN resolution_state = 'resolved' THEN candidate_entity_revision END,
    CASE WHEN resolution_state = 'resolved' THEN candidate_plan_revision END,
    CASE WHEN resolution_state = 'resolved' THEN candidate_enrollment_revision END,
    CASE WHEN resolution_state = 'resolved' THEN candidate_rule_revision END,
    CASE WHEN resolution_state = 'resolved' THEN candidate_source_document_version END,
    CASE WHEN resolution_state = 'resolved' THEN candidate_valid_from END,
    CASE WHEN resolution_state = 'resolved' THEN candidate_valid_to END,
    resolution_state, next_revision, clinical_case.case_input_revision,
    CASE WHEN resolution_state = 'resolved' THEN candidate_rule_id END,
    committed_at)
  ON CONFLICT (case_id) DO UPDATE SET
    practice_id = EXCLUDED.practice_id,
    entity_id = EXCLUDED.entity_id,
    criteria_set_key = EXCLUDED.criteria_set_key,
    submission_channel_key = EXCLUDED.submission_channel_key,
    appeal_path_key = EXCLUDED.appeal_path_key,
    source_document_id = EXCLUDED.source_document_id,
    entity_revision = EXCLUDED.entity_revision,
    plan_revision = EXCLUDED.plan_revision,
    enrollment_revision = EXCLUDED.enrollment_revision,
    rule_revision = EXCLUDED.rule_revision,
    source_document_version = EXCLUDED.source_document_version,
    valid_from = EXCLUDED.valid_from,
    valid_to = EXCLUDED.valid_to,
    state = EXCLUDED.state,
    revision = EXCLUDED.revision,
    case_input_revision = EXCLUDED.case_input_revision,
    matched_rule_id = EXCLUDED.matched_rule_id,
    resolved_at = EXCLUDED.resolved_at;

  result := jsonb_build_object(
    'commandId', target_command, 'caseId', target_case,
    'state', resolution_state, 'resolutionRevision', next_revision,
    'caseInputRevision', clinical_case.case_input_revision,
    'committedAt', committed_at,
    'entityId', candidate_entity_id, 'entityName', candidate_entity_name,
    'criteriaSetKey', candidate_criteria_set_key,
    'submissionChannelKey', candidate_submission_channel_key,
    'appealPathKey', candidate_appeal_path_key,
    'sourceDocumentId', candidate_source_document_id,
    'sourceDocumentName', candidate_source_document_name,
    'sourceDocumentEffectiveDate', candidate_source_document_effective_date,
    'validFrom', candidate_valid_from, 'validTo', candidate_valid_to,
    'entityRevision', candidate_entity_revision,
    'planRevision', candidate_plan_revision,
    'enrollmentRevision', candidate_enrollment_revision,
    'ruleRevision', candidate_rule_revision,
    'sourceDocumentVersion', candidate_source_document_version);
  INSERT INTO aso.administering_entity_resolution_commands (
    kratos_identity_id, practice_id, command_id, actor_id, case_id, payload,
    result, committed_at)
  VALUES (actor.identity_id, actor.practice_id, target_command, actor.actor_id,
    target_case, payload, result, committed_at);
  INSERT INTO aso.audit_events (
    practice_id, occurred_at, actor_id, actor_kratos_id, actor_label,
    actor_role, action, outcome, entity_table, entity_id, case_id, summary, data)
  VALUES (actor.practice_id, committed_at, actor.actor_id, actor.identity_id,
    actor.actor_label, 'case:resolve_administering_entity',
    'administering_entity.resolve', 'success',
    'administering_entity_resolutions', target_case, target_case,
    'Administering entity resolution committed',
    jsonb_build_object('commandId', target_command, 'state', resolution_state,
      'resolutionRevision', next_revision,
      'entityId', candidate_entity_id, 'entityName', candidate_entity_name,
      'criteriaSetKey', candidate_criteria_set_key,
      'submissionChannelKey', candidate_submission_channel_key,
      'appealPathKey', candidate_appeal_path_key,
      'sourceDocumentId', candidate_source_document_id,
      'sourceDocumentName', candidate_source_document_name,
      'sourceDocumentEffectiveDate', candidate_source_document_effective_date,
      'validFrom', candidate_valid_from, 'validTo', candidate_valid_to,
      'entityRevision', candidate_entity_revision,
      'planRevision', candidate_plan_revision,
      'enrollmentRevision', candidate_enrollment_revision,
      'ruleRevision', candidate_rule_revision,
      'sourceDocumentVersion', candidate_source_document_version));
  RETURN result;
END;
$$;

CREATE FUNCTION aso.administering_entity_resolution_commands_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, aso, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'resolution command results are immutable' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER administering_entity_resolution_commands_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE
  ON aso.administering_entity_resolution_commands
  FOR EACH STATEMENT
  EXECUTE FUNCTION aso.administering_entity_resolution_commands_immutable();

GRANT CREATE ON SCHEMA aso TO aso_case_owner;
DO $$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'aso.invalidate_administering_entity_resolution()',
    'aso.authorize_administering_entity_target(uuid)',
    'aso.administering_entity_resolution_json(uuid)',
    'aso.read_administering_entity_resolution(uuid)',
    'aso.lookup_administering_entity_resolution_command(uuid,uuid)',
    'aso.resolve_administering_entity_command(uuid,uuid,bigint)',
    'aso.administering_entity_resolution_commands_immutable()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', signature);
    EXECUTE format('ALTER FUNCTION %s OWNER TO aso_case_owner', signature);
  END LOOP;
END;
$$;
REVOKE CREATE ON SCHEMA aso FROM aso_case_owner;

GRANT EXECUTE ON FUNCTION
  aso.authorize_administering_entity_target(uuid),
  aso.read_administering_entity_resolution(uuid),
  aso.lookup_administering_entity_resolution_command(uuid,uuid),
  aso.resolve_administering_entity_command(uuid,uuid,bigint)
TO aso_case_executor;
