-- web-08. Atomic three-state evidence assembly with exact source provenance.

INSERT INTO aso.capabilities (key, label, description, is_clinical) VALUES
  ('evidence_assemble', 'Assemble case evidence',
   'Classify selected criteria as met, gap, or void with exact chart provenance.', false),
  ('evidence_obtain', 'Complete evidence work',
   'Request and resolve missing-document work for an authorized case.', false)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label,
  description=EXCLUDED.description, is_clinical=EXCLUDED.is_clinical;

INSERT INTO aso.role_capabilities (role_id, capability_key)
SELECT role.id, capability
FROM aso.roles role
CROSS JOIN (VALUES ('evidence_assemble'), ('evidence_obtain')) granted(capability)
WHERE role.key IN ('staff', 'surgeon')
ON CONFLICT DO NOTHING;

ALTER TABLE aso.cases
  ADD COLUMN evidence_revision bigint NOT NULL DEFAULT 0 CHECK (evidence_revision >= 0),
  ADD COLUMN evidence_work_revision bigint NOT NULL DEFAULT 0 CHECK (evidence_work_revision >= 0);

ALTER TABLE aso.case_evidence
  ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES aso.practices(id) ON DELETE RESTRICT;
ALTER TABLE aso.evidence_citations
  ADD COLUMN IF NOT EXISTS practice_id uuid REFERENCES aso.practices(id) ON DELETE RESTRICT,
  ADD COLUMN document_effective_date date,
  ADD COLUMN content_sha256_text text;

UPDATE aso.case_evidence evidence
SET practice_id = clinical_case.practice_id
FROM aso.cases clinical_case
WHERE clinical_case.id = evidence.case_id;
UPDATE aso.evidence_citations citation
SET practice_id = evidence.practice_id
FROM aso.case_evidence evidence
WHERE evidence.id = citation.case_evidence_id;
ALTER TABLE aso.case_evidence ALTER COLUMN practice_id SET NOT NULL;
ALTER TABLE aso.evidence_citations ALTER COLUMN practice_id SET NOT NULL;

UPDATE aso.evidence_citations citation
SET document_effective_date = document.effective_date,
    content_sha256_text = encode(document.content_sha256, 'hex')
FROM aso.documents document WHERE document.id = citation.document_id;

ALTER TABLE aso.evidence_citations
  ADD CONSTRAINT evidence_citations_provenance_check
    CHECK (document_effective_date IS NOT NULL
      AND content_sha256_text ~ '^[0-9a-f]{64}$') NOT VALID,
  ADD CONSTRAINT evidence_citations_quote_check
    CHECK (quote IS NOT NULL AND btrim(quote) <> '' AND page_number IS NOT NULL) NOT VALID;

CREATE TABLE aso.evidence_assembly_commands (
  kratos_identity_id uuid NOT NULL,
  practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  command_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  committed_at timestamptz NOT NULL,
  PRIMARY KEY (kratos_identity_id, practice_id, command_id),
  FOREIGN KEY (case_id, practice_id) REFERENCES aso.cases(id, practice_id) ON DELETE RESTRICT
);

COMMENT ON TABLE aso.evidence_assembly_commands IS
  'Lane: server-authoritative relational. Privacy: local. Immutable evidence command receipts; excluded from replication.';
COMMENT ON TABLE aso.case_evidence IS
  'Lane: server-authoritative relational. Privacy: trusted PHI. Three-state evidence; publish only the reviewed allowlist under verified-practice scope.';
COMMENT ON TABLE aso.evidence_citations IS
  'Lane: server-authoritative relational. Privacy: trusted PHI. Exact document/page/date/hash citations under the parent evidence tenant.';

ALTER TABLE aso.evidence_assembly_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.evidence_assembly_commands FROM PUBLIC;
GRANT SELECT, INSERT ON aso.evidence_assembly_commands TO aso_case_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON aso.case_evidence, aso.evidence_citations TO aso_case_owner;
GRANT SELECT ON aso.document_pages, aso.documents, aso.case_criteria_selections,
  aso.criteria TO aso_case_owner;
GRANT SELECT (id, practice_id, document_set_revision, criteria_selection_revision,
  evidence_revision, evidence_work_revision) ON aso.cases TO aso_case_owner;
GRANT UPDATE (evidence_revision) ON aso.cases TO aso_case_owner;

