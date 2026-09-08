-- Verified sessions resolve authority through a restricted database role.
-- authorization_revision is server-authoritative relational control metadata.
-- Privacy: trusted, exposed only as an authenticated scope projection.
-- Excluded from Electric/entity replication; only its sanitized revision
-- string leaves this boundary through /api/session.
-- A global revision invalidates every authority snapshot after any authority
-- statement. This is deliberately coarse: even a no-op UPDATE advances it.
-- The row update commits or rolls back with the authorization change. The
-- incarnation distinguishes independently initialized authority stores.
-- Restore procedures must rotate incarnation before serving restored data;
-- restoring an old backup also restores its old incarnation and revision.

BEGIN;

CREATE TABLE IF NOT EXISTS aso.authorization_revision (
  singleton   boolean PRIMARY KEY CHECK (singleton),
  incarnation uuid NOT NULL DEFAULT gen_random_uuid(),
  revision    bigint NOT NULL CHECK (revision > 0)
);

INSERT INTO aso.authorization_revision (singleton, revision)
VALUES (true, 1)
ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION aso.bump_authorization_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  UPDATE aso.authorization_revision SET revision = revision + 1
   WHERE singleton = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'authorization revision is missing';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION aso.bump_authorization_revision() FROM PUBLIC;

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

DO $$
DECLARE
  reader oid;
BEGIN
  SELECT oid INTO reader FROM pg_catalog.pg_roles
   WHERE rolname = 'aso_session_reader';

  IF reader IS NULL THEN
    CREATE ROLE aso_session_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS;
  ELSE
    -- Do not silently turn an existing privileged deployment role into the
    -- reader. Parent memberships can make apparently safe attributes unsafe.
    IF EXISTS (
      SELECT FROM pg_catalog.pg_roles
       WHERE oid = reader AND
         (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR
          rolreplication OR rolbypassrls)
    ) OR EXISTS (
      SELECT FROM pg_catalog.pg_auth_members WHERE member = reader
    ) OR EXISTS (
      SELECT FROM pg_catalog.pg_database WHERE datdba = reader
    ) OR EXISTS (
      SELECT FROM pg_catalog.pg_namespace
       WHERE nspname = 'aso' AND nspowner = reader
    ) OR EXISTS (
      SELECT FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'aso' AND
         (c.relowner = reader OR
          (c.relkind IN ('r', 'p', 'v', 'm', 'f') AND
           (pg_catalog.has_table_privilege(reader, c.oid,
              'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN') OR
            pg_catalog.has_any_column_privilege(reader, c.oid,
              'INSERT, UPDATE, REFERENCES'))))
    ) OR EXISTS (
      SELECT FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'aso' AND p.proowner = reader
    ) OR pg_catalog.has_schema_privilege(reader, 'aso', 'CREATE') THEN
      RAISE EXCEPTION 'aso_session_reader already exists with privileged access';
    END IF;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA aso TO aso_session_reader;
GRANT SELECT ON aso.users, aso.user_roles, aso.role_capabilities,
  aso.capabilities, aso.user_capabilities, aso.authorization_revision
  TO aso_session_reader;

-- Provision the runtime LOGIN and its password through deployment secrets.
-- It must be a separate non-owner, non-superuser, NOBYPASSRLS role with
-- membership in aso_session_reader. No fixed login or password belongs here.
-- Runtime transactions use SET LOCAL ROLE aso_session_reader before reading.
-- This migration grants no write access to that role.

COMMIT;
