-- The public criteria functions are SECURITY DEFINER functions owned by
-- aso_case_owner. Their private actor-context helper is intentionally revoked
-- from PUBLIC, so the owner must hold the one nested EXECUTE grant.
REVOKE ALL ON FUNCTION aso.criteria_actor_context(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aso.criteria_actor_context(boolean) TO aso_case_owner;
GRANT UPDATE ON aso.criteria_catalog_state TO aso_case_owner;

DROP POLICY IF EXISTS criteria_catalog_case_owner ON aso.criteria_catalog;
CREATE POLICY criteria_catalog_case_owner ON aso.criteria_catalog
  FOR ALL TO aso_case_owner USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS criteria_catalog_state_case_owner ON aso.criteria_catalog_state;
CREATE POLICY criteria_catalog_state_case_owner ON aso.criteria_catalog_state
  FOR ALL TO aso_case_owner USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS criteria_catalog_commands_case_owner ON aso.criteria_catalog_commands;
CREATE POLICY criteria_catalog_commands_case_owner ON aso.criteria_catalog_commands
  FOR ALL TO aso_case_owner USING (true) WITH CHECK (true);
