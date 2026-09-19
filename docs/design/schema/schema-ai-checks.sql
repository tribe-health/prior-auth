-- ═══════════════════════════════════════════════════════════════════════════
-- Behavioural checks for schema-ai.sql (PostgreSQL 18 + pgvector).
--
-- Each test is numbered to the adversarial-review finding it answers. The
-- review was produced by a different model (k3) than the schema, and its
-- verdict was BLOCK with 4 CRITICAL findings; these tests are the evidence
-- that each is now closed.
--
--   psql -d <db> -f schema-ai-checks.sql
--
-- Expect ERROR on: A1 A2 A3 A4 A5 A6 A7 A8 A9 A10 A12.
-- Expect a RESULT line on: A11 A13 A14 A15.
-- Everything runs in one transaction that is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
SET search_path = aso, public;
BEGIN;

INSERT INTO practices (id,name,key) VALUES
  ('11111111-1111-1111-1111-111111111111','ASO','aso'),
  ('22222222-2222-2222-2222-222222222222','Peer Ortho','peer');
INSERT INTO payers (id,name,key) VALUES ('c0000000-0000-0000-0000-000000000001','BCBS','bcbs');
INSERT INTO users (id,kratos_identity_id,practice_id,email,full_name) VALUES
  ('a0000000-0000-0000-0000-000000000001',gen_random_uuid(),
   '11111111-1111-1111-1111-111111111111','kjames@asodocs.com','Kevin B. James, MD');
INSERT INTO user_roles (user_id,role_id,practice_id)
  SELECT 'a0000000-0000-0000-0000-000000000001',id,'11111111-1111-1111-1111-111111111111'
    FROM roles WHERE key='surgeon';
SELECT set_config(
  'aso.kratos_identity_id',
  (SELECT kratos_identity_id::text FROM users
    WHERE id='a0000000-0000-0000-0000-000000000001'),
  true
);
SELECT set_config('aso.selected_practice_id','11111111-1111-1111-1111-111111111111',true);
INSERT INTO policies (id,policy_type_id,payer_id,name,policy_number,version,effective_from)
  SELECT 'aa000000-0000-0000-0000-0000000000aa',id,'c0000000-0000-0000-0000-000000000001',
         'CPB 0743','CPB 0743','2026-01',DATE '2026-01-01' FROM policy_types LIMIT 1;
INSERT INTO patients (id,practice_id,family_name,given_name,birth_date)
  VALUES ('b0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Kaminski','Ruth','1958-04-02');
INSERT INTO cases (id,practice_id,patient_id,surgeon_id,payer_id,case_number)
  VALUES ('d0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
          'b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
          'c0000000-0000-0000-0000-000000000001','ASO-2026-0001');

\echo '=== A1  [K3-1] ALTER shared corpus to add a fee column   -> expect ERROR'
SAVEPOINT a1; ALTER TABLE shared_criterion_summaries ADD COLUMN allowed_amount numeric; ROLLBACK TO a1;

\echo '=== A2  [K3-1] same, disguised as money type             -> expect ERROR'
SAVEPOINT a2; ALTER TABLE shared_criterion_summaries ADD COLUMN x money; ROLLBACK TO a2;

\echo '=== A3  [K3-7] derived criterion citing a policy parent  -> expect ERROR'
SAVEPOINT a3;
INSERT INTO criteria (payer_id,practice_id,evidence_grade,label,requirement,content_sha256,policy_id,section)
  VALUES ('c0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
          'derived_observed','L','R',decode('00','hex'),'aa000000-0000-0000-0000-0000000000aa','3.2');
ROLLBACK TO a3;

\echo '=== A4  [K3-7] payer_verbal with no recorder             -> expect ERROR'
SAVEPOINT a4;
INSERT INTO criteria (payer_id,evidence_grade,label,requirement,content_sha256)
  VALUES ('c0000000-0000-0000-0000-000000000001','payer_verbal','L','R',decode('00','hex'));
ROLLBACK TO a4;

\echo '=== A5  [K3-7] peer_shared with no origin grade          -> expect ERROR'
SAVEPOINT a5;
INSERT INTO criteria (payer_id,evidence_grade,label,requirement,content_sha256,source_practice_id)
  VALUES ('c0000000-0000-0000-0000-000000000001','peer_shared','P','Q',decode('cc','hex'),
          '22222222-2222-2222-2222-222222222222');
