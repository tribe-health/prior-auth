-- Fresh-install counterpart of server migration 2026090610.

BEGIN;

DO $$
DECLARE
  executor oid;
BEGIN
  SELECT oid INTO executor FROM pg_catalog.pg_roles
   WHERE rolname = 'aso_session_authority_executor';

  IF executor IS NULL THEN
    CREATE ROLE aso_session_authority_executor NOLOGIN NOSUPERUSER NOCREATEDB
      NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS (
    SELECT FROM pg_catalog.pg_roles
     WHERE oid = executor AND
       (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR
        rolreplication OR rolbypassrls)
  ) OR EXISTS (
    SELECT FROM pg_catalog.pg_auth_members WHERE member = executor
  ) OR EXISTS (
    SELECT FROM pg_catalog.pg_database WHERE datdba = executor
  ) OR EXISTS (
    SELECT FROM pg_catalog.pg_namespace
     WHERE nspname = 'aso' AND nspowner = executor
  ) OR EXISTS (
    SELECT FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'aso' AND relation.relowner = executor
  ) OR EXISTS (
    SELECT FROM pg_catalog.pg_proc function
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = function.pronamespace
     WHERE namespace.nspname = 'aso' AND function.proowner = executor
  ) OR EXISTS (
    SELECT FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'aso' AND (
       pg_catalog.has_table_privilege(executor, relation.oid,
         'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
       OR (relation.relname NOT IN ('authority_deployment', 'session_denials')
           AND pg_catalog.has_table_privilege(executor, relation.oid, 'SELECT'))
     )
  ) OR EXISTS (
    SELECT FROM pg_catalog.pg_attribute attribute
    JOIN pg_catalog.pg_class relation ON relation.oid = attribute.attrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'aso' AND attribute.attnum > 0
       AND NOT attribute.attisdropped AND (
         (pg_catalog.has_column_privilege(
            executor, relation.oid, attribute.attnum, 'INSERT') AND
          (relation.relname <> 'session_denials' OR attribute.attname NOT IN (
            'deployment_id', 'kratos_issuer', 'kratos_session_id',
            'session_expires_at', 'skew_allowance', 'retain_until',
            'confirmation_state', 'attempt_count', 'next_attempt_at',
            'lease_token', 'lease_expires_at', 'last_attempt_at',
            'confirmed_at', 'last_error_code', 'created_at', 'updated_at')))
         OR (pg_catalog.has_column_privilege(
               executor, relation.oid, attribute.attnum, 'UPDATE') AND
          (relation.relname <> 'session_denials' OR attribute.attname NOT IN (
            'confirmation_state', 'attempt_count', 'next_attempt_at',
            'lease_token', 'lease_expires_at', 'last_attempt_at',
            'confirmed_at', 'last_error_code', 'updated_at')))
         OR pg_catalog.has_column_privilege(
              executor, relation.oid, attribute.attnum, 'REFERENCES')
       )
  ) OR pg_catalog.has_schema_privilege(executor, 'aso', 'CREATE') THEN
    RAISE EXCEPTION 'aso_session_authority_executor already exists with privileged access';
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA aso TO aso_session_authority_executor;
GRANT SELECT ON aso.authority_deployment, aso.session_denials
  TO aso_session_authority_executor;
GRANT INSERT (
  deployment_id, kratos_issuer, kratos_session_id, session_expires_at,
  skew_allowance, retain_until, confirmation_state, attempt_count,
  next_attempt_at, lease_token, lease_expires_at, last_attempt_at,
  confirmed_at, last_error_code, created_at, updated_at
) ON aso.session_denials TO aso_session_authority_executor;
GRANT UPDATE (
  confirmation_state, attempt_count, next_attempt_at, lease_token,
  lease_expires_at, last_attempt_at, confirmed_at, last_error_code, updated_at
) ON aso.session_denials TO aso_session_authority_executor;

COMMIT;
