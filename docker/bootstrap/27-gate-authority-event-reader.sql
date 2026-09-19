-- RA06c-02 fresh-install counterpart to server migration 2026090611.
-- Flint Gate reads only the ASO authority snapshot and durable outbox.

DO $$
DECLARE
  reader oid;
BEGIN
  SELECT oid INTO reader
    FROM pg_catalog.pg_roles
   WHERE rolname = 'aso_authority_event_reader';

  IF reader IS NULL THEN
    CREATE ROLE aso_authority_event_reader NOLOGIN NOSUPERUSER NOCREATEDB
      NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSE
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
      SELECT FROM pg_catalog.pg_namespace WHERE nspowner = reader
    ) OR EXISTS (
      SELECT FROM pg_catalog.pg_class WHERE relowner = reader
    ) OR EXISTS (
      SELECT FROM pg_catalog.pg_proc WHERE proowner = reader
    ) THEN
      RAISE EXCEPTION
        'aso_authority_event_reader already exists with privileged access';
    END IF;
  END IF;
END;
$$;

REVOKE ALL PRIVILEGES ON SCHEMA aso FROM aso_authority_event_reader;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA aso
  FROM aso_authority_event_reader;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA aso
  FROM aso_authority_event_reader;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA aso
  FROM aso_authority_event_reader;

GRANT USAGE ON SCHEMA aso TO aso_authority_event_reader;
GRANT SELECT ON aso.authority_deployment, aso.authorization_revision,
  aso.session_denials, aso.authority_outbox TO aso_authority_event_reader;

DO $$
DECLARE
  reader oid;
BEGIN
  SELECT oid INTO STRICT reader
    FROM pg_catalog.pg_roles
   WHERE rolname = 'aso_authority_event_reader';

  IF NOT pg_catalog.has_schema_privilege(reader, 'aso', 'USAGE')
     OR pg_catalog.has_schema_privilege(reader, 'aso', 'CREATE')
     OR EXISTS (
       SELECT FROM pg_catalog.pg_class relation
       JOIN pg_catalog.pg_namespace namespace
         ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'aso'
         AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND (
           (relation.relname IN (
             'authority_deployment', 'authorization_revision',
             'session_denials', 'authority_outbox'
           ) AND NOT pg_catalog.has_table_privilege(reader, relation.oid, 'SELECT'))
           OR
           (relation.relname NOT IN (
             'authority_deployment', 'authorization_revision',
             'session_denials', 'authority_outbox'
           ) AND pg_catalog.has_table_privilege(reader, relation.oid, 'SELECT'))
           OR pg_catalog.has_table_privilege(
             reader, relation.oid,
             'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'
           )
           OR pg_catalog.has_any_column_privilege(
             reader, relation.oid, 'INSERT, UPDATE, REFERENCES'
           )
         )
     )
     OR EXISTS (
       SELECT FROM pg_catalog.pg_class sequence
       JOIN pg_catalog.pg_namespace namespace
         ON namespace.oid = sequence.relnamespace
       WHERE CASE
         WHEN namespace.nspname = 'aso' AND sequence.relkind = 'S'
         THEN pg_catalog.has_sequence_privilege(
           reader, sequence.oid, 'USAGE, SELECT, UPDATE'
         )
         ELSE false
       END
     ) THEN
    RAISE EXCEPTION 'aso_authority_event_reader privilege contract is invalid';
  END IF;
END;
$$;

-- Provision a separate runtime LOGIN and password through deployment secrets.
-- The LOGIN must be an unprivileged member of aso_authority_event_reader.
