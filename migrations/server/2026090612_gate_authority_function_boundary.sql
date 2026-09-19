-- The authority-event reader needs USAGE on the aso schema to read its four
-- allowed tables. PostgreSQL grants EXECUTE on new functions to PUBLIC by
-- default, which would otherwise give that reader an unintended write path
-- through SECURITY DEFINER functions.

REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA aso FROM PUBLIC;
ALTER DEFAULT PRIVILEGES
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE aso_gate_owner
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
DECLARE
  reader oid;
BEGIN
  SELECT oid INTO STRICT reader
    FROM pg_catalog.pg_roles
   WHERE rolname = 'aso_authority_event_reader';

  IF EXISTS (
    SELECT FROM pg_catalog.pg_proc routine
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'aso'
      AND pg_catalog.has_function_privilege(reader, routine.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION
      'aso_authority_event_reader may not execute functions in schema aso';
  END IF;
END;
$$;
