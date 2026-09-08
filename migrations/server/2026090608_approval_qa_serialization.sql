-- RA-03. Approval must observe complete QA and cited-document sets in the same
-- transaction that binds approved_qa_revision. ROW SHARE conflicts with
-- TRUNCATE's automatic ACCESS EXCLUSIVE relation lock while remaining
-- compatible with ordinary row writes, which already serialize per letter
-- through migration 0605.

CREATE OR REPLACE FUNCTION aso.bind_letter_approval_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  source_document uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20260905, pg_catalog.hashtext(NEW.id::text));

  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND (
    NEW.status NOT IN ('approved', 'signed')
    OR (to_jsonb(NEW) - ARRAY['status', 'signature_id', 'signed_at', 'updated_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status', 'signature_id', 'signed_at', 'updated_at'])
  ) THEN
    RAISE EXCEPTION 'approved letter revision is immutable' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'signed' AND
     (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM
     (to_jsonb(OLD) - 'updated_at') THEN
    RAISE EXCEPTION 'signed letter revision is immutable' USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status <> 'approved') THEN
    IF NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR NEW.content_sha256 IS NULL THEN
      RAISE EXCEPTION 'letter approval is incomplete' USING ERRCODE = 'A0303';
    END IF;

    LOCK TABLE aso.letter_qa_results IN ROW SHARE MODE;
    IF EXISTS (
      SELECT
      FROM aso.qa_check_types check_type
      LEFT JOIN aso.letter_qa_results result
        ON result.qa_check_type_id = check_type.id
       AND result.letter_id = NEW.id
      WHERE result.id IS NULL
         OR (check_type.severity = 'blocking' AND result.outcome <> 'pass')
    ) THEN
      RAISE EXCEPTION 'letter QA incomplete' USING ERRCODE = 'A0305';
    END IF;

    LOCK TABLE aso.letter_claims IN ROW SHARE MODE;
    IF NOT EXISTS (
      SELECT FROM aso.letter_claims claim WHERE claim.letter_id = NEW.id
    ) OR EXISTS (
      SELECT
      FROM aso.letter_claims claim
      WHERE claim.letter_id = NEW.id
        AND (
          claim.document_id IS NULL
          OR claim.annotation_id IS NOT NULL
          OR claim.page_number IS NULL
        )
    ) THEN
      RAISE EXCEPTION 'letter sources incomplete' USING ERRCODE = 'A0306';
    END IF;

    PERFORM 1
    FROM aso.letter_claims claim
    WHERE claim.letter_id = NEW.id
    ORDER BY claim.id
    FOR SHARE;
    FOR source_document IN
      SELECT DISTINCT claim.document_id
      FROM aso.letter_claims claim
      WHERE claim.letter_id = NEW.id AND claim.document_id IS NOT NULL
      ORDER BY claim.document_id
    LOOP
      PERFORM pg_catalog.pg_advisory_xact_lock(
        20260904,
        pg_catalog.hashtext(source_document::text)
      );
      PERFORM 1
      FROM aso.documents document
      JOIN aso.cases target_case ON target_case.id = NEW.case_id
      WHERE document.id = source_document
        AND document.effective_date IS NOT NULL
        AND document.content_sha256 IS NOT NULL
        AND document.page_count IS NOT NULL
        AND document.patient_id = target_case.patient_id
        AND (document.case_id IS NULL OR document.case_id = target_case.id)
        AND NOT EXISTS (
          SELECT
          FROM aso.letter_claims claim
          WHERE claim.letter_id = NEW.id
            AND claim.document_id = source_document
            AND (
              claim.page_number IS NULL
              OR claim.page_number > document.page_count
            )
        )
      FOR SHARE OF document;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'letter sources incomplete' USING ERRCODE = 'A0306';
      END IF;
    END LOOP;
    NEW.approved_qa_revision := NEW.qa_revision;
  END IF;
  RETURN NEW;
END;
$$;
