-- Focused identity check for an initial request and denial response in one case.
-- Apply after schema.sql, schema-ai.sql, and schema-web-capabilities.sql.
-- The transaction proves both letter purposes can use version 1 and both
-- letters can use submission attempt 1, then rolls back.

\set ON_ERROR_STOP on
SET search_path=aso,public;
BEGIN;
INSERT INTO practices(id,name,key) VALUES ('41000000-0000-4000-8000-000000000001','Synthetic Flow Practice','synthetic-flow-practice');
INSERT INTO users(id,kratos_identity_id,practice_id,email,full_name) VALUES ('42000000-0000-4000-8000-000000000001',gen_random_uuid(),'41000000-0000-4000-8000-000000000001','flow-surgeon@example.invalid','Synthetic Flow Surgeon');
INSERT INTO user_roles(user_id,role_id,practice_id) SELECT '42000000-0000-4000-8000-000000000001',id,'41000000-0000-4000-8000-000000000001' FROM roles WHERE key='surgeon';
SELECT set_config('aso.kratos_identity_id',(SELECT kratos_identity_id::text FROM users WHERE id='42000000-0000-4000-8000-000000000001'),true);
SELECT set_config('aso.selected_practice_id','41000000-0000-4000-8000-000000000001',true);
INSERT INTO patients(id,practice_id,family_name,given_name,birth_date) VALUES ('43000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','Synthetic','Flow Patient',DATE '1970-01-01');
INSERT INTO payers(id,name,key) VALUES ('44000000-0000-4000-8000-000000000001','Synthetic Flow Payer','synthetic-flow-payer');
INSERT INTO cases(id,practice_id,patient_id,surgeon_id,payer_id,case_number) VALUES ('45000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001','SYN-FLOW-001');
INSERT INTO gate_affirmations(case_id,kind,affirmed_by) SELECT '45000000-0000-4000-8000-000000000001',key,'42000000-0000-4000-8000-000000000001' FROM gate_affirmation_kinds;
INSERT INTO signatures(id,user_id,version,image_uri,image_sha256,credential_line) VALUES ('46000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001',1,'synthetic://flow-signature',decode('00','hex'),'Synthetic Flow Surgeon');
INSERT INTO letters(id,case_id,purpose,version,status,body_markdown,signature_id,signed_at) VALUES ('47000000-0000-4000-8000-000000000001','45000000-0000-4000-8000-000000000001','prior_authorization_request',1,'signed','Synthetic initial request','46000000-0000-4000-8000-000000000001',now());
INSERT INTO submissions(id,submission_channel_type_id,case_id,letter_id,name,data,attempt,submitted_by,status,manifest_sha256,total_pages)
SELECT '48000000-0000-4000-8000-000000000001',id,'45000000-0000-4000-8000-000000000001','47000000-0000-4000-8000-000000000001','Synthetic initial submission','{"trace_number":"SYN-TRACE-1","clearinghouse":"Synthetic Clearinghouse"}'::jsonb,1,'42000000-0000-4000-8000-000000000001','acknowledged',decode('01','hex'),1 FROM submission_channel_types WHERE name='X12 278 Transaction';
INSERT INTO determinations(id,case_id,submission_id,outcome,decided_on,reason_text) VALUES ('49000000-0000-4000-8000-000000000001','45000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-000000000001','denied',DATE '2026-03-10','Synthetic denial');
INSERT INTO letters(id,case_id,purpose,version,status,body_markdown,signature_id,signed_at,original_request_letter_id,challenged_determination_id) VALUES ('47000000-0000-4000-8000-000000000002','45000000-0000-4000-8000-000000000001','clinical_appeal',1,'signed','Synthetic appeal','46000000-0000-4000-8000-000000000001',now(),'47000000-0000-4000-8000-000000000001','49000000-0000-4000-8000-000000000001');
INSERT INTO submissions(id,submission_channel_type_id,case_id,letter_id,name,data,attempt,submitted_by,status,manifest_sha256,total_pages)
SELECT '48000000-0000-4000-8000-000000000002',id,'45000000-0000-4000-8000-000000000001','47000000-0000-4000-8000-000000000002','Synthetic response submission','{"trace_number":"SYN-TRACE-2","clearinghouse":"Synthetic Clearinghouse"}'::jsonb,1,'42000000-0000-4000-8000-000000000001','acknowledged',decode('02','hex'),1 FROM submission_channel_types WHERE name='X12 278 Transaction';
SELECT 'Passed: same case stores initial and response version 1' WHERE (SELECT count(*) FROM letters WHERE case_id='45000000-0000-4000-8000-000000000001' AND version=1)=2;
SELECT 'Passed: each letter stores submission attempt 1' WHERE (SELECT count(*) FROM submissions WHERE case_id='45000000-0000-4000-8000-000000000001' AND attempt=1)=2;

INSERT INTO patients(id,practice_id,family_name,given_name,birth_date)
VALUES ('43000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000001','Synthetic','Other Patient',DATE '1970-01-02');
INSERT INTO cases(id,practice_id,patient_id,surgeon_id,payer_id,case_number)
VALUES ('45000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001','SYN-FLOW-002');
INSERT INTO documents(id,document_type_id,patient_id,case_id,name,effective_date)
SELECT '4a000000-0000-4000-8000-000000000002',id,'43000000-0000-4000-8000-000000000002','45000000-0000-4000-8000-000000000002','Synthetic other-case source',DATE '2026-03-01'
  FROM document_types WHERE key='policy-document';

DO $$
BEGIN
  BEGIN
    INSERT INTO letter_claims(
      letter_id,case_id,ordinal,claim_text,document_id,document_version,
      page_number,source_quote,source_span_start,source_span_end,source_date,
      source_date_kind
    ) VALUES (
      '47000000-0000-4000-8000-000000000001',
      '45000000-0000-4000-8000-000000000001',
      1,'Synthetic cross-case claim',
      '4a000000-0000-4000-8000-000000000002',1,1,
      'Synthetic source',0,16,DATE '2026-03-01','effective_date'
    );
    RAISE EXCEPTION 'cross-case cited document was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'Passed: cross-case cited document refused';
  END;
END;
$$;
ROLLBACK;
