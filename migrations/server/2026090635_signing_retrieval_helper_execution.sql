-- The signing update invokes the provenance guard as aso_gate_owner. Permit
-- that trigger to inspect only the retrieval and criterion records it uses to
-- refuse unresolved non-policy claims.

GRANT SELECT ON aso.retrieval_log, aso.criteria, aso.evidence_grades
  TO aso_gate_owner;