CREATE POLICY evidence_assembly_commands_owner ON aso.evidence_assembly_commands
  TO aso_case_owner USING (true) WITH CHECK (true);
CREATE POLICY case_evidence_owner ON aso.case_evidence
  TO aso_case_owner USING (true) WITH CHECK (true);
CREATE POLICY evidence_citations_owner ON aso.evidence_citations
  TO aso_case_owner USING (true) WITH CHECK (true);
CREATE POLICY evidence_documents_owner ON aso.documents
  TO aso_case_owner USING (true);
CREATE POLICY evidence_document_pages_owner ON aso.document_pages
  TO aso_case_owner USING (true);

CREATE FUNCTION aso.evidence_revision_token(target_case uuid, revision bigint)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,aso,pg_temp
AS $$ SELECT target_case::text || ':evidenceRevision:r' || revision::text $$;
CREATE FUNCTION aso.evidence_work_revision_token(target_case uuid, revision bigint)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,aso,pg_temp
AS $$ SELECT target_case::text || ':evidenceWorkRevision:r' || revision::text $$;

CREATE FUNCTION aso.case_evidence_snapshot_json(target_case uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE clinical_case aso.cases%ROWTYPE; entries jsonb;
BEGIN
  SELECT * INTO STRICT clinical_case FROM aso.cases WHERE id=target_case;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', evidence.id, 'criterionId', evidence.criterion_id,
    'criterionLabel', criterion.label, 'criterionRequirement', criterion.requirement,
    'state', evidence.state, 'rationale', COALESCE(evidence.rationale,''),
    'assessedAt', evidence.assessed_at, 'revision', evidence.revision,
    'citations', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', citation.id, 'documentId', citation.document_id,
      'pageNumber', citation.page_number, 'quote', citation.quote,
      'relevance', citation.relevance,
      'documentEffectiveDate', citation.document_effective_date,
      'contentSha256Text', citation.content_sha256_text) ORDER BY citation.id)
      FROM aso.evidence_citations citation WHERE citation.case_evidence_id=evidence.id), '[]'::jsonb)
  ) ORDER BY criterion.ordinal, evidence.id), '[]'::jsonb) INTO entries
  FROM aso.case_evidence evidence JOIN aso.criteria criterion ON criterion.id=evidence.criterion_id
  WHERE evidence.case_id=target_case;
  RETURN jsonb_build_object('caseId', target_case,
    'evidenceRevision', aso.evidence_revision_token(target_case, clinical_case.evidence_revision),
    'evidenceWorkRevision', aso.evidence_work_revision_token(target_case, clinical_case.evidence_work_revision),
    'entries', entries);
END $$;

