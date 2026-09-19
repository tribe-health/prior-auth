-- Host-owned generation tasks. No model call holds a database transaction.
-- Only deployment initialization may classify a fixture for offshore synthetic inference.
CREATE TABLE aso.synthetic_generation_cases (
 case_id uuid PRIMARY KEY REFERENCES aso.cases(id),
 fixture text NOT NULL CHECK(fixture='web-case-to-letter')
);
COMMENT ON TABLE aso.synthetic_generation_cases IS 'Lane: server-authoritative relational. Privacy: local. Admin-owned synthetic inference classification; excluded from replication.';
ALTER TABLE aso.synthetic_generation_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.synthetic_generation_cases FROM PUBLIC,aso_case_executor;
GRANT SELECT ON aso.synthetic_generation_cases TO aso_case_owner;
CREATE POLICY synthetic_generation_cases_owner ON aso.synthetic_generation_cases TO aso_case_owner USING(true);
CREATE TABLE aso.document_generation_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 practice_id uuid NOT NULL REFERENCES aso.practices(id),
 kratos_identity_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES aso.users(id),
 case_id uuid NOT NULL,
 command_id uuid NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('prior_authorization_request','corrected_resubmission','clinical_appeal')),
 state text NOT NULL DEFAULT 'submitted' CHECK(state IN ('submitted','working','input-required','auth-required','completed','canceled','failed','rejected')),
 stage text NOT NULL DEFAULT 'submitted',
 request_payload jsonb NOT NULL,
 input_snapshot jsonb NOT NULL,
 letter_id uuid REFERENCES aso.letters(id),
 result jsonb,
 error_code text,
 last_sequence bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(kratos_identity_id,practice_id,command_id),
 FOREIGN KEY(case_id,practice_id) REFERENCES aso.cases(id,practice_id),
 CHECK ((state='completed')=(letter_id IS NOT NULL AND result IS NOT NULL))
);
CREATE TABLE aso.document_generation_events (
 task_id uuid NOT NULL REFERENCES aso.document_generation_tasks(id),
 sequence bigint NOT NULL CHECK(sequence>0),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 event_type text NOT NULL,
 payload jsonb NOT NULL,
 PRIMARY KEY(task_id,sequence)
);
COMMENT ON TABLE aso.document_generation_tasks IS 'Lane: server-authoritative relational. Privacy: local. Protected task input and receipts; excluded from replication.';
COMMENT ON TABLE aso.document_generation_events IS 'Lane: append-only log. Privacy: local. Protected task event payloads; excluded from replication.';
ALTER TABLE aso.document_generation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE aso.document_generation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.document_generation_tasks,aso.document_generation_events FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON aso.document_generation_tasks TO aso_case_owner;
GRANT SELECT,INSERT ON aso.document_generation_events TO aso_case_owner;
CREATE POLICY document_generation_tasks_owner ON aso.document_generation_tasks TO aso_case_owner USING(true) WITH CHECK(true);
CREATE POLICY document_generation_events_owner ON aso.document_generation_events TO aso_case_owner USING(true) WITH CHECK(true);
GRANT SELECT ON aso.annotations,aso.patients,aso.practices,aso.payers,aso.policies,aso.criteria_catalog_state,aso.case_criteria_selections,aso.administering_entity_resolutions TO aso_case_owner;
-- UPDATE on only the key permits row SHARE locking without granting general
-- source/header mutation to the trusted function owner.
GRANT UPDATE(id) ON aso.policies,aso.practices,aso.patients,aso.payers TO aso_case_owner;
CREATE POLICY document_generation_annotations_owner ON aso.annotations TO aso_case_owner USING(true);

