-- Gate SECURITY DEFINER functions read case rows whose RLS policies call this
-- private tenant helper. The function owner needs the nested EXECUTE grant;
-- callers remain restricted to the bounded gate functions.
GRANT EXECUTE ON FUNCTION
  aso.current_app_user_id(),
  aso.current_verified_practice_id(),
  aso.current_app_practice_ids()
TO aso_gate_owner;

DROP POLICY IF EXISTS gate_affirmations_gate_owner ON aso.gate_affirmations;
CREATE POLICY gate_affirmations_gate_owner ON aso.gate_affirmations
  FOR ALL TO aso_gate_owner USING (true) WITH CHECK (true);
