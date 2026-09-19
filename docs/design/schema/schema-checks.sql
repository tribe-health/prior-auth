-- ═══════════════════════════════════════════════════════════════════════════
-- Behavioural checks for schema.sql.
--
-- These do not test that tables exist — psql already told us that when the
-- schema applied. They test that the clinical safety rules actually REFUSE
-- the wrong actor, which is the only property of this schema worth losing
-- sleep over. Every statement below runs inside one transaction that is
-- rolled back, so the database is left untouched.
--
--   psql -d <db> -f schema-checks.sql
--
-- Expected: T1, T4, T5, T7 and T9 raise an ERROR. T2, T3, T6 and T8 return
-- a RESULT line. An ERROR anywhere else, or a missing ERROR on T1/T4/T5/T7/T9,
-- is a regression.
-- ═══════════════════════════════════════════════════════════════════════════
SET search_path = aso, public;
BEGIN;

INSERT INTO practices (id, name, key)
  VALUES ('11111111-1111-1111-1111-111111111111', 'ASO', 'aso');

INSERT INTO users (id, kratos_identity_id, practice_id, email, full_name) VALUES
  ('a0000000-0000-0000-0000-000000000001', gen_random_uuid(),
   '11111111-1111-1111-1111-111111111111', 'kjames@asodocs.com', 'Kevin B. James, MD'),
  ('a0000000-0000-0000-0000-000000000002', gen_random_uuid(),
   '11111111-1111-1111-1111-111111111111', 'dwhitfield@asodocs.com', 'Dana Whitfield');

INSERT INTO user_roles (user_id, role_id, practice_id)
  SELECT 'a0000000-0000-0000-0000-000000000001', id, '11111111-1111-1111-1111-111111111111'
    FROM roles WHERE key = 'surgeon';
INSERT INTO user_roles (user_id, role_id, practice_id)
  SELECT 'a0000000-0000-0000-0000-000000000002', id, '11111111-1111-1111-1111-111111111111'
    FROM roles WHERE key = 'admin';

SELECT set_config(
  'aso.kratos_identity_id',
  (SELECT kratos_identity_id::text FROM users
    WHERE id = 'a0000000-0000-0000-0000-000000000002'),
  true
);
SELECT set_config('aso.selected_practice_id','11111111-1111-1111-1111-111111111111',true);

INSERT INTO patients (id, practice_id, family_name, given_name, birth_date)
  VALUES ('b0000000-0000-0000-0000-000000000001',
          '11111111-1111-1111-1111-111111111111', 'Kaminski', 'Ruth', '1958-04-02');
INSERT INTO payers (id, name, key)
  VALUES ('c0000000-0000-0000-0000-000000000001', 'BCBS', 'bcbs');
INSERT INTO cases (id, practice_id, patient_id, surgeon_id, payer_id, case_number)
  VALUES ('d0000000-0000-0000-0000-000000000001',
          '11111111-1111-1111-1111-111111111111',
          'b0000000-0000-0000-0000-000000000001',
          'a0000000-0000-0000-0000-000000000001',
          'c0000000-0000-0000-0000-000000000001', 'ASO-2026-0001');

\echo '=== T1  administrator affirms the gate  -> expect ERROR'
SAVEPOINT s1;
INSERT INTO gate_affirmations (case_id, kind, affirmed_by)
  VALUES ('d0000000-0000-0000-0000-000000000001', 'policy',
          'a0000000-0000-0000-0000-000000000002');
ROLLBACK TO s1;

\echo '=== T2  surgeon affirms all four       -> expect gate_affirmed=true'
SELECT set_config(
  'aso.kratos_identity_id',
  (SELECT kratos_identity_id::text FROM users
    WHERE id = 'a0000000-0000-0000-0000-000000000001'),
  true
);
INSERT INTO gate_affirmations (case_id, kind, affirmed_by)
  SELECT 'd0000000-0000-0000-0000-000000000001', key,
         'a0000000-0000-0000-0000-000000000001'
    FROM gate_affirmation_kinds;
