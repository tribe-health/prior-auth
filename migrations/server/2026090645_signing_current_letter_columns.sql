-- The signing owner needs only the ordering columns added to the current-letter
-- decision; it still has no unrestricted table read.
GRANT SELECT (generated_at, created_at) ON aso.letters TO aso_gate_owner;
