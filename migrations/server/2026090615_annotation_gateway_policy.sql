-- RA-15 follow-up. Gate needs an independent, read-only authorization check
-- for annotation command and reconciliation routes. The later AppServices
-- capability check and the annotation trigger remain separate decisions.

CREATE FUNCTION aso.read_annotation_target(target_case uuid, target_annotation uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  PERFORM aso.require_annotation_case(target_case, false);
  IF EXISTS (
    SELECT FROM aso.annotations annotation
    WHERE annotation.id = target_annotation
  ) AND NOT EXISTS (
    SELECT FROM aso.annotations annotation
    WHERE annotation.id = target_annotation
      AND annotation.case_id = target_case
  ) THEN
    RETURN false;
  END IF;
  RETURN true;
EXCEPTION WHEN insufficient_privilege OR no_data_found THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION aso.read_annotation_target(uuid,uuid) FROM PUBLIC;
ALTER FUNCTION aso.read_annotation_target(uuid,uuid) OWNER TO aso_gate_owner;
GRANT EXECUTE ON FUNCTION aso.read_annotation_target(uuid,uuid)
  TO aso_gate_executor;
