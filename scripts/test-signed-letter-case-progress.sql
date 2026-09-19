\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  target_case constant uuid := '10000000-0000-4000-8000-000000000005';
  signed_letter uuid;
  response_letter uuid;
  letter_version integer;
  expected_qa_revision bigint;
  starting_revision bigint;
BEGIN
  SELECT candidate.id, candidate.version, candidate.qa_revision
    INTO STRICT signed_letter, letter_version, expected_qa_revision
    FROM aso.letters candidate
   WHERE candidate.case_id = target_case
     AND candidate.purpose = 'prior_authorization_request'
     AND candidate.status = 'signed'
   ORDER BY candidate.generated_at DESC, candidate.created_at DESC, candidate.id DESC
   LIMIT 1;

  IF (SELECT is_nullable FROM information_schema.columns
       WHERE table_schema = 'aso' AND table_name = 'letters'
         AND column_name = 'generated_at') <> 'NO' THEN
    RAISE EXCEPTION 'generated_at is still nullable';
  END IF;

  ALTER TABLE aso.letter_sign_commands DISABLE TRIGGER USER;
  DELETE FROM aso.letter_sign_commands WHERE letter_id = signed_letter;
  ALTER TABLE aso.letter_sign_commands ENABLE TRIGGER USER;
  ALTER TABLE aso.letters DISABLE TRIGGER USER;
  UPDATE aso.letters
     SET status = 'approved', signature_id = NULL, signed_at = NULL,
         generated_at = clock_timestamp() + interval '1 minute'
   WHERE id = signed_letter;
  ALTER TABLE aso.letters ENABLE TRIGGER USER;

  UPDATE aso.cases SET status = 'drafting' WHERE id = target_case;
  SELECT status_revision INTO STRICT starting_revision
    FROM aso.cases WHERE id = target_case;

  PERFORM set_config('aso.actor_id',
    '10000000-0000-4000-8000-000000000002', true);
  PERFORM set_config('aso.kratos_identity_id',
    'c87af03e-9155-4f7b-9ae8-b945a396d02a', true);
  PERFORM set_config('aso.practice_id',
    '10000000-0000-4000-8000-000000000001', true);
  PERFORM set_config('aso.session_expires_at',
    (clock_timestamp() + interval '1 hour')::text, true);
  PERFORM set_config('aso.principal', 'user', true);
  PERFORM aso.apply_letter_sign_command(
    gen_random_uuid(), signed_letter, letter_version, expected_qa_revision, 1);

  IF (SELECT status FROM aso.cases WHERE id = target_case) <> 'ready' THEN
    RAISE EXCEPTION 'the signing command did not advance the initial request to ready';
  END IF;
  IF (SELECT status_revision FROM aso.cases WHERE id = target_case)
       <> starting_revision + 1 THEN
    RAISE EXCEPTION 'initial signing advanced more than the drafting-to-ready edge';
  END IF;

  SELECT candidate.id INTO STRICT response_letter
    FROM aso.letters candidate
   WHERE candidate.case_id = target_case
     AND candidate.purpose IN ('corrected_resubmission', 'clinical_appeal')
   ORDER BY candidate.generated_at DESC, candidate.created_at DESC, candidate.id DESC
   LIMIT 1;
  ALTER TABLE aso.letters DISABLE TRIGGER USER;
  UPDATE aso.letters
     SET status = 'signed',
         signature_id = '10000000-0000-4000-8000-000000000017',
         signed_at = clock_timestamp(),
         generated_at = clock_timestamp() + interval '2 minutes'
   WHERE id = response_letter;
  ALTER TABLE aso.letters ENABLE TRIGGER USER;
  UPDATE aso.cases SET status = 'submitted' WHERE id = target_case;
  SELECT status_revision INTO STRICT starting_revision
    FROM aso.cases WHERE id = target_case;
  PERFORM aso.advance_case_for_signed_letter(response_letter);
  IF (SELECT status FROM aso.cases WHERE id = target_case) <> 'submitted'
     OR (SELECT status_revision FROM aso.cases WHERE id = target_case) <> starting_revision THEN
    RAISE EXCEPTION 'response signing manufactured an adverse determination';
  END IF;

  UPDATE aso.cases SET status = 'response_drafting' WHERE id = target_case;
  SELECT status_revision INTO STRICT starting_revision
    FROM aso.cases WHERE id = target_case;
  PERFORM aso.advance_case_for_signed_letter(response_letter);
  IF (SELECT status FROM aso.cases WHERE id = target_case) <> 'response_ready'
     OR (SELECT status_revision FROM aso.cases WHERE id = target_case) <> starting_revision + 1 THEN
    RAISE EXCEPTION 'response signing did not advance exactly one allowed edge';
  END IF;
  IF NOT EXISTS (
    SELECT FROM pg_trigger
     WHERE tgrelid = 'aso.letters'::regclass
       AND tgname = 'letters_advance_case_after_signature'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'signed-letter progression trigger is missing';
  END IF;
END $$;

ROLLBACK;
