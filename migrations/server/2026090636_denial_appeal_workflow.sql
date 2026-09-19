-- Web demo denial intake and cited clinical appeal generation.

INSERT INTO aso.capabilities(key,label,description,is_clinical) VALUES
 ('determination_record','Record payer determinations','Record a denied payer determination against its immutable source document.',false)
ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,description=EXCLUDED.description,is_clinical=EXCLUDED.is_clinical;

INSERT INTO aso.role_capabilities(role_id,capability_key)
SELECT role.id,'determination_record'
FROM aso.roles role WHERE role.key IN ('staff','surgeon')
ON CONFLICT DO NOTHING;

CREATE TABLE aso.determination_commands(
 kratos_identity_id uuid NOT NULL,
 practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
 command_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
 case_id uuid NOT NULL,
 determination_id uuid NOT NULL REFERENCES aso.determinations(id) ON DELETE RESTRICT,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 committed_at timestamptz NOT NULL,
 PRIMARY KEY(kratos_identity_id,practice_id,command_id),
 FOREIGN KEY(case_id,practice_id) REFERENCES aso.cases(id,practice_id) ON DELETE RESTRICT
);
COMMENT ON TABLE aso.determination_commands IS
 'Lane: server-authoritative relational. Privacy: local. Immutable payer-determination command receipts; excluded from replication.';
ALTER TABLE aso.determination_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.determination_commands FROM PUBLIC;
GRANT SELECT,INSERT ON aso.determination_commands TO aso_case_owner;
GRANT SELECT,INSERT ON aso.determinations TO aso_case_owner;
GRANT SELECT ON aso.determinations TO aso_gate_owner;
CREATE POLICY determination_commands_owner ON aso.determination_commands
 TO aso_case_owner USING(true) WITH CHECK(true);
CREATE POLICY determinations_case_owner ON aso.determinations
 TO aso_case_owner USING(true) WITH CHECK(true);
CREATE POLICY determinations_gate_owner ON aso.determinations
 TO aso_gate_owner USING(true);