ROLLBACK TO a5;

-- The criterion the rest of the suite uses.
INSERT INTO criteria (id,payer_id,practice_id,evidence_grade,label,requirement,content_sha256,procedure_family)
  VALUES ('f0000000-0000-0000-0000-00000000000f','c0000000-0000-0000-0000-000000000001',
          '11111111-1111-1111-1111-111111111111','derived_observed','Translation >3mm',
          'BCBS approves fusion when segmental translation exceeds 3mm',decode('aa','hex'),'lumbar-fusion');

\echo '=== A6  [K3-6] edit criterion text after observations    -> expect ERROR'
SAVEPOINT a6; UPDATE criteria SET requirement='changed' WHERE id='f0000000-0000-0000-0000-00000000000f'; ROLLBACK TO a6;

\echo '=== A7  [K3-4] overlapping validity, same payer+label    -> expect ERROR'
SAVEPOINT a7;
INSERT INTO criteria (payer_id,practice_id,evidence_grade,label,requirement,content_sha256)
  VALUES ('c0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
          'derived_observed','Translation >3mm','conflicting',decode('bb','hex'));
ROLLBACK TO a7;

\echo '=== A8  [K3-3] cite a derived criterion as payer policy  -> expect ERROR'
INSERT INTO letters (id,case_id,version,body_markdown)
  VALUES ('11100000-0000-0000-0000-000000000111','d0000000-0000-0000-0000-000000000001',1,'draft');
INSERT INTO documents (id,document_type_id,patient_id,case_id,name,effective_date,data)
  SELECT 'd0000000-0000-0000-0000-00000000000d',id,'b0000000-0000-0000-0000-000000000001',
         'd0000000-0000-0000-0000-000000000001',
         'MRI','2026-01-01','{"modality":"MRI","body_region":"lumbar","impression":"stenosis"}'::jsonb
    FROM document_types WHERE key='mri-report';
SAVEPOINT a8;
INSERT INTO letter_claims (
  letter_id,case_id,ordinal,claim_text,document_id,document_version,page_number,
  source_quote,source_span_start,source_span_end,source_date,source_date_kind,
  criterion_id,attribution)
  VALUES ('11100000-0000-0000-0000-000000000111','d0000000-0000-0000-0000-000000000001',1,'BCBS requires translation >3mm',
          'd0000000-0000-0000-0000-00000000000d',1,1,
          'stenosis',0,8,DATE '2026-01-01','effective_date',
          'f0000000-0000-0000-0000-00000000000f','published_policy');
ROLLBACK TO a8;

-- Keep one fully sourced and human-supported claim on the draft. A12 and A13
-- therefore isolate the unresolved-retrieval signing rule rather than failing
-- on missing claim provenance or review.
INSERT INTO letter_claims (
  letter_id,case_id,ordinal,claim_text,document_id,document_version,page_number,
  source_quote,source_span_start,source_span_end,source_date,source_date_kind,
  support_status,support_reviewed_by,support_reviewed_at,support_claim_version,
  criterion_id,attribution)
  VALUES ('11100000-0000-0000-0000-000000000111','d0000000-0000-0000-0000-000000000001',1,
          'This practice has observed translation greater than 3mm.',
          'd0000000-0000-0000-0000-00000000000d',1,1,
          'stenosis',0,8,DATE '2026-01-01','effective_date',
          'supported','a0000000-0000-0000-0000-000000000001',now(),1,
          'f0000000-0000-0000-0000-00000000000f','practice_experience');

\echo '=== A9  [K3-2] PHI chunk sent to a hosted model          -> expect ERROR'
INSERT INTO chunks (id,corpus_key,document_id,practice_id,patient_id,ordinal,content,content_sha256)
  VALUES ('e0000000-0000-0000-0000-00000000000e','document','d0000000-0000-0000-0000-00000000000d',
          '11111111-1111-1111-1111-111111111111','b0000000-0000-0000-0000-000000000001',1,
          'severe foraminal stenosis at L4-L5',decode('dd','hex'));
