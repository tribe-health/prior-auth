-- RA-03. Verified-context evidence reassessment over an immutable command ledger.
-- Lane: server-authoritative relational. Privacy: local.
-- Command receipts and audit details are excluded from client replication.

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_publication WHERE puballtables)
     OR EXISTS (
       SELECT FROM pg_catalog.pg_publication_namespace pn
       JOIN pg_catalog.pg_namespace n ON n.oid = pn.pnnspid
       WHERE n.nspname = 'aso'
     ) THEN
    RAISE EXCEPTION 'local reassessment command data requires explicit-table publications';
  END IF;
END;
$$;

CREATE TABLE aso.evidence_reassessment_commands (
  kratos_identity_id uuid NOT NULL,
  practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  command_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES aso.cases(id) ON DELETE RESTRICT,
  evidence_id uuid NOT NULL REFERENCES aso.case_evidence(id) ON DELETE RESTRICT,
  expected_assessed_at timestamptz NOT NULL,
  previous_state text NOT NULL REFERENCES aso.evidence_states(key),
  state text NOT NULL REFERENCES aso.evidence_states(key),
  result jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  PRIMARY KEY (kratos_identity_id, practice_id, command_id)
);
COMMENT ON TABLE aso.evidence_reassessment_commands IS
  'Lane: server-authoritative relational. Privacy: local. Immutable reassessment results; excluded from replication.';
ALTER TABLE aso.evidence_reassessment_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.evidence_reassessment_commands FROM PUBLIC;

GRANT SELECT ON aso.case_evidence, aso.evidence_reassessment_commands TO aso_gate_owner;
GRANT UPDATE (state, assessed_by, assessed_at) ON aso.case_evidence TO aso_gate_owner;
GRANT INSERT ON aso.evidence_reassessment_commands TO aso_gate_owner;

CREATE POLICY evidence_reassessment_commands_owner
  ON aso.evidence_reassessment_commands TO aso_gate_owner
  USING (true) WITH CHECK (true);

