-- Local integration regression; requires 0638/0639 and the synthetic demo's current
-- policy/evidence/four-part gate. No model call. Every test write rolls back.
-- docker compose exec -T db psql -U flint -d flint -X -v ON_ERROR_STOP=1 < scripts/test-document-generation-tasks.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$ DECLARE identity uuid; payload jsonb;
BEGIN
 IF NOT EXISTS(SELECT FROM aso.practices WHERE id='10000000-0000-4000-8000-000000000001' AND key='aso-demo')
 THEN RAISE EXCEPTION 'synthetic fixture required'; END IF;
 SELECT kratos_identity_id INTO STRICT identity FROM aso.users WHERE id='10000000-0000-4000-8000-000000000002';
 PERFORM set_config('aso.actor_id','10000000-0000-4000-8000-000000000002',true);
 PERFORM set_config('aso.kratos_identity_id',identity::text,true);
 PERFORM set_config('aso.practice_id','10000000-0000-4000-8000-000000000001',true);
 PERFORM set_config('aso.principal','user',true);
 PERFORM set_config('aso.session_expires_at',(clock_timestamp()+interval '10 minutes')::text,true);
 DELETE FROM aso.synthetic_generation_cases WHERE case_id='10000000-0000-4000-8000-000000000005';
 IF (aso.generation_snapshot('10000000-0000-4000-8000-000000000005','prior_authorization_request')->>'syntheticCase')::boolean
 THEN RAISE EXCEPTION 'unregistered fixture allowed synthetic inference'; END IF;
 INSERT INTO aso.synthetic_generation_cases(case_id,fixture)
 VALUES('10000000-0000-4000-8000-000000000005','web-case-to-letter');
 IF NOT (aso.generation_snapshot('10000000-0000-4000-8000-000000000005','prior_authorization_request')->>'syntheticCase')::boolean
 THEN RAISE EXCEPTION 'registered fixture refused synthetic inference'; END IF;
 RAISE NOTICE 'Passed: synthetic inference requires trusted fixture registry';
 SELECT jsonb_build_object('caseId',id,'commandId',gen_random_uuid(),
  'resolution',id::text||':resolutionRevision:r'||resolution_revision,
  'selection',id::text||':criteriaSelectionRevision:r'||criteria_selection_revision,
  'evidence',id::text||':evidenceRevision:r'||evidence_revision) INTO payload
 FROM aso.cases WHERE id='10000000-0000-4000-8000-000000000005';
 PERFORM set_config('aso_test.task_payload',payload::text,true);
END $$;
SET LOCAL ROLE aso_case_executor;
SET LOCAL search_path=pg_catalog,aso,pg_temp;
DO $$
DECLARE p jsonb:=current_setting('aso_test.task_payload')::jsonb;
 task jsonb; again jsonb; snapshot jsonb; source jsonb; assembly jsonb; bad jsonb;
 task_id uuid; case_id uuid:=(p->>'caseId')::uuid; command_id uuid:=(p->>'commandId')::uuid;
 receipt jsonb; body text; hash_bytes bytea; original_scope text;