SELECT 'RESULT gate_affirmed=' || (gate_affirmed_at IS NOT NULL)::text
  FROM cases WHERE id = 'd0000000-0000-0000-0000-000000000001';

\echo '=== T3  one affirmation withdrawn      -> expect gate_cleared=true'
SAVEPOINT s3;
DELETE FROM gate_affirmations
 WHERE case_id = 'd0000000-0000-0000-0000-000000000001' AND kind = 'plan';
SELECT 'RESULT gate_cleared=' || (gate_affirmed_at IS NULL)::text
  FROM cases WHERE id = 'd0000000-0000-0000-0000-000000000001';
ROLLBACK TO s3;

\echo '=== T4  administrator annotates        -> expect ERROR'
SELECT set_config(
  'aso.kratos_identity_id',
  (SELECT kratos_identity_id::text FROM users
    WHERE id = 'a0000000-0000-0000-0000-000000000002'),
  true
);
SAVEPOINT s4;
INSERT INTO annotations (annotation_type_id, case_id, name, body, author_id)
  SELECT id, 'd0000000-0000-0000-0000-000000000001', 'x', 'y',
         'a0000000-0000-0000-0000-000000000002'
    FROM annotation_types LIMIT 1;
ROLLBACK TO s4;

SELECT set_config(
  'aso.kratos_identity_id',
  (SELECT kratos_identity_id::text FROM users
    WHERE id = 'a0000000-0000-0000-0000-000000000001'),
  true
);

\echo '=== T5  lab payload missing required   -> expect ERROR'
SAVEPOINT s5;
INSERT INTO documents (document_type_id, patient_id, name, effective_date, data)
  SELECT id, 'b0000000-0000-0000-0000-000000000001', 'Bad', '2026-01-01',
         '{"analyte":"HbA1c"}'::jsonb
    FROM document_types WHERE key = 'laboratory-result';
ROLLBACK TO s5;

\echo '=== T6  conforming lab payload         -> expect documents=1'
INSERT INTO documents (document_type_id, patient_id, name, effective_date, data)
  SELECT id, 'b0000000-0000-0000-0000-000000000001', 'HbA1c', '2026-01-01',
         '{"loinc_code":"4548-4","analyte":"HbA1c","value":7.1,"units":"%"}'::jsonb
    FROM document_types WHERE key = 'laboratory-result';
SELECT 'RESULT documents=' || count(*)::text FROM documents;

\echo '=== T7  audit_events UPDATE            -> expect ERROR'
INSERT INTO audit_events (actor_label, actor_role, action, entity_table, summary)
  VALUES ('Kevin B. James, MD', 'surgeon', 'gate.affirm', 'gate_affirmations', 'Affirmed');
SAVEPOINT s7;
UPDATE audit_events SET summary = 'tampered';
ROLLBACK TO s7;

\echo '=== T8  kebab key derived from name    -> expect ct-myelogram-report'
SELECT 'RESULT key=' || key FROM document_types WHERE name = 'CT Myelogram Report';

\echo '=== T9  letter signed before the gate  -> expect ERROR'
SAVEPOINT s9;
INSERT INTO signatures (id, user_id, version, image_uri, image_sha256, credential_line)
  VALUES ('e0000000-0000-0000-0000-000000000001',
          'a0000000-0000-0000-0000-000000000001', 1, 's3://x',
          decode('00','hex'), 'Kevin B. James, MD');
INSERT INTO cases (id, practice_id, patient_id, surgeon_id, payer_id, case_number)
  VALUES ('d0000000-0000-0000-0000-000000000002',
          '11111111-1111-1111-1111-111111111111',
          'b0000000-0000-0000-0000-000000000001',
          'a0000000-0000-0000-0000-000000000001',
          'c0000000-0000-0000-0000-000000000001', 'ASO-2026-0002');
INSERT INTO letters (case_id, version, body_markdown, signature_id, signed_at)
  VALUES ('d0000000-0000-0000-0000-000000000002', 1, 'draft',
          'e0000000-0000-0000-0000-000000000001', now());
ROLLBACK TO s9;

ROLLBACK;