SAVEPOINT a9;
INSERT INTO chunk_vectors_2000 (chunk_id,embedding_model_id,embedding)
  SELECT 'e0000000-0000-0000-0000-00000000000e',id,array_fill(0.1::real,ARRAY[1536])::vector
    FROM embedding_models WHERE key='openai-text-embedding-3-small';
ROLLBACK TO a9;

\echo '=== A10 [K3-2] PHI chunk with no practice_id             -> expect ERROR'
SAVEPOINT a10;
INSERT INTO chunks (corpus_key,document_id,ordinal,content,content_sha256)
  VALUES ('document','d0000000-0000-0000-0000-00000000000d',2,'x',decode('ee','hex'));
ROLLBACK TO a10;

\echo '=== A11 [K3-2] same chunk, local model                   -> expect RESULT'
INSERT INTO chunk_vectors_1024 (chunk_id,embedding_model_id,embedding)
  SELECT 'e0000000-0000-0000-0000-00000000000e',id,array_fill(0.1::real,ARRAY[1024])::vector
    FROM embedding_models WHERE key='bge-large-en-v1-5-local';
SELECT 'RESULT local embedding stored='||count(*)::text FROM chunk_vectors_1024;

\echo '=== A12 [K3-3] sign with an unresolved derived retrieval -> expect ERROR'
INSERT INTO gate_affirmations (case_id,kind,affirmed_by)
  SELECT 'd0000000-0000-0000-0000-000000000001',key,'a0000000-0000-0000-0000-000000000001'
    FROM gate_affirmation_kinds;
INSERT INTO signatures (id,user_id,version,image_uri,image_sha256,credential_line)
  VALUES ('e1000000-0000-0000-0000-0000000000e1','a0000000-0000-0000-0000-000000000001',1,
          's3://x',decode('00','hex'),'Kevin B. James, MD');
INSERT INTO retrieval_log (letter_id,case_id,embedding_model_id,query_text,corpus_key,criterion_id,rank)
  SELECT '11100000-0000-0000-0000-000000000111','d0000000-0000-0000-0000-000000000001',id,
         'what actually gets approved','criteria','f0000000-0000-0000-0000-00000000000f',1
    FROM embedding_models WHERE key='bge-large-en-v1-5-local';
SAVEPOINT a12;
UPDATE letters SET signature_id='e1000000-0000-0000-0000-0000000000e1', signed_at=now()
 WHERE id='11100000-0000-0000-0000-000000000111';
ROLLBACK TO a12;

\echo '=== A13 [K3-3] resolve, then sign                        -> expect RESULT'
UPDATE retrieval_log SET resolution='attributed'
 WHERE letter_id='11100000-0000-0000-0000-000000000111';
UPDATE letters SET signature_id='e1000000-0000-0000-0000-0000000000e1', signed_at=now()
 WHERE id='11100000-0000-0000-0000-000000000111';
SELECT 'RESULT signed='||(signed_at IS NOT NULL)::text FROM letters
 WHERE id='11100000-0000-0000-0000-000000000111';

\echo '=== A14 [K3-5] one case counted twice / below cell size  -> expect RESULT 0'
INSERT INTO criterion_observations (criterion_id,practice_id,case_id,outcome,observed_on,recorded_by)
  VALUES ('f0000000-0000-0000-0000-00000000000f','11111111-1111-1111-1111-111111111111',
          'd0000000-0000-0000-0000-000000000001','approved',DATE '2026-02-01',
          'a0000000-0000-0000-0000-000000000001');
SELECT recompute_shared_summary('f0000000-0000-0000-0000-00000000000f','2026-Q1');
SELECT 'RESULT shared rows at n=1='||count(*)::text FROM shared_criterion_summaries;

\echo '=== A15 [K3-4] derived criterion decays with age         -> expect RESULT'
SELECT 'RESULT weight fresh='||criterion_retrieval_weight('f0000000-0000-0000-0000-00000000000f')::text;
UPDATE criteria SET last_confirmed_at = now() - interval '2 years'
 WHERE id='f0000000-0000-0000-0000-00000000000f';
SELECT 'RESULT weight after 2y='||criterion_retrieval_weight('f0000000-0000-0000-0000-00000000000f')::text;

ROLLBACK;