CREATE FUNCTION aso.document_task_json(target_task uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
 SELECT jsonb_build_object('id',id,'caseId',case_id,'commandId',command_id,'purpose',purpose,
 'state',state,'stage',stage,'createdAt',created_at,'updatedAt',updated_at,
 'letterId',letter_id,'errorCode',error_code,'lastSequence',last_sequence)
 FROM aso.document_generation_tasks WHERE id=target_task;
$$;

CREATE FUNCTION aso.authorize_document_task(target_task uuid,capability text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE actor record; target_case uuid;
BEGIN
 SELECT * INTO STRICT actor FROM aso.case_actor_context(capability);
 SELECT task.case_id INTO target_case FROM aso.document_generation_tasks task
 WHERE task.id=target_task AND task.practice_id=actor.practice_id
 AND task.kratos_identity_id=actor.identity_id AND task.actor_id=actor.actor_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'document task not found' USING ERRCODE='P0002'; END IF;
 PERFORM aso.require_case(target_case,capability);
END $$;

CREATE FUNCTION aso.generation_snapshot(target_case uuid,target_purpose text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE actor record; c aso.cases%ROWTYPE; selected aso.case_criteria_selections%ROWTYPE;
 policy aso.policies%ROWTYPE; denied aso.determinations%ROWTYPE; initial_id uuid;
 sources jsonb; annotations_json jsonb; required jsonb; evidence_json jsonb; context_json jsonb;
 captured jsonb; token text; result jsonb; practice_json jsonb; patient_json jsonb; payer_json jsonb; surgeon_json jsonb;
BEGIN
 SELECT * INTO STRICT actor FROM aso.case_actor_context('letter_generate');
 PERFORM aso.require_case(target_case,'letter_generate');
 IF target_purpose NOT IN ('prior_authorization_request','corrected_resubmission','clinical_appeal') OR target_purpose IS NULL
 THEN RAISE EXCEPTION 'invalid generation purpose' USING ERRCODE='22023'; END IF;
 SELECT * INTO STRICT c FROM aso.cases WHERE id=target_case AND practice_id=actor.practice_id;
 SELECT * INTO selected FROM aso.case_criteria_selections WHERE case_id=target_case;
 IF NOT FOUND OR selected.resolution_revision<>c.resolution_revision
 OR selected.criteria_catalog_revision IS DISTINCT FROM (SELECT revision_token FROM aso.criteria_catalog_state WHERE singleton)
 OR NOT EXISTS(SELECT FROM aso.administering_entity_resolutions resolution WHERE resolution.case_id=target_case
 AND resolution.state='resolved' AND resolution.revision=c.resolution_revision AND resolution.case_input_revision=c.case_input_revision)
 THEN RAISE EXCEPTION 'stale generation selection' USING ERRCODE='40001'; END IF;
 SELECT * INTO STRICT policy FROM aso.policies WHERE id=selected.policy_id;
 IF c.gate_affirmed_at IS NULL OR EXISTS(SELECT FROM aso.gate_affirmation_kinds kind WHERE NOT EXISTS(
 SELECT FROM aso.gate_affirmations a WHERE a.case_id=target_case AND a.kind=kind.key))
 THEN RAISE EXCEPTION 'clinical gate incomplete' USING ERRCODE='P0005'; END IF;
 IF NOT EXISTS(SELECT FROM aso.case_evidence WHERE case_id=target_case) OR EXISTS(
 SELECT FROM aso.case_evidence e WHERE e.case_id=target_case AND (e.state='void' OR NOT EXISTS(
 SELECT FROM aso.evidence_citations citation JOIN aso.documents d ON d.id=citation.document_id
 JOIN aso.document_pages p ON p.document_id=d.id AND p.page_number=citation.page_number
 WHERE citation.case_evidence_id=e.id AND d.practice_id=actor.practice_id AND d.case_id=target_case
 AND d.processing_status='ready' AND d.effective_date IS NOT NULL AND d.content_sha256 IS NOT NULL
 AND p.page_number>0 AND p.page_number<=d.page_count AND nullif(btrim(p.text),'') IS NOT NULL
 AND citation.document_effective_date=d.effective_date
 AND citation.content_sha256_text=encode(d.content_sha256,'hex')
 AND nullif(btrim(citation.quote),'') IS NOT NULL AND strpos(p.text,citation.quote)>0)))
 THEN RAISE EXCEPTION 'sourced evidence incomplete' USING ERRCODE='P0006'; END IF;
 IF EXISTS(SELECT FROM unnest(selected.selected_criterion_ids) AS required_id(value)
 WHERE NOT EXISTS(SELECT FROM aso.case_evidence e WHERE e.case_id=target_case AND e.criterion_id=required_id.value))
 OR EXISTS(SELECT FROM aso.case_evidence e WHERE e.case_id=target_case AND NOT(e.criterion_id=ANY(selected.selected_criterion_ids)))
 THEN RAISE EXCEPTION 'evidence selection changed' USING ERRCODE='40001'; END IF;
 IF target_purpose<>'prior_authorization_request' THEN
  SELECT * INTO denied FROM aso.determinations WHERE case_id=target_case AND outcome IN ('denied','partial')
  ORDER BY decided_on DESC,created_at DESC,id DESC LIMIT 1;
  IF denied.id IS NULL THEN RAISE EXCEPTION 'determination not found' USING ERRCODE='P0002'; END IF;
  IF (denied.data ? 'confirmed_response_mode' AND denied.data->>'confirmed_response_mode' IS DISTINCT FROM target_purpose)
   OR (target_purpose='corrected_resubmission' AND denied.data->>'confirmed_response_mode' IS DISTINCT FROM 'corrected_resubmission')
  THEN RAISE EXCEPTION 'response classification required' USING ERRCODE='22023'; END IF;
  SELECT id INTO initial_id FROM aso.letters WHERE case_id=target_case AND purpose='prior_authorization_request'
  AND status='signed' ORDER BY version DESC LIMIT 1;
  IF initial_id IS NULL THEN RAISE EXCEPTION 'signed initial request not found' USING ERRCODE='P0002'; END IF;
  IF target_purpose='clinical_appeal' AND EXISTS(SELECT FROM aso.gate_affirmation_kinds kind WHERE NOT EXISTS(
   SELECT FROM aso.gate_affirmations a WHERE a.case_id=target_case AND a.kind=kind.key AND a.affirmed_at>denied.created_at))
  THEN RAISE EXCEPTION 'fresh appeal gate required' USING ERRCODE='P0005'; END IF;
 END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',d.id::text||':p'||p.page_number,
  'documentId',d.id,'documentVersion',d.document_version,'title',d.name,'page',p.page_number,
  'effectiveDate',d.effective_date,'contentSha256',encode(d.content_sha256,'hex'),'text',p.text,
  'criterionIds',COALESCE((SELECT jsonb_agg(DISTINCT e.criterion_id ORDER BY e.criterion_id)
   FROM aso.case_evidence e JOIN aso.evidence_citations citation ON citation.case_evidence_id=e.id
   WHERE e.case_id=target_case AND citation.document_id=d.id AND citation.page_number=p.page_number),'[]'::jsonb))
  ORDER BY d.id,p.page_number),'[]'::jsonb) INTO sources
 FROM aso.documents d JOIN aso.document_pages p ON p.document_id=d.id
 WHERE d.case_id=target_case AND d.practice_id=actor.practice_id AND d.processing_status='ready'
 AND d.effective_date IS NOT NULL AND octet_length(d.content_sha256)=32
 AND p.page_number>0 AND p.page_number<=d.page_count AND nullif(btrim(p.text),'') IS NOT NULL;
 IF jsonb_array_length(sources)>128 OR octet_length(sources::text)>2097152
 THEN RAISE EXCEPTION 'generation source budget exceeded' USING ERRCODE='22023'; END IF;
 IF denied.id IS NOT NULL AND NOT EXISTS(SELECT FROM jsonb_array_elements(sources) s WHERE s->>'documentId'=denied.document_id::text)
 THEN RAISE EXCEPTION 'determination source incomplete' USING ERRCODE='P0006'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',a.id,'sourceId',s->>'id','author',a.author_label,
  'authoredOn',a.created_at::date,'text',a.body) ORDER BY a.id,s->>'id'),'[]'::jsonb) INTO annotations_json
 FROM aso.annotations a CROSS JOIN jsonb_array_elements(sources) s
 WHERE a.case_id=target_case AND a.practice_id=actor.practice_id AND a.is_included
 AND (a.target_document_id::text=s->>'documentId' OR EXISTS(
 SELECT FROM aso.evidence_citations citation WHERE citation.case_evidence_id=a.target_evidence_id
 AND citation.document_id::text=s->>'documentId' AND citation.page_number=(s->>'page')::integer));
 SELECT COALESCE(jsonb_agg(criterion.id ORDER BY criterion.id),'[]'::jsonb) INTO required
 FROM aso.criteria criterion WHERE criterion.id=ANY(selected.selected_criterion_ids) AND criterion.is_mandatory;
 SELECT COALESCE(jsonb_object_agg(e.criterion_id::text,e.state),'{}'::jsonb) INTO evidence_json
 FROM aso.case_evidence e WHERE e.case_id=target_case;
 SELECT to_jsonb(p) INTO practice_json FROM aso.practices p WHERE p.id=c.practice_id;
 SELECT to_jsonb(p) INTO patient_json FROM aso.patients p WHERE p.id=c.patient_id;
 SELECT to_jsonb(p) INTO payer_json FROM aso.payers p WHERE p.id=c.payer_id;
 SELECT to_jsonb(p) INTO surgeon_json FROM aso.users p WHERE p.id=c.surgeon_id;
 context_json:=jsonb_build_object('case_number',c.id::text,'letter_date',current_date,'practice',jsonb_build_object('name',practice_json->>'name'),
  'payer',jsonb_build_object('name',payer_json->>'name'),'payer_type','commercial',
  'member',jsonb_build_object('name',concat_ws(' ',patient_json->>'given_name',patient_json->>'family_name'),
   'dob',patient_json->>'birth_date','member_id',c.member_id),
  'request',jsonb_build_object('procedure',c.procedure_code,'date_of_service',c.date_of_service,
   'codes',jsonb_build_array(jsonb_build_object('code',c.procedure_code,'description','Requested procedure','units',1)),
   'icd10','[]'::jsonb,'facility','{}'::jsonb),
  'requesting_physician',jsonb_build_object('name',surgeon_json->>'full_name','npi',surgeon_json->>'npi'),
  'policy',jsonb_build_object('title',policy.name,'id',policy.policy_number,'version',policy.version),
  'criteria',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'text',requirement) ORDER BY ordinal,id)
   FROM aso.criteria WHERE id=ANY(selected.selected_criterion_ids)),'[]'::jsonb),
  'exhibits',COALESCE((SELECT jsonb_agg(jsonb_build_object('label',d.id,'title',d.name,'date',d.effective_date,'pages',d.page_count) ORDER BY d.id)
   FROM aso.documents d WHERE d.case_id=target_case AND d.processing_status='ready'),'[]'::jsonb),
  'contacts','{}'::jsonb,'patient_cc',false);
 IF denied.id IS NOT NULL THEN context_json:=context_json||jsonb_build_object('response_mode',target_purpose,
  'determination',jsonb_build_object('date',denied.decided_on,'reference',denied.id,'document_id',denied.document_id),
  'appeal',jsonb_build_object('deadline',denied.appeal_deadline)); END IF;
 -- The fingerprint includes all consumed authoritative records, including gate
 -- values/timestamps and source content, not only the three browser tokens.
 captured:=jsonb_build_object('case',to_jsonb(c),'selection',to_jsonb(selected),'policy',to_jsonb(policy),
  'determination',to_jsonb(denied),'sources',sources,'annotations',annotations_json,
  'evidence',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM aso.case_evidence e WHERE e.case_id=target_case),'[]'::jsonb),
  'citations',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM aso.evidence_citations x
    JOIN aso.case_evidence e ON e.id=x.case_evidence_id WHERE e.case_id=target_case),'[]'::jsonb),
  'gate',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.kind) FROM aso.gate_affirmations a WHERE a.case_id=target_case),'[]'::jsonb),
  'criteria',COALESCE((SELECT jsonb_agg(to_jsonb(criterion) ORDER BY criterion.id) FROM aso.criteria criterion WHERE criterion.id=ANY(selected.selected_criterion_ids)),'[]'::jsonb),
  'documents',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM aso.documents d WHERE d.case_id=target_case),'[]'::jsonb),
  'context',context_json,'originalRequestId',initial_id);
 token:=encode(public.digest(convert_to(captured::text,'UTF8'),'sha256'),'hex');
 result:=jsonb_build_object('caseId',target_case,'practiceId',actor.practice_id,'snapshotToken',token,
  'syntheticCase',COALESCE(practice_json->>'key'='aso-demo' AND EXISTS(SELECT FROM aso.synthetic_generation_cases fixture WHERE fixture.case_id=target_case AND fixture.fixture='web-case-to-letter'),false),
  'purpose',target_purpose,'originalRequestId',initial_id,'determinationId',denied.id,
  'sources',sources,'annotations',annotations_json,'requiredCriteria',required,'evidence',evidence_json,'context',context_json,
  'checks',jsonb_build_object('citedPolicyVersion',policy.version,'inForcePolicyVersion',
    CASE WHEN policy.effective_from<=c.date_of_service AND (policy.effective_to IS NULL OR policy.effective_to>c.date_of_service) THEN policy.version END,
    'requestedCodes',jsonb_build_array(c.procedure_code),'affirmedPathwayCodes','[]'::jsonb,
    'dates',jsonb_build_array(jsonb_build_array('date_of_service',c.date_of_service::text))));
 RETURN result;
