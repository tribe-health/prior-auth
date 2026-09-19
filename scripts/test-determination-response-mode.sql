-- Local 0640 regression. Synthetic demo only; every write rolls back.
-- docker compose exec -T db psql -U flint -d flint -X -v ON_ERROR_STOP=1 < scripts/test-determination-response-mode.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$ DECLARE identity uuid; source uuid; target uuid:=gen_random_uuid(); payload jsonb;
BEGIN
 IF NOT EXISTS(SELECT FROM aso.practices WHERE id='10000000-0000-4000-8000-000000000001' AND key='aso-demo')
 THEN RAISE EXCEPTION 'synthetic fixture required'; END IF;
 SELECT kratos_identity_id INTO STRICT identity FROM aso.users WHERE id='10000000-0000-4000-8000-000000000002';
 SELECT document_id INTO STRICT source FROM aso.determinations
 WHERE case_id='10000000-0000-4000-8000-000000000005' AND outcome IN ('denied','partial')
 ORDER BY decided_on DESC,created_at DESC,id DESC LIMIT 1;
 PERFORM set_config('aso.actor_id','10000000-0000-4000-8000-000000000002',true);
 PERFORM set_config('aso.kratos_identity_id',identity::text,true);
 PERFORM set_config('aso.practice_id','10000000-0000-4000-8000-000000000001',true);
 PERFORM set_config('aso.principal','user',true);
 PERFORM set_config('aso.session_expires_at',(clock_timestamp()+interval '10 minutes')::text,true);
 PERFORM set_config('aso_test.gates_before',(SELECT jsonb_build_object('rows',jsonb_agg(to_jsonb(a) ORDER BY a.kind),
 'at',(SELECT gate_affirmed_at FROM aso.cases WHERE id='10000000-0000-4000-8000-000000000005'))::text
 FROM aso.gate_affirmations a WHERE case_id='10000000-0000-4000-8000-000000000005'),true);
 INSERT INTO aso.determinations(id,case_id,outcome,decided_on,reason_text,document_id,created_at)
 VALUES(target,'10000000-0000-4000-8000-000000000005','denied',current_date+1,'Synthetic classification regression',source,clock_timestamp());
 SELECT jsonb_build_object('caseId',id,'determinationId',target,'commandId',gen_random_uuid(),
  'resolution',id::text||':resolutionRevision:r'||resolution_revision,
  'selection',id::text||':criteriaSelectionRevision:r'||criteria_selection_revision,
  'evidence',id::text||':evidenceRevision:r'||evidence_revision) INTO payload
 FROM aso.cases WHERE id='10000000-0000-4000-8000-000000000005';
 PERFORM set_config('aso_test.response_payload',payload::text,true);
END $$;
SET LOCAL ROLE aso_case_executor;
SET LOCAL search_path=pg_catalog,aso,pg_temp;
DO $$ DECLARE p jsonb:=current_setting('aso_test.response_payload')::jsonb;
 target_case uuid:=(p->>'caseId')::uuid; target uuid:=(p->>'determinationId')::uuid;
 command uuid:=(p->>'commandId')::uuid; receipt jsonb; old_scope text;
