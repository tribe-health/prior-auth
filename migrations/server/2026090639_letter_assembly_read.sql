-- A practice reviewer may inspect the persisted letter package independently of
-- the generating task's owner. Task status, inputs, and events stay owner-scoped.
CREATE FUNCTION aso.read_letter_assembly(target_letter uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE artifact jsonb;
BEGIN
 PERFORM aso.read_letter_workflow(target_letter);
 SELECT jsonb_build_object('assembly',task.assembly,'letter',task.result) INTO artifact
 FROM aso.document_generation_tasks task
 WHERE task.letter_id=target_letter AND task.state='completed';
 -- Historical signed letters retain their original digest and have no assembly.
 RETURN artifact;
END $$;
GRANT CREATE ON SCHEMA aso TO aso_case_owner;
ALTER FUNCTION aso.read_letter_assembly(uuid) OWNER TO aso_case_owner;
REVOKE CREATE ON SCHEMA aso FROM aso_case_owner;
REVOKE ALL ON FUNCTION aso.read_letter_assembly(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aso.read_letter_assembly(uuid) TO aso_case_executor;