BEGIN
 BEGIN
  PERFORM * FROM aso.document_generation_tasks;
  RAISE EXCEPTION 'direct task read accepted';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'Passed: executor cannot read task table directly'; END;
 task:=aso.start_document_task(command_id,case_id,p->>'resolution',p->>'selection',p->>'evidence','prior_authorization_request');
 task_id:=(task->>'id')::uuid;
 again:=aso.start_document_task(command_id,case_id,p->>'resolution',p->>'selection',p->>'evidence','prior_authorization_request');
 IF again IS DISTINCT FROM task THEN RAISE EXCEPTION 'start not idempotent'; END IF;
 RAISE NOTICE 'Passed: duplicate start returns same durable task';
 BEGIN
  PERFORM aso.start_document_task(command_id,case_id,p->>'resolution',p->>'selection',p->>'evidence','clinical_appeal');
  RAISE EXCEPTION 'changed task payload accepted';
 EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'Passed: reused command with changed payload refused'; END;
 original_scope:=current_setting('aso.practice_id');
 BEGIN
  PERFORM set_config('aso.practice_id','20000000-0000-4000-8000-000000000001',true);
  PERFORM aso.read_document_task_input(task_id);
  RAISE EXCEPTION 'foreign practice task input accepted';
 EXCEPTION WHEN insufficient_privilege OR no_data_found THEN RAISE NOTICE 'Passed: foreign practice task input refused'; END;
 PERFORM set_config('aso.practice_id',original_scope,true);
 snapshot:=aso.read_document_task_input(task_id);
 IF snapshot->>'caseId' IS DISTINCT FROM case_id::text OR nullif(snapshot->>'snapshotToken','') IS NULL
 THEN RAISE EXCEPTION 'missing snapshot identity'; END IF;
 SELECT s INTO STRICT source FROM jsonb_array_elements(snapshot->'sources') s
 WHERE jsonb_array_length(s->'criterionIds')>0 LIMIT 1;
 body:='# Synthetic task regression'||E'\n\n'||(source->>'text');
 assembly:=jsonb_build_object('kindKey','pa.initial_request','kindVersion',1,
  'templatePackage','synthetic-regression','templateDigest','synthetic-package-digest',
  'canonicalMarkdown',body,'renderedClaims',jsonb_build_array(jsonb_build_object('ordinal',1,
   'text',source->>'text','criterionId',source->'criterionIds'->>0,
   'provenance',jsonb_build_object('kind','document','documentId',source->>'documentId',
    'documentVersion',source->'documentVersion','title',source->>'title','page',source->'page',
    'effectiveDate',source->>'effectiveDate','contentSha256',source->>'contentSha256','sourceQuote',source->>'text'))),
  'qa',jsonb_build_array(
   jsonb_build_object('check','unsupported_claim','severity','blocking','outcome','pass','detail','Synthetic source bound'),
   jsonb_build_object('check','annotation_attribution','severity','blocking','outcome','pass','detail','No annotation'),
   jsonb_build_object('check','criterion_coverage','severity','blocking','outcome','fail','detail','Synthetic blocking failure'),
   jsonb_build_object('check','policy_version_currency','severity','blocking','outcome','pass','detail','Synthetic current policy'),
   jsonb_build_object('check','code_consistency','severity','warning','outcome','not_applicable','detail','No code pair'),
   jsonb_build_object('check','date_consistency','severity','warning','outcome','pass','detail','Synthetic dates'),
   jsonb_build_object('check','readability','severity','advisory','outcome','pass','detail','Synthetic prose')));
 hash_bytes:=public.digest(convert_to('pa.initial_request','UTF8')||decode('00','hex')||convert_to('1','UTF8')||decode('00','hex')||
  convert_to('synthetic-package-digest','UTF8')||decode('00','hex')||convert_to(body,'UTF8'),'sha256');
 assembly:=assembly||jsonb_build_object('contentSha256','sha256:'||encode(hash_bytes,'hex'));
 PERFORM aso.transition_document_task(task_id,'working',NULL);
 bad:=assembly-ARRAY['kindVersion','contentSha256'];
 BEGIN
  PERFORM aso.commit_document_generation(task_id,bad);
  RAISE EXCEPTION 'missing digest fields accepted';
 EXCEPTION WHEN invalid_parameter_value THEN RAISE NOTICE 'Passed: missing digest fields refused'; END;
 bad:=jsonb_set(assembly,'{contentSha256}','"sha256:wrong"');
 BEGIN
  PERFORM aso.commit_document_generation(task_id,bad);
  RAISE EXCEPTION 'wrong digest accepted';
 EXCEPTION WHEN invalid_parameter_value THEN RAISE NOTICE 'Passed: wrong engine digest refused'; END;
 bad:=jsonb_set(assembly,'{renderedClaims,0,provenance,contentSha256}','"wrong"');
 BEGIN
  PERFORM aso.commit_document_generation(task_id,bad);
  RAISE EXCEPTION 'wrong source hash accepted';
 EXCEPTION WHEN invalid_parameter_value THEN RAISE NOTICE 'Passed: source metadata mismatch refused'; END;
 receipt:=aso.commit_document_generation(task_id,assembly);
 again:=aso.commit_document_generation(task_id,assembly);
 IF again IS DISTINCT FROM receipt THEN RAISE EXCEPTION 'commit not idempotent'; END IF;
 again:=aso.read_document_task_artifacts(task_id);
 IF again->'assembly' IS DISTINCT FROM assembly OR again->'letter' IS DISTINCT FROM receipt
  OR again#>>'{assembly,canonicalMarkdown}' IS DISTINCT FROM body
  OR again#>>'{assembly,contentSha256}' IS DISTINCT FROM 'sha256:'||encode(hash_bytes,'hex')
 THEN RAISE EXCEPTION 'persisted artifact differs'; END IF;
 RAISE NOTICE 'Passed: exact assembly body digest and idempotent result persisted';
 IF aso.read_letter_assembly((receipt->>'letterId')::uuid)->'assembly' IS DISTINCT FROM assembly
 THEN RAISE EXCEPTION 'authorized letter assembly recovery differs'; END IF;
 RAISE NOTICE 'Passed: authorized letter assembly recovery preserves artifact';
 receipt:=aso.review_letter_workflow(gen_random_uuid(),(receipt->>'letterId')::uuid,(receipt->>'letterVersion')::integer);
 IF receipt->>'status'<>'draft' THEN RAISE EXCEPTION 'blocking QA review escaped draft'; END IF;
 RAISE NOTICE 'Passed: review preserves blocking QA and draft status';
 again:=aso.cancel_document_task(task_id);
 IF again->>'state'<>'completed' THEN RAISE EXCEPTION 'cancel rewrote completed task'; END IF;
 RAISE NOTICE 'Passed: completed result wins cancellation race';
 IF (aso.read_document_task_events(task_id,0)->0->>'eventType')<>'RUN_STARTED'
 OR NOT EXISTS(SELECT FROM jsonb_array_elements(aso.read_document_task_events(task_id,0)) e WHERE e->>'eventType'='RUN_FINISHED')
 THEN RAISE EXCEPTION 'missing committed event lifecycle'; END IF;
 RAISE NOTICE 'Passed: durable run events contain start and committed finish';
 PERFORM set_config('aso_test.committed_task',task_id::text,true);
END $$;
RESET ROLE;
DO $$ DECLARE t aso.document_generation_tasks%ROWTYPE;
BEGIN
 SELECT * INTO STRICT t FROM aso.document_generation_tasks WHERE id=current_setting('aso_test.committed_task')::uuid;
 IF (SELECT count(*) FROM aso.letter_qa_results WHERE letter_id=t.letter_id)<>7
 OR NOT EXISTS(SELECT FROM aso.letter_qa_results q JOIN aso.qa_check_types qt ON qt.id=q.qa_check_type_id
 WHERE q.letter_id=t.letter_id AND qt.key='criterion-coverage' AND q.outcome='fail')
 THEN RAISE EXCEPTION 'QA findings were lost or overwritten'; END IF;
 IF NOT EXISTS(SELECT FROM aso.local_replication_exclusions WHERE relation_oid='aso.document_generation_tasks'::regclass)
 OR NOT EXISTS(SELECT FROM aso.local_replication_exclusions WHERE relation_oid='aso.document_generation_events'::regclass)
 THEN RAISE EXCEPTION 'local task publication exclusion absent'; END IF;
 RAISE NOTICE 'Passed: seven findings retained and protected tables excluded';
END $$;
ROLLBACK;
