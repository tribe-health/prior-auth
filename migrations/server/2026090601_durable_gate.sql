-- RA-02. Applied transactionally by the checksummed server migrator after
-- schema.sql and 25-session-authority.sql, on both fresh and existing stores.
-- gate_commands lane: server-authoritative relational. Privacy: local.
-- Original clinical command results and their audit are never replicated.
-- The trusted host supplies verified, transaction-local session settings.
-- A database credential is not a Kratos verifier: never expose it to clients.

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
    RAISE EXCEPTION 'local gate command data requires explicit-table publications';
  END IF;

  FOREACH role_name IN ARRAY ARRAY['aso_gate_owner', 'aso_gate_executor'] LOOP
    SELECT oid INTO role_id FROM pg_catalog.pg_roles WHERE rolname = role_name;
    IF role_id IS NULL THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', role_name);
    ELSE
      IF EXISTS (
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
    END IF;
  END LOOP;
  -- Membership in the definer owner would expose its table grants directly.
  IF EXISTS (
    SELECT FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles r ON r.oid = m.roleid
    WHERE r.rolname = 'aso_gate_owner'
  ) THEN
    RAISE EXCEPTION 'aso_gate_owner must have no members';
  END IF;
END;
$$;

CREATE TABLE aso.gate_commands (
  kratos_identity_id uuid NOT NULL,
  practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  command_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES aso.cases(id) ON DELETE RESTRICT,
  kind text NOT NULL REFERENCES aso.gate_affirmation_kinds(key),
  action text NOT NULL CHECK (action IN ('affirm', 'remove')),
  result jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  PRIMARY KEY (kratos_identity_id, practice_id, command_id)
);
COMMENT ON TABLE aso.gate_commands IS
  'Lane: server-authoritative relational. Privacy: local. Immutable clinical command results; excluded from replication.';
ALTER TABLE aso.gate_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.gate_commands FROM PUBLIC;

GRANT USAGE ON SCHEMA aso TO aso_gate_owner, aso_gate_executor;
GRANT SELECT (id, kratos_identity_id, practice_id, status, full_name)
  ON aso.users TO aso_gate_owner;
GRANT SELECT ON aso.user_roles, aso.user_capabilities,
  aso.gate_affirmation_kinds, aso.gate_affirmations, aso.gate_commands
  TO aso_gate_owner;
GRANT SELECT (id, practice_id, gate_affirmed_at, gate_affirmed_by),
  UPDATE (gate_affirmed_at, gate_affirmed_by) ON aso.cases TO aso_gate_owner;
GRANT INSERT (case_id, kind, affirmed_by, affirmed_at),
  UPDATE (affirmed_by, affirmed_at), DELETE ON aso.gate_affirmations
  TO aso_gate_owner;
GRANT INSERT ON aso.gate_commands TO aso_gate_owner;
GRANT INSERT (practice_id, occurred_at, actor_id, actor_kratos_id, actor_label,
  actor_role, action, outcome, entity_table, entity_id, case_id, summary, data)
  ON aso.audit_events TO aso_gate_owner;
DO $$
BEGIN
  EXECUTE format('GRANT USAGE ON SEQUENCE %s TO aso_gate_owner',
    pg_catalog.pg_get_serial_sequence('aso.audit_events', 'id'));
END;
$$;

-- The owner can see case scope to distinguish missing from foreign cases;
-- public functions check that scope before returning any clinical data.
CREATE POLICY cases_gate_owner ON aso.cases TO aso_gate_owner
  USING (true) WITH CHECK (true);
CREATE POLICY gate_commands_owner ON aso.gate_commands TO aso_gate_owner
  USING (true) WITH CHECK (true);
CREATE POLICY audit_gate_insert ON aso.audit_events FOR INSERT TO aso_gate_owner
  WITH CHECK (
    actor_id = NULLIF(current_setting('aso.actor_id', true), '')::uuid
    AND actor_kratos_id = NULLIF(current_setting('aso.kratos_identity_id', true), '')::uuid
    AND practice_id = NULLIF(current_setting('aso.practice_id', true), '')::uuid
    AND current_setting('aso.principal', true) = 'user'
  );

CREATE FUNCTION aso.gate_actor_context()
RETURNS TABLE (actor_id uuid, identity_id uuid, practice_id uuid, actor_label text)
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
    context_identity := NULLIF(current_setting('aso.kratos_identity_id', true), '')::uuid;
    context_practice := NULLIF(current_setting('aso.practice_id', true), '')::uuid;
    context_expiry := NULLIF(current_setting('aso.session_expires_at', true), '')::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'invalid gate session context' USING ERRCODE = '42501';
  END;
  IF current_setting('aso.principal', true) IS DISTINCT FROM 'user'
     OR context_actor IS NULL OR context_identity IS NULL OR context_practice IS NULL
     OR context_expiry IS NULL OR NOT isfinite(context_expiry)
     OR context_expiry <= clock_timestamp() THEN
    RAISE EXCEPTION 'active human session required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT u.id, u.kratos_identity_id, context_practice, u.full_name
    FROM aso.users u
    WHERE u.id = context_actor AND u.kratos_identity_id = context_identity
      AND u.status = 'active'
      AND EXISTS (SELECT FROM aso.user_roles ur
        WHERE ur.user_id = u.id AND ur.practice_id = context_practice);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gate session identity or membership denied' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION aso.require_gate_case(target_case uuid, clinical boolean)
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
  SELECT c.practice_id INTO case_practice FROM aso.cases c WHERE c.id = target_case;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gate case not found' USING ERRCODE = 'P0002';
  END IF;
  IF case_practice <> actor.practice_id OR (clinical AND NOT EXISTS (
    SELECT FROM aso.user_capabilities uc
    WHERE uc.user_id = actor.actor_id AND uc.practice_id = actor.practice_id
      AND uc.capability_key = 'affirm_gate' AND uc.is_clinical
  )) THEN
    RAISE EXCEPTION 'gate case authority denied' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION aso.read_gate(target_case uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  result jsonb;
BEGIN
  PERFORM aso.require_gate_case(target_case, false);
  SELECT jsonb_build_object(
    'caseId', c.id,
    'affirmed', COALESCE((
      SELECT jsonb_agg(a.kind ORDER BY k.ordinal)
      FROM aso.gate_affirmations a JOIN aso.gate_affirmation_kinds k ON k.key = a.kind
      WHERE a.case_id = c.id
    ), '[]'::jsonb),
    'gateAffirmedAt', c.gate_affirmed_at,
    'gateAffirmedBy', c.gate_affirmed_by)
    INTO result FROM aso.cases c WHERE c.id = target_case;
  RETURN result;
END;
$$;

CREATE FUNCTION aso.may_affirm_gate(target_case uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  PERFORM aso.require_gate_case(target_case, true);
  RETURN true;
EXCEPTION WHEN insufficient_privilege OR no_data_found THEN
  RETURN false;
END;
$$;

CREATE FUNCTION aso.lookup_gate_command(target_command uuid)
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
  SELECT g.result INTO original FROM aso.gate_commands g
    WHERE g.kratos_identity_id = actor.identity_id
      AND g.practice_id = actor.practice_id AND g.command_id = target_command;
  RETURN original;
END;
$$;

-- This trigger is an independent database boundary. It checks DELETE too,
-- and never infers authority from the affirmer stored on an existing row.
CREATE OR REPLACE FUNCTION aso.enforce_gate_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  target_case uuid;
BEGIN
  IF current_user <> 'aso_gate_owner' THEN
    RAISE EXCEPTION 'gate writes require the command function' USING ERRCODE = '42501';
  END IF;
  target_case := CASE WHEN TG_OP = 'DELETE' THEN OLD.case_id ELSE NEW.case_id END;
  SELECT * INTO STRICT actor FROM aso.gate_actor_context();
  PERFORM aso.require_gate_case(target_case, true);
  PERFORM c.id FROM aso.cases c WHERE c.id = target_case FOR UPDATE;
  IF TG_OP <> 'DELETE' AND NEW.affirmed_by <> actor.actor_id THEN
    RAISE EXCEPTION 'gate affirmer must be the verified actor' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.case_id <> OLD.case_id OR NEW.kind <> OLD.kind) THEN
    RAISE EXCEPTION 'gate affirmation identity is immutable' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER gate_affirmations_authority
  BEFORE INSERT OR UPDATE OR DELETE ON aso.gate_affirmations
  FOR EACH ROW EXECUTE FUNCTION aso.enforce_gate_authority();

CREATE OR REPLACE FUNCTION aso.refresh_case_gate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  target_case uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.case_id ELSE NEW.case_id END;
  last_by uuid;
  last_at timestamptz;
BEGIN
  IF current_user <> 'aso_gate_owner' THEN
    RAISE EXCEPTION 'gate summary requires the command function' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT FROM aso.gate_affirmation_kinds k
    WHERE NOT EXISTS (SELECT FROM aso.gate_affirmations a
      WHERE a.case_id = target_case AND a.kind = k.key)
  ) THEN
    SELECT a.affirmed_at, a.affirmed_by INTO last_at, last_by
      FROM aso.gate_affirmations a WHERE a.case_id = target_case
      ORDER BY a.affirmed_at DESC, a.kind DESC LIMIT 1;
  END IF;
  UPDATE aso.cases SET gate_affirmed_at = last_at, gate_affirmed_by = last_by
    WHERE id = target_case;
  RETURN NULL;
END;
$$;

-- Existing installations allowed direct summary writes. Reconcile those
-- rows before protecting the derived columns, retaining valid complete gates
-- and leaving already-correct pairs (and their updated_at values) untouched.
WITH expected_gate AS (
  SELECT c.id, latest.affirmed_at, latest.affirmed_by
  FROM aso.cases c
  LEFT JOIN LATERAL (
    SELECT a.affirmed_at, a.affirmed_by
    FROM aso.gate_affirmations a
    WHERE a.case_id = c.id AND NOT EXISTS (
      SELECT FROM aso.gate_affirmation_kinds k
      WHERE NOT EXISTS (
        SELECT FROM aso.gate_affirmations required
        WHERE required.case_id = c.id AND required.kind = k.key
      )
    )
    ORDER BY a.affirmed_at DESC, a.kind DESC
    LIMIT 1
  ) latest ON true
)
UPDATE aso.cases c
  SET gate_affirmed_at = expected.affirmed_at,
      gate_affirmed_by = expected.affirmed_by
  FROM expected_gate expected
  WHERE c.id = expected.id
    AND (c.gate_affirmed_at, c.gate_affirmed_by)
      IS DISTINCT FROM (expected.affirmed_at, expected.affirmed_by);

CREATE FUNCTION aso.guard_case_gate_summary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.gate_affirmed_at IS NOT NULL OR NEW.gate_affirmed_by IS NOT NULL THEN
      RAISE EXCEPTION 'gate summary is derived from affirmations' USING ERRCODE = '42501';
    END IF;
  ELSIF (NEW.gate_affirmed_at IS DISTINCT FROM OLD.gate_affirmed_at
      OR NEW.gate_affirmed_by IS DISTINCT FROM OLD.gate_affirmed_by)
      AND (current_user <> 'aso_gate_owner' OR pg_trigger_depth() <> 2) THEN
    RAISE EXCEPTION 'gate summary is derived from affirmations' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cases_gate_summary_guard
  BEFORE INSERT OR UPDATE OF gate_affirmed_at, gate_affirmed_by ON aso.cases
  FOR EACH ROW EXECUTE FUNCTION aso.guard_case_gate_summary();

CREATE FUNCTION aso.gate_commands_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'gate command results are immutable' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER gate_commands_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON aso.gate_commands
  FOR EACH STATEMENT EXECUTE FUNCTION aso.gate_commands_immutable();

CREATE FUNCTION aso.apply_gate_command(
  target_command uuid, target_case uuid, target_kind text, target_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  original aso.gate_commands%ROWTYPE;
  result jsonb;
  committed_at timestamptz;
BEGIN
  SELECT * INTO STRICT actor FROM aso.gate_actor_context();
  IF target_command IS NULL THEN
    RAISE EXCEPTION 'invalid gate command payload' USING ERRCODE = '22023';
  END IF;

  -- Compare an identity/practice-scoped command before target-case authority.
  -- The caller already owns this opaque command ID; doing so makes conflicts
  -- explicit without exposing another identity or practice's command ledger.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    actor.identity_id::text || ':' || actor.practice_id::text || ':' || target_command::text, 0));
  SELECT * INTO original FROM aso.gate_commands g
    WHERE g.kratos_identity_id = actor.identity_id
      AND g.practice_id = actor.practice_id AND g.command_id = target_command;
  IF FOUND THEN
    IF original.case_id IS DISTINCT FROM target_case
       OR original.kind IS DISTINCT FROM target_kind
       OR original.action IS DISTINCT FROM target_action
       OR original.actor_id IS DISTINCT FROM actor.actor_id THEN
      RAISE EXCEPTION 'gate command ID has a different payload' USING ERRCODE = '23505';
    END IF;
  END IF;

  IF target_case IS NULL OR target_kind IS NULL OR target_action IS NULL
     OR target_action NOT IN ('affirm', 'remove') OR NOT EXISTS (
       SELECT FROM aso.gate_affirmation_kinds WHERE key = target_kind
     ) THEN
    RAISE EXCEPTION 'invalid gate command payload' USING ERRCODE = '22023';
  END IF;
  PERFORM aso.require_gate_case(target_case, true);
  PERFORM c.id FROM aso.cases c WHERE c.id = target_case FOR UPDATE;
  -- Locks can wait beyond session expiry or an authority change.
  PERFORM aso.require_gate_case(target_case, true);
  IF original.command_id IS NOT NULL THEN
    RETURN original.result;
  END IF;

  committed_at := clock_timestamp();
  IF target_action = 'affirm' THEN
    INSERT INTO aso.gate_affirmations (case_id, kind, affirmed_by, affirmed_at)
      VALUES (target_case, target_kind, actor.actor_id, committed_at)
      ON CONFLICT (case_id, kind) DO UPDATE
        SET affirmed_by = EXCLUDED.affirmed_by, affirmed_at = EXCLUDED.affirmed_at;
  ELSE
    DELETE FROM aso.gate_affirmations WHERE case_id = target_case AND kind = target_kind;
  END IF;

  result := jsonb_build_object(
    'commandId', target_command, 'caseId', target_case,
    'kind', target_kind, 'action', target_action,
    'gate', aso.read_gate(target_case), 'committedAt', committed_at);
  INSERT INTO aso.audit_events (
    practice_id, occurred_at, actor_id, actor_kratos_id, actor_label, actor_role,
    action, outcome, entity_table, entity_id, case_id, summary, data)
  VALUES (
    actor.practice_id, committed_at, actor.actor_id, actor.identity_id,
    actor.actor_label, 'clinical:affirm_gate', 'gate.' || target_action, 'success',
    'gate_affirmations', target_case, target_case,
    'Surgeon gate ' || target_kind || ': ' || target_action,
    jsonb_build_object('commandId', target_command, 'kind', target_kind));
  INSERT INTO aso.gate_commands (
    kratos_identity_id, practice_id, command_id, actor_id, case_id,
    kind, action, result, committed_at)
  VALUES (actor.identity_id, actor.practice_id, target_command, actor.actor_id,
    target_case, target_kind, target_action, result, committed_at);
  RETURN result;
END;
$$;

-- Transfer only the bounded functions. No runtime role may become the owner.
-- CREATE is temporary for ownership transfer and revoked in this transaction.
GRANT CREATE ON SCHEMA aso TO aso_gate_owner;
DO $$
DECLARE
  signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'aso.gate_actor_context()', 'aso.require_gate_case(uuid,boolean)',
    'aso.read_gate(uuid)', 'aso.may_affirm_gate(uuid)',
    'aso.lookup_gate_command(uuid)', 'aso.enforce_gate_authority()',
    'aso.refresh_case_gate()', 'aso.guard_case_gate_summary()',
    'aso.gate_commands_immutable()', 'aso.apply_gate_command(uuid,uuid,text,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', signature);
    EXECUTE format('ALTER FUNCTION %s OWNER TO aso_gate_owner', signature);
  END LOOP;
END;
$$;
REVOKE CREATE ON SCHEMA aso FROM aso_gate_owner;
GRANT EXECUTE ON FUNCTION aso.read_gate(uuid), aso.may_affirm_gate(uuid),
  aso.lookup_gate_command(uuid), aso.apply_gate_command(uuid,uuid,text,text)
  TO aso_gate_executor;

-- Provision a separate non-owner LOGIN through deployment secrets with only
-- aso_gate_executor membership. Transactions SET LOCAL ROLE aso_gate_executor.
-- aso_session_reader is deliberately unchanged.
