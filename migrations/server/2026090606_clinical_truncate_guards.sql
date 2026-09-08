-- RA-03. Row triggers do not run for TRUNCATE. Preserve the QA and cited-claim
-- basis of every approved or signed letter at the statement boundary.

CREATE FUNCTION aso.guard_approved_letter_qa_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM aso.letter_qa_results result
    JOIN aso.letters letter ON letter.id = result.letter_id
    WHERE letter.status IN ('approved', 'signed')
  ) THEN
    RAISE EXCEPTION 'approved letter QA is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER letter_qa_results_approved_truncate_guard
BEFORE TRUNCATE ON aso.letter_qa_results
FOR EACH STATEMENT EXECUTE FUNCTION aso.guard_approved_letter_qa_truncate();

CREATE FUNCTION aso.guard_approved_letter_claims_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM aso.letter_claims claim
    JOIN aso.letters letter ON letter.id = claim.letter_id
    WHERE letter.status IN ('approved', 'signed')
  ) THEN
    RAISE EXCEPTION 'approved letter sources are immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER letter_claims_approved_truncate_guard
BEFORE TRUNCATE ON aso.letter_claims
FOR EACH STATEMENT EXECUTE FUNCTION aso.guard_approved_letter_claims_truncate();

REVOKE ALL ON FUNCTION
  aso.guard_approved_letter_qa_truncate(),
  aso.guard_approved_letter_claims_truncate()
  FROM PUBLIC;
