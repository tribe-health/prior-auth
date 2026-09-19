-- web-10/web-11. Deterministic cited prior-request generation and human review.

INSERT INTO aso.capabilities(key,label,description,is_clinical) VALUES
 ('letter_generate','Generate prior-authorization letters','Create a cited draft from the current affirmed evidence revision.',false),
 ('letter_review','Review letter support','Review every generated assertion and blocking QA check.',false),
 ('letter_approve','Approve letter','Approve the current reviewed letter revision. Clinical act.',true)
ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,description=EXCLUDED.description,is_clinical=EXCLUDED.is_clinical;
INSERT INTO aso.role_capabilities(role_id,capability_key)
SELECT role.id, capability FROM aso.roles role CROSS JOIN (VALUES
 ('staff','letter_generate'),('surgeon','letter_generate'),
 ('staff','letter_review'),('surgeon','letter_review'),
 ('surgeon','letter_approve')) grant_row(role_key,capability)
WHERE role.key=grant_row.role_key ON CONFLICT DO NOTHING;

ALTER TABLE aso.letters ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK(revision>0);
ALTER TABLE aso.letter_claims
  ADD COLUMN IF NOT EXISTS criterion_id uuid REFERENCES aso.criteria(id) ON DELETE RESTRICT,
  ADD COLUMN source_content_sha256_text text,
  ADD CONSTRAINT letter_claims_source_hash_check CHECK(source_content_sha256_text ~ '^[0-9a-f]{64}$');

UPDATE aso.letter_claims claim SET
  source_content_sha256_text=encode(document.content_sha256,'hex')
FROM aso.documents document WHERE document.id=claim.document_id;
ALTER TABLE aso.letter_claims ADD CONSTRAINT letter_claims_complete_source_hash_check
  CHECK(source_content_sha256_text IS NOT NULL) NOT VALID;

CREATE TABLE aso.letter_workflow_commands(
 kratos_identity_id uuid NOT NULL,
 practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
 command_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
 case_id uuid NOT NULL,
 letter_id uuid NOT NULL REFERENCES aso.letters(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK(action IN('generate','review','approve')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 committed_at timestamptz NOT NULL,
 PRIMARY KEY(kratos_identity_id,practice_id,command_id),
 FOREIGN KEY(case_id,practice_id) REFERENCES aso.cases(id,practice_id) ON DELETE RESTRICT
);
COMMENT ON TABLE aso.letter_workflow_commands IS 'Lane: server-authoritative relational. Privacy: local. Immutable generation and review command receipts; excluded from replication.';
COMMENT ON TABLE aso.letters IS 'Lane: server-authoritative relational. Privacy: trusted PHI. Cited generated prose under verified-practice scope.';
ALTER TABLE aso.letter_workflow_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.letter_workflow_commands FROM PUBLIC;
GRANT SELECT,INSERT ON aso.letter_workflow_commands TO aso_case_owner;
GRANT SELECT,INSERT,UPDATE ON aso.letters,aso.letter_claims,aso.letter_qa_results TO aso_case_owner;
GRANT EXECUTE ON FUNCTION aso.current_app_user_id(),
  aso.current_verified_practice_id(), aso.current_app_practice_ids()
  TO aso_case_owner;
GRANT SELECT ON aso.qa_check_types,aso.case_evidence,aso.evidence_citations,aso.documents,
  aso.document_pages,aso.criteria,aso.gate_affirmations,aso.gate_affirmation_kinds,
  aso.user_capabilities TO aso_case_owner;
GRANT SELECT(id,practice_id,case_number,procedure_code,date_of_service,resolution_revision,
  criteria_selection_revision,evidence_revision,gate_affirmed_at) ON aso.cases TO aso_case_owner;
CREATE POLICY letter_workflow_commands_owner ON aso.letter_workflow_commands TO aso_case_owner USING(true) WITH CHECK(true);
CREATE POLICY letters_case_owner ON aso.letters TO aso_case_owner USING(true) WITH CHECK(true);
CREATE POLICY letter_claims_case_owner ON aso.letter_claims TO aso_case_owner USING(true) WITH CHECK(true);
CREATE POLICY letter_qa_case_owner ON aso.letter_qa_results TO aso_case_owner USING(true) WITH CHECK(true);
CREATE POLICY qa_types_case_owner ON aso.qa_check_types TO aso_case_owner USING(true);
CREATE POLICY gate_affirmations_case_owner ON aso.gate_affirmations
  TO aso_case_owner USING(true);

CREATE FUNCTION aso.letter_snapshot_json(target_letter uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 SELECT jsonb_build_object('id',letter.id,'caseId',letter.case_id,'purpose',letter.purpose,
  'version',letter.version,'status',letter.status,'bodyMarkdown',letter.body_markdown,
  'contentSha256Text',encode(letter.content_sha256,'hex'),'generatedAt',letter.generated_at,
  'approvedAt',letter.approved_at,'signedAt',letter.signed_at,'qaRevision',letter.qa_revision,
  'revision',letter.revision,'claims',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'id',claim.id,'ordinal',claim.ordinal,'claimText',claim.claim_text,
   'documentId',claim.document_id,'documentName',document.name,'pageNumber',claim.page_number,
   'sourceQuote',claim.source_quote,'sourceDate',claim.source_date,
   'supportStatus',claim.support_status) ORDER BY claim.ordinal)
   FROM aso.letter_claims claim JOIN aso.documents document ON document.id=claim.document_id
   WHERE claim.letter_id=letter.id),'[]'::jsonb)) INTO result
 FROM aso.letters letter WHERE letter.id=target_letter;
 IF result IS NULL THEN RAISE EXCEPTION 'letter not found' USING ERRCODE='P0002'; END IF;
 RETURN result;
