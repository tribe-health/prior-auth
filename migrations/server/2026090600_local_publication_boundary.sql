-- RA-03. Install before every local clinical command ledger migration.
-- The registry follows relation OIDs across rename and schema moves. The event
-- trigger runs in the same transaction as DDL, so an unsafe publication change
-- is rolled back before it can expose a committed ledger.

CREATE TABLE aso.local_replication_exclusions (
  relation_oid oid PRIMARY KEY,
  registered_name text NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
COMMENT ON TABLE aso.local_replication_exclusions IS
  'Trusted-host registry of relations structurally excluded from logical replication.';
REVOKE ALL ON aso.local_replication_exclusions FROM PUBLIC;

INSERT INTO aso.local_replication_exclusions (relation_oid, registered_name)
SELECT relation.oid,
       pg_catalog.format('%I.%I', namespace.nspname, relation.relname)
FROM pg_catalog.pg_class relation
JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
WHERE relation.relkind IN ('r', 'p')
  AND (
    relation.relname IN (
      'gate_commands',
      'letter_sign_commands',
      'evidence_reassessment_commands'
    )
    OR (
      position('Privacy: local' in COALESCE(
        pg_catalog.obj_description(relation.oid, 'pg_class'), '')) > 0
      AND position('excluded from replication' in COALESCE(
        pg_catalog.obj_description(relation.oid, 'pg_class'), '')) > 0
    )
  )
ON CONFLICT (relation_oid) DO NOTHING;

CREATE FUNCTION aso.register_and_reject_local_publication()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  changed record;
BEGIN
  IF TG_TAG IN ('CREATE TABLE', 'ALTER TABLE') THEN
    FOR changed IN
      SELECT command.objid
      FROM pg_catalog.pg_event_trigger_ddl_commands() command
      WHERE command.classid = 'pg_catalog.pg_class'::regclass
    LOOP
      INSERT INTO aso.local_replication_exclusions (relation_oid, registered_name)
      SELECT relation.oid,
             pg_catalog.format('%I.%I', namespace.nspname, relation.relname)
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE relation.oid = changed.objid
        AND relation.relkind IN ('r', 'p')
        AND (
          relation.relname IN (
            'gate_commands',
            'letter_sign_commands',
            'evidence_reassessment_commands'
          )
          OR (
            position('Privacy: local' in COALESCE(
              pg_catalog.obj_description(relation.oid, 'pg_class'), '')) > 0
            AND position('excluded from replication' in COALESCE(
              pg_catalog.obj_description(relation.oid, 'pg_class'), '')) > 0
          )
        )
      ON CONFLICT (relation_oid) DO UPDATE
        SET registered_name = EXCLUDED.registered_name;
    END LOOP;
  END IF;

  IF EXISTS (SELECT FROM pg_catalog.pg_publication WHERE puballtables)
     OR EXISTS (
       SELECT FROM pg_catalog.pg_publication_namespace publication_schema
       JOIN pg_catalog.pg_namespace namespace
         ON namespace.oid = publication_schema.pnnspid
       WHERE namespace.nspname = 'aso'
     )
     OR EXISTS (
       SELECT FROM pg_catalog.pg_publication_rel publication_table
       JOIN aso.local_replication_exclusions excluded
         ON excluded.relation_oid = publication_table.prrelid
     )
     OR EXISTS (
       SELECT FROM pg_catalog.pg_publication_namespace publication_schema
       JOIN pg_catalog.pg_class relation
         ON relation.relnamespace = publication_schema.pnnspid
       JOIN aso.local_replication_exclusions excluded
         ON excluded.relation_oid = relation.oid
     ) THEN
    RAISE EXCEPTION 'local clinical command ledgers cannot be published'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE EVENT TRIGGER aso_local_command_publication_guard
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'ALTER TABLE', 'CREATE PUBLICATION', 'ALTER PUBLICATION')
  EXECUTE FUNCTION aso.register_and_reject_local_publication();

CREATE FUNCTION aso.remove_dropped_local_publication_registration()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  IF pg_catalog.to_regclass('aso.local_replication_exclusions') IS NOT NULL THEN
    DELETE FROM aso.local_replication_exclusions excluded
    USING pg_catalog.pg_event_trigger_dropped_objects() dropped
    WHERE dropped.classid = 'pg_catalog.pg_class'::regclass
      AND excluded.relation_oid = dropped.objid;
  END IF;
END;
$$;

CREATE EVENT TRIGGER aso_local_command_drop_cleanup
  ON sql_drop
  WHEN TAG IN ('DROP TABLE')
  EXECUTE FUNCTION aso.remove_dropped_local_publication_registration();

REVOKE ALL ON FUNCTION
  aso.register_and_reject_local_publication(),
  aso.remove_dropped_local_publication_registration()
  FROM PUBLIC;
