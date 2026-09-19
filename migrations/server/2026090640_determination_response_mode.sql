-- Response classification is a trusted, auditable command. It neither grants
-- clinical authority nor changes any recorded surgeon affirmation.
GRANT UPDATE(data) ON aso.determinations TO aso_case_owner;

CREATE OR REPLACE FUNCTION aso.determination_snapshot_json(target_determination uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 SELECT jsonb_build_object(
  'id',determination.id,'caseId',determination.case_id,'outcome',determination.outcome,
  'decidedOn',determination.decided_on,'reasonCode',determination.reason_code,
  'reasonText',determination.reason_text,'appealDeadline',determination.appeal_deadline,
  'documentId',determination.document_id,'documentName',document.name,
  'createdAt',determination.created_at,'responseMode',determination.data->>'confirmed_response_mode')
 INTO result FROM aso.determinations determination
 JOIN aso.documents document ON document.id=determination.document_id
 WHERE determination.id=target_determination;
 IF result IS NULL THEN RAISE EXCEPTION 'determination not found' USING ERRCODE='P0002'; END IF;
 RETURN result;
END $$;

CREATE FUNCTION aso.confirm_determination_response_mode(target_case uuid,target_command uuid,
 expected_determination uuid,target_mode text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE actor record; original aso.determination_commands%ROWTYPE;
 determination aso.determinations%ROWTYPE; payload jsonb; result jsonb; committed timestamptz;
BEGIN
 SELECT * INTO STRICT actor FROM aso.case_actor_context('determination_record');
 PERFORM aso.require_case(target_case,'determination_record');
 IF target_command IS NULL OR expected_determination IS NULL
 OR target_mode IS NULL OR target_mode NOT IN ('corrected_resubmission','clinical_appeal')
 THEN RAISE EXCEPTION 'invalid response mode command' USING ERRCODE='22023'; END IF;
 payload:=jsonb_build_object('action','confirm_response_mode',
  'expectedDeterminationId',expected_determination,'mode',target_mode);
 PERFORM pg_advisory_xact_lock(hashtextextended(actor.identity_id::text||actor.practice_id::text||target_command::text,640));
 SELECT * INTO original FROM aso.determination_commands command
 WHERE command.kratos_identity_id=actor.identity_id AND command.practice_id=actor.practice_id
 AND command.command_id=target_command;
 IF FOUND THEN
  IF original.case_id<>target_case OR original.payload IS DISTINCT FROM payload
  THEN RAISE EXCEPTION 'determination command conflict' USING ERRCODE='23505'; END IF;
  RETURN original.result;
 END IF;
 PERFORM id FROM aso.cases WHERE id=target_case AND practice_id=actor.practice_id FOR UPDATE;
 SELECT * INTO determination FROM aso.determinations
 WHERE case_id=target_case AND outcome IN ('denied','partial')
 ORDER BY decided_on DESC,created_at DESC,id DESC LIMIT 1 FOR UPDATE;
 IF determination.id IS NULL THEN RAISE EXCEPTION 'determination not found' USING ERRCODE='P0002'; END IF;
 IF determination.id<>expected_determination
 THEN RAISE EXCEPTION 'determination changed; reload current decision' USING ERRCODE='40001'; END IF;
 IF determination.data ? 'confirmed_response_mode'
 AND determination.data->>'confirmed_response_mode' IS DISTINCT FROM target_mode
 THEN RAISE EXCEPTION 'response mode already confirmed' USING ERRCODE='23505'; END IF;
 IF NOT(determination.data ? 'confirmed_response_mode') THEN
  UPDATE aso.determinations SET data=data||jsonb_build_object('confirmed_response_mode',target_mode)
  WHERE id=expected_determination;
 END IF;
 committed:=clock_timestamp();
 result:=jsonb_build_object('commandId',target_command,'caseId',target_case,
  'determinationId',expected_determination,'mode',target_mode,'committedAt',committed);
 INSERT INTO aso.determination_commands(kratos_identity_id,practice_id,command_id,actor_id,case_id,
  determination_id,payload,result,committed_at)
 VALUES(actor.identity_id,actor.practice_id,target_command,actor.actor_id,target_case,
  expected_determination,payload,result,committed);
 INSERT INTO aso.audit_events(practice_id,occurred_at,actor_id,actor_kratos_id,actor_label,actor_role,
  action,outcome,entity_table,entity_id,case_id,summary,data)
 VALUES(actor.practice_id,committed,actor.actor_id,actor.identity_id,actor.actor_label,'determination_record',
  'determination.response_mode','success','determinations',expected_determination,target_case,
  'Payer response mode confirmed',jsonb_build_object('commandId',target_command,'mode',target_mode));
 RETURN result;
END $$;
GRANT CREATE ON SCHEMA aso TO aso_case_owner;
ALTER FUNCTION aso.confirm_determination_response_mode(uuid,uuid,uuid,text) OWNER TO aso_case_owner;
REVOKE CREATE ON SCHEMA aso FROM aso_case_owner;
REVOKE ALL ON FUNCTION aso.confirm_determination_response_mode(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aso.confirm_determination_response_mode(uuid,uuid,uuid,text) TO aso_case_executor;
