-- web-01. Verified, idempotent case creation and management commands.
-- case_commands is a server-authoritative local ledger and is never replicated.

DO $$
DECLARE
  role_name text;
  role_id oid;
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_publication WHERE puballtables)
     OR EXISTS (
       SELECT FROM pg_catalog.pg_publication_namespace pn
       JOIN pg_catalog.pg_namespace n ON n.oid = pn.pnnspid
       WHERE n.nspname = 'aso'
     ) THEN
    RAISE EXCEPTION 'local case command data requires explicit-table publications';
  END IF;

  FOREACH role_name IN ARRAY ARRAY['aso_case_owner', 'aso_case_executor'] LOOP
    SELECT oid INTO role_id FROM pg_catalog.pg_roles WHERE rolname = role_name;
    IF role_id IS NULL THEN
      EXECUTE format(
        'CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
        role_name);
    ELSIF EXISTS (
      SELECT FROM pg_catalog.pg_roles WHERE oid = role_id
        AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole
             OR rolreplication OR rolbypassrls)
    ) OR EXISTS (
      SELECT FROM pg_catalog.pg_auth_members WHERE member = role_id
    ) OR EXISTS (
      SELECT FROM pg_catalog.pg_database WHERE datdba = role_id
    ) OR EXISTS (
      SELECT FROM pg_catalog.pg_namespace WHERE nspowner = role_id
    ) OR EXISTS (
      SELECT FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'aso' AND (c.relowner = role_id OR
        (c.relkind IN ('r', 'p', 'v', 'm', 'f') AND
          (pg_catalog.has_table_privilege(role_id, c.oid,
            'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
           OR pg_catalog.has_any_column_privilege(role_id, c.oid,
            'SELECT, INSERT, UPDATE, REFERENCES'))))
    ) OR EXISTS (
      SELECT FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'aso' AND p.proowner = role_id
    ) OR pg_catalog.has_schema_privilege(role_id, 'aso', 'CREATE') THEN
      RAISE EXCEPTION '% already exists with privileged access', role_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles r ON r.oid = m.roleid
    WHERE r.rolname = 'aso_case_owner'
  ) THEN
    RAISE EXCEPTION 'aso_case_owner must have no members';
  END IF;
END;
$$;

INSERT INTO aso.capabilities (key, label, description, is_clinical) VALUES
  ('case:read', 'Read an authorized case',
   'Read a case under verified practice scope.', false),
  ('case_write', 'Prepare a case',
   'Create, edit, and advance nonclinical case state.', false)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  is_clinical = EXCLUDED.is_clinical;

INSERT INTO aso.role_capabilities (role_id, capability_key)
SELECT role.id, grant_key.capability_key
FROM aso.roles role
JOIN (VALUES
  ('staff', 'case:read'),
  ('staff', 'case_write'),
  ('surgeon', 'case:read'),
  ('surgeon', 'case_write')
) AS grant_key(role_key, capability_key) ON grant_key.role_key = role.key
ON CONFLICT DO NOTHING;

ALTER TABLE aso.cases
  ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN case_input_revision bigint NOT NULL DEFAULT 1
    CHECK (case_input_revision > 0),
  ADD COLUMN status_revision bigint NOT NULL DEFAULT 0
    CHECK (status_revision >= 0),
  ADD COLUMN procedure_code text,
  ADD COLUMN plan_key text;

COMMENT ON COLUMN aso.cases.revision IS
  'Monotonic published row revision; advanced by managed case, status, or gate changes.';
COMMENT ON COLUMN aso.cases.case_input_revision IS
  'Invalidation revision for patient, member, plan, payer, procedure, service-date, or facility changes.';
COMMENT ON COLUMN aso.cases.status_revision IS
  'Optimistic revision for case lifecycle transitions.';

