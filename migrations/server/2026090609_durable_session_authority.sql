-- RA06c-01. Durable session denials and membership authority events are
-- server-authoritative control data. They stay outside Electric replication.

CREATE TABLE IF NOT EXISTS aso.authority_deployment (
  singleton     boolean PRIMARY KEY CHECK (singleton),
  deployment_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO aso.authority_deployment (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS aso.authorization_revision (
  singleton   boolean PRIMARY KEY CHECK (singleton),
  incarnation uuid NOT NULL DEFAULT gen_random_uuid(),
  revision    bigint NOT NULL CHECK (revision > 0)
);

ALTER TABLE aso.authorization_revision
  ADD COLUMN IF NOT EXISTS incarnation uuid NOT NULL DEFAULT gen_random_uuid();

INSERT INTO aso.authorization_revision (singleton, revision)
VALUES (true, 1)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS aso.session_denials (
  deployment_id       uuid NOT NULL REFERENCES aso.authority_deployment(deployment_id)
                        ON DELETE RESTRICT,
  kratos_issuer       text NOT NULL CHECK (btrim(kratos_issuer) <> ''),
  kratos_session_id   text NOT NULL CHECK (btrim(kratos_session_id) <> ''),
  session_expires_at  timestamptz NOT NULL,
  skew_allowance      interval NOT NULL DEFAULT interval '1 second'
                        CHECK (skew_allowance >= interval '0 seconds'),
  retain_until        timestamptz NOT NULL,
  confirmation_state  text NOT NULL DEFAULT 'pending'
                        CHECK (confirmation_state IN ('pending', 'confirmed')),
  attempt_count       bigint NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at     timestamptz,
  lease_token         uuid,
  lease_expires_at    timestamptz,
  last_attempt_at     timestamptz,
  confirmed_at        timestamptz,
  last_error_code     text,
  created_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (deployment_id, kratos_issuer, kratos_session_id),
  CONSTRAINT session_denials_retention_exact CHECK (
    retain_until = session_expires_at + skew_allowance
  ),
  CONSTRAINT session_denials_lease_complete CHECK (
    (lease_token IS NULL) = (lease_expires_at IS NULL)
  ),
  CONSTRAINT session_denials_state_complete CHECK (
    (confirmation_state = 'pending' AND confirmed_at IS NULL AND next_attempt_at IS NOT NULL)
    OR
    (confirmation_state = 'confirmed' AND confirmed_at IS NOT NULL
      AND next_attempt_at IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS session_denials_retry_ix
  ON aso.session_denials (next_attempt_at, lease_expires_at)
  WHERE confirmation_state = 'pending';
CREATE INDEX IF NOT EXISTS session_denials_retention_ix
  ON aso.session_denials (retain_until);

CREATE TABLE IF NOT EXISTS aso.authority_outbox (
  sequence               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id               uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  event_type             text NOT NULL
                           CHECK (event_type IN ('membership_revision', 'session_denied')),
  deployment_id          uuid NOT NULL REFERENCES aso.authority_deployment(deployment_id)
                           ON DELETE RESTRICT,
  authority_incarnation  uuid NOT NULL,
  authorization_revision bigint NOT NULL CHECK (authorization_revision > 0),
  kratos_issuer          text,
  kratos_session_id      text,
  occurred_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT authority_outbox_session_shape CHECK (
    (event_type = 'membership_revision'
      AND kratos_issuer IS NULL AND kratos_session_id IS NULL)
    OR
    (event_type = 'session_denied'
      AND kratos_issuer IS NOT NULL AND kratos_session_id IS NOT NULL
      AND btrim(kratos_issuer) <> '' AND btrim(kratos_session_id) <> '')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS authority_outbox_membership_revision_ux
  ON aso.authority_outbox (
    deployment_id, authority_incarnation, authorization_revision
  ) WHERE event_type = 'membership_revision';
CREATE UNIQUE INDEX IF NOT EXISTS authority_outbox_session_denial_ux
  ON aso.authority_outbox (deployment_id, kratos_issuer, kratos_session_id)
  WHERE event_type = 'session_denied';

COMMENT ON TABLE aso.authority_deployment IS
  'Privacy: local; deployment identity excluded from replication.';
COMMENT ON TABLE aso.authorization_revision IS
  'Privacy: local; authorization fence excluded from replication.';
COMMENT ON TABLE aso.session_denials IS
  'Privacy: local; session denial and retry journal excluded from replication.';
COMMENT ON TABLE aso.authority_outbox IS
  'Privacy: local; replayable authority events excluded from replication.';

REVOKE ALL ON aso.authority_deployment, aso.authorization_revision,
  aso.session_denials, aso.authority_outbox FROM PUBLIC;
REVOKE ALL ON SEQUENCE aso.authority_outbox_sequence_seq FROM PUBLIC;

CREATE OR REPLACE FUNCTION aso.bump_authorization_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  current_deployment uuid;
  current_incarnation uuid;
  current_revision bigint;
BEGIN
  SELECT deployment_id INTO current_deployment
    FROM aso.authority_deployment WHERE singleton = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'authority deployment is missing';
  END IF;

  UPDATE aso.authorization_revision
     SET revision = revision + 1
   WHERE singleton = true
   RETURNING incarnation, revision
        INTO current_incarnation, current_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'authorization revision is missing';
  END IF;

  INSERT INTO aso.authority_outbox (
    event_type, deployment_id, authority_incarnation, authorization_revision
  ) VALUES (
    'membership_revision', current_deployment, current_incarnation, current_revision
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION aso.emit_session_denial_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  current_deployment uuid;
  current_incarnation uuid;
  current_revision bigint;
BEGIN
  SELECT deployment_id INTO current_deployment
    FROM aso.authority_deployment WHERE singleton = true;
  IF NOT FOUND OR NEW.deployment_id <> current_deployment THEN
    RAISE EXCEPTION 'session denial deployment does not match this authority store'
      USING ERRCODE = '42501';
  END IF;

  SELECT incarnation, revision
    INTO current_incarnation, current_revision
    FROM aso.authorization_revision WHERE singleton = true
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'authorization revision is missing';
  END IF;

  INSERT INTO aso.authority_outbox (
    event_type, deployment_id, authority_incarnation, authorization_revision,
    kratos_issuer, kratos_session_id
  ) VALUES (
    'session_denied', NEW.deployment_id, current_incarnation, current_revision,
    NEW.kratos_issuer, NEW.kratos_session_id
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION aso.protect_session_denial_retention()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.deployment_id IS DISTINCT FROM OLD.deployment_id
    OR NEW.kratos_issuer IS DISTINCT FROM OLD.kratos_issuer
    OR NEW.kratos_session_id IS DISTINCT FROM OLD.kratos_session_id
    OR NEW.session_expires_at IS DISTINCT FROM OLD.session_expires_at
    OR NEW.skew_allowance IS DISTINCT FROM OLD.skew_allowance
    OR NEW.retain_until IS DISTINCT FROM OLD.retain_until
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'session denial identity and retention are immutable'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.confirmation_state = 'confirmed'
     AND NEW.confirmation_state <> 'confirmed' THEN
    RAISE EXCEPTION 'confirmed session denial cannot return to pending'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' AND clock_timestamp() < OLD.retain_until THEN
    RAISE EXCEPTION 'session denial retention has not elapsed'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION aso.protect_session_denial_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF EXISTS (
    SELECT FROM aso.session_denials WHERE clock_timestamp() < retain_until
  ) THEN
    RAISE EXCEPTION 'session denial retention has not elapsed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION aso.bump_authorization_revision(),
  aso.emit_session_denial_event(), aso.protect_session_denial_retention(),
  aso.protect_session_denial_truncate() FROM PUBLIC;

CREATE OR REPLACE TRIGGER session_denials_event
  AFTER INSERT ON aso.session_denials
  FOR EACH ROW EXECUTE FUNCTION aso.emit_session_denial_event();
CREATE OR REPLACE TRIGGER session_denials_retention
  BEFORE UPDATE OR DELETE ON aso.session_denials
  FOR EACH ROW EXECUTE FUNCTION aso.protect_session_denial_retention();
CREATE OR REPLACE TRIGGER session_denials_truncate
  BEFORE TRUNCATE ON aso.session_denials
  FOR EACH STATEMENT EXECUTE FUNCTION aso.protect_session_denial_truncate();

CREATE OR REPLACE TRIGGER users_authorization_revision
  AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON aso.users
  FOR EACH STATEMENT EXECUTE FUNCTION aso.bump_authorization_revision();
CREATE OR REPLACE TRIGGER user_roles_authorization_revision
  AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON aso.user_roles
  FOR EACH STATEMENT EXECUTE FUNCTION aso.bump_authorization_revision();
CREATE OR REPLACE TRIGGER role_capabilities_authorization_revision
  AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON aso.role_capabilities
  FOR EACH STATEMENT EXECUTE FUNCTION aso.bump_authorization_revision();
CREATE OR REPLACE TRIGGER capabilities_authorization_revision
  AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON aso.capabilities
  FOR EACH STATEMENT EXECUTE FUNCTION aso.bump_authorization_revision();

INSERT INTO aso.local_replication_exclusions (relation_oid, registered_name)
SELECT relation.oid,
       pg_catalog.format('%I.%I', namespace.nspname, relation.relname)
FROM pg_catalog.pg_class relation
JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'aso'
  AND relation.relname IN (
    'authority_deployment', 'authorization_revision', 'session_denials',
    'authority_outbox'
  )
ON CONFLICT (relation_oid) DO UPDATE
  SET registered_name = EXCLUDED.registered_name;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'aso_session_reader') THEN
    GRANT SELECT ON aso.authority_deployment, aso.authorization_revision,
      aso.session_denials TO aso_session_reader;
  END IF;
END;
$$;
