-- RA-03. Serialize publication changes with table schema moves. Event-trigger
-- start hooks cannot identify the table target, so every CREATE/ALTER TABLE
-- takes the shared side of this lock. Publication DDL takes the exclusive side.
-- A command that had to wait aborts after the winner commits because its DDL
-- snapshot may predate that commit. Uncontended commands continue to the
-- ddl_command_end guard installed by migration 0600.

CREATE FUNCTION aso.serialize_local_publication_ddl()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  IF TG_TAG IN ('CREATE TABLE', 'ALTER TABLE') THEN
    IF NOT pg_catalog.pg_try_advisory_xact_lock_shared(20260906, 7) THEN
      PERFORM pg_catalog.pg_advisory_xact_lock_shared(20260906, 7);
      RAISE EXCEPTION 'concurrent publication DDL requires table DDL retry'
        USING ERRCODE = '40001';
    END IF;
  ELSIF NOT pg_catalog.pg_try_advisory_xact_lock(20260906, 7) THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(20260906, 7);
    RAISE EXCEPTION 'concurrent table DDL requires publication DDL retry'
      USING ERRCODE = '40001';
  END IF;
END;
$$;

CREATE EVENT TRIGGER aso_local_command_publication_serialization
  ON ddl_command_start
  WHEN TAG IN ('CREATE TABLE', 'ALTER TABLE', 'CREATE PUBLICATION', 'ALTER PUBLICATION')
  EXECUTE FUNCTION aso.serialize_local_publication_ddl();

REVOKE ALL ON FUNCTION aso.serialize_local_publication_ddl() FROM PUBLIC;
