-- Keep the repaired signing target inside the existing clinical signing owner.
SET search_path = aso, public;

GRANT CREATE ON SCHEMA aso TO aso_gate_owner;
ALTER FUNCTION aso.read_signing_target(uuid) OWNER TO aso_gate_owner;
REVOKE CREATE ON SCHEMA aso FROM aso_gate_owner;
REVOKE ALL ON FUNCTION aso.read_signing_target(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aso.read_signing_target(uuid) TO aso_gate_executor;