CREATE FUNCTION aso.read_case_evidence(target_case uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
BEGIN
  PERFORM aso.require_case(target_case, 'case:read');
  RETURN aso.case_evidence_snapshot_json(target_case);
END $$;

CREATE FUNCTION aso.assemble_case_evidence(target_command uuid, target_case uuid,
  expected_document_revision text, expected_selection_revision text,
  expected_work_revision text, target_inputs jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE actor record; original aso.evidence_assembly_commands%ROWTYPE;
  clinical_case aso.cases%ROWTYPE; selection aso.case_criteria_selections%ROWTYPE;
  payload jsonb; result jsonb; committed_at timestamptz; next_revision bigint;
  document_revision bigint; selection_revision bigint; work_revision bigint;
  token_match text[]; input_count bigint; selected_count bigint; item record;
BEGIN
  SELECT * INTO STRICT actor FROM aso.case_actor_context('evidence_assemble');
  PERFORM aso.require_case(target_case, 'evidence_assemble');
  IF target_command IS NULL OR jsonb_typeof(target_inputs) <> 'array'
     OR jsonb_array_length(target_inputs)=0 THEN
    RAISE EXCEPTION 'invalid evidence request' USING ERRCODE='22023';
  END IF;
  token_match := regexp_match(expected_document_revision, '^.+:documentSetRevision:r(0|[1-9][0-9]*)$');
  IF token_match IS NULL THEN RAISE EXCEPTION 'invalid document revision' USING ERRCODE='22023'; END IF;
  document_revision := token_match[1]::bigint;
  token_match := regexp_match(expected_selection_revision, '^.+:criteriaSelectionRevision:r(0|[1-9][0-9]*)$');
  IF token_match IS NULL THEN RAISE EXCEPTION 'invalid selection revision' USING ERRCODE='22023'; END IF;
  selection_revision := token_match[1]::bigint;
  token_match := regexp_match(expected_work_revision, '^.+:evidenceWorkRevision:r(0|[1-9][0-9]*)$');
  IF token_match IS NULL THEN RAISE EXCEPTION 'invalid work revision' USING ERRCODE='22023'; END IF;
  work_revision := token_match[1]::bigint;
  payload := jsonb_build_object('expectedRevisions',jsonb_build_object(
    'documentSetRevision',expected_document_revision,
    'criteriaSelectionRevision',expected_selection_revision,
    'evidenceWorkRevision',expected_work_revision),'evidenceInputs',target_inputs);
  SELECT * INTO original FROM aso.evidence_assembly_commands command
   WHERE command.kratos_identity_id=actor.identity_id AND command.practice_id=actor.practice_id
     AND command.command_id=target_command;
  IF FOUND THEN
    IF original.case_id IS DISTINCT FROM target_case OR original.payload IS DISTINCT FROM payload THEN
      RAISE EXCEPTION 'evidence command conflict' USING ERRCODE='23505';
    END IF;
    RETURN original.result;
  END IF;
  SELECT * INTO STRICT clinical_case FROM aso.cases
   WHERE id=target_case AND practice_id=actor.practice_id FOR UPDATE;
  SELECT * INTO selection FROM aso.case_criteria_selections
   WHERE case_id=target_case AND practice_id=actor.practice_id;
  IF NOT FOUND OR selection.revision<>clinical_case.criteria_selection_revision THEN
    RAISE EXCEPTION 'criteria unresolved' USING ERRCODE='P0003';
  END IF;
  IF clinical_case.document_set_revision<>document_revision
     OR clinical_case.criteria_selection_revision<>selection_revision
     OR clinical_case.evidence_work_revision<>work_revision THEN
    RAISE EXCEPTION 'evidence revision changed' USING ERRCODE='40001';
  END IF;
  SELECT count(*), count(DISTINCT value->>'criterionId') INTO input_count, selected_count
    FROM jsonb_array_elements(target_inputs) value;
  IF input_count<>cardinality(selection.selected_criterion_ids) OR selected_count<>input_count
     OR EXISTS (SELECT FROM unnest(selection.selected_criterion_ids) selected(id)
       WHERE NOT EXISTS (SELECT FROM jsonb_array_elements(target_inputs) value
         WHERE (value->>'criterionId')::uuid=selected.id)) THEN
    RAISE EXCEPTION 'evidence matrix differs from selection' USING ERRCODE='23514';
  END IF;
  FOR item IN SELECT * FROM jsonb_to_recordset(target_inputs) AS x(
    id uuid, "criterionId" uuid, "expectedState" text, "documentId" uuid,
    "pageNumber" integer, quote text, rationale text)
  LOOP
    IF item.id IS NULL OR item."criterionId" IS NULL OR item."expectedState" NOT IN ('met','gap','void')
       OR btrim(COALESCE(item.rationale,''))='' THEN
      RAISE EXCEPTION 'invalid evidence input' USING ERRCODE='23514';
    END IF;
    IF item."expectedState"='void' THEN
      IF item."documentId" IS NOT NULL OR item."pageNumber" IS NOT NULL OR item.quote IS NOT NULL THEN
        RAISE EXCEPTION 'void cannot carry a citation' USING ERRCODE='23514';
      END IF;
    ELSE
      IF item."documentId" IS NULL OR item."pageNumber" IS NULL OR btrim(COALESCE(item.quote,''))='' OR NOT EXISTS (
        SELECT FROM aso.documents document JOIN aso.document_pages page ON page.document_id=document.id
        WHERE document.id=item."documentId" AND document.case_id=target_case
          AND document.processing_status='ready' AND page.page_number=item."pageNumber"
          AND strpos(page.text,item.quote)>0) THEN
        RAISE EXCEPTION 'citation incomplete' USING ERRCODE='P0004';
      END IF;
    END IF;
  END LOOP;
  DELETE FROM aso.evidence_citations citation USING aso.case_evidence evidence
   WHERE citation.case_evidence_id=evidence.id AND evidence.case_id=target_case;
  DELETE FROM aso.case_evidence WHERE case_id=target_case;
  next_revision := clinical_case.evidence_revision+1;
  FOR item IN SELECT * FROM jsonb_to_recordset(target_inputs) AS x(
    id uuid, "criterionId" uuid, "expectedState" text, "documentId" uuid,
    "pageNumber" integer, quote text, rationale text)
  LOOP
    INSERT INTO aso.case_evidence(id,practice_id,case_id,criterion_id,state,rationale,
      assessed_by,assessed_at,revision)
    VALUES(item.id,actor.practice_id,target_case,item."criterionId",item."expectedState",
      item.rationale,actor.actor_id,clock_timestamp(),next_revision);
    IF item."expectedState"<>'void' THEN
      INSERT INTO aso.evidence_citations(case_evidence_id,practice_id,document_id,page_number,
        quote,relevance,document_effective_date,content_sha256_text)
      SELECT item.id,actor.practice_id,document.id,item."pageNumber",item.quote,
        CASE WHEN item."expectedState"='gap' THEN 'contradicts' ELSE 'supports' END,
        document.effective_date,encode(document.content_sha256,'hex')
      FROM aso.documents document WHERE document.id=item."documentId";
    END IF;
  END LOOP;
  UPDATE aso.cases SET evidence_revision=next_revision WHERE id=target_case;
  committed_at:=clock_timestamp();
  result:=jsonb_build_object('commandId',target_command,'caseId',target_case,
    'evidenceRevision',aso.evidence_revision_token(target_case,next_revision),'committedAt',committed_at);
  INSERT INTO aso.evidence_assembly_commands(kratos_identity_id,practice_id,command_id,
    actor_id,case_id,payload,result,committed_at)
  VALUES(actor.identity_id,actor.practice_id,target_command,actor.actor_id,target_case,payload,result,committed_at);
  INSERT INTO aso.audit_events(practice_id,occurred_at,actor_id,actor_kratos_id,actor_label,
    actor_role,action,outcome,entity_table,entity_id,case_id,summary,data)
  VALUES(actor.practice_id,committed_at,actor.actor_id,actor.identity_id,actor.actor_label,
    'case:evidence_assemble','evidence.assemble','success','case_evidence',target_case,
    target_case,'Case evidence assembled',jsonb_build_object('commandId',target_command,'evidenceRevision',next_revision));
  RETURN result;
END $$;

CREATE FUNCTION aso.lookup_evidence_assembly_command(target_case uuid,target_command uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE actor record; found_result jsonb;
BEGIN
  SELECT * INTO STRICT actor FROM aso.case_actor_context('evidence_assemble');
  PERFORM aso.require_case(target_case,'evidence_assemble');
  SELECT command.result INTO found_result FROM aso.evidence_assembly_commands command
   WHERE command.kratos_identity_id=actor.identity_id AND command.practice_id=actor.practice_id
     AND command.case_id=target_case AND command.command_id=target_command;
  RETURN found_result;
END $$;

CREATE FUNCTION aso.evidence_assembly_commands_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,aso,pg_temp AS $$
BEGIN RAISE EXCEPTION 'evidence command receipts are immutable' USING ERRCODE='42501'; END $$;
CREATE TRIGGER evidence_assembly_commands_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
ON aso.evidence_assembly_commands FOR EACH STATEMENT EXECUTE FUNCTION aso.evidence_assembly_commands_immutable();

GRANT CREATE ON SCHEMA aso TO aso_case_owner;
DO $$ DECLARE signature text; BEGIN FOREACH signature IN ARRAY ARRAY[
  'aso.evidence_revision_token(uuid,bigint)',
  'aso.evidence_work_revision_token(uuid,bigint)',
  'aso.case_evidence_snapshot_json(uuid)',
  'aso.read_case_evidence(uuid)',
  'aso.assemble_case_evidence(uuid,uuid,text,text,text,jsonb)',
  'aso.lookup_evidence_assembly_command(uuid,uuid)',
  'aso.evidence_assembly_commands_immutable()'
] LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',signature);
  EXECUTE format('ALTER FUNCTION %s OWNER TO aso_case_owner',signature); END LOOP; END $$;
REVOKE CREATE ON SCHEMA aso FROM aso_case_owner;
GRANT EXECUTE ON FUNCTION aso.read_case_evidence(uuid),
  aso.assemble_case_evidence(uuid,uuid,text,text,text,jsonb),
  aso.lookup_evidence_assembly_command(uuid,uuid) TO aso_case_executor;