BEGIN
 BEGIN
  PERFORM aso.confirm_determination_response_mode(target_case,gen_random_uuid(),target,'initial_request');
  RAISE EXCEPTION 'unknown response mode accepted';
 EXCEPTION WHEN invalid_parameter_value THEN RAISE NOTICE 'Passed: exact response mode allowlist'; END;
 BEGIN
  PERFORM aso.confirm_determination_response_mode(target_case,gen_random_uuid(),gen_random_uuid(),'corrected_resubmission');
  RAISE EXCEPTION 'stale determination accepted';
 EXCEPTION WHEN serialization_failure THEN RAISE NOTICE 'Passed: stale determination refused'; END;
 old_scope:=current_setting('aso.practice_id');
 BEGIN
  PERFORM set_config('aso.practice_id','20000000-0000-4000-8000-000000000001',true);
  PERFORM aso.confirm_determination_response_mode(target_case,gen_random_uuid(),target,'corrected_resubmission');
  RAISE EXCEPTION 'foreign practice accepted';
 EXCEPTION WHEN insufficient_privilege OR no_data_found THEN RAISE NOTICE 'Passed: foreign practice refused'; END;
 PERFORM set_config('aso.practice_id',old_scope,true);
 receipt:=aso.confirm_determination_response_mode(target_case,command,target,'corrected_resubmission');
 IF receipt->>'mode'<>'corrected_resubmission' OR receipt->>'determinationId'<>target::text
 OR receipt IS DISTINCT FROM aso.confirm_determination_response_mode(target_case,command,target,'corrected_resubmission')
 THEN RAISE EXCEPTION 'mode confirmation not idempotent'; END IF;
 RAISE NOTICE 'Passed: exact mode receipt is idempotent';
 BEGIN
  PERFORM aso.confirm_determination_response_mode(target_case,command,target,'clinical_appeal');
  RAISE EXCEPTION 'changed command accepted';
 EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'Passed: reused command conflict refused'; END;
 BEGIN
  PERFORM aso.confirm_determination_response_mode(target_case,gen_random_uuid(),target,'clinical_appeal');
  RAISE EXCEPTION 'confirmed mode changed';
 EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'Passed: confirmed mode is immutable'; END;
 IF aso.read_latest_denied_determination(target_case)->>'responseMode'<>'corrected_resubmission'
 THEN RAISE EXCEPTION 'mode missing on reload'; END IF;
 RAISE NOTICE 'Passed: determination reload includes confirmed mode';
 PERFORM aso.start_document_task(gen_random_uuid(),target_case,p->>'resolution',p->>'selection',p->>'evidence','corrected_resubmission');
 RAISE NOTICE 'Passed: corrected resubmission retains existing affirmation prerequisites';
 BEGIN
  PERFORM aso.start_document_task(gen_random_uuid(),target_case,p->>'resolution',p->>'selection',p->>'evidence','clinical_appeal');
  RAISE EXCEPTION 'generation ignored confirmed response mode';
 EXCEPTION WHEN invalid_parameter_value THEN RAISE NOTICE 'Passed: generation refuses mismatched confirmed mode'; END;
END $$;
RESET ROLE;
DO $$ DECLARE p jsonb:=current_setting('aso_test.response_payload')::jsonb; source uuid; target uuid:=gen_random_uuid();
BEGIN
 SELECT document_id INTO source FROM aso.determinations WHERE id=(p->>'determinationId')::uuid;
 INSERT INTO aso.determinations(id,case_id,outcome,decided_on,reason_text,document_id,created_at)
 VALUES(target,(p->>'caseId')::uuid,'denied',current_date+2,'Synthetic clinical appeal regression',source,clock_timestamp());
 PERFORM set_config('aso_test.response_payload',jsonb_set(p,'{determinationId}',to_jsonb(target))::text,true);
END $$;
SET LOCAL ROLE aso_case_executor;
DO $$ DECLARE p jsonb:=current_setting('aso_test.response_payload')::jsonb;
BEGIN
 PERFORM aso.confirm_determination_response_mode((p->>'caseId')::uuid,gen_random_uuid(),(p->>'determinationId')::uuid,'clinical_appeal');
 BEGIN
  PERFORM aso.start_document_task(gen_random_uuid(),(p->>'caseId')::uuid,p->>'resolution',p->>'selection',p->>'evidence','clinical_appeal');
  RAISE EXCEPTION 'clinical appeal accepted old affirmations';
 EXCEPTION WHEN SQLSTATE 'P0005' THEN RAISE NOTICE 'Passed: clinical appeal requires fresh surgeon affirmation'; END;
END $$;
RESET ROLE;
DO $$ DECLARE gates jsonb;
BEGIN
 SELECT jsonb_build_object('rows',jsonb_agg(to_jsonb(a) ORDER BY a.kind),
 'at',(SELECT gate_affirmed_at FROM aso.cases WHERE id='10000000-0000-4000-8000-000000000005')) INTO gates
 FROM aso.gate_affirmations a WHERE case_id='10000000-0000-4000-8000-000000000005';
 IF gates IS DISTINCT FROM current_setting('aso_test.gates_before')::jsonb THEN RAISE EXCEPTION 'mode confirmation changed clinical gate'; END IF;
 RAISE NOTICE 'Passed: response mode confirmation preserves all surgeon gate records';
END $$;
ROLLBACK;
