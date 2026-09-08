-- RA-03. Source documents cited by an approved or signed letter are immutable.
-- Corrected source content is a new document version and a new letter revision;
-- an in-place edit would sever the approval from the content it authorized.

CREATE FUNCTION aso.guard_approved_letter_documents()
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
    WHERE claim.document_id = OLD.id
      AND letter.status IN ('approved', 'signed')
  ) AND (
    TG_OP = 'DELETE'
    OR (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM
       (to_jsonb(OLD) - 'updated_at')
  ) THEN
    RAISE EXCEPTION 'approved letter source documents are immutable'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER documents_approved_letter_guard
  BEFORE UPDATE OR DELETE ON aso.documents
  FOR EACH ROW EXECUTE FUNCTION aso.guard_approved_letter_documents();

CREATE FUNCTION aso.guard_approved_letter_document_truncate()
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
    RAISE EXCEPTION 'approved letter source documents are immutable'
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER documents_approved_letter_truncate_guard
  BEFORE TRUNCATE ON aso.documents
  FOR EACH STATEMENT EXECUTE FUNCTION aso.guard_approved_letter_document_truncate();

DO $$
DECLARE
  signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'aso.guard_approved_letter_documents()',
    'aso.guard_approved_letter_document_truncate()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', signature);
    EXECUTE format('ALTER FUNCTION %s OWNER TO aso_gate_owner', signature);
  END LOOP;
END;
$$;
