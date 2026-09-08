-- RA-03. Close indirect mutation and publication paths around clinical commands.
-- Existing migration checksums remain unchanged; this migration replaces the
-- affected trigger functions. Migration 0600 owns the publication boundary.

CREATE OR REPLACE FUNCTION aso.bump_letter_qa_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  target_letter uuid;
  target_letters uuid[] := ARRAY[]::uuid[];
BEGIN
  IF TG_OP <> 'INSERT' THEN
    target_letters := array_append(target_letters, OLD.letter_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    target_letters := array_append(target_letters, NEW.letter_id);
  END IF;

  FOR target_letter IN
    SELECT DISTINCT candidate
    FROM unnest(target_letters) AS candidate
    ORDER BY candidate
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(20260905, pg_catalog.hashtext(target_letter::text));
  END LOOP;

  IF EXISTS (
    SELECT FROM aso.letters letter
    WHERE letter.id = ANY(target_letters)
      AND letter.status IN ('approved', 'signed')
  ) THEN
    RAISE EXCEPTION 'approved letter QA is immutable' USING ERRCODE = '42501';
  END IF;

  UPDATE aso.letters
  SET qa_revision = qa_revision + 1
  WHERE id = ANY(target_letters);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

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

    -- Claim triggers take the same letter lock. Document triggers take the
    -- document lock. Once these locks are held, a source edit either committed
    -- before this approval or waits and is refused after it.
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
      PERFORM 1 FROM aso.documents document
      WHERE document.id = source_document
      FOR SHARE;
    END LOOP;
    NEW.approved_qa_revision := NEW.qa_revision;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION aso.guard_approved_letter_claims()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  target_letter uuid;
  target_letters uuid[] := ARRAY[]::uuid[];
BEGIN
  IF TG_OP <> 'INSERT' THEN
    target_letters := array_append(target_letters, OLD.letter_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    target_letters := array_append(target_letters, NEW.letter_id);
  END IF;
  FOR target_letter IN
    SELECT DISTINCT candidate
    FROM unnest(target_letters) AS candidate
    ORDER BY candidate
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(20260905, pg_catalog.hashtext(target_letter::text));
  END LOOP;
  IF EXISTS (
    SELECT FROM aso.letters letter
    WHERE letter.id = ANY(target_letters)
      AND letter.status IN ('approved', 'signed')
  ) THEN
    RAISE EXCEPTION 'approved letter sources are immutable' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION aso.guard_approved_letter_documents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20260904, pg_catalog.hashtext(OLD.id::text));
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
