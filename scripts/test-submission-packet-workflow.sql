-- Local 0641 regression. Synthetic demo only; every write rolls back.
-- docker compose exec -T db psql -U flint -d flint -X -v ON_ERROR_STOP=1 < scripts/test-submission-packet-workflow.sql
\set ON_ERROR_STOP on
BEGIN;
ALTER TABLE aso.letters DISABLE TRIGGER USER;
WITH unsubmitted AS (
  SELECT letter.id
  FROM aso.letters letter
  WHERE letter.case_id='10000000-0000-4000-8000-000000000005'
    AND letter.status='signed'
    AND NOT EXISTS (
      SELECT FROM aso.submissions submission WHERE submission.letter_id=letter.id
    )
  ORDER BY letter.generated_at DESC,letter.created_at DESC,letter.id DESC
  LIMIT 1
)
UPDATE aso.letters letter
SET generated_at=CASE WHEN letter.id=(SELECT id FROM unsubmitted)
  THEN clock_timestamp()+interval '1 minute'
  ELSE '2000-01-01T00:00:00Z'::timestamptz END
WHERE letter.case_id='10000000-0000-4000-8000-000000000005';
ALTER TABLE aso.letters ENABLE TRIGGER USER;
UPDATE aso.cases SET status='ready' WHERE id='10000000-0000-4000-8000-000000000005';
UPDATE aso.administering_entity_resolutions SET submission_channel_key='manual_synthetic'
WHERE case_id='10000000-0000-4000-8000-000000000005';
DO $$ DECLARE identity uuid;
BEGIN
 SELECT kratos_identity_id INTO STRICT identity FROM aso.users
 WHERE id='10000000-0000-4000-8000-000000000002';
 PERFORM set_config('aso.actor_id','10000000-0000-4000-8000-000000000002',true);
 PERFORM set_config('aso.kratos_identity_id',identity::text,true);
 PERFORM set_config('aso.practice_id','10000000-0000-4000-8000-000000000001',true);
 PERFORM set_config('aso.principal','user',true);
 PERFORM set_config('aso.session_expires_at',(clock_timestamp()+interval '10 minutes')::text,true);
END $$;
SET LOCAL ROLE aso_case_executor;
SET LOCAL search_path=pg_catalog,aso,pg_temp;
DO $$ DECLARE target_case uuid:='10000000-0000-4000-8000-000000000005';
 packet jsonb; sent jsonb; acknowledged jsonb; receipt_view jsonb; command uuid:=gen_random_uuid();
 ack_command uuid:=gen_random_uuid(); submission uuid; pages integer; manifest text;
BEGIN
 packet:=aso.read_submission_packet(target_case);
 IF packet->>'canSubmit'<>'true' OR packet->'letter'->>'status'<>'signed'
    OR jsonb_array_length(packet->'attachments')<2
 THEN RAISE EXCEPTION 'signed packet did not become ready'; END IF;
 RAISE NOTICE 'Passed: signed current letter and cited sources form a ready packet';
 BEGIN
   PERFORM aso.submit_case_packet(gen_random_uuid(),target_case,(packet->'letter'->>'revision')::bigint+1);
   RAISE EXCEPTION 'stale letter revision accepted';
 EXCEPTION WHEN serialization_failure THEN RAISE NOTICE 'Passed: stale letter revision refused'; END;
 sent:=aso.submit_case_packet(command,target_case,(packet->'letter'->>'revision')::bigint);
 IF sent->'submission'->>'commandId'<>command::text OR sent->'submission'->>'status'<>'sent'
 THEN RAISE EXCEPTION 'transmission receipt is incomplete'; END IF;
 IF sent IS DISTINCT FROM aso.submit_case_packet(command,target_case,(packet->'letter'->>'revision')::bigint)
 THEN RAISE EXCEPTION 'submission replay changed result'; END IF;
 RAISE NOTICE 'Passed: packet transmission is durable and idempotent';
 BEGIN
   PERFORM aso.submit_case_packet(command,target_case,(packet->'letter'->>'revision')::bigint+1);
   RAISE EXCEPTION 'changed submission command accepted';
 EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'Passed: changed submission command refused'; END;
 submission:=(sent->'submission'->>'id')::uuid;
 PERFORM set_config('aso_test.submission_id',submission::text,true);
 pages:=(sent->'submission'->>'totalPages')::integer;
 manifest:=sent->'submission'->>'manifestSha256Text';
 IF manifest<>encode(public.digest(convert_to((sent->'attachments')::text,'UTF8'),'sha256'),'hex')
 THEN RAISE EXCEPTION 'stored manifest does not match ordered attachments'; END IF;
 receipt_view:=aso.read_submission_receipt(target_case);
 IF jsonb_array_length(receipt_view->'custody')<>3
 THEN RAISE EXCEPTION 'initial custody chain is incomplete'; END IF;
 RAISE NOTICE 'Passed: exact manifest and authorized custody projection persisted';
 acknowledged:=aso.acknowledge_case_submission(ack_command,target_case,submission,
   'SYNTHETIC-ACK-001',clock_timestamp(),pages);
 IF acknowledged->'receipt'->>'commandId'<>ack_command::text
    OR acknowledged->'packet'->'submission'->>'status'<>'acknowledged'
    OR jsonb_array_length(acknowledged->'custody')<>4
 THEN RAISE EXCEPTION 'acknowledgement view is incomplete'; END IF;
 IF acknowledged IS DISTINCT FROM aso.acknowledge_case_submission(ack_command,target_case,submission,
   'SYNTHETIC-ACK-001',(acknowledged->'receipt'->>'acknowledgedAt')::timestamptz,pages)
 THEN RAISE EXCEPTION 'acknowledgement replay changed result'; END IF;
 RAISE NOTICE 'Passed: sent remains distinct until payer acknowledgement is recorded';
 BEGIN
   PERFORM aso.acknowledge_case_submission(ack_command,target_case,submission,
     'DIFFERENT-ACK',clock_timestamp(),pages);
   RAISE EXCEPTION 'changed acknowledgement command accepted';
 EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'Passed: changed acknowledgement command refused'; END;
END $$;
RESET ROLE;
DO $$ DECLARE submission uuid:=current_setting('aso_test.submission_id')::uuid;
BEGIN
 IF (SELECT count(*) FROM aso.custody_events WHERE submission_id=submission)<>4
    OR EXISTS(SELECT FROM aso.custody_events current_event LEFT JOIN aso.custody_events previous_event
      ON previous_event.submission_id=current_event.submission_id AND previous_event.sequence=current_event.sequence-1
      WHERE current_event.submission_id=submission AND current_event.sequence>1
        AND current_event.previous_hash IS DISTINCT FROM previous_event.entry_hash)
 THEN RAISE EXCEPTION 'custody hash chain is incomplete'; END IF;
 RAISE NOTICE 'Passed: custody hashes form an append-only chain';
END $$;
ROLLBACK;