END $$;

CREATE FUNCTION aso.start_document_task(target_command uuid,target_case uuid,expected_resolution text,
 expected_selection text,expected_evidence text,target_purpose text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE actor record; t aso.document_generation_tasks%ROWTYPE; payload jsonb; snapshot jsonb; c aso.cases%ROWTYPE;
BEGIN
 SELECT * INTO STRICT actor FROM aso.case_actor_context('letter_generate');
 PERFORM aso.require_case(target_case,'letter_generate');
 IF target_command IS NULL THEN RAISE EXCEPTION 'command required' USING ERRCODE='22023'; END IF;
 payload:=jsonb_build_object('expectedRevisions',jsonb_build_object('resolutionRevision',expected_resolution,
  'criteriaSelectionRevision',expected_selection,'evidenceRevision',expected_evidence),'purpose',target_purpose);
 -- Serialize duplicate commands even when they target different cases.
 PERFORM pg_advisory_xact_lock(hashtextextended(actor.identity_id::text||actor.practice_id::text||target_command::text,638));
 SELECT * INTO t FROM aso.document_generation_tasks WHERE kratos_identity_id=actor.identity_id
 AND practice_id=actor.practice_id AND command_id=target_command;
 IF FOUND THEN
  IF t.case_id<>target_case OR t.request_payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'task command conflict' USING ERRCODE='23505'; END IF;
  RETURN aso.document_task_json(t.id);
 END IF;
 IF EXISTS(SELECT FROM aso.letter_workflow_commands WHERE kratos_identity_id=actor.identity_id AND practice_id=actor.practice_id AND command_id=target_command)
 THEN RAISE EXCEPTION 'command already used' USING ERRCODE='23505'; END IF;
 SELECT * INTO STRICT c FROM aso.cases WHERE id=target_case AND practice_id=actor.practice_id FOR UPDATE;
 IF expected_resolution IS DISTINCT FROM target_case::text||':resolutionRevision:r'||c.resolution_revision
 OR expected_selection IS DISTINCT FROM target_case::text||':criteriaSelectionRevision:r'||c.criteria_selection_revision
 OR expected_evidence IS DISTINCT FROM target_case::text||':evidenceRevision:r'||c.evidence_revision
 THEN RAISE EXCEPTION 'stale generation revisions' USING ERRCODE='40001'; END IF;
 snapshot:=aso.generation_snapshot(target_case,target_purpose);
 INSERT INTO aso.document_generation_tasks(practice_id,kratos_identity_id,actor_id,case_id,command_id,purpose,request_payload,input_snapshot)
 VALUES(actor.practice_id,actor.identity_id,actor.actor_id,target_case,target_command,target_purpose,payload,snapshot) RETURNING * INTO t;
 UPDATE aso.document_generation_tasks SET last_sequence=1 WHERE id=t.id;
 INSERT INTO aso.document_generation_events(task_id,sequence,event_type,payload)
 VALUES(t.id,1,'RUN_STARTED',jsonb_build_object('type','RUN_STARTED','threadId',target_case,'runId',t.id));
 RETURN aso.document_task_json(t.id);
END $$;

CREATE FUNCTION aso.read_document_task(target_task uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$ BEGIN
 PERFORM aso.authorize_document_task(target_task,'case:read'); RETURN aso.document_task_json(target_task);
END $$;
CREATE FUNCTION aso.read_document_task_input(target_task uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$ BEGIN
 PERFORM aso.authorize_document_task(target_task,'letter_generate');
 RETURN (SELECT input_snapshot FROM aso.document_generation_tasks WHERE id=target_task);
END $$;
CREATE FUNCTION aso.read_document_task_events(target_task uuid,after_sequence bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$ BEGIN
 PERFORM aso.authorize_document_task(target_task,'case:read');
 IF after_sequence IS NULL OR after_sequence<0 THEN RAISE EXCEPTION 'invalid event cursor' USING ERRCODE='22023'; END IF;
 RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object('taskId',task_id,'sequence',sequence,
  'occurredAt',occurred_at,'eventType',event_type,'payload',payload) ORDER BY sequence),'[]'::jsonb)
  FROM (SELECT * FROM aso.document_generation_events WHERE task_id=target_task AND sequence>after_sequence ORDER BY sequence LIMIT 256) events);
END $$;
CREATE FUNCTION aso.append_document_task_event(target_task uuid,target_event text,target_payload jsonb,target_stage text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE t aso.document_generation_tasks%ROWTYPE;
BEGIN
 PERFORM aso.authorize_document_task(target_task,'letter_generate');
 SELECT * INTO STRICT t FROM aso.document_generation_tasks WHERE id=target_task FOR UPDATE;
 IF t.state IN ('completed','canceled','failed','rejected') THEN RAISE EXCEPTION 'task is terminal' USING ERRCODE='55000'; END IF;
 IF target_event NOT IN ('RUN_STARTED','STEP_STARTED','STEP_FINISHED','TEXT_MESSAGE_START','TEXT_MESSAGE_CONTENT',
 'TEXT_MESSAGE_END','STATE_SNAPSHOT','CUSTOM','RUN_ERROR') OR target_event IS NULL OR target_payload IS NULL OR octet_length(target_payload::text)>(CASE WHEN target_event='CUSTOM' THEN 2097152 ELSE 65536 END)
 OR nullif(btrim(target_stage),'') IS NULL THEN RAISE EXCEPTION 'invalid event' USING ERRCODE='22023'; END IF;
 UPDATE aso.document_generation_tasks SET last_sequence=last_sequence+1,stage=target_stage,updated_at=clock_timestamp()
 WHERE id=target_task RETURNING * INTO t;
 INSERT INTO aso.document_generation_events(task_id,sequence,event_type,payload)
 VALUES(target_task,t.last_sequence,target_event,target_payload);
 RETURN aso.document_task_json(target_task);
END $$;
CREATE FUNCTION aso.transition_document_task(target_task uuid,target_state text,target_error text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE t aso.document_generation_tasks%ROWTYPE;
BEGIN
 PERFORM aso.authorize_document_task(target_task,'letter_generate');
 SELECT * INTO STRICT t FROM aso.document_generation_tasks WHERE id=target_task FOR UPDATE;
 IF t.state=target_state THEN RETURN aso.document_task_json(target_task); END IF;
 IF t.state IN ('completed','canceled','failed','rejected') OR target_state NOT IN ('working','input-required','auth-required','canceled','failed','rejected')
 OR target_state IS NULL OR (target_state='working' AND t.state NOT IN ('submitted','input-required','auth-required'))
 OR (target_state IN ('input-required','auth-required') AND t.state<>'working')
 THEN RAISE EXCEPTION 'invalid task transition' USING ERRCODE='55000'; END IF;
 IF target_error IS NOT NULL AND target_error !~ '^[a-z][a-z0-9_]{0,79}$' THEN RAISE EXCEPTION 'invalid error code' USING ERRCODE='22023'; END IF;
 UPDATE aso.document_generation_tasks SET state=target_state,stage=target_state,error_code=target_error,
 updated_at=clock_timestamp(),last_sequence=last_sequence+1 WHERE id=target_task RETURNING * INTO t;
 INSERT INTO aso.document_generation_events(task_id,sequence,event_type,payload)
 VALUES(target_task,t.last_sequence,'STATE_SNAPSHOT',jsonb_build_object('type','STATE_SNAPSHOT',
 'snapshot',jsonb_build_object('task',aso.document_task_json(target_task))));
 RETURN aso.document_task_json(target_task);
END $$;
CREATE FUNCTION aso.cancel_document_task(target_task uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
BEGIN
 PERFORM aso.authorize_document_task(target_task,'letter_generate');
 PERFORM id FROM aso.document_generation_tasks WHERE id=target_task FOR UPDATE;
 IF (SELECT state FROM aso.document_generation_tasks WHERE id=target_task) IN ('completed','canceled','failed','rejected')
 THEN RETURN aso.document_task_json(target_task); END IF;
 RETURN aso.transition_document_task(target_task,'canceled',NULL);
END $$;

ALTER TABLE aso.document_generation_tasks ADD COLUMN assembly jsonb;

CREATE FUNCTION aso.commit_document_generation(target_task uuid,target_assembly jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE actor record; t aso.document_generation_tasks%ROWTYPE; fresh jsonb; c aso.cases%ROWTYPE;
 claim jsonb; provenance jsonb; source jsonb; annotation jsonb; finding jsonb; check_type aso.qa_check_types%ROWTYPE;
 body text; hash_bytes bytea; expected_kind text; letter_id uuid; next_version integer;
 committed timestamptz; receipt jsonb; ordinal_value integer; quote_text text; annotation_id uuid; attribution_value text;
BEGIN
 PERFORM aso.authorize_document_task(target_task,'letter_generate');
 SELECT * INTO STRICT actor FROM aso.case_actor_context('letter_generate');
 SELECT * INTO STRICT t FROM aso.document_generation_tasks WHERE id=target_task FOR UPDATE;
 IF t.state='completed' THEN
  IF t.assembly IS DISTINCT FROM target_assembly THEN RAISE EXCEPTION 'assembly retry conflict' USING ERRCODE='23505'; END IF;
  RETURN t.result;
 END IF;
 IF t.state<>'working' THEN RAISE EXCEPTION 'task is not working' USING ERRCODE='55000'; END IF;
 SELECT * INTO STRICT c FROM aso.cases WHERE id=t.case_id AND practice_id=actor.practice_id FOR UPDATE;
 -- Source mutation and catalog commands serialize on these records. Case-owned
 -- evidence, annotation, gate, and determination commands already lock the case.
 PERFORM singleton FROM aso.criteria_catalog_state WHERE singleton FOR SHARE;
 PERFORM p.id FROM aso.policies p JOIN aso.case_criteria_selections selection ON selection.policy_id=p.id
 WHERE selection.case_id=t.case_id FOR SHARE OF p;
 PERFORM id FROM aso.practices WHERE id=c.practice_id FOR SHARE;
 PERFORM id FROM aso.patients WHERE id=c.patient_id FOR SHARE;
 PERFORM id FROM aso.payers WHERE id=c.payer_id FOR SHARE;
 PERFORM d.id FROM aso.documents d WHERE d.case_id=t.case_id ORDER BY d.id FOR SHARE;
 fresh:=aso.generation_snapshot(t.case_id,t.purpose);
 IF fresh->>'snapshotToken' IS DISTINCT FROM t.input_snapshot->>'snapshotToken'
 THEN RAISE EXCEPTION 'generation input changed' USING ERRCODE='40001'; END IF;
 expected_kind:=CASE WHEN t.purpose='prior_authorization_request' THEN 'pa.initial_request' ELSE 'pa.denial_response' END;
 body:=target_assembly->>'canonicalMarkdown';
 IF jsonb_typeof(target_assembly) IS DISTINCT FROM 'object' OR target_assembly->>'kindKey' IS DISTINCT FROM expected_kind
 OR ((target_assembly->>'kindVersion') ~ '^[1-9][0-9]*$') IS NOT TRUE
 OR ((target_assembly->>'contentSha256') ~ '^sha256:[0-9a-f]{64}$') IS NOT TRUE
 OR nullif(target_assembly->>'templateDigest','') IS NULL OR nullif(body,'') IS NULL
 OR jsonb_typeof(target_assembly->'renderedClaims') IS DISTINCT FROM 'array'
 OR jsonb_typeof(target_assembly->'qa') IS DISTINCT FROM 'array'
 OR jsonb_array_length(target_assembly->'qa')<>7 OR octet_length(target_assembly::text)>2097152
 THEN RAISE EXCEPTION 'invalid assembly' USING ERRCODE='22023'; END IF;
 hash_bytes:=public.digest(convert_to(expected_kind,'UTF8')||decode('00','hex')||
 convert_to(target_assembly->>'kindVersion','UTF8')||decode('00','hex')||
 convert_to(target_assembly->>'templateDigest','UTF8')||decode('00','hex')||convert_to(body,'UTF8'),'sha256');
 IF target_assembly->>'contentSha256' IS DISTINCT FROM 'sha256:'||encode(hash_bytes,'hex')
 THEN RAISE EXCEPTION 'assembly digest mismatch' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(target_assembly->'qa') q
  LEFT JOIN aso.qa_check_types qt ON qt.key=replace(q->>'check','_','-')
  WHERE qt.id IS NULL OR qt.severity IS DISTINCT FROM q->>'severity'
  OR q->>'outcome' NOT IN ('pass','fail','not_applicable') OR q->>'outcome' IS NULL)
 OR (SELECT count(DISTINCT q->>'check') FROM jsonb_array_elements(target_assembly->'qa') q)<>7
 THEN RAISE EXCEPTION 'invalid QA findings' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(target_assembly->'renderedClaims') x GROUP BY x->>'ordinal' HAVING count(*)>1)
 THEN RAISE EXCEPTION 'duplicate claim ordinal' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(max(version),0)+1 INTO next_version FROM aso.letters WHERE case_id=t.case_id AND purpose=t.purpose;
 letter_id:=gen_random_uuid(); committed:=clock_timestamp();
 INSERT INTO aso.letters(id,case_id,purpose,version,status,body_markdown,content_sha256,model_name,model_version,
 generated_at,revision,original_request_letter_id,challenged_determination_id,data)
 VALUES(letter_id,t.case_id,t.purpose,next_version,'draft',body,hash_bytes,'clinical-docs',target_assembly->>'kindVersion',
 committed,1,(fresh->>'originalRequestId')::uuid,(fresh->>'determinationId')::uuid,
 jsonb_build_object('assembly',jsonb_build_object('schemaVersion',1,'kindKey',expected_kind,
 'kindVersion',target_assembly->'kindVersion','templatePackage',target_assembly->'templatePackage',
 'templateDigest',target_assembly->'templateDigest','contentSha256',target_assembly->'contentSha256',
 'snapshotToken',fresh->>'snapshotToken','taskId',target_task)));
 FOR claim IN SELECT value FROM jsonb_array_elements(target_assembly->'renderedClaims') LOOP
  provenance:=claim->'provenance'; ordinal_value:=(claim->>'ordinal')::integer; quote_text:=provenance->>'sourceQuote';
  IF ordinal_value IS NULL OR ordinal_value<=0 OR nullif(btrim(claim->>'text'),'') IS NULL
  OR provenance->>'kind' NOT IN ('document','attributed_document') OR provenance->>'kind' IS NULL
  OR nullif(btrim(quote_text),'') IS NULL
  THEN RAISE EXCEPTION 'invalid cited claim' USING ERRCODE='22023'; END IF;
  SELECT s INTO source FROM jsonb_array_elements(fresh->'sources') s
  WHERE s->>'documentId'=provenance->>'documentId' AND s->'page'=provenance->'page';
  IF source IS NULL OR source->'documentVersion' IS DISTINCT FROM provenance->'documentVersion'
  OR source->>'title' IS DISTINCT FROM provenance->>'title' OR source->>'effectiveDate' IS DISTINCT FROM provenance->>'effectiveDate'
  OR source->>'contentSha256' IS DISTINCT FROM provenance->>'contentSha256' OR strpos(source->>'text',quote_text)=0
  OR (claim->>'criterionId' IS NOT NULL AND NOT (source->'criterionIds' ? (claim->>'criterionId')))
  THEN RAISE EXCEPTION 'claim source mismatch' USING ERRCODE='22023'; END IF;
  annotation_id:=NULL;
  IF provenance->>'kind'='attributed_document' THEN
   SELECT a INTO annotation FROM jsonb_array_elements(fresh->'annotations') a
   WHERE a->>'id'=provenance->>'annotationId' AND a->>'sourceId'=source->>'id';
   IF annotation IS NULL OR annotation->>'author' IS DISTINCT FROM provenance->>'author'
    OR annotation->>'authoredOn' IS DISTINCT FROM provenance->>'authoredOn'
   THEN RAISE EXCEPTION 'claim annotation mismatch' USING ERRCODE='22023'; END IF;
   annotation_id:=(annotation->>'id')::uuid;
  END IF;
  attribution_value:='practice_experience';
  IF source->>'documentId'=fresh#>>'{context,determination,document_id}' THEN attribution_value:='payer_stated';
  ELSIF claim->>'criterionId' IS NOT NULL THEN
   SELECT CASE WHEN grade.citable_as_policy THEN 'published_policy'
    WHEN criterion.evidence_grade='payer_verbal' THEN 'payer_stated'
    WHEN criterion.evidence_grade='peer_shared' THEN 'peer_reported' ELSE 'practice_experience' END
   INTO attribution_value FROM aso.criteria criterion JOIN aso.evidence_grades grade ON grade.key=criterion.evidence_grade
   WHERE criterion.id=(claim->>'criterionId')::uuid;
  END IF;
  INSERT INTO aso.letter_claims(letter_id,case_id,ordinal,claim_text,document_id,document_version,
   annotation_id,page_number,source_quote,source_span_start,source_span_end,source_date,source_date_kind,
   criterion_id,attribution,source_content_sha256_text,support_status)
  VALUES(letter_id,t.case_id,ordinal_value,claim->>'text',(source->>'documentId')::uuid,(source->>'documentVersion')::integer,
   annotation_id,(source->>'page')::integer,quote_text,strpos(source->>'text',quote_text)-1,
   strpos(source->>'text',quote_text)-1+char_length(quote_text),(source->>'effectiveDate')::date,'effective_date',
   (claim->>'criterionId')::uuid,attribution_value,source->>'contentSha256','pending');
 END LOOP;
 FOR finding IN SELECT value FROM jsonb_array_elements(target_assembly->'qa') LOOP
  SELECT * INTO STRICT check_type FROM aso.qa_check_types WHERE key=replace(finding->>'check','_','-');
  INSERT INTO aso.letter_qa_results(qa_check_type_id,letter_id,name,outcome,detail,data,evaluated_at)
  VALUES(check_type.id,letter_id,check_type.name,finding->>'outcome',finding->>'detail',finding->'data',committed);
 END LOOP;
 receipt:=jsonb_build_object('commandId',t.command_id,'letterId',letter_id,'caseId',t.case_id,
 'letterVersion',next_version,'qaRevision',(SELECT qa_revision FROM aso.letters WHERE id=letter_id),
 'status','draft','committedAt',committed);
 INSERT INTO aso.letter_workflow_commands(kratos_identity_id,practice_id,command_id,actor_id,case_id,letter_id,action,payload,result,committed_at)
 VALUES(actor.identity_id,actor.practice_id,t.command_id,actor.actor_id,t.case_id,letter_id,'generate',t.request_payload,receipt,committed);
 INSERT INTO aso.audit_events(practice_id,occurred_at,actor_id,actor_kratos_id,actor_label,actor_role,
 action,outcome,entity_table,entity_id,case_id,summary,data)
 VALUES(actor.practice_id,committed,actor.actor_id,actor.identity_id,actor.actor_label,'letter_generate',
 'letter.generate','success','letters',letter_id,t.case_id,'Cited document assembly committed',
 jsonb_build_object('commandId',t.command_id,'taskId',target_task,'contentSha256',encode(hash_bytes,'hex')));
 UPDATE aso.document_generation_tasks SET state='completed',stage='completed',letter_id=(receipt->>'letterId')::uuid,
 result=receipt,assembly=target_assembly,last_sequence=last_sequence+2,updated_at=committed WHERE id=target_task RETURNING * INTO t;
 INSERT INTO aso.document_generation_events(task_id,sequence,event_type,payload)
 VALUES(target_task,t.last_sequence-1,'STEP_FINISHED',jsonb_build_object('type','STEP_FINISHED','stepName','persistence'));
 INSERT INTO aso.document_generation_events(task_id,sequence,event_type,payload)
 VALUES(target_task,t.last_sequence,'RUN_FINISHED',jsonb_build_object('type','RUN_FINISHED',
 'threadId',t.case_id,'runId',target_task,'result',receipt));
 RETURN receipt;
END $$;

CREATE FUNCTION aso.read_document_task_artifacts(target_task uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE t aso.document_generation_tasks%ROWTYPE;
BEGIN
 PERFORM aso.authorize_document_task(target_task,'case:read');
 SELECT * INTO STRICT t FROM aso.document_generation_tasks WHERE id=target_task;
 RETURN jsonb_build_object('assembly',t.assembly,'letter',t.result);
END $$;

-- Reviewing an assembly records claim review without rewriting engine QA. Old
-- letters without persisted findings require regeneration rather than fabricated passes.
CREATE OR REPLACE FUNCTION aso.review_letter_workflow(target_command uuid,target_letter uuid,expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE actor record; letter aso.letters%ROWTYPE; original aso.letter_workflow_commands%ROWTYPE;
 payload jsonb; result jsonb; committed_at timestamptz;
BEGIN
 SELECT * INTO STRICT actor FROM aso.case_actor_context('letter_review');
 payload:=jsonb_build_object('expectedLetterVersion',expected_version);
 SELECT * INTO original FROM aso.letter_workflow_commands command WHERE command.kratos_identity_id=actor.identity_id
 AND command.practice_id=actor.practice_id AND command.command_id=target_command;
 IF FOUND THEN
  PERFORM aso.require_case(original.case_id,'letter_review');
  IF original.letter_id<>target_letter OR original.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'letter command conflict' USING ERRCODE='23505'; END IF;
  RETURN original.result;
 END IF;
 SELECT target.* INTO letter FROM aso.letters target JOIN aso.cases c ON c.id=target.case_id
 WHERE target.id=target_letter AND c.practice_id=actor.practice_id FOR UPDATE OF target;
 IF NOT FOUND THEN RAISE EXCEPTION 'letter not found' USING ERRCODE='P0002'; END IF;
 PERFORM aso.require_case(letter.case_id,'letter_review');
 IF letter.version<>expected_version OR letter.status NOT IN ('draft','in_review') THEN RAISE EXCEPTION 'stale letter' USING ERRCODE='40001'; END IF;
 IF (SELECT count(*) FROM aso.letter_qa_results WHERE letter_id=target_letter)<>7
 THEN RAISE EXCEPTION 'persisted QA required; regenerate letter' USING ERRCODE='P0007'; END IF;
 UPDATE aso.letter_claims SET support_status='supported',support_reviewed_by=actor.actor_id,
 support_reviewed_at=clock_timestamp(),support_claim_version=letter.version WHERE letter_id=target_letter;
 IF NOT EXISTS(SELECT FROM aso.letter_qa_results q JOIN aso.qa_check_types qt ON qt.id=q.qa_check_type_id
 WHERE q.letter_id=target_letter AND qt.severity='blocking' AND q.outcome<>'pass') THEN
  UPDATE aso.letters SET status='in_review',revision=revision+1 WHERE id=target_letter RETURNING * INTO letter;
 END IF;
 SELECT * INTO STRICT letter FROM aso.letters WHERE id=target_letter;
 committed_at:=clock_timestamp();
 result:=jsonb_build_object('commandId',target_command,'letterId',target_letter,'caseId',letter.case_id,
 'letterVersion',letter.version,'qaRevision',letter.qa_revision,'status',letter.status,'committedAt',committed_at);
 INSERT INTO aso.letter_workflow_commands(kratos_identity_id,practice_id,command_id,actor_id,case_id,letter_id,action,payload,result,committed_at)
 VALUES(actor.identity_id,actor.practice_id,target_command,actor.actor_id,letter.case_id,target_letter,'review',payload,result,committed_at);
 RETURN result;
END $$;

CREATE FUNCTION aso.protect_document_task_input() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,aso,pg_temp AS $$ BEGIN
 IF (to_jsonb(NEW)-ARRAY['state','stage','letter_id','result','assembly','error_code','last_sequence','updated_at'])
 IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','stage','letter_id','result','assembly','error_code','last_sequence','updated_at'])
 OR (OLD.state IN ('completed','canceled','failed','rejected') AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD))
 THEN RAISE EXCEPTION 'task input or terminal result is immutable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER document_task_input_immutable BEFORE UPDATE ON aso.document_generation_tasks FOR EACH ROW EXECUTE FUNCTION aso.protect_document_task_input();
CREATE TRIGGER document_generation_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON aso.document_generation_events
 FOR EACH STATEMENT EXECUTE FUNCTION aso.letter_workflow_commands_immutable();

GRANT CREATE ON SCHEMA aso TO aso_case_owner;
DO $$ DECLARE signature text; BEGIN
 FOREACH signature IN ARRAY ARRAY[
 'aso.document_task_json(uuid)','aso.authorize_document_task(uuid,text)','aso.generation_snapshot(uuid,text)',
 'aso.start_document_task(uuid,uuid,text,text,text,text)','aso.read_document_task(uuid)',
 'aso.read_document_task_input(uuid)','aso.read_document_task_events(uuid,bigint)',
 'aso.append_document_task_event(uuid,text,jsonb,text)','aso.transition_document_task(uuid,text,text)',
 'aso.cancel_document_task(uuid)','aso.commit_document_generation(uuid,jsonb)',
 'aso.read_document_task_artifacts(uuid)','aso.protect_document_task_input()'
 ] LOOP
  EXECUTE 'ALTER FUNCTION '||signature||' OWNER TO aso_case_owner';
  EXECUTE 'REVOKE ALL ON FUNCTION '||signature||' FROM PUBLIC';
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA aso FROM aso_case_owner;
GRANT EXECUTE ON FUNCTION aso.start_document_task(uuid,uuid,text,text,text,text),aso.read_document_task(uuid),
 aso.read_document_task_input(uuid),aso.read_document_task_events(uuid,bigint),
 aso.append_document_task_event(uuid,text,jsonb,text),aso.transition_document_task(uuid,text,text),
 aso.cancel_document_task(uuid),aso.commit_document_generation(uuid,jsonb),aso.read_document_task_artifacts(uuid)
 TO aso_case_executor;
-- Register by OID before any caller can create a logical publication.
INSERT INTO aso.local_replication_exclusions(relation_oid,registered_name)
VALUES('aso.synthetic_generation_cases'::regclass,'aso.synthetic_generation_cases'),
 ('aso.document_generation_tasks'::regclass,'aso.document_generation_tasks'),
 ('aso.document_generation_events'::regclass,'aso.document_generation_events')
ON CONFLICT(relation_oid) DO NOTHING;
