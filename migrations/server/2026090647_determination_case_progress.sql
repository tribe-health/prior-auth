-- A recorded adverse determination and its confirmed response path advance the
-- case through the existing workflow edges. Letter signing remains bounded to
-- response_drafting -> response_ready and cannot invent these earlier events.
SET search_path = aso, public;

CREATE OR REPLACE FUNCTION aso.advance_case_for_recorded_determination(target_case uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE current_status text; next_status text;
BEGIN
 SELECT status INTO current_status FROM aso.cases WHERE id=target_case FOR UPDATE;
 LOOP
  next_status:=CASE current_status
   WHEN 'submitted' THEN 'denied'
   WHEN 'resubmitted' THEN 'denied'
   WHEN 'appealed' THEN 'denied'
   WHEN 'denied' THEN 'denial_review'
  END;
  EXIT WHEN next_status IS NULL;
  IF NOT EXISTS(SELECT FROM aso.case_status_transitions transition
   WHERE transition.from_status=current_status AND transition.to_status=next_status)
  THEN RAISE EXCEPTION 'determination case transition is not allowed' USING ERRCODE='23514'; END IF;
  UPDATE aso.cases SET status=next_status WHERE id=target_case;
  current_status:=next_status;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION aso.advance_case_after_determination_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
BEGIN
 IF NEW.outcome IN ('denied','partial') THEN
  PERFORM aso.advance_case_for_recorded_determination(NEW.case_id);
 END IF;
 RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS determinations_advance_case_after_insert ON aso.determinations;
CREATE TRIGGER determinations_advance_case_after_insert
AFTER INSERT ON aso.determinations
FOR EACH ROW EXECUTE FUNCTION aso.advance_case_after_determination_insert();

CREATE OR REPLACE FUNCTION aso.advance_case_for_confirmed_response_mode(target_determination uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE target_case uuid; current_status text;
BEGIN
 SELECT case_id INTO target_case FROM aso.determinations
 WHERE id=target_determination AND outcome IN ('denied','partial')
  AND data->>'confirmed_response_mode' IN ('corrected_resubmission','clinical_appeal');
 IF target_case IS NULL THEN RETURN; END IF;
 PERFORM aso.advance_case_for_recorded_determination(target_case);
 SELECT status INTO current_status FROM aso.cases WHERE id=target_case FOR UPDATE;
 IF current_status<>'denial_review' THEN RETURN; END IF;
 IF NOT EXISTS(SELECT FROM aso.case_status_transitions transition
  WHERE transition.from_status='denial_review' AND transition.to_status='response_drafting')
 THEN RAISE EXCEPTION 'response-mode case transition is not allowed' USING ERRCODE='23514'; END IF;
 UPDATE aso.cases SET status='response_drafting' WHERE id=target_case;
END $$;

CREATE OR REPLACE FUNCTION aso.advance_case_after_response_mode()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
BEGIN
 IF NEW.data->>'confirmed_response_mode' IN ('corrected_resubmission','clinical_appeal')
  AND OLD.data->>'confirmed_response_mode' IS DISTINCT FROM NEW.data->>'confirmed_response_mode'
 THEN PERFORM aso.advance_case_for_confirmed_response_mode(NEW.id); END IF;
 RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS determinations_advance_case_after_response_mode ON aso.determinations;
CREATE TRIGGER determinations_advance_case_after_response_mode
AFTER UPDATE OF data ON aso.determinations
FOR EACH ROW EXECUTE FUNCTION aso.advance_case_after_response_mode();

-- Reconcile determinations confirmed before this migration. The signed-letter
-- helper remains responsible for the final, independently checked edge.
DO $$ DECLARE item record; response_letter uuid;
BEGIN
 FOR item IN
  SELECT DISTINCT ON (determination.case_id) determination.id,determination.case_id
  FROM aso.determinations determination
  WHERE determination.outcome IN ('denied','partial')
   AND determination.data->>'confirmed_response_mode' IN ('corrected_resubmission','clinical_appeal')
  ORDER BY determination.case_id,determination.decided_on DESC,determination.created_at DESC,determination.id DESC
 LOOP
  PERFORM aso.advance_case_for_confirmed_response_mode(item.id);
  SELECT letter.id INTO response_letter FROM aso.letters letter
  WHERE letter.case_id=item.case_id
   AND letter.purpose IN ('corrected_resubmission','clinical_appeal')
   AND letter.status='signed'
  ORDER BY letter.generated_at DESC,letter.created_at DESC,letter.id DESC LIMIT 1;
  IF response_letter IS NOT NULL THEN
   PERFORM aso.advance_case_for_signed_letter(response_letter);
  END IF;
 END LOOP;
END $$;

GRANT CREATE ON SCHEMA aso TO aso_case_owner;
ALTER FUNCTION aso.advance_case_for_recorded_determination(uuid) OWNER TO aso_case_owner;
ALTER FUNCTION aso.advance_case_after_determination_insert() OWNER TO aso_case_owner;
ALTER FUNCTION aso.advance_case_for_confirmed_response_mode(uuid) OWNER TO aso_case_owner;
ALTER FUNCTION aso.advance_case_after_response_mode() OWNER TO aso_case_owner;
REVOKE CREATE ON SCHEMA aso FROM aso_case_owner;
REVOKE ALL ON FUNCTION aso.advance_case_for_recorded_determination(uuid),
 aso.advance_case_after_determination_insert(),
 aso.advance_case_for_confirmed_response_mode(uuid),
 aso.advance_case_after_response_mode() FROM PUBLIC;