CREATE FUNCTION aso.require_reassessment_evidence(
  target_case uuid,
  target_evidence uuid,
  clinical boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  evidence_case uuid;
  case_practice uuid;
BEGIN
  SELECT * INTO STRICT actor FROM aso.gate_actor_context();
  SELECT evidence.case_id, clinical_case.practice_id
    INTO evidence_case, case_practice
  FROM aso.case_evidence evidence
  JOIN aso.cases clinical_case ON clinical_case.id = evidence.case_id
  WHERE evidence.id = target_evidence;
  IF NOT FOUND OR evidence_case IS DISTINCT FROM target_case THEN
    RAISE EXCEPTION 'evidence assessment not found' USING ERRCODE = 'P0002';
  END IF;
  IF case_practice <> actor.practice_id OR (clinical AND NOT EXISTS (
    SELECT FROM aso.user_capabilities capability
    WHERE capability.user_id = actor.actor_id
      AND capability.practice_id = actor.practice_id
      AND capability.capability_key = 'annotate'
      AND capability.is_clinical
  )) THEN
    RAISE EXCEPTION 'evidence reassessment authority denied' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION aso.may_reassess_evidence(target_case uuid, target_evidence uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  PERFORM aso.require_reassessment_evidence(target_case, target_evidence, true);
  RETURN true;
EXCEPTION WHEN insufficient_privilege OR no_data_found THEN
  RETURN false;
END;
$$;

CREATE FUNCTION aso.read_reassessment_target(target_case uuid, target_evidence uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  result jsonb;
BEGIN
  PERFORM aso.require_reassessment_evidence(target_case, target_evidence, false);
  SELECT jsonb_build_object(
    'caseId', evidence.case_id,
    'evidenceId', evidence.id,
    'state', evidence.state,
    'assessedAt', evidence.assessed_at)
  INTO result
  FROM aso.case_evidence evidence
  WHERE evidence.id = target_evidence;
  RETURN result;
END;
$$;

CREATE FUNCTION aso.lookup_evidence_reassessment_command(target_command uuid)
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
  FROM aso.evidence_reassessment_commands command
  WHERE command.kratos_identity_id = actor.identity_id
    AND command.practice_id = actor.practice_id
    AND command.command_id = target_command;
  RETURN original;
END;
$$;

CREATE FUNCTION aso.evidence_reassessment_commands_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'evidence reassessment results are immutable' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER evidence_reassessment_commands_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON aso.evidence_reassessment_commands
  FOR EACH STATEMENT EXECUTE FUNCTION aso.evidence_reassessment_commands_immutable();

CREATE FUNCTION aso.enforce_evidence_reassessment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
BEGIN
  SELECT * INTO STRICT actor FROM aso.gate_actor_context();
  PERFORM aso.require_reassessment_evidence(NEW.case_id, NEW.id, true);
  IF NEW.assessed_by IS DISTINCT FROM actor.actor_id
     OR NEW.assessed_at IS NULL
     OR NEW.assessed_at <= OLD.assessed_at
     OR NEW.state IS NOT DISTINCT FROM OLD.state THEN
    RAISE EXCEPTION 'invalid evidence reassessment' USING ERRCODE = 'A0307';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_evidence_reassessment
  BEFORE UPDATE OF state, assessed_by, assessed_at ON aso.case_evidence
  FOR EACH ROW EXECUTE FUNCTION aso.enforce_evidence_reassessment();

CREATE FUNCTION aso.apply_evidence_reassessment_command(
  target_command uuid,
  target_case uuid,
  target_evidence uuid,
  target_expected_assessed_at timestamptz,
  target_state text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  original aso.evidence_reassessment_commands%ROWTYPE;
  evidence_record record;
  result jsonb;
  committed_at timestamptz;
BEGIN
  SELECT * INTO STRICT actor FROM aso.gate_actor_context();
  IF target_command IS NULL OR target_case IS NULL OR target_evidence IS NULL
     OR target_expected_assessed_at IS NULL
     OR target_state NOT IN ('met', 'gap', 'void') THEN
    RAISE EXCEPTION 'invalid evidence reassessment payload' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    actor.identity_id::text || ':' || actor.practice_id::text || ':' || target_command::text, 0));
  SELECT * INTO original FROM aso.evidence_reassessment_commands command
  WHERE command.kratos_identity_id = actor.identity_id
    AND command.practice_id = actor.practice_id
    AND command.command_id = target_command;
  IF FOUND THEN
    PERFORM aso.require_reassessment_evidence(original.case_id, original.evidence_id, true);
    IF original.case_id IS DISTINCT FROM target_case
       OR original.evidence_id IS DISTINCT FROM target_evidence
       OR original.expected_assessed_at IS DISTINCT FROM target_expected_assessed_at
       OR original.state IS DISTINCT FROM target_state
       OR original.actor_id IS DISTINCT FROM actor.actor_id THEN
      RAISE EXCEPTION 'reassessment command ID has a different payload' USING ERRCODE = '23505';
    END IF;
    RETURN original.result;
  END IF;

  PERFORM aso.require_reassessment_evidence(target_case, target_evidence, true);
  PERFORM clinical_case.id FROM aso.cases clinical_case WHERE clinical_case.id = target_case FOR UPDATE;
  SELECT evidence.state, evidence.assessed_at
    INTO STRICT evidence_record
  FROM aso.case_evidence evidence
  WHERE evidence.id = target_evidence AND evidence.case_id = target_case
  FOR UPDATE;
  PERFORM aso.require_reassessment_evidence(target_case, target_evidence, true);

  IF evidence_record.assessed_at IS DISTINCT FROM target_expected_assessed_at THEN
    RAISE EXCEPTION 'evidence assessment changed after review' USING ERRCODE = 'A0307';
  ELSIF evidence_record.state IS NOT DISTINCT FROM target_state THEN
    RAISE EXCEPTION 'evidence reassessment must change state' USING ERRCODE = 'A0307';
  END IF;

  committed_at := clock_timestamp();
  UPDATE aso.case_evidence
  SET state = target_state, assessed_by = actor.actor_id, assessed_at = committed_at
  WHERE id = target_evidence;

  result := jsonb_build_object(
    'commandId', target_command,
    'caseId', target_case,
    'evidenceId', target_evidence,
    'previousState', evidence_record.state,
    'state', target_state,
    'expectedAssessedAt', target_expected_assessed_at,
    'assessedAt', committed_at);
  INSERT INTO aso.audit_events (
    practice_id, occurred_at, actor_id, actor_kratos_id, actor_label, actor_role,
    action, outcome, entity_table, entity_id, case_id, summary, data)
  VALUES (
    actor.practice_id, committed_at, actor.actor_id, actor.identity_id,
    actor.actor_label, 'clinical:reassess_evidence', 'evidence.reassess', 'success',
    'case_evidence', target_evidence, target_case,
    'Evidence state reassessed',
    jsonb_build_object('commandId', target_command,
      'previousState', evidence_record.state, 'state', target_state,
      'expectedAssessedAt', target_expected_assessed_at));
  INSERT INTO aso.evidence_reassessment_commands (
    kratos_identity_id, practice_id, command_id, actor_id, case_id, evidence_id,
    expected_assessed_at, previous_state, state, result, committed_at)
  VALUES (
    actor.identity_id, actor.practice_id, target_command, actor.actor_id,
    target_case, target_evidence, target_expected_assessed_at,
    evidence_record.state, target_state, result, committed_at);
  RETURN result;
END;
$$;

GRANT CREATE ON SCHEMA aso TO aso_gate_owner;
DO $$
DECLARE
  signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'aso.require_reassessment_evidence(uuid,uuid,boolean)',
    'aso.may_reassess_evidence(uuid,uuid)',
    'aso.read_reassessment_target(uuid,uuid)',
    'aso.lookup_evidence_reassessment_command(uuid)',
    'aso.evidence_reassessment_commands_immutable()',
    'aso.enforce_evidence_reassessment()',
    'aso.apply_evidence_reassessment_command(uuid,uuid,uuid,timestamptz,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', signature);
    EXECUTE format('ALTER FUNCTION %s OWNER TO aso_gate_owner', signature);
  END LOOP;
END;
$$;
REVOKE CREATE ON SCHEMA aso FROM aso_gate_owner;
GRANT EXECUTE ON FUNCTION
  aso.may_reassess_evidence(uuid,uuid),
  aso.read_reassessment_target(uuid,uuid),
  aso.lookup_evidence_reassessment_command(uuid),
  aso.apply_evidence_reassessment_command(uuid,uuid,uuid,timestamptz,text)
  TO aso_gate_executor;