CREATE FUNCTION aso.determination_snapshot_json(target_determination uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 SELECT jsonb_build_object(
   'id',determination.id,'caseId',determination.case_id,'outcome',determination.outcome,
   'decidedOn',determination.decided_on,'reasonCode',determination.reason_code,
   'reasonText',determination.reason_text,'appealDeadline',determination.appeal_deadline,
   'documentId',determination.document_id,'documentName',document.name,
   'createdAt',determination.created_at)
 INTO result
 FROM aso.determinations determination
 JOIN aso.documents document ON document.id=determination.document_id
 WHERE determination.id=target_determination;
 IF result IS NULL THEN RAISE EXCEPTION 'determination not found' USING ERRCODE='P0002'; END IF;
 RETURN result;
END $$;

CREATE FUNCTION aso.read_latest_denied_determination(target_case uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE actor record; determination_id uuid;
BEGIN
 SELECT * INTO STRICT actor FROM aso.case_actor_context('case:read');
 PERFORM aso.require_case(target_case,'case:read');
 SELECT determination.id INTO determination_id
 FROM aso.determinations determination
 JOIN aso.cases clinical_case ON clinical_case.id=determination.case_id
 WHERE determination.case_id=target_case
   AND clinical_case.practice_id=actor.practice_id
   AND determination.outcome IN ('denied','partial')
 ORDER BY determination.decided_on DESC,determination.created_at DESC
 LIMIT 1;
 IF determination_id IS NULL THEN RAISE EXCEPTION 'determination not found' USING ERRCODE='P0002'; END IF;
 RETURN aso.determination_snapshot_json(determination_id);
END $$;

CREATE FUNCTION aso.record_denied_determination(
 target_command uuid,target_case uuid,target_document uuid,target_decided_on date,
 target_reason_code text,target_reason_text text,target_appeal_deadline date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE actor record; original aso.determination_commands%ROWTYPE; payload jsonb;
 determination_id uuid; result jsonb; committed_at timestamptz;
BEGIN
 SELECT * INTO STRICT actor FROM aso.case_actor_context('determination_record');
 PERFORM aso.require_case(target_case,'determination_record');
 IF target_command IS NULL OR target_document IS NULL OR target_decided_on IS NULL
    OR NULLIF(btrim(target_reason_text),'') IS NULL
    OR (target_appeal_deadline IS NOT NULL AND target_appeal_deadline<target_decided_on)
 THEN RAISE EXCEPTION 'invalid determination request' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(
   SELECT FROM aso.documents document
   JOIN aso.document_types document_type ON document_type.id=document.document_type_id
   WHERE document.id=target_document AND document.case_id=target_case
     AND document.practice_id=actor.practice_id AND document.processing_status='ready'
     AND document_type.key='payer-determination')
 THEN RAISE EXCEPTION 'payer determination source not found' USING ERRCODE='P0002'; END IF;
 payload:=jsonb_build_object('documentId',target_document,'decidedOn',target_decided_on,
   'reasonCode',NULLIF(btrim(target_reason_code),''),'reasonText',btrim(target_reason_text),
   'appealDeadline',target_appeal_deadline);
 SELECT * INTO original FROM aso.determination_commands command
 WHERE command.kratos_identity_id=actor.identity_id AND command.practice_id=actor.practice_id
   AND command.command_id=target_command;
 IF FOUND THEN
   IF original.case_id<>target_case OR original.payload IS DISTINCT FROM payload
   THEN RAISE EXCEPTION 'determination command conflict' USING ERRCODE='23505'; END IF;
   RETURN original.result;
 END IF;
 determination_id:=gen_random_uuid(); committed_at:=clock_timestamp();
 INSERT INTO aso.determinations(id,case_id,outcome,decided_on,reason_code,reason_text,
   appeal_deadline,document_id,created_at)
 VALUES(determination_id,target_case,'denied',target_decided_on,NULLIF(btrim(target_reason_code),''),
   btrim(target_reason_text),target_appeal_deadline,target_document,committed_at);
 result:=aso.determination_snapshot_json(determination_id);
 INSERT INTO aso.determination_commands(kratos_identity_id,practice_id,command_id,actor_id,
   case_id,determination_id,payload,result,committed_at)
 VALUES(actor.identity_id,actor.practice_id,target_command,actor.actor_id,target_case,
   determination_id,payload,result,committed_at);
 RETURN result;
END $$;

-- A determination begins a new clinical review cycle. The underlying gate
-- rows remain intact for audit, while reads expose only affirmations made
-- after the latest denied or partial determination.
CREATE OR REPLACE FUNCTION aso.read_gate(target_case uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE result jsonb; cycle_started_at timestamptz;
BEGIN
 PERFORM aso.require_gate_case(target_case,false);
 SELECT max(determination.created_at) INTO cycle_started_at
 FROM aso.determinations determination
 WHERE determination.case_id=target_case AND determination.outcome IN ('denied','partial');
 SELECT jsonb_build_object(
   'caseId',clinical_case.id,
   'affirmed',COALESCE((SELECT jsonb_agg(affirmation.kind ORDER BY kind.ordinal)
     FROM aso.gate_affirmations affirmation
     JOIN aso.gate_affirmation_kinds kind ON kind.key=affirmation.kind
     WHERE affirmation.case_id=clinical_case.id
       AND (cycle_started_at IS NULL OR affirmation.affirmed_at>cycle_started_at)),'[]'::jsonb),
   'gateAffirmedAt',CASE WHEN cycle_started_at IS NULL OR NOT EXISTS(
     SELECT FROM aso.gate_affirmation_kinds required WHERE NOT EXISTS(
       SELECT FROM aso.gate_affirmations affirmation
       WHERE affirmation.case_id=clinical_case.id AND affirmation.kind=required.key
         AND affirmation.affirmed_at>cycle_started_at))
     THEN clinical_case.gate_affirmed_at ELSE NULL END,
   'gateAffirmedBy',CASE WHEN cycle_started_at IS NULL OR NOT EXISTS(
     SELECT FROM aso.gate_affirmation_kinds required WHERE NOT EXISTS(
       SELECT FROM aso.gate_affirmations affirmation
       WHERE affirmation.case_id=clinical_case.id AND affirmation.kind=required.key
         AND affirmation.affirmed_at>cycle_started_at))
     THEN clinical_case.gate_affirmed_by ELSE NULL END)
 INTO result FROM aso.cases clinical_case WHERE clinical_case.id=target_case;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION aso.generate_prior_letter(target_command uuid,target_case uuid,
 expected_resolution text,expected_selection text,expected_evidence text,target_purpose text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE actor record; clinical_case aso.cases%ROWTYPE; original aso.letter_workflow_commands%ROWTYPE;
 payload jsonb; result jsonb; letter_id uuid; letter_version integer; body text;
 committed_at timestamptz; expected_value bigint; token_match text[]; item record; ordinal_value integer:=0;
 original_letter_id uuid; denial record;
BEGIN
 SELECT * INTO STRICT actor FROM aso.case_actor_context('letter_generate');
 PERFORM aso.require_case(target_case,'letter_generate');
 IF target_command IS NULL OR target_purpose NOT IN ('prior_authorization_request','clinical_appeal')
 THEN RAISE EXCEPTION 'invalid generation request' USING ERRCODE='22023'; END IF;
 payload:=jsonb_build_object('expectedRevisions',jsonb_build_object('resolutionRevision',expected_resolution,
  'criteriaSelectionRevision',expected_selection,'evidenceRevision',expected_evidence),'purpose',target_purpose);
 SELECT * INTO original FROM aso.letter_workflow_commands command WHERE command.kratos_identity_id=actor.identity_id
  AND command.practice_id=actor.practice_id AND command.command_id=target_command;
 IF FOUND THEN IF original.case_id<>target_case OR original.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'letter command conflict' USING ERRCODE='23505'; END IF; RETURN original.result; END IF;
 SELECT * INTO STRICT clinical_case FROM aso.cases WHERE id=target_case AND practice_id=actor.practice_id FOR UPDATE;
 token_match:=regexp_match(expected_resolution,'^.+:resolutionRevision:r(0|[1-9][0-9]*)$'); IF token_match IS NULL THEN RAISE EXCEPTION 'invalid revision' USING ERRCODE='22023'; END IF; expected_value:=token_match[1]::bigint; IF clinical_case.resolution_revision<>expected_value THEN RAISE EXCEPTION 'stale revision' USING ERRCODE='40001'; END IF;
 token_match:=regexp_match(expected_selection,'^.+:criteriaSelectionRevision:r(0|[1-9][0-9]*)$'); IF token_match IS NULL THEN RAISE EXCEPTION 'invalid revision' USING ERRCODE='22023'; END IF; expected_value:=token_match[1]::bigint; IF clinical_case.criteria_selection_revision<>expected_value THEN RAISE EXCEPTION 'stale revision' USING ERRCODE='40001'; END IF;
 token_match:=regexp_match(expected_evidence,'^.+:evidenceRevision:r(0|[1-9][0-9]*)$'); IF token_match IS NULL THEN RAISE EXCEPTION 'invalid revision' USING ERRCODE='22023'; END IF; expected_value:=token_match[1]::bigint; IF clinical_case.evidence_revision<>expected_value THEN RAISE EXCEPTION 'stale revision' USING ERRCODE='40001'; END IF;
 IF clinical_case.gate_affirmed_at IS NULL OR EXISTS(SELECT FROM aso.gate_affirmation_kinds required WHERE NOT EXISTS(SELECT FROM aso.gate_affirmations affirmation WHERE affirmation.case_id=target_case AND affirmation.kind=required.key)) THEN RAISE EXCEPTION 'clinical gate incomplete' USING ERRCODE='P0005'; END IF;
 IF NOT EXISTS(SELECT FROM aso.case_evidence WHERE case_id=target_case) OR EXISTS(SELECT FROM aso.case_evidence evidence WHERE evidence.case_id=target_case AND (evidence.state='void' OR NOT EXISTS(SELECT FROM aso.evidence_citations citation WHERE citation.case_evidence_id=evidence.id))) THEN RAISE EXCEPTION 'evidence incomplete' USING ERRCODE='P0006'; END IF;
 IF target_purpose='clinical_appeal' THEN
   SELECT determination.id,determination.decided_on,determination.reason_code,determination.reason_text,
     determination.created_at,
     determination.appeal_deadline,document.id AS document_id,document.name AS document_name,
     document.effective_date,document.revision AS document_version,encode(document.content_sha256,'hex') AS content_hash,
     page.text AS page_text
   INTO denial
   FROM aso.determinations determination JOIN aso.documents document ON document.id=determination.document_id
   JOIN aso.document_pages page ON page.document_id=document.id AND page.page_number=1
   WHERE determination.case_id=target_case AND determination.outcome IN ('denied','partial')
   ORDER BY determination.decided_on DESC,determination.created_at DESC LIMIT 1;
   IF denial.id IS NULL THEN RAISE EXCEPTION 'determination not found' USING ERRCODE='P0002'; END IF;
   IF EXISTS(SELECT FROM aso.gate_affirmation_kinds required WHERE NOT EXISTS(
     SELECT FROM aso.gate_affirmations affirmation
     WHERE affirmation.case_id=target_case AND affirmation.kind=required.key
       AND affirmation.affirmed_at>denial.created_at))
   THEN RAISE EXCEPTION 'clinical gate incomplete' USING ERRCODE='P0005'; END IF;
   SELECT initial.id INTO original_letter_id FROM aso.letters initial
   WHERE initial.case_id=target_case AND initial.purpose='prior_authorization_request'
     AND initial.status='signed' ORDER BY initial.version DESC LIMIT 1;
   IF original_letter_id IS NULL THEN RAISE EXCEPTION 'signed initial request not found' USING ERRCODE='P0002'; END IF;
 END IF;
 SELECT COALESCE(max(version),0)+1 INTO letter_version FROM aso.letters WHERE case_id=target_case AND purpose=target_purpose;
 letter_id:=gen_random_uuid(); committed_at:=clock_timestamp();
 IF target_purpose='clinical_appeal' THEN
   body:='# Clinical Appeal'||E'\n\n'||'Case '||clinical_case.case_number||E'\n\n' ||
     'The payer determination dated '||denial.decided_on||' states: '||denial.reason_text||
     ' (Source: '||denial.document_name||', p. 1, '||denial.effective_date||').'||E'\n\n'||
     '## Clinical support'||E'\n\n';
 ELSE
   body:='# Prior Authorization Request'||E'\n\n'||'Case '||clinical_case.case_number||E'\n\n';
 END IF;
 body:=body||COALESCE((SELECT string_agg('- '||evidence.rationale||' (Source: '||document.name||', p. '||citation.page_number||', '||document.effective_date||')',E'\n')
   FROM aso.case_evidence evidence JOIN aso.evidence_citations citation ON citation.case_evidence_id=evidence.id
   JOIN aso.documents document ON document.id=citation.document_id WHERE evidence.case_id=target_case), '');
 INSERT INTO aso.letters(id,case_id,purpose,version,status,body_markdown,content_sha256,model_name,model_version,
   generated_at,revision,original_request_letter_id,challenged_determination_id)
 VALUES(letter_id,target_case,target_purpose,letter_version,'draft',body,public.digest(convert_to(body,'UTF8'),'sha256'),
   'deterministic-template','1',committed_at,1,original_letter_id,CASE WHEN target_purpose='clinical_appeal' THEN denial.id END);
 IF target_purpose='clinical_appeal' THEN
   ordinal_value:=1;
   INSERT INTO aso.letter_claims(letter_id,case_id,ordinal,claim_text,document_id,document_version,
    page_number,source_quote,source_span_start,source_span_end,source_date,source_date_kind,
    criterion_id,attribution,source_content_sha256_text,support_status)
   VALUES(letter_id,target_case,ordinal_value,denial.reason_text,denial.document_id,denial.document_version,1,
    left(denial.page_text,500),0,char_length(left(denial.page_text,500)),denial.decided_on,'determination_date',
    NULL,'payer_stated',denial.content_hash,'pending');
 END IF;
 FOR item IN SELECT evidence.criterion_id,evidence.rationale,citation.document_id,citation.page_number,citation.quote,
   citation.document_effective_date,citation.content_sha256_text,document.revision AS document_version,page.text,
   CASE WHEN grade.citable_as_policy THEN 'published_policy' ELSE
     CASE criterion.evidence_grade WHEN 'payer_verbal' THEN 'payer_stated'
       WHEN 'peer_shared' THEN 'peer_reported' ELSE 'practice_experience' END END AS attribution
   FROM aso.case_evidence evidence JOIN aso.evidence_citations citation ON citation.case_evidence_id=evidence.id
   JOIN aso.documents document ON document.id=citation.document_id JOIN aso.document_pages page ON page.document_id=document.id AND page.page_number=citation.page_number
   JOIN aso.criteria criterion ON criterion.id=evidence.criterion_id
   JOIN aso.evidence_grades grade ON grade.key=criterion.evidence_grade
   WHERE evidence.case_id=target_case ORDER BY evidence.id
 LOOP
  ordinal_value:=ordinal_value+1;
  INSERT INTO aso.letter_claims(letter_id,case_id,ordinal,claim_text,document_id,document_version,
   page_number,source_quote,source_span_start,source_span_end,source_date,source_date_kind,
   criterion_id,attribution,source_content_sha256_text,support_status)
  VALUES(letter_id,target_case,ordinal_value,item.rationale,item.document_id,item.document_version,item.page_number,
   item.quote,strpos(item.text,item.quote)-1,strpos(item.text,item.quote)-1+char_length(item.quote),
   item.document_effective_date,'effective_date',item.criterion_id,item.attribution,item.content_sha256_text,'pending');
 END LOOP;
 result:=jsonb_build_object('commandId',target_command,'letterId',letter_id,'caseId',target_case,
  'letterVersion',letter_version,'qaRevision',0,'status','draft','committedAt',committed_at);
 INSERT INTO aso.letter_workflow_commands(kratos_identity_id,practice_id,command_id,actor_id,case_id,letter_id,action,payload,result,committed_at)
 VALUES(actor.identity_id,actor.practice_id,target_command,actor.actor_id,target_case,letter_id,'generate',payload,result,committed_at);
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION aso.determination_snapshot_json(uuid),
 aso.read_latest_denied_determination(uuid),
 aso.record_denied_determination(uuid,uuid,uuid,date,text,text,date) FROM PUBLIC;
ALTER FUNCTION aso.determination_snapshot_json(uuid) OWNER TO aso_case_owner;
ALTER FUNCTION aso.read_latest_denied_determination(uuid) OWNER TO aso_case_owner;
ALTER FUNCTION aso.record_denied_determination(uuid,uuid,uuid,date,text,text,date) OWNER TO aso_case_owner;
ALTER FUNCTION aso.generate_prior_letter(uuid,uuid,text,text,text,text) OWNER TO aso_case_owner;
GRANT EXECUTE ON FUNCTION aso.read_latest_denied_determination(uuid),
 aso.record_denied_determination(uuid,uuid,uuid,date,text,text,date),
 aso.generate_prior_letter(uuid,uuid,text,text,text,text) TO aso_case_executor;
