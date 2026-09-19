-- A completed clinical signature advances the operational case status that
-- the browser workflow has already satisfied. Each update still traverses the
-- canonical transition table one edge at a time.
SET search_path = aso, public;

CREATE FUNCTION aso.advance_case_for_signed_letter(target_letter uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE letter aso.letters%ROWTYPE; current_status text; next_status text;
BEGIN
 SELECT * INTO letter FROM aso.letters candidate WHERE candidate.id=target_letter;
 IF letter.id IS NULL OR letter.status<>'signed' OR letter.signature_id IS NULL
    OR EXISTS(SELECT FROM aso.letters newer WHERE newer.case_id=letter.case_id
      AND (newer.generated_at,newer.created_at,newer.id)>(letter.generated_at,letter.created_at,letter.id))
 THEN RETURN; END IF;
 SELECT status INTO current_status FROM aso.cases WHERE id=letter.case_id FOR UPDATE;
 LOOP
   next_status:=CASE
     WHEN letter.purpose='prior_authorization_request' THEN CASE current_status
       WHEN 'intake' THEN 'evidence' WHEN 'evidence' THEN 'policy_review'
       WHEN 'policy_review' THEN 'awaiting_gate' WHEN 'awaiting_gate' THEN 'drafting'
       WHEN 'drafting' THEN 'ready' END
     WHEN letter.purpose IN('corrected_resubmission','clinical_appeal') THEN CASE current_status
       WHEN 'submitted' THEN 'denied' WHEN 'resubmitted' THEN 'denied'
       WHEN 'appealed' THEN 'denied' WHEN 'denied' THEN 'denial_review'
       WHEN 'denial_review' THEN 'response_drafting'
       WHEN 'response_drafting' THEN 'response_ready' END
   END;
   EXIT WHEN next_status IS NULL;
   UPDATE aso.cases SET status=next_status WHERE id=letter.case_id;
   current_status:=next_status;
 END LOOP;
END $$;

CREATE FUNCTION aso.advance_case_after_letter_signature()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
BEGIN
 IF NEW.status='signed' AND OLD.status IS DISTINCT FROM 'signed' THEN
   PERFORM aso.advance_case_for_signed_letter(NEW.id);
 END IF;
 RETURN NULL;
END $$;

CREATE TRIGGER letters_advance_case_after_signature
AFTER UPDATE OF status ON aso.letters
FOR EACH ROW EXECUTE FUNCTION aso.advance_case_after_letter_signature();

GRANT CREATE ON SCHEMA aso TO aso_case_owner;
ALTER FUNCTION aso.advance_case_for_signed_letter(uuid) OWNER TO aso_case_owner;
ALTER FUNCTION aso.advance_case_after_letter_signature() OWNER TO aso_case_owner;
REVOKE CREATE ON SCHEMA aso FROM aso_case_owner;
REVOKE ALL ON FUNCTION aso.advance_case_for_signed_letter(uuid),
 aso.advance_case_after_letter_signature() FROM PUBLIC;
