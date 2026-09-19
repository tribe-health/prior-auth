-- Repair current-letter selection, bounded case progression, and exact
-- command reconciliation under concurrent delivery.
SET search_path = aso, public;

UPDATE aso.letters
SET generated_at = created_at
WHERE generated_at IS NULL;

ALTER TABLE aso.letters
  ALTER COLUMN generated_at SET NOT NULL;

CREATE OR REPLACE FUNCTION aso.read_signing_target(target_letter uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  result jsonb;
BEGIN
  SELECT * INTO STRICT actor FROM aso.gate_actor_context();
  PERFORM aso.require_signing_letter(target_letter, false);
  SELECT jsonb_build_object(
    'letterId', l.id,
    'caseId', l.case_id,
    'letterVersion', l.version,
    'qaRevision', l.qa_revision,
    'signatureVersion', signature.version,
    'status', l.status,
    'approvedByActor', l.approved_by = actor.actor_id AND l.approved_at IS NOT NULL,
    'isCurrent', NOT EXISTS (
      SELECT FROM aso.letters newer
      WHERE newer.case_id = l.case_id
        AND (newer.generated_at, newer.created_at, newer.id)
          > (l.generated_at, l.created_at, l.id)
    ),
    'gateAffirmed', c.gate_affirmed_at IS NOT NULL AND NOT EXISTS (
      SELECT FROM aso.gate_affirmation_kinds required
      WHERE NOT EXISTS (
        SELECT FROM aso.gate_affirmations affirmation
        WHERE affirmation.case_id = c.id AND affirmation.kind = required.key
      )
    ),
    'qaComplete', l.approved_qa_revision = l.qa_revision AND NOT EXISTS (
      SELECT FROM aso.qa_check_types check_type
      LEFT JOIN aso.letter_qa_results qa
        ON qa.qa_check_type_id = check_type.id AND qa.letter_id = l.id
      WHERE qa.id IS NULL
         OR (check_type.severity = 'blocking' AND qa.outcome <> 'pass')
    ),
    'sourcesComplete', EXISTS (
      SELECT FROM aso.letter_claims claim WHERE claim.letter_id = l.id
    ) AND NOT EXISTS (
      SELECT FROM aso.letter_claims claim
      LEFT JOIN aso.documents document ON document.id = claim.document_id
      WHERE claim.letter_id = l.id AND (
        claim.document_id IS NULL OR claim.annotation_id IS NOT NULL OR (
          claim.page_number IS NULL OR document.id IS NULL
          OR document.effective_date IS NULL OR document.content_sha256 IS NULL
          OR document.page_count IS NULL OR claim.page_number > document.page_count
          OR document.patient_id <> c.patient_id
          OR (document.case_id IS NOT NULL AND document.case_id <> c.id)
        )
      )
    )
  ) INTO result
  FROM aso.letters l
  JOIN aso.cases c ON c.id = l.case_id
  LEFT JOIN LATERAL (
    SELECT s.version FROM aso.signatures s
    WHERE s.user_id = actor.actor_id AND s.is_current AND s.retired_at IS NULL
    ORDER BY s.version DESC LIMIT 1
  ) signature ON true
  WHERE l.id = target_letter;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION aso.advance_case_for_signed_letter(target_letter uuid)
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
 next_status:=CASE
   WHEN letter.purpose='prior_authorization_request' AND current_status='drafting' THEN 'ready'
   WHEN letter.purpose IN('corrected_resubmission','clinical_appeal')
     AND current_status='response_drafting' THEN 'response_ready'
 END;
 IF next_status IS NULL THEN RETURN; END IF;
 IF NOT EXISTS(SELECT FROM aso.case_status_transitions transition
   WHERE transition.from_status=current_status AND transition.to_status=next_status)
 THEN RAISE EXCEPTION 'signed-letter case transition is not allowed' USING ERRCODE='23514'; END IF;
 UPDATE aso.cases SET status=next_status WHERE id=letter.case_id;
END $$;

ALTER FUNCTION aso.submit_case_packet(uuid,uuid,bigint)
  RENAME TO submit_case_packet_unlocked;

CREATE FUNCTION aso.submit_case_packet(
  target_command uuid,
  target_case uuid,
  expected_letter_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE actor record;
BEGIN
 SELECT * INTO STRICT actor FROM aso.case_actor_context('submit');
 PERFORM aso.require_case(target_case,'submit');
 IF target_command IS NULL THEN
   RAISE EXCEPTION 'invalid submission request' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(
   actor.identity_id::text||':'||actor.practice_id::text||':'||target_command::text,0));
 PERFORM clinical_case.id FROM aso.cases clinical_case
   WHERE clinical_case.id=target_case AND clinical_case.practice_id=actor.practice_id
   FOR UPDATE;
 RETURN aso.submit_case_packet_unlocked(
   target_command,target_case,expected_letter_revision);
END $$;

ALTER FUNCTION aso.acknowledge_case_submission(uuid,uuid,uuid,text,timestamptz,integer)
  RENAME TO acknowledge_case_submission_unlocked;

CREATE FUNCTION aso.acknowledge_case_submission(
  target_command uuid,
  target_case uuid,
  target_submission uuid,
  payer_reference text,
  acknowledged_at timestamptz,
  acknowledged_pages integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE actor record;
BEGIN
 SELECT * INTO STRICT actor FROM aso.case_actor_context('submit');
 PERFORM aso.require_case(target_case,'submit');
 IF target_command IS NULL THEN
   RAISE EXCEPTION 'invalid acknowledgement request' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(
   actor.identity_id::text||':'||actor.practice_id::text||':'||target_command::text,0));
 RETURN aso.acknowledge_case_submission_unlocked(
   target_command,target_case,target_submission,payer_reference,
   acknowledged_at,acknowledged_pages);
END $$;

GRANT CREATE ON SCHEMA aso TO aso_case_owner;
ALTER FUNCTION aso.read_signing_target(uuid) OWNER TO aso_case_owner;
ALTER FUNCTION aso.advance_case_for_signed_letter(uuid) OWNER TO aso_case_owner;
ALTER FUNCTION aso.submit_case_packet(uuid,uuid,bigint) OWNER TO aso_case_owner;
ALTER FUNCTION aso.acknowledge_case_submission(uuid,uuid,uuid,text,timestamptz,integer)
  OWNER TO aso_case_owner;
REVOKE CREATE ON SCHEMA aso FROM aso_case_owner;

REVOKE ALL ON FUNCTION aso.submit_case_packet_unlocked(uuid,uuid,bigint),
  aso.acknowledge_case_submission_unlocked(uuid,uuid,uuid,text,timestamptz,integer)
  FROM PUBLIC,aso_case_executor;
REVOKE ALL ON FUNCTION aso.read_signing_target(uuid),
  aso.advance_case_for_signed_letter(uuid),
  aso.submit_case_packet(uuid,uuid,bigint),
  aso.acknowledge_case_submission(uuid,uuid,uuid,text,timestamptz,integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aso.submit_case_packet(uuid,uuid,bigint),
  aso.acknowledge_case_submission(uuid,uuid,uuid,text,timestamptz,integer)
  TO aso_case_executor;
