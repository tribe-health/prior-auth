-- Durable packet transmission, receipt acknowledgement, and custody evidence.
SET search_path = aso, public;

INSERT INTO aso.submission_channel_types(name, description, schema)
VALUES(
  'Manual Synthetic',
  'Local demonstration transport. No packet leaves the Compose network.',
  '{"type":"object","required":["scenario"],"properties":{"scenario":{"type":"string","enum":["local_demo"]}}}'::jsonb
)
ON CONFLICT(name) DO NOTHING;

CREATE TABLE aso.submission_commands(
  kratos_identity_id uuid NOT NULL,
  practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  command_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL,
  submission_id uuid REFERENCES aso.submissions(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK(action IN ('submit','acknowledge')),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
  committed_at timestamptz NOT NULL,
  PRIMARY KEY(kratos_identity_id,practice_id,command_id),
  FOREIGN KEY(case_id,practice_id) REFERENCES aso.cases(id,practice_id) ON DELETE RESTRICT
);
COMMENT ON TABLE aso.submission_commands IS
  'Lane: server-authoritative relational. Privacy: local. Immutable submit and acknowledgement command receipts; excluded from replication.';
ALTER TABLE aso.submission_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.submission_commands FROM PUBLIC;
GRANT SELECT,INSERT ON aso.submission_commands TO aso_case_owner;
GRANT SELECT,INSERT,UPDATE ON aso.submissions,aso.receipts,aso.receipt_items TO aso_case_owner;
GRANT SELECT,INSERT ON aso.submission_attachments,aso.custody_events TO aso_case_owner;
GRANT SELECT ON aso.submission_channel_types,aso.administering_entity_resolutions TO aso_case_owner;
GRANT SELECT(id,practice_id,status) ON aso.cases TO aso_case_owner;
GRANT UPDATE(status) ON aso.cases TO aso_case_owner;
CREATE POLICY submission_commands_owner ON aso.submission_commands TO aso_case_owner USING(true) WITH CHECK(true);
CREATE POLICY submissions_case_owner ON aso.submissions TO aso_case_owner USING(true) WITH CHECK(true);
CREATE UNIQUE INDEX receipts_one_per_submission ON aso.receipts(submission_id);

CREATE FUNCTION aso.submission_packet_snapshot_json(target_case uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE letter aso.letters%ROWTYPE; sent aso.submissions%ROWTYPE; command_id uuid;
 attachments jsonb:='[]'::jsonb; case_status text; resolution_state text;
 channel_key text; block_reason text; can_submit boolean:=false;
BEGIN
 SELECT status INTO case_status FROM aso.cases WHERE id=target_case;
 IF NOT FOUND THEN RAISE EXCEPTION 'case not found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO letter FROM aso.letters candidate WHERE candidate.case_id=target_case
 ORDER BY candidate.generated_at DESC NULLS LAST,candidate.created_at DESC,candidate.id DESC LIMIT 1;
 IF letter.id IS NULL THEN
   RETURN jsonb_build_object('caseId',target_case,'letter',NULL,'submission',NULL,
     'attachments','[]'::jsonb,'canSubmit',false,'blockReason','Generate and sign a current letter first.');
 END IF;
 SELECT resolution.state,resolution.submission_channel_key INTO resolution_state,channel_key
 FROM aso.administering_entity_resolutions resolution WHERE resolution.case_id=target_case;
 SELECT * INTO sent FROM aso.submissions item WHERE item.letter_id=letter.id
 ORDER BY item.attempt DESC,item.submitted_at DESC LIMIT 1;
 IF sent.id IS NULL THEN
   SELECT jsonb_build_array(jsonb_build_object(
     'ordinal',1,'kind','letter','name',CASE letter.purpose
       WHEN 'prior_authorization_request' THEN 'Signed prior authorization request'
       WHEN 'corrected_resubmission' THEN 'Signed corrected resubmission'
       ELSE 'Signed clinical appeal' END,
     'documentId',NULL,'pageCount',1,'contentSha256Text',encode(letter.content_sha256,'hex')))
     || COALESCE(jsonb_agg(jsonb_build_object(
       'ordinal',source.ordinal+1,'kind','source','name',source.name,
       'documentId',source.id,'pageCount',source.page_count,
       'contentSha256Text',encode(source.content_sha256,'hex')) ORDER BY source.ordinal),'[]'::jsonb)
   INTO attachments
   FROM (
     SELECT document.id,document.name,document.page_count,document.content_sha256,
       min(claim.ordinal) AS ordinal
     FROM aso.letter_claims claim JOIN aso.documents document ON document.id=claim.document_id
     WHERE claim.letter_id=letter.id
     GROUP BY document.id,document.name,document.page_count,document.content_sha256
   ) source;
 ELSE
   SELECT COALESCE(jsonb_agg(jsonb_build_object(
     'ordinal',attachment.ordinal,
     'kind',CASE WHEN attachment.letter_id IS NULL THEN 'source' ELSE 'letter' END,
     'name',attachment.label,'documentId',attachment.document_id,
     'pageCount',attachment.page_count,'contentSha256Text',encode(attachment.content_sha256,'hex'))
     ORDER BY attachment.ordinal),'[]'::jsonb)
   INTO attachments FROM aso.submission_attachments attachment WHERE attachment.submission_id=sent.id;
 END IF;
 IF letter.status<>'signed' OR letter.signed_at IS NULL THEN block_reason:='The current letter must be approved and signed.';
 ELSIF octet_length(letter.content_sha256) IS DISTINCT FROM 32 OR jsonb_array_length(attachments)<2 OR EXISTS(
   SELECT FROM jsonb_array_elements(attachments) item
   WHERE COALESCE((item->>'pageCount')::integer,0)<1
     OR COALESCE(item->>'contentSha256Text','') !~ '^[a-f0-9]{64}$')
 THEN block_reason:='Every packet item needs a page count and verified content hash.';
 ELSIF sent.id IS NOT NULL THEN block_reason:='This signed letter has already been sent.';
 ELSIF resolution_state IS DISTINCT FROM 'resolved' OR channel_key IS DISTINCT FROM 'manual_synthetic'
 THEN block_reason:='The configured submission channel is not available in this demonstration.';
 ELSIF (letter.purpose='prior_authorization_request' AND case_status<>'ready')
    OR (letter.purpose IN('corrected_resubmission','clinical_appeal') AND case_status<>'response_ready')
 THEN block_reason:='The case workflow is not ready for this packet.';
 ELSE can_submit:=true;
 END IF;
 IF sent.id IS NOT NULL THEN
   SELECT receipt.command_id INTO command_id FROM aso.submission_commands receipt
   WHERE receipt.submission_id=sent.id AND receipt.action='submit' ORDER BY receipt.committed_at LIMIT 1;
 END IF;
 RETURN jsonb_build_object(
   'caseId',target_case,
   'letter',jsonb_build_object('id',letter.id,'purpose',letter.purpose,'status',letter.status,
     'version',letter.version,'revision',letter.revision,'contentSha256Text',encode(letter.content_sha256,'hex'),
     'signedAt',letter.signed_at),
   'submission',CASE WHEN sent.id IS NULL THEN NULL ELSE jsonb_build_object(
     'id',sent.id,'commandId',command_id,'letterId',sent.letter_id,'status',sent.status,
     'channel','Manual demonstration','attempt',sent.attempt,'submittedAt',sent.submitted_at,
     'totalPages',sent.total_pages,'manifestSha256Text',encode(sent.manifest_sha256,'hex')) END,
   'attachments',attachments,'canSubmit',can_submit,'blockReason',block_reason);
END $$;

CREATE FUNCTION aso.read_submission_packet(target_case uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
BEGIN
 PERFORM aso.require_case(target_case,'case:read');
 RETURN aso.submission_packet_snapshot_json(target_case);
END $$;

CREATE FUNCTION aso.submit_case_packet(target_command uuid,target_case uuid,expected_letter_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE actor record; original aso.submission_commands%ROWTYPE; packet jsonb; payload jsonb;
 letter aso.letters%ROWTYPE; channel_id uuid; submission_id uuid; manifest bytea;
 attachment jsonb; custody record; total_pages integer:=0; committed timestamptz; previous bytea; entry bytea;
 target_status text; result jsonb;
BEGIN
 SELECT * INTO STRICT actor FROM aso.case_actor_context('submit');
 PERFORM aso.require_case(target_case,'submit');
 IF target_command IS NULL OR expected_letter_revision IS NULL OR expected_letter_revision<1
 THEN RAISE EXCEPTION 'invalid submission request' USING ERRCODE='22023'; END IF;
 packet:=aso.submission_packet_snapshot_json(target_case);
 payload:=jsonb_build_object('expectedLetterRevision',expected_letter_revision);
 SELECT * INTO original FROM aso.submission_commands command
 WHERE command.kratos_identity_id=actor.identity_id AND command.practice_id=actor.practice_id
   AND command.command_id=target_command;
 IF FOUND THEN
   IF original.case_id<>target_case OR original.action<>'submit' OR original.payload IS DISTINCT FROM payload
   THEN RAISE EXCEPTION 'submission command conflict' USING ERRCODE='23505'; END IF;
   RETURN original.result;
 END IF;
 IF NOT COALESCE((packet->>'canSubmit')::boolean,false)
 THEN RAISE EXCEPTION 'submission packet is not ready' USING ERRCODE='P0007'; END IF;
 SELECT * INTO STRICT letter FROM aso.letters WHERE id=(packet->'letter'->>'id')::uuid FOR UPDATE;
 IF letter.revision<>expected_letter_revision
 THEN RAISE EXCEPTION 'stale letter' USING ERRCODE='40001'; END IF;
 SELECT id INTO channel_id FROM aso.submission_channel_types WHERE name='Manual Synthetic';
 IF channel_id IS NULL THEN RAISE EXCEPTION 'submission channel unavailable' USING ERRCODE='P0007'; END IF;
 manifest:=public.digest(convert_to((packet->'attachments')::text,'UTF8'),'sha256');
 SELECT sum((item->>'pageCount')::integer) INTO total_pages FROM jsonb_array_elements(packet->'attachments') item;
 submission_id:=gen_random_uuid(); committed:=clock_timestamp();
 INSERT INTO aso.submissions(id,submission_channel_type_id,case_id,letter_id,name,data,attempt,
   submitted_by,submitted_at,status,manifest_sha256,total_pages)
 VALUES(submission_id,channel_id,target_case,letter.id,'Manual demonstration packet',
   '{"scenario":"local_demo"}'::jsonb,1,actor.actor_id,committed,'sent',manifest,total_pages);
 FOR attachment IN SELECT value FROM jsonb_array_elements(packet->'attachments') LOOP
   INSERT INTO aso.submission_attachments(submission_id,document_id,letter_id,ordinal,label,page_count,content_sha256)
   VALUES(submission_id,
     CASE WHEN attachment->>'kind'='source' THEN (attachment->>'documentId')::uuid END,
     CASE WHEN attachment->>'kind'='letter' THEN letter.id END,
     (attachment->>'ordinal')::integer,attachment->>'name',(attachment->>'pageCount')::integer,
     decode(attachment->>'contentSha256Text','hex'));
 END LOOP;
 FOR custody IN SELECT * FROM (VALUES(1,'assembled'),(2,'sealed'),(3,'transmitted')) event(sequence,event) LOOP
   entry:=public.digest(COALESCE(previous,'\\x'::bytea)||convert_to(jsonb_build_object(
     'submissionId',submission_id,'sequence',custody.sequence,'event',custody.event,
     'manifestSha256',encode(manifest,'hex'),'occurredAt',committed)::text,'UTF8'),'sha256');
   INSERT INTO aso.custody_events(submission_id,sequence,event,occurred_at,actor_id,actor_label,payload,previous_hash,entry_hash)
   VALUES(submission_id,custody.sequence,custody.event,committed,
     actor.actor_id,actor.actor_label,jsonb_build_object('manifestSha256Text',encode(manifest,'hex')),
     previous,entry);
   previous:=entry;
 END LOOP;
 target_status:=CASE letter.purpose WHEN 'prior_authorization_request' THEN 'submitted'
   WHEN 'corrected_resubmission' THEN 'resubmitted' ELSE 'appealed' END;
 UPDATE aso.cases SET status=target_status WHERE id=target_case;
 result:=aso.submission_packet_snapshot_json(target_case);
 result:=jsonb_set(result,'{submission,commandId}',to_jsonb(target_command),false);
 INSERT INTO aso.submission_commands(kratos_identity_id,practice_id,command_id,actor_id,case_id,
   submission_id,action,payload,result,committed_at)
 VALUES(actor.identity_id,actor.practice_id,target_command,actor.actor_id,target_case,
   submission_id,'submit',payload,result,committed);
 INSERT INTO aso.audit_events(practice_id,occurred_at,actor_id,actor_kratos_id,actor_label,actor_role,
   action,outcome,entity_table,entity_id,case_id,summary,data)
 VALUES(actor.practice_id,committed,actor.actor_id,actor.identity_id,actor.actor_label,'submit',
   'submission.transmit','success','submissions',submission_id,target_case,'Packet sent through the manual demonstration channel',
   jsonb_build_object('commandId',target_command,'manifestSha256Text',encode(manifest,'hex'),'totalPages',total_pages));
 RETURN result;
END $$;

CREATE FUNCTION aso.submission_receipt_snapshot_json(target_case uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE packet jsonb; sent_id uuid; receipt aso.receipts%ROWTYPE; command_id uuid; custody jsonb;
BEGIN
 packet:=aso.submission_packet_snapshot_json(target_case);
 sent_id:=(packet->'submission'->>'id')::uuid;
 IF sent_id IS NOT NULL THEN
   SELECT * INTO receipt FROM aso.receipts item WHERE item.submission_id=sent_id ORDER BY item.created_at DESC LIMIT 1;
   IF receipt.id IS NOT NULL THEN
     SELECT command.command_id INTO command_id FROM aso.submission_commands command
     WHERE command.submission_id=sent_id AND command.action='acknowledge' ORDER BY command.committed_at LIMIT 1;
   END IF;
   SELECT COALESCE(jsonb_agg(jsonb_build_object('sequence',event.sequence,'event',event.event,
     'occurredAt',event.occurred_at,'actorLabel',event.actor_label) ORDER BY event.sequence),'[]'::jsonb)
   INTO custody FROM aso.custody_events event WHERE event.submission_id=sent_id;
 ELSE custody:='[]'::jsonb;
 END IF;
 RETURN jsonb_build_object('packet',packet,'receipt',CASE WHEN receipt.id IS NULL THEN NULL ELSE
   jsonb_build_object('id',receipt.id,'commandId',command_id,'submissionId',receipt.submission_id,
     'payerReference',receipt.payer_reference,'acknowledgedAt',receipt.received_at,
     'pageCount',receipt.acknowledged_pages,'recordedAt',receipt.created_at) END,
   'custody',custody);
END $$;

CREATE FUNCTION aso.read_submission_receipt(target_case uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
BEGIN
 PERFORM aso.require_case(target_case,'case:read');
 RETURN aso.submission_receipt_snapshot_json(target_case);
END $$;

CREATE FUNCTION aso.acknowledge_case_submission(target_command uuid,target_case uuid,target_submission uuid,
 payer_reference text,acknowledged_at timestamptz,acknowledged_pages integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,aso,pg_temp AS $$
DECLARE actor record; original aso.submission_commands%ROWTYPE; sent aso.submissions%ROWTYPE;
 payload jsonb; receipt_id uuid; committed timestamptz; acknowledgement_state text; previous bytea; entry bytea; result jsonb;
BEGIN
 SELECT * INTO STRICT actor FROM aso.case_actor_context('submit');
 PERFORM aso.require_case(target_case,'submit');
 IF target_command IS NULL OR target_submission IS NULL OR NULLIF(btrim(payer_reference),'') IS NULL
   OR acknowledged_at IS NULL OR acknowledged_pages IS NULL OR acknowledged_pages<0
 THEN RAISE EXCEPTION 'invalid acknowledgement request' USING ERRCODE='22023'; END IF;
 payload:=jsonb_build_object('submissionId',target_submission,'payerReference',btrim(payer_reference),
   'acknowledgedAt',acknowledged_at,'pageCount',acknowledged_pages);
 SELECT * INTO original FROM aso.submission_commands command
 WHERE command.kratos_identity_id=actor.identity_id AND command.practice_id=actor.practice_id
   AND command.command_id=target_command;
 IF FOUND THEN
   IF original.case_id<>target_case OR original.action<>'acknowledge' OR original.payload IS DISTINCT FROM payload
   THEN RAISE EXCEPTION 'submission command conflict' USING ERRCODE='23505'; END IF;
   RETURN original.result;
 END IF;
 SELECT item.* INTO sent FROM aso.submissions item JOIN aso.cases clinical_case ON clinical_case.id=item.case_id
 WHERE item.id=target_submission AND item.case_id=target_case AND clinical_case.practice_id=actor.practice_id FOR UPDATE OF item;
 IF sent.id IS NULL THEN RAISE EXCEPTION 'submission not found' USING ERRCODE='P0002'; END IF;
 IF sent.status<>'sent' OR acknowledged_pages>sent.total_pages OR EXISTS(
   SELECT FROM aso.receipts existing WHERE existing.submission_id=sent.id)
 THEN RAISE EXCEPTION 'submission cannot be acknowledged' USING ERRCODE='P0007'; END IF;
 committed:=clock_timestamp(); receipt_id:=gen_random_uuid();
 acknowledgement_state:=CASE WHEN acknowledged_pages=sent.total_pages THEN 'acknowledged' ELSE 'disputed' END;
 INSERT INTO aso.receipts(id,submission_id,received_at,payer_reference,acknowledged_pages,recorded_by,created_at)
 VALUES(receipt_id,sent.id,acknowledged_at,btrim(payer_reference),acknowledged_pages,actor.actor_id,committed);
 INSERT INTO aso.receipt_items(receipt_id,submission_attachment_id,state,payer_page_count)
 SELECT receipt_id,attachment.id,
   CASE WHEN acknowledgement_state='acknowledged' THEN 'acknowledged' ELSE 'unconfirmed' END,
   CASE WHEN acknowledgement_state='acknowledged' THEN attachment.page_count END
 FROM aso.submission_attachments attachment WHERE attachment.submission_id=sent.id;
 UPDATE aso.submissions SET status=acknowledgement_state WHERE id=sent.id;
 SELECT event.entry_hash INTO previous FROM aso.custody_events event
 WHERE event.submission_id=sent.id ORDER BY event.sequence DESC LIMIT 1;
 entry:=public.digest(COALESCE(previous,'\\x'::bytea)||convert_to(jsonb_build_object(
   'submissionId',sent.id,'sequence',4,'event',acknowledgement_state,'payerReference',btrim(payer_reference),
   'acknowledgedAt',acknowledged_at,'pageCount',acknowledged_pages)::text,'UTF8'),'sha256');
 INSERT INTO aso.custody_events(submission_id,sequence,event,occurred_at,actor_id,actor_label,payload,previous_hash,entry_hash)
 VALUES(sent.id,4,acknowledgement_state,committed,actor.actor_id,actor.actor_label,
   jsonb_build_object('payerReference',btrim(payer_reference),'acknowledgedAt',acknowledged_at,
     'pageCount',acknowledged_pages),previous,entry);
 result:=aso.submission_receipt_snapshot_json(target_case);
 result:=jsonb_set(result,'{receipt,commandId}',to_jsonb(target_command),false);
 INSERT INTO aso.submission_commands(kratos_identity_id,practice_id,command_id,actor_id,case_id,
   submission_id,action,payload,result,committed_at)
 VALUES(actor.identity_id,actor.practice_id,target_command,actor.actor_id,target_case,
   sent.id,'acknowledge',payload,result,committed);
 INSERT INTO aso.audit_events(practice_id,occurred_at,actor_id,actor_kratos_id,actor_label,actor_role,
   action,outcome,entity_table,entity_id,case_id,summary,data)
 VALUES(actor.practice_id,committed,actor.actor_id,actor.identity_id,actor.actor_label,'submit',
   'submission.acknowledge','success','receipts',receipt_id,target_case,
   CASE WHEN acknowledgement_state='acknowledged' THEN 'Payer acknowledgement recorded' ELSE 'Partial payer acknowledgement recorded' END,
   jsonb_build_object('commandId',target_command,'submissionId',sent.id,'pageCount',acknowledged_pages));
 RETURN result;
END $$;

CREATE FUNCTION aso.submission_commands_immutable() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,aso,pg_temp AS $$ BEGIN
 RAISE EXCEPTION 'submission commands are immutable' USING ERRCODE='42501';
END $$;
CREATE TRIGGER submission_commands_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON aso.submission_commands
FOR EACH STATEMENT EXECUTE FUNCTION aso.submission_commands_immutable();

GRANT CREATE ON SCHEMA aso TO aso_case_owner;
ALTER FUNCTION aso.submission_packet_snapshot_json(uuid) OWNER TO aso_case_owner;
ALTER FUNCTION aso.read_submission_packet(uuid) OWNER TO aso_case_owner;
ALTER FUNCTION aso.submit_case_packet(uuid,uuid,bigint) OWNER TO aso_case_owner;
ALTER FUNCTION aso.submission_receipt_snapshot_json(uuid) OWNER TO aso_case_owner;
ALTER FUNCTION aso.read_submission_receipt(uuid) OWNER TO aso_case_owner;
ALTER FUNCTION aso.acknowledge_case_submission(uuid,uuid,uuid,text,timestamptz,integer) OWNER TO aso_case_owner;
ALTER FUNCTION aso.submission_commands_immutable() OWNER TO aso_case_owner;
REVOKE CREATE ON SCHEMA aso FROM aso_case_owner;
REVOKE ALL ON FUNCTION aso.submission_packet_snapshot_json(uuid),aso.read_submission_packet(uuid),
 aso.submit_case_packet(uuid,uuid,bigint),aso.submission_receipt_snapshot_json(uuid),
 aso.read_submission_receipt(uuid),aso.acknowledge_case_submission(uuid,uuid,uuid,text,timestamptz,integer),
 aso.submission_commands_immutable() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aso.read_submission_packet(uuid),aso.submit_case_packet(uuid,uuid,bigint),
 aso.read_submission_receipt(uuid),aso.acknowledge_case_submission(uuid,uuid,uuid,text,timestamptz,integer)
 TO aso_case_executor;