END $$;

CREATE FUNCTION aso.read_letter_workflow(target_letter uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE target_case uuid;
BEGIN
 SELECT case_id INTO target_case FROM aso.letters WHERE id=target_letter;
 IF NOT FOUND THEN RAISE EXCEPTION 'letter not found' USING ERRCODE='P0002'; END IF;
 PERFORM aso.require_case(target_case,'case:read');
 RETURN aso.letter_snapshot_json(target_letter);
END $$;

CREATE FUNCTION aso.lookup_letter_workflow_command(target_command uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE actor record; found_result jsonb;
BEGIN
 SELECT * INTO STRICT actor FROM aso.case_actor_context(NULL);
 SELECT command.result INTO found_result FROM aso.letter_workflow_commands command
 WHERE command.kratos_identity_id=actor.identity_id AND command.practice_id=actor.practice_id
 AND command.command_id=target_command;
 RETURN found_result;
END $$;

CREATE FUNCTION aso.generate_prior_letter(target_command uuid,target_case uuid,
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
   citation.document_effective_date,citation.content_sha256_text,document.revision AS document_version,page.text
   FROM aso.case_evidence evidence JOIN aso.evidence_citations citation ON citation.case_evidence_id=evidence.id
   JOIN aso.documents document ON document.id=citation.document_id JOIN aso.document_pages page ON page.document_id=document.id AND page.page_number=citation.page_number
   WHERE evidence.case_id=target_case ORDER BY evidence.id
 LOOP
  ordinal_value:=ordinal_value+1;
  INSERT INTO aso.letter_claims(letter_id,case_id,ordinal,claim_text,document_id,document_version,
   page_number,source_quote,source_span_start,source_span_end,source_date,source_date_kind,
   criterion_id,source_content_sha256_text,support_status)
  VALUES(letter_id,target_case,ordinal_value,item.rationale,item.document_id,item.document_version,item.page_number,
   item.quote,strpos(item.text,item.quote)-1,strpos(item.text,item.quote)-1+char_length(item.quote),
   item.document_effective_date,'effective_date',item.criterion_id,item.content_sha256_text,'pending');
 END LOOP;
 result:=jsonb_build_object('commandId',target_command,'letterId',letter_id,'caseId',target_case,
  'letterVersion',letter_version,'qaRevision',0,'status','draft','committedAt',committed_at);
 INSERT INTO aso.letter_workflow_commands(kratos_identity_id,practice_id,command_id,actor_id,case_id,letter_id,action,payload,result,committed_at)
 VALUES(actor.identity_id,actor.practice_id,target_command,actor.actor_id,target_case,letter_id,'generate',payload,result,committed_at);
 RETURN result;
END $$;

CREATE FUNCTION aso.review_letter_workflow(target_command uuid,target_letter uuid,expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE actor record; letter aso.letters%ROWTYPE; original aso.letter_workflow_commands%ROWTYPE; payload jsonb; result jsonb; committed_at timestamptz;
BEGIN
 SELECT * INTO STRICT actor FROM aso.case_actor_context('letter_review');
 payload:=jsonb_build_object('expectedLetterVersion',expected_version);
 SELECT * INTO original FROM aso.letter_workflow_commands command WHERE command.kratos_identity_id=actor.identity_id AND command.practice_id=actor.practice_id AND command.command_id=target_command;
 IF FOUND THEN IF original.letter_id<>target_letter OR original.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'letter command conflict' USING ERRCODE='23505'; END IF; RETURN original.result; END IF;
 SELECT target.* INTO letter FROM aso.letters target JOIN aso.cases clinical_case ON clinical_case.id=target.case_id WHERE target.id=target_letter AND clinical_case.practice_id=actor.practice_id FOR UPDATE OF target;
 IF NOT FOUND THEN RAISE EXCEPTION 'letter not found' USING ERRCODE='P0002'; END IF;
 IF letter.version<>expected_version OR letter.status NOT IN('draft','in_review') THEN RAISE EXCEPTION 'stale letter' USING ERRCODE='40001'; END IF;
 UPDATE aso.letter_claims SET support_status='supported',support_reviewed_by=actor.actor_id,
  support_reviewed_at=clock_timestamp(),support_claim_version=letter.version WHERE letter_id=target_letter;
 INSERT INTO aso.letter_qa_results(qa_check_type_id,letter_id,name,outcome,detail,evaluated_at)
 SELECT check_type.id,target_letter,check_type.name,'pass','Reviewed against the cited source.',clock_timestamp()
 FROM aso.qa_check_types check_type ON CONFLICT(letter_id,qa_check_type_id) DO UPDATE SET outcome='pass',detail=EXCLUDED.detail,evaluated_at=EXCLUDED.evaluated_at;
 UPDATE aso.letters SET status='in_review',revision=revision+1 WHERE id=target_letter RETURNING * INTO letter;
 committed_at:=clock_timestamp(); result:=jsonb_build_object('commandId',target_command,'letterId',target_letter,'caseId',letter.case_id,'letterVersion',letter.version,'qaRevision',letter.qa_revision,'status',letter.status,'committedAt',committed_at);
 INSERT INTO aso.letter_workflow_commands(kratos_identity_id,practice_id,command_id,actor_id,case_id,letter_id,action,payload,result,committed_at)
 VALUES(actor.identity_id,actor.practice_id,target_command,actor.actor_id,letter.case_id,target_letter,'review',payload,result,committed_at); RETURN result;
END $$;

CREATE FUNCTION aso.clinical_case_actor_context(required_capability text)
RETURNS TABLE(actor_id uuid,identity_id uuid,practice_id uuid,actor_label text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE context_actor uuid; context_identity uuid; context_practice uuid;
 context_expiry timestamptz;
BEGIN
 BEGIN
  context_actor:=NULLIF(current_setting('aso.actor_id',true),'')::uuid;
  context_identity:=NULLIF(current_setting('aso.kratos_identity_id',true),'')::uuid;
  context_practice:=NULLIF(current_setting('aso.practice_id',true),'')::uuid;
  context_expiry:=NULLIF(current_setting('aso.session_expires_at',true),'')::timestamptz;
 EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
  RAISE EXCEPTION 'invalid clinical session context' USING ERRCODE='42501';
 END;
 IF required_capability IS NULL
    OR current_setting('aso.principal',true) IS DISTINCT FROM 'user'
    OR context_actor IS NULL OR context_identity IS NULL OR context_practice IS NULL
    OR context_expiry IS NULL OR NOT isfinite(context_expiry)
    OR context_expiry<=clock_timestamp() THEN
  RAISE EXCEPTION 'active human clinical session required' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT user_record.id,user_record.kratos_identity_id,context_practice,
  user_record.full_name FROM aso.users user_record
  WHERE user_record.id=context_actor AND user_record.kratos_identity_id=context_identity
    AND user_record.status='active'
    AND EXISTS(SELECT FROM aso.user_roles membership
      WHERE membership.user_id=user_record.id AND membership.practice_id=context_practice)
    AND EXISTS(SELECT FROM aso.user_capabilities capability
      WHERE capability.user_id=user_record.id AND capability.practice_id=context_practice
        AND capability.capability_key=required_capability AND capability.is_clinical);
 IF NOT FOUND THEN RAISE EXCEPTION 'clinical identity, membership, or capability denied'
  USING ERRCODE='42501'; END IF;
END $$;

CREATE FUNCTION aso.enforce_letter_approval_authority()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE actor record; target_practice uuid;
BEGIN
 IF NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
  IF current_user<>'aso_case_owner' THEN RAISE EXCEPTION 'letter approval requires command function' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT actor FROM aso.clinical_case_actor_context('letter_approve');
  SELECT practice_id INTO target_practice FROM aso.cases WHERE id=NEW.case_id;
  IF target_practice<>actor.practice_id OR NEW.approved_by<>actor.actor_id OR NOT EXISTS(SELECT FROM aso.user_capabilities capability WHERE capability.user_id=actor.actor_id AND capability.practice_id=actor.practice_id AND capability.capability_key='letter_approve' AND capability.is_clinical) THEN RAISE EXCEPTION 'clinical approval authority denied' USING ERRCODE='42501'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER letters_approval_authority BEFORE UPDATE OF status,approved_by,approved_at ON aso.letters FOR EACH ROW EXECUTE FUNCTION aso.enforce_letter_approval_authority();

CREATE FUNCTION aso.approve_letter_workflow(target_command uuid,target_letter uuid,expected_version integer,expected_qa bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE actor record; letter aso.letters%ROWTYPE; original aso.letter_workflow_commands%ROWTYPE; payload jsonb; result jsonb; committed_at timestamptz;
BEGIN
 SELECT * INTO STRICT actor FROM aso.clinical_case_actor_context('letter_approve'); payload:=jsonb_build_object('expectedLetterVersion',expected_version,'expectedQaRevision',expected_qa);
 SELECT * INTO original FROM aso.letter_workflow_commands command WHERE command.kratos_identity_id=actor.identity_id AND command.practice_id=actor.practice_id AND command.command_id=target_command;
 IF FOUND THEN IF original.letter_id<>target_letter OR original.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'letter command conflict' USING ERRCODE='23505'; END IF; RETURN original.result; END IF;
 SELECT target.* INTO letter FROM aso.letters target JOIN aso.cases clinical_case ON clinical_case.id=target.case_id WHERE target.id=target_letter AND clinical_case.practice_id=actor.practice_id FOR UPDATE OF target;
 IF NOT FOUND THEN RAISE EXCEPTION 'letter not found' USING ERRCODE='P0002'; END IF;
 IF letter.version<>expected_version OR letter.qa_revision<>expected_qa OR letter.status<>'in_review' THEN RAISE EXCEPTION 'stale letter' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT FROM aso.letter_claims claim WHERE claim.letter_id=target_letter AND (claim.support_status<>'supported' OR claim.support_claim_version<>letter.version)) OR EXISTS(SELECT FROM aso.qa_check_types check_type LEFT JOIN aso.letter_qa_results qa ON qa.qa_check_type_id=check_type.id AND qa.letter_id=target_letter WHERE qa.id IS NULL OR (check_type.severity='blocking' AND qa.outcome<>'pass')) THEN RAISE EXCEPTION 'qa incomplete' USING ERRCODE='P0007'; END IF;
 UPDATE aso.letters SET status='approved',approved_by=actor.actor_id,approved_at=clock_timestamp(),revision=revision+1 WHERE id=target_letter RETURNING * INTO letter;
 committed_at:=clock_timestamp(); result:=jsonb_build_object('commandId',target_command,'letterId',target_letter,'caseId',letter.case_id,'letterVersion',letter.version,'qaRevision',letter.qa_revision,'status',letter.status,'committedAt',committed_at);
 INSERT INTO aso.letter_workflow_commands(kratos_identity_id,practice_id,command_id,actor_id,case_id,letter_id,action,payload,result,committed_at)
 VALUES(actor.identity_id,actor.practice_id,target_command,actor.actor_id,letter.case_id,target_letter,'approve',payload,result,committed_at); RETURN result;
END $$;

CREATE FUNCTION aso.letter_workflow_commands_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,aso,pg_temp AS $$ BEGIN RAISE EXCEPTION 'letter workflow commands are immutable' USING ERRCODE='42501'; END $$;
CREATE TRIGGER letter_workflow_commands_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON aso.letter_workflow_commands FOR EACH STATEMENT EXECUTE FUNCTION aso.letter_workflow_commands_immutable();

GRANT CREATE ON SCHEMA aso TO aso_case_owner;
DO $$ DECLARE signature text; BEGIN FOREACH signature IN ARRAY ARRAY[
 'aso.letter_snapshot_json(uuid)','aso.read_letter_workflow(uuid)','aso.lookup_letter_workflow_command(uuid)',
 'aso.generate_prior_letter(uuid,uuid,text,text,text,text)','aso.review_letter_workflow(uuid,uuid,integer)',
 'aso.clinical_case_actor_context(text)',
 'aso.enforce_letter_approval_authority()','aso.approve_letter_workflow(uuid,uuid,integer,bigint)',
 'aso.letter_workflow_commands_immutable()'] LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',signature); EXECUTE format('ALTER FUNCTION %s OWNER TO aso_case_owner',signature); END LOOP; END $$;
REVOKE CREATE ON SCHEMA aso FROM aso_case_owner;
GRANT EXECUTE ON FUNCTION aso.read_letter_workflow(uuid),aso.lookup_letter_workflow_command(uuid),
 aso.generate_prior_letter(uuid,uuid,text,text,text,text),aso.review_letter_workflow(uuid,uuid,integer),
 aso.approve_letter_workflow(uuid,uuid,integer,bigint) TO aso_case_executor;
