-- Focused database probes for tenant-scoped browser clinical authority.
-- Apply after schema.sql, schema-ai.sql, and schema-web-capabilities.sql.
-- Every attempted act by surgeon A against practice B must be refused by the
-- PostgreSQL trigger itself. The transaction is rolled back.

\set ON_ERROR_STOP on
SET search_path = aso, public;
BEGIN;

INSERT INTO practices (id, name, key) VALUES
  ('31000000-0000-4000-8000-000000000001', 'Synthetic Practice A', 'synthetic-practice-a'),
  ('31000000-0000-4000-8000-000000000002', 'Synthetic Practice B', 'synthetic-practice-b');

INSERT INTO users (id, kratos_identity_id, practice_id, email, full_name) VALUES
  ('32000000-0000-4000-8000-000000000001', gen_random_uuid(),
   '31000000-0000-4000-8000-000000000001', 'surgeon-a@example.invalid', 'Synthetic Surgeon A'),
  ('32000000-0000-4000-8000-000000000002', gen_random_uuid(),
   '31000000-0000-4000-8000-000000000002', 'surgeon-b@example.invalid', 'Synthetic Surgeon B');

INSERT INTO user_roles (user_id, role_id, practice_id)
SELECT '32000000-0000-4000-8000-000000000001', id,
       '31000000-0000-4000-8000-000000000001'
  FROM roles WHERE key = 'surgeon';
INSERT INTO user_roles (user_id, role_id, practice_id)
SELECT '32000000-0000-4000-8000-000000000002', id,
       '31000000-0000-4000-8000-000000000002'
  FROM roles WHERE key = 'surgeon';
-- Surgeon A also belongs to practice B. Selecting practice A must still fence
-- every act against practice B; membership alone is not active authority.
INSERT INTO user_roles (user_id, role_id, practice_id)
SELECT '32000000-0000-4000-8000-000000000001', id,
       '31000000-0000-4000-8000-000000000002'
  FROM roles WHERE key = 'surgeon';

SELECT set_config(
  'aso.kratos_identity_id',
  (SELECT kratos_identity_id::text FROM users
    WHERE id = '32000000-0000-4000-8000-000000000001'),
  true
);
SELECT set_config(
  'aso.selected_practice_id',
  '31000000-0000-4000-8000-000000000001',
  true
);

INSERT INTO patients (id, practice_id, family_name, given_name, birth_date)
VALUES ('33000000-0000-4000-8000-000000000002',
        '31000000-0000-4000-8000-000000000002',
        'Synthetic', 'Patient B', DATE '1970-01-01');
INSERT INTO payers (id, name, key)
VALUES ('34000000-0000-4000-8000-000000000001', 'Synthetic Payer', 'synthetic-payer');
INSERT INTO cases (
  id, practice_id, patient_id, surgeon_id, payer_id, case_number
) VALUES (
  '35000000-0000-4000-8000-000000000002',
  '31000000-0000-4000-8000-000000000002',
  '33000000-0000-4000-8000-000000000002',
  '32000000-0000-4000-8000-000000000002',
  '34000000-0000-4000-8000-000000000001',
  'SYN-TENANT-B-001'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO gate_affirmations (case_id, kind, affirmed_by)
    VALUES ('35000000-0000-4000-8000-000000000002', 'policy',
            '32000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'cross-practice gate affirmation was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Passed: cross-practice gate affirmation refused';
  END;
END;
$$;

DO $$
DECLARE
  annotation_kind uuid;
BEGIN
  SELECT id INTO annotation_kind FROM annotation_types ORDER BY id LIMIT 1;
  BEGIN
    INSERT INTO annotations (annotation_type_id, case_id, name, body, author_id)
    VALUES (annotation_kind, '35000000-0000-4000-8000-000000000002',
            'Synthetic cross-practice annotation', 'Synthetic body',
            '32000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'cross-practice annotation was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Passed: cross-practice annotation refused';
  END;
END;
$$;

SELECT set_config(
  'aso.kratos_identity_id',
  (SELECT kratos_identity_id::text FROM users
    WHERE id = '32000000-0000-4000-8000-000000000002'),
  true
);
SELECT set_config(
  'aso.selected_practice_id',
  '31000000-0000-4000-8000-000000000002',
  true
);

INSERT INTO gate_affirmations (case_id, kind, affirmed_by)
SELECT '35000000-0000-4000-8000-000000000002', key,
       '32000000-0000-4000-8000-000000000002'
  FROM gate_affirmation_kinds;
INSERT INTO letters (id, case_id, purpose, version, body_markdown)
VALUES ('36000000-0000-4000-8000-000000000002',
        '35000000-0000-4000-8000-000000000002',
        'prior_authorization_request', 1, 'Synthetic request');
INSERT INTO signatures (id, user_id, version, image_uri, image_sha256, credential_line)
VALUES ('37000000-0000-4000-8000-000000000001',
        '32000000-0000-4000-8000-000000000001', 1,
        'synthetic://signature-a', decode('00','hex'), 'Synthetic Surgeon A');

SELECT set_config(
  'aso.kratos_identity_id',
  (SELECT kratos_identity_id::text FROM users
    WHERE id = '32000000-0000-4000-8000-000000000001'),
  true
);
SELECT set_config(
  'aso.selected_practice_id',
  '31000000-0000-4000-8000-000000000001',
  true
);

DO $$
BEGIN
  BEGIN
    UPDATE letters
       SET approved_by = '32000000-0000-4000-8000-000000000001',
           approved_at = now()
     WHERE id = '36000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'cross-practice letter approval was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Passed: cross-practice letter approval refused';
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    UPDATE letters
       SET signature_id = '37000000-0000-4000-8000-000000000001',
           signed_at = now()
     WHERE id = '36000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'cross-practice letter signing was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Passed: cross-practice letter signing refused';
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    UPDATE cases
       SET practice_id = '31000000-0000-4000-8000-000000000001'
     WHERE id = '35000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'clinical case practice reassignment was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'Passed: clinical case practice reassignment refused';
  END;
END;
$$;

ROLLBACK;