CREATE TABLE aso.case_status_transitions (
  from_status text NOT NULL REFERENCES aso.case_statuses(key) ON DELETE RESTRICT,
  to_status text NOT NULL REFERENCES aso.case_statuses(key) ON DELETE RESTRICT,
  PRIMARY KEY (from_status, to_status),
  CHECK (from_status <> to_status)
);

INSERT INTO aso.case_status_transitions (from_status, to_status) VALUES
  ('intake', 'evidence'), ('intake', 'withdrawn'),
  ('evidence', 'policy_review'), ('evidence', 'intake'),
  ('evidence', 'withdrawn'),
  ('policy_review', 'awaiting_gate'), ('policy_review', 'evidence'),
  ('policy_review', 'withdrawn'),
  ('awaiting_gate', 'drafting'), ('awaiting_gate', 'policy_review'),
  ('awaiting_gate', 'withdrawn'),
  ('drafting', 'ready'), ('drafting', 'awaiting_gate'),
  ('drafting', 'withdrawn'),
  ('ready', 'submitted'), ('ready', 'drafting'), ('ready', 'withdrawn'),
  ('submitted', 'approved'), ('submitted', 'denied'),
  ('submitted', 'peer_review'), ('submitted', 'withdrawn'),
  ('peer_review', 'approved'), ('peer_review', 'denied'),
  ('peer_review', 'withdrawn'),
  ('denied', 'denial_review'), ('denied', 'withdrawn'),
  ('denial_review', 'response_drafting'), ('denial_review', 'withdrawn'),
  ('response_drafting', 'response_ready'),
  ('response_drafting', 'denial_review'), ('response_drafting', 'withdrawn'),
  ('response_ready', 'resubmitted'), ('response_ready', 'appealed'),
  ('response_ready', 'response_drafting'), ('response_ready', 'withdrawn'),
  ('resubmitted', 'approved'), ('resubmitted', 'denied'),
  ('resubmitted', 'withdrawn'),
  ('appealed', 'approved'), ('appealed', 'denied'),
  ('appealed', 'peer_review'), ('appealed', 'withdrawn');

REVOKE ALL ON aso.case_status_transitions FROM PUBLIC;

