-- The cited-letter generator runs as aso_case_owner. Its claim-attribution
-- trigger must be able to read the canonical evidence grade, and every claim
-- created from a selected criterion must state how that criterion is used.

GRANT SELECT ON aso.evidence_grades TO aso_case_owner;

CREATE OR REPLACE FUNCTION aso.generate_prior_letter(target_command uuid,target_case uuid,
 expected_resolution text,expected_selection text,expected_evidence text,target_purpose text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE actor record; clinical_case aso.cases%ROWTYPE; original aso.letter_workflow_commands%ROWTYPE;
 payload jsonb; result jsonb; letter_id uuid; letter_version integer; body text;
 committed_at timestamptz; expected_value bigint; token_match text[]; item record; ordinal_value integer:=0;
BEGIN
 SELECT * INTO STRICT actor FROM aso.case_actor_context('letter_generate');
 PERFORM aso.require_case(target_case,'letter_generate');
 IF target_command IS NULL OR target_purpose<>'prior_authorization_request' THEN RAISE EXCEPTION 'invalid generation request' USING ERRCODE='22023'; END IF;
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
 SELECT COALESCE(max(version),0)+1 INTO letter_version FROM aso.letters WHERE case_id=target_case AND purpose=target_purpose;
 letter_id:=gen_random_uuid(); committed_at:=clock_timestamp();
 body:='# Prior Authorization Request'||E'\n\n'||'Case '||clinical_case.case_number||E'\n\n'||
  COALESCE((SELECT string_agg('- '||evidence.rationale||' (Source: '||document.name||', p. '||citation.page_number||', '||document.effective_date||')',E'\n')
   FROM aso.case_evidence evidence JOIN aso.evidence_citations citation ON citation.case_evidence_id=evidence.id
   JOIN aso.documents document ON document.id=citation.document_id WHERE evidence.case_id=target_case), '');
 INSERT INTO aso.letters(id,case_id,purpose,version,status,body_markdown,content_sha256,model_name,model_version,generated_at,revision)
 VALUES(letter_id,target_case,target_purpose,letter_version,'draft',body,public.digest(convert_to(body,'UTF8'),'sha256'),'deterministic-template','1',committed_at,1);
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

REVOKE ALL ON FUNCTION aso.generate_prior_letter(uuid,uuid,text,text,text,text) FROM PUBLIC;
ALTER FUNCTION aso.generate_prior_letter(uuid,uuid,text,text,text,text) OWNER TO aso_case_owner;
GRANT EXECUTE ON FUNCTION aso.generate_prior_letter(uuid,uuid,text,text,text,text) TO aso_case_executor;