CREATE TABLE aso.case_commands (
  kratos_identity_id uuid NOT NULL,
  practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  command_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES aso.cases(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('create', 'update', 'transition')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  expected_revision bigint CHECK (expected_revision >= 0),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  committed_at timestamptz NOT NULL,
  PRIMARY KEY (kratos_identity_id, practice_id, command_id)
);

COMMENT ON TABLE aso.case_commands IS
  'Lane: server-authoritative relational. Privacy: local. Immutable case command results; excluded from replication.';
ALTER TABLE aso.case_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.case_commands FROM PUBLIC;

GRANT USAGE ON SCHEMA aso TO aso_case_owner, aso_case_executor;
GRANT SELECT (id, kratos_identity_id, practice_id, status, full_name)
  ON aso.users TO aso_case_owner;
GRANT SELECT ON aso.user_roles, aso.user_capabilities, aso.case_statuses,
  aso.case_status_transitions, aso.case_commands TO aso_case_owner;
GRANT SELECT (id, practice_id) ON aso.patients TO aso_case_owner;
GRANT SELECT (id, practice_id, is_active) ON aso.facilities TO aso_case_owner;
GRANT SELECT (id) ON aso.payers TO aso_case_owner;
GRANT SELECT ON aso.cases TO aso_case_owner;
GRANT INSERT (id, practice_id, patient_id, surgeon_id, coordinator_id,
  facility_id, payer_id, case_number, status, member_id, date_of_service,
  data, procedure_code, plan_key)
  ON aso.cases TO aso_case_owner;
GRANT UPDATE (patient_id, surgeon_id, coordinator_id, facility_id, payer_id,
  case_number, status, member_id, date_of_service, data, procedure_code,
  plan_key)
  ON aso.cases TO aso_case_owner;
GRANT INSERT ON aso.case_commands TO aso_case_owner;
GRANT INSERT (practice_id, occurred_at, actor_id, actor_kratos_id, actor_label,
  actor_role, action, outcome, entity_table, entity_id, case_id, summary, data)
  ON aso.audit_events TO aso_case_owner;
DO $$
BEGIN
  EXECUTE format('GRANT USAGE ON SEQUENCE %s TO aso_case_owner',
    pg_catalog.pg_get_serial_sequence('aso.audit_events', 'id'));
END;
$$;

CREATE POLICY cases_case_owner ON aso.cases TO aso_case_owner
  USING (true) WITH CHECK (true);
CREATE POLICY patients_case_owner ON aso.patients TO aso_case_owner
  USING (true);
CREATE POLICY case_commands_owner ON aso.case_commands TO aso_case_owner
  USING (true) WITH CHECK (true);
CREATE POLICY audit_case_insert ON aso.audit_events FOR INSERT TO aso_case_owner
  WITH CHECK (
    actor_id = NULLIF(current_setting('aso.actor_id', true), '')::uuid
    AND actor_kratos_id =
      NULLIF(current_setting('aso.kratos_identity_id', true), '')::uuid
    AND practice_id = NULLIF(current_setting('aso.practice_id', true), '')::uuid
    AND current_setting('aso.principal', true) = 'user'
  );

CREATE FUNCTION aso.case_actor_context(required_capability text)
RETURNS TABLE (
  actor_id uuid,
  identity_id uuid,
  practice_id uuid,
  actor_label text
)
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
      RAISE EXCEPTION 'invalid case session context' USING ERRCODE = '42501';
  END;

  IF required_capability IS NULL
     OR current_setting('aso.principal', true) IS DISTINCT FROM 'user'
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
            AND membership.practice_id = context_practice
       )
       AND EXISTS (
         SELECT FROM aso.user_capabilities capability
          WHERE capability.user_id = user_record.id
            AND capability.practice_id = context_practice
            AND capability.capability_key = required_capability
            AND NOT capability.is_clinical
       );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'case session identity, membership, or capability denied'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION aso.require_case(target_case uuid, required_capability text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  target_practice uuid;
BEGIN
  SELECT * INTO STRICT actor FROM aso.case_actor_context(required_capability);
  SELECT clinical_case.practice_id INTO target_practice
    FROM aso.cases clinical_case WHERE clinical_case.id = target_case;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'case not found' USING ERRCODE = 'P0002';
  END IF;
  IF target_practice IS DISTINCT FROM actor.practice_id THEN
    RAISE EXCEPTION 'case authority denied' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION aso.case_record_json(target_case uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', clinical_case.id,
    'practiceId', clinical_case.practice_id,
    'patientId', clinical_case.patient_id,
    'surgeonId', clinical_case.surgeon_id,
    'coordinatorId', clinical_case.coordinator_id,
    'facilityId', clinical_case.facility_id,
    'payerId', clinical_case.payer_id,
    'caseNumber', clinical_case.case_number,
    'status', clinical_case.status,
    'memberId', clinical_case.member_id,
    'dateOfService', clinical_case.date_of_service,
    'procedureCode', clinical_case.procedure_code,
    'planKey', clinical_case.plan_key,
    'data', clinical_case.data,
    'gateAffirmedAt', clinical_case.gate_affirmed_at,
    'gateAffirmedBy', clinical_case.gate_affirmed_by,
    'revision', clinical_case.revision,
    'caseInputRevision', clinical_case.case_input_revision,
    'statusRevision', clinical_case.status_revision,
    'createdAt', clinical_case.created_at,
    'updatedAt', clinical_case.updated_at)
  FROM aso.cases clinical_case WHERE clinical_case.id = target_case;
$$;

CREATE FUNCTION aso.read_case(target_case uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  PERFORM aso.require_case(target_case, 'case:read');
  RETURN aso.case_record_json(target_case);
END;
$$;

CREATE FUNCTION aso.authorize_case_write_target(target_case uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  PERFORM aso.require_case(target_case, 'case_write');
END;
$$;

CREATE FUNCTION aso.list_cases()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  result jsonb;
BEGIN
  SELECT * INTO STRICT actor FROM aso.case_actor_context('case:read');
  SELECT COALESCE(
    jsonb_agg(aso.case_record_json(clinical_case.id)
      ORDER BY clinical_case.updated_at DESC NULLS LAST,
               clinical_case.created_at DESC, clinical_case.id),
    '[]'::jsonb)
  INTO result
  FROM aso.cases clinical_case
  WHERE clinical_case.practice_id = actor.practice_id;
  RETURN result;
END;
$$;

CREATE FUNCTION aso.lookup_create_case_command(target_command uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  original jsonb;
BEGIN
  SELECT * INTO STRICT actor FROM aso.case_actor_context('case_write');
  SELECT command.result INTO original
    FROM aso.case_commands command
   WHERE command.kratos_identity_id = actor.identity_id
     AND command.practice_id = actor.practice_id
     AND command.command_id = target_command
     AND command.action = 'create';
  RETURN original;
END;
$$;

CREATE FUNCTION aso.lookup_case_command(target_case uuid, target_command uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  original jsonb;
BEGIN
  SELECT * INTO STRICT actor FROM aso.case_actor_context('case_write');
  PERFORM aso.require_case(target_case, 'case_write');
  SELECT command.result INTO original
    FROM aso.case_commands command
   WHERE command.kratos_identity_id = actor.identity_id
     AND command.practice_id = actor.practice_id
     AND command.command_id = target_command
     AND command.case_id = target_case;
  RETURN original;
END;
$$;

CREATE FUNCTION aso.bump_case_revisions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  IF ROW(NEW.patient_id, NEW.surgeon_id, NEW.coordinator_id, NEW.facility_id,
         NEW.payer_id, NEW.case_number, NEW.status, NEW.member_id,
         NEW.date_of_service, NEW.data, NEW.procedure_code, NEW.plan_key,
         NEW.gate_affirmed_at, NEW.gate_affirmed_by)
     IS DISTINCT FROM
     ROW(OLD.patient_id, OLD.surgeon_id, OLD.coordinator_id, OLD.facility_id,
         OLD.payer_id, OLD.case_number, OLD.status, OLD.member_id,
         OLD.date_of_service, OLD.data, OLD.procedure_code, OLD.plan_key,
         OLD.gate_affirmed_at, OLD.gate_affirmed_by) THEN
    NEW.revision := OLD.revision + 1;
  ELSE
    NEW.revision := OLD.revision;
  END IF;

  IF ROW(NEW.patient_id, NEW.facility_id, NEW.payer_id, NEW.member_id,
         NEW.date_of_service, NEW.procedure_code, NEW.plan_key)
     IS DISTINCT FROM
     ROW(OLD.patient_id, OLD.facility_id, OLD.payer_id, OLD.member_id,
         OLD.date_of_service, OLD.procedure_code, OLD.plan_key) THEN
    NEW.case_input_revision := OLD.case_input_revision + 1;
  ELSE
    NEW.case_input_revision := OLD.case_input_revision;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_revision := OLD.status_revision + 1;
  ELSE
    NEW.status_revision := OLD.status_revision;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cases_revisions
  BEFORE UPDATE ON aso.cases
  FOR EACH ROW EXECUTE FUNCTION aso.bump_case_revisions();

CREATE FUNCTION aso.case_commands_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'case command results are immutable' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER case_commands_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON aso.case_commands
  FOR EACH STATEMENT EXECUTE FUNCTION aso.case_commands_immutable();

CREATE FUNCTION aso.require_case_reference_scope(
  actor_practice uuid,
  target_patient uuid,
  target_surgeon uuid,
  target_coordinator uuid,
  target_facility uuid,
  target_payer uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  IF actor_practice IS NULL OR target_patient IS NULL OR target_surgeon IS NULL
     OR target_payer IS NULL
     OR NOT EXISTS (
       SELECT FROM aso.patients patient
        WHERE patient.id = target_patient
          AND patient.practice_id = actor_practice)
     OR NOT EXISTS (
       SELECT FROM aso.users surgeon
        WHERE surgeon.id = target_surgeon AND surgeon.status = 'active'
          AND EXISTS (
            SELECT FROM aso.user_roles membership
             WHERE membership.user_id = surgeon.id
               AND membership.practice_id = actor_practice))
     OR (target_coordinator IS NOT NULL AND NOT EXISTS (
       SELECT FROM aso.users coordinator
        WHERE coordinator.id = target_coordinator
          AND coordinator.status = 'active'
          AND EXISTS (
            SELECT FROM aso.user_roles membership
             WHERE membership.user_id = coordinator.id
               AND membership.practice_id = actor_practice)))
     OR (target_facility IS NOT NULL AND NOT EXISTS (
       SELECT FROM aso.facilities facility
        WHERE facility.id = target_facility
          AND facility.practice_id = actor_practice
          AND facility.is_active))
     OR NOT EXISTS (SELECT FROM aso.payers payer WHERE payer.id = target_payer)
  THEN
    RAISE EXCEPTION 'case reference scope denied' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION aso.create_case_command(
  target_command uuid,
  target_case uuid,
  target_case_number text,
  target_patient uuid,
  target_surgeon uuid,
  target_coordinator uuid,
  target_facility uuid,
  target_payer uuid,
  target_member_id text,
  target_date_of_service date,
  target_procedure_code text,
  target_plan_key text,
  target_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  original aso.case_commands%ROWTYPE;
  payload jsonb;
  result jsonb;
  committed_at timestamptz;
BEGIN
  SELECT * INTO STRICT actor FROM aso.case_actor_context('case_write');
  payload := jsonb_build_object(
    'caseId', target_case,
    'caseNumber', target_case_number,
    'patientId', target_patient,
    'surgeonId', target_surgeon,
    'coordinatorId', target_coordinator,
    'facilityId', target_facility,
    'payerId', target_payer,
    'memberId', target_member_id,
    'dateOfService', target_date_of_service,
    'procedureCode', target_procedure_code,
    'planKey', target_plan_key,
    'data', COALESCE(target_data, '{}'::jsonb));

  IF target_command IS NULL OR target_case IS NULL
     OR NULLIF(btrim(target_case_number), '') IS NULL
     OR target_patient IS NULL OR target_surgeon IS NULL OR target_payer IS NULL
     OR target_data IS NULL OR jsonb_typeof(target_data) <> 'object' THEN
    RAISE EXCEPTION 'invalid case create payload' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    actor.identity_id::text || ':' || actor.practice_id::text || ':' ||
    target_command::text, 0));
  SELECT * INTO original FROM aso.case_commands command
   WHERE command.kratos_identity_id = actor.identity_id
     AND command.practice_id = actor.practice_id
     AND command.command_id = target_command;
  IF FOUND THEN
    IF original.action IS DISTINCT FROM 'create'
       OR original.case_id IS DISTINCT FROM target_case
       OR original.actor_id IS DISTINCT FROM actor.actor_id
       OR original.payload IS DISTINCT FROM payload THEN
      RAISE EXCEPTION 'case command ID has a different payload'
        USING ERRCODE = '23505';
    END IF;
    RETURN original.result;
  END IF;

  PERFORM aso.require_case_reference_scope(
    actor.practice_id, target_patient, target_surgeon, target_coordinator,
    target_facility, target_payer);

  committed_at := clock_timestamp();
  INSERT INTO aso.cases (
    id, practice_id, patient_id, surgeon_id, coordinator_id, facility_id,
    payer_id, case_number, status, member_id, date_of_service, data,
    procedure_code, plan_key)
  VALUES (
    target_case, actor.practice_id, target_patient, target_surgeon,
    target_coordinator, target_facility, target_payer,
    btrim(target_case_number), 'intake', NULLIF(btrim(target_member_id), ''),
    target_date_of_service, target_data,
    NULLIF(btrim(target_procedure_code), ''), NULLIF(btrim(target_plan_key), ''));

  result := jsonb_build_object(
    'commandId', target_command,
    'action', 'create',
    'caseId', target_case,
    'committedAt', committed_at);
  INSERT INTO aso.case_commands (
    kratos_identity_id, practice_id, command_id, actor_id, case_id, action,
    payload, expected_revision, result, committed_at)
  VALUES (
    actor.identity_id, actor.practice_id, target_command, actor.actor_id,
    target_case, 'create', payload, NULL, result, committed_at);
  INSERT INTO aso.audit_events (
    practice_id, occurred_at, actor_id, actor_kratos_id, actor_label,
    actor_role, action, outcome, entity_table, entity_id, case_id, summary, data)
  VALUES (
    actor.practice_id, committed_at, actor.actor_id, actor.identity_id,
    actor.actor_label, 'case:case_write', 'case.create', 'success', 'cases',
    target_case, target_case, 'Authorization case created',
    jsonb_build_object('commandId', target_command));
  RETURN result;
END;
$$;

CREATE FUNCTION aso.update_case_command(
  target_command uuid,
  target_case uuid,
  expected_case_revision bigint,
  target_case_number text,
  target_patient uuid,
  target_surgeon uuid,
  target_coordinator uuid,
  target_facility uuid,
  target_payer uuid,
  target_member_id text,
  target_date_of_service date,
  target_procedure_code text,
  target_plan_key text,
  target_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  original aso.case_commands%ROWTYPE;
  current_case aso.cases%ROWTYPE;
  payload jsonb;
  result jsonb;
  committed_at timestamptz;
BEGIN
  SELECT * INTO STRICT actor FROM aso.case_actor_context('case_write');
  payload := jsonb_build_object(
    'caseId', target_case,
    'expectedRevision', expected_case_revision,
    'caseNumber', target_case_number,
    'patientId', target_patient,
    'surgeonId', target_surgeon,
    'coordinatorId', target_coordinator,
    'facilityId', target_facility,
    'payerId', target_payer,
    'memberId', target_member_id,
    'dateOfService', target_date_of_service,
    'procedureCode', target_procedure_code,
    'planKey', target_plan_key,
    'data', COALESCE(target_data, '{}'::jsonb));

  IF target_command IS NULL OR target_case IS NULL
     OR expected_case_revision IS NULL OR expected_case_revision <= 0
     OR NULLIF(btrim(target_case_number), '') IS NULL
     OR target_patient IS NULL OR target_surgeon IS NULL OR target_payer IS NULL
     OR target_data IS NULL OR jsonb_typeof(target_data) <> 'object' THEN
    RAISE EXCEPTION 'invalid case update payload' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    actor.identity_id::text || ':' || actor.practice_id::text || ':' ||
    target_command::text, 0));
  SELECT * INTO original FROM aso.case_commands command
   WHERE command.kratos_identity_id = actor.identity_id
     AND command.practice_id = actor.practice_id
     AND command.command_id = target_command;
  IF FOUND THEN
    IF original.action IS DISTINCT FROM 'update'
       OR original.case_id IS DISTINCT FROM target_case
       OR original.actor_id IS DISTINCT FROM actor.actor_id
       OR original.expected_revision IS DISTINCT FROM expected_case_revision
       OR original.payload IS DISTINCT FROM payload THEN
      RAISE EXCEPTION 'case command ID has a different payload'
        USING ERRCODE = '23505';
    END IF;
    RETURN original.result;
  END IF;

  PERFORM aso.require_case(target_case, 'case_write');
  SELECT * INTO STRICT current_case FROM aso.cases clinical_case
    WHERE clinical_case.id = target_case FOR UPDATE;
  PERFORM aso.require_case(target_case, 'case_write');
  IF current_case.revision <> expected_case_revision THEN
    RAISE EXCEPTION 'case revision is stale' USING ERRCODE = '40001';
  END IF;
  PERFORM aso.require_case_reference_scope(
    actor.practice_id, target_patient, target_surgeon, target_coordinator,
    target_facility, target_payer);

  committed_at := clock_timestamp();
  UPDATE aso.cases SET
    patient_id = target_patient,
    surgeon_id = target_surgeon,
    coordinator_id = target_coordinator,
    facility_id = target_facility,
    payer_id = target_payer,
    case_number = btrim(target_case_number),
    member_id = NULLIF(btrim(target_member_id), ''),
    date_of_service = target_date_of_service,
    procedure_code = NULLIF(btrim(target_procedure_code), ''),
    plan_key = NULLIF(btrim(target_plan_key), ''),
    data = target_data
  WHERE id = target_case;

  result := jsonb_build_object(
    'commandId', target_command,
    'action', 'update',
    'caseId', target_case,
    'committedAt', committed_at);
  INSERT INTO aso.case_commands (
    kratos_identity_id, practice_id, command_id, actor_id, case_id, action,
    payload, expected_revision, result, committed_at)
  VALUES (
    actor.identity_id, actor.practice_id, target_command, actor.actor_id,
    target_case, 'update', payload, expected_case_revision, result, committed_at);
  INSERT INTO aso.audit_events (
    practice_id, occurred_at, actor_id, actor_kratos_id, actor_label,
    actor_role, action, outcome, entity_table, entity_id, case_id, summary, data)
  VALUES (
    actor.practice_id, committed_at, actor.actor_id, actor.identity_id,
    actor.actor_label, 'case:case_write', 'case.update', 'success', 'cases',
    target_case, target_case, 'Authorization case updated',
    jsonb_build_object('commandId', target_command,
      'expectedRevision', expected_case_revision));
  RETURN result;
END;
$$;

CREATE FUNCTION aso.transition_case_command(
  target_command uuid,
  target_case uuid,
  expected_status_revision bigint,
  target_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  original aso.case_commands%ROWTYPE;
  current_case aso.cases%ROWTYPE;
  payload jsonb;
  result jsonb;
  committed_at timestamptz;
BEGIN
  SELECT * INTO STRICT actor FROM aso.case_actor_context('case_write');
  payload := jsonb_build_object(
    'caseId', target_case,
    'expectedStatusRevision', expected_status_revision,
    'targetStatus', target_status);
  IF target_command IS NULL OR target_case IS NULL
     OR expected_status_revision IS NULL OR expected_status_revision < 0
     OR target_status IS NULL THEN
    RAISE EXCEPTION 'invalid case transition payload' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    actor.identity_id::text || ':' || actor.practice_id::text || ':' ||
    target_command::text, 0));
  SELECT * INTO original FROM aso.case_commands command
   WHERE command.kratos_identity_id = actor.identity_id
     AND command.practice_id = actor.practice_id
     AND command.command_id = target_command;
  IF FOUND THEN
    IF original.action IS DISTINCT FROM 'transition'
       OR original.case_id IS DISTINCT FROM target_case
       OR original.actor_id IS DISTINCT FROM actor.actor_id
       OR original.expected_revision IS DISTINCT FROM expected_status_revision
       OR original.payload IS DISTINCT FROM payload THEN
      RAISE EXCEPTION 'case command ID has a different payload'
        USING ERRCODE = '23505';
    END IF;
    RETURN original.result;
  END IF;

  PERFORM aso.require_case(target_case, 'case_write');
  SELECT * INTO STRICT current_case FROM aso.cases clinical_case
    WHERE clinical_case.id = target_case FOR UPDATE;
  PERFORM aso.require_case(target_case, 'case_write');
  IF current_case.status_revision <> expected_status_revision THEN
    RAISE EXCEPTION 'case status revision is stale' USING ERRCODE = '40001';
  END IF;
  IF NOT EXISTS (
    SELECT FROM aso.case_status_transitions transition
     WHERE transition.from_status = current_case.status
       AND transition.to_status = target_status) THEN
    RAISE EXCEPTION 'invalid case status transition' USING ERRCODE = '23514';
  END IF;
  IF current_case.status = 'intake' AND target_status = 'evidence'
     AND (NULLIF(btrim(current_case.member_id), '') IS NULL
       OR NULLIF(btrim(current_case.plan_key), '') IS NULL
       OR NULLIF(btrim(current_case.procedure_code), '') IS NULL
       OR current_case.date_of_service IS NULL) THEN
    RAISE EXCEPTION 'case inputs are incomplete' USING ERRCODE = '23514';
  END IF;

  committed_at := clock_timestamp();
  UPDATE aso.cases SET status = target_status WHERE id = target_case;
  result := jsonb_build_object(
    'commandId', target_command,
    'action', 'transition',
    'caseId', target_case,
    'committedAt', committed_at);
  INSERT INTO aso.case_commands (
    kratos_identity_id, practice_id, command_id, actor_id, case_id, action,
    payload, expected_revision, result, committed_at)
  VALUES (
    actor.identity_id, actor.practice_id, target_command, actor.actor_id,
    target_case, 'transition', payload, expected_status_revision, result,
    committed_at);
  INSERT INTO aso.audit_events (
    practice_id, occurred_at, actor_id, actor_kratos_id, actor_label,
    actor_role, action, outcome, entity_table, entity_id, case_id, summary, data)
  VALUES (
    actor.practice_id, committed_at, actor.actor_id, actor.identity_id,
    actor.actor_label, 'case:case_write', 'case.transition', 'success', 'cases',
    target_case, target_case, 'Authorization case status changed',
    jsonb_build_object('commandId', target_command,
      'fromStatus', current_case.status, 'toStatus', target_status,
      'expectedStatusRevision', expected_status_revision));
  RETURN result;
END;
$$;

GRANT CREATE ON SCHEMA aso TO aso_case_owner;
DO $$
DECLARE
  signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'aso.case_actor_context(text)',
    'aso.require_case(uuid,text)',
    'aso.case_record_json(uuid)',
    'aso.read_case(uuid)',
    'aso.authorize_case_write_target(uuid)',
    'aso.list_cases()',
    'aso.lookup_create_case_command(uuid)',
    'aso.lookup_case_command(uuid,uuid)',
    'aso.bump_case_revisions()',
    'aso.case_commands_immutable()',
    'aso.require_case_reference_scope(uuid,uuid,uuid,uuid,uuid,uuid)',
    'aso.create_case_command(uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,text,date,text,text,jsonb)',
    'aso.update_case_command(uuid,uuid,bigint,text,uuid,uuid,uuid,uuid,uuid,text,date,text,text,jsonb)',
    'aso.transition_case_command(uuid,uuid,bigint,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', signature);
    EXECUTE format('ALTER FUNCTION %s OWNER TO aso_case_owner', signature);
  END LOOP;
END;
$$;
REVOKE CREATE ON SCHEMA aso FROM aso_case_owner;

GRANT EXECUTE ON FUNCTION
  aso.read_case(uuid),
  aso.authorize_case_write_target(uuid),
  aso.list_cases(),
  aso.lookup_create_case_command(uuid),
  aso.lookup_case_command(uuid,uuid),
  aso.create_case_command(
    uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,text,date,text,text,jsonb),
  aso.update_case_command(
    uuid,uuid,bigint,text,uuid,uuid,uuid,uuid,uuid,text,date,text,text,jsonb),
  aso.transition_case_command(uuid,uuid,bigint,text)
TO aso_case_executor;

-- The deployment provisions a non-owner login with only aso_case_executor
-- membership. Transactions SET LOCAL ROLE aso_case_executor and verified
-- transaction-local session settings before calling these functions.
