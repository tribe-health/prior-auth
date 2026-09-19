#!/bin/sh
set -eu

kratos_admin="${ASO_KRATOS_ADMIN_URL:?ASO_KRATOS_ADMIN_URL is required}"
demo_email="${ASO_DEMO_EMAIL:?ASO_DEMO_EMAIL is required}"
demo_password="${ASO_DEMO_PASSWORD:?ASO_DEMO_PASSWORD is required}"

until curl -fsS "${kratos_admin}/health/ready" >/dev/null; do
  sleep 1
done

identity_id="$({ curl -fsS "${kratos_admin}/admin/identities?page_size=1000" || true; } | \
  perl -MJSON::PP -0777 -e '
    my $email = $ARGV[0];
    my $value = eval { decode_json(<STDIN>) } || [];
    my $items = ref($value) eq "ARRAY" ? $value : ($value->{identities} || []);
    for my $identity (@$items) {
      if (($identity->{traits}->{email} || "") eq $email) {
        print $identity->{id}; last;
      }
    }
  ' "$demo_email")"

if [ -z "$identity_id" ]; then
identity_payload="$(ASO_DEMO_EMAIL="$demo_email" ASO_DEMO_PASSWORD="$demo_password" \
  perl -MJSON::PP -e '
    print encode_json({
      schema_id => "clinician",
      state => "active",
      traits => {
        email => $ENV{ASO_DEMO_EMAIL},
        name => { first => "Demo", last => "Surgeon" }
      },
      credentials => {
        password => { config => { password => $ENV{ASO_DEMO_PASSWORD} } }
      }
    });
  ')"

identity_response="$(curl -fsS -X POST "${kratos_admin}/admin/identities" \
  -H 'Content-Type: application/json' --data-binary "$identity_payload")"
identity_id="$(printf '%s' "$identity_response" | \
  perl -MJSON::PP -0777 -e 'print decode_json(<STDIN>)->{id}')"

fi

psql "${ASO_MIGRATION_DATABASE_URL:?ASO_MIGRATION_DATABASE_URL is required}" \
  -X -v ON_ERROR_STOP=1 \
  -v identity_id="$identity_id" \
  -v demo_email="$demo_email" \
  -v runtime_password="${ASO_RUNTIME_DATABASE_PASSWORD:?ASO_RUNTIME_DATABASE_PASSWORD is required}" \
  -v authority_password="${ASO_AUTHORITY_DATABASE_PASSWORD:?ASO_AUTHORITY_DATABASE_PASSWORD is required}" \
  -v gate_authority_password="${ASO_GATE_AUTHORITY_DATABASE_PASSWORD:?ASO_GATE_AUTHORITY_DATABASE_PASSWORD is required}" <<'SQL'
BEGIN;
SET search_path = aso, public;

SELECT format(
  'CREATE ROLE aso_demo_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'runtime_password'
) WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aso_demo_runtime') \gexec
SELECT format('ALTER ROLE aso_demo_runtime PASSWORD %L', :'runtime_password') \gexec
GRANT aso_session_reader, aso_gate_executor, aso_case_executor TO aso_demo_runtime;

SELECT format(
  'CREATE ROLE aso_demo_authority LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'authority_password'
) WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aso_demo_authority') \gexec
SELECT format('ALTER ROLE aso_demo_authority PASSWORD %L', :'authority_password') \gexec
GRANT aso_session_authority_executor TO aso_demo_authority;

SELECT format(
  'CREATE ROLE aso_demo_gate_authority LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'gate_authority_password'
) WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aso_demo_gate_authority') \gexec
SELECT format('ALTER ROLE aso_demo_gate_authority PASSWORD %L', :'gate_authority_password') \gexec
GRANT aso_authority_event_reader TO aso_demo_gate_authority;

INSERT INTO aso.practices (id, name, key)
VALUES ('10000000-0000-4000-8000-000000000001', 'Advanced Spine & Orthopedics Demo', 'aso-demo')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
WHERE aso.practices.name IS DISTINCT FROM EXCLUDED.name;

INSERT INTO aso.users (
  id, kratos_identity_id, practice_id, email, full_name,
  display_name, initials, title, job_title, npi, status
) VALUES (
  '10000000-0000-4000-8000-000000000002', :'identity_id',
  '10000000-0000-4000-8000-000000000001', :'demo_email',
  'Demo Surgeon', 'Dr. Demo', 'DS', 'MD', 'Orthopedic surgeon',
  '1999999999', 'active'
)
ON CONFLICT (id) DO UPDATE SET
  kratos_identity_id = EXCLUDED.kratos_identity_id,
  email = EXCLUDED.email,
  status = 'active'
WHERE ROW(aso.users.kratos_identity_id, aso.users.email, aso.users.status)
  IS DISTINCT FROM ROW(EXCLUDED.kratos_identity_id, EXCLUDED.email, EXCLUDED.status);

INSERT INTO aso.user_roles (user_id, role_id, practice_id)
SELECT '10000000-0000-4000-8000-000000000002', id,
       '10000000-0000-4000-8000-000000000001'
FROM aso.roles WHERE key = 'surgeon'
ON CONFLICT DO NOTHING;

INSERT INTO aso.signatures (
  id, user_id, version, image_uri, image_sha256,
  credential_line, is_current
) VALUES (
  '10000000-0000-4000-8000-000000000017',
  '10000000-0000-4000-8000-000000000002', 1,
  'demo://synthetic-surgeon-signature',
  digest(convert_to('Synthetic demo surgeon signature version 1', 'UTF8'), 'sha256'),
  'Demo Surgeon, MD · NPI 1999999999', true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO aso.users (
  id, kratos_identity_id, practice_id, email, full_name,
  display_name, initials, job_title, status
) VALUES (
  '10000000-0000-4000-8000-000000000015',
  '10000000-0000-4000-8000-000000000016',
  '10000000-0000-4000-8000-000000000001',
  'document.processor@example.invalid', 'Demo Document Processor',
  'Document processor', 'DP', 'Protected document processing service', 'active'
)
ON CONFLICT (id) DO UPDATE SET status = 'active'
WHERE aso.users.status IS DISTINCT FROM EXCLUDED.status;

INSERT INTO aso.document_processor_grants (
  service_identity_id, actor_id, practice_id, grant_key, enabled
) VALUES (
  '10000000-0000-4000-8000-000000000016',
  '10000000-0000-4000-8000-000000000015',
  '10000000-0000-4000-8000-000000000001',
  'authorized_document_job_only', true
)
ON CONFLICT (service_identity_id, practice_id)
DO UPDATE SET enabled = true
WHERE aso.document_processor_grants.enabled IS DISTINCT FROM EXCLUDED.enabled;

INSERT INTO aso.capabilities (key, label, description, is_clinical)
VALUES (
  'criteria_select', 'Select controlling criteria',
  'Commit an immutable criteria snapshot for a case.', false
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO aso.role_capabilities (role_id, capability_key)
SELECT id, 'criteria_select' FROM aso.roles WHERE key IN ('staff', 'surgeon')
ON CONFLICT DO NOTHING;

INSERT INTO aso.payers (id, name, key)
VALUES ('10000000-0000-4000-8000-000000000003', 'Synthetic Demonstration Health Plan', 'synthetic-demo-plan')
ON CONFLICT (id) DO NOTHING;

-- Seed clinical state only once. Replayed BEFORE INSERT triggers can invalidate
-- committed coverage even when ON CONFLICT would discard the candidate row.
SELECT NOT EXISTS (SELECT FROM aso.cases
  WHERE id = '10000000-0000-4000-8000-000000000005') AS seed_demo_case \gset
\if :seed_demo_case

INSERT INTO aso.patients (id, practice_id, family_name, given_name, birth_date, sex_at_birth)
VALUES (
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000001',
  'Example', 'Synthetic Patient', DATE '1970-01-01', 'unknown'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO aso.cases (
  id, practice_id, patient_id, surgeon_id, payer_id, case_number,
  status, member_id, date_of_service, procedure_code, plan_key, data
) VALUES (
  '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  'DEMO-CASE-001', 'drafting', 'SYNTHETIC-MEMBER-001',
  CURRENT_DATE + 30, 'SYN-LUMBAR-001', 'synthetic-ppo', '{"procedure_code":"SYN-LUMBAR-001","plan_key":"synthetic-ppo"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Seed the smallest complete, source-backed coverage and policy path needed
-- to demonstrate the real case-to-letter workflow. These rows use synthetic
-- identifiers and remain inside the local practice boundary.
INSERT INTO aso.documents (
  id, document_type_id, patient_id, case_id, name, effective_date,
  document_version, page_count, content_sha256, ingest_method, practice_id,
  processing_status, committed_at
)
SELECT
  '10000000-0000-4000-8000-000000000006', id,
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005',
  'Synthetic coverage and delegation record', CURRENT_DATE - 30,
  1, 1, digest(convert_to('Synthetic coverage and delegation record', 'UTF8'), 'sha256'),
  'api', '10000000-0000-4000-8000-000000000001',
  'ready', clock_timestamp()
FROM aso.document_types WHERE key = 'insurance-card'
ON CONFLICT (id) DO NOTHING;

INSERT INTO aso.administering_entities (id, practice_id, key, name)
VALUES (
  '10000000-0000-4000-8000-000000000007',
  '10000000-0000-4000-8000-000000000001',
  'synthetic-review-partner', 'Synthetic Demonstration Review Partner'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO aso.payer_plans (
  id, practice_id, payer_id, plan_key, name, valid_from, valid_to
) VALUES (
  '10000000-0000-4000-8000-000000000008',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  'synthetic-ppo', 'Synthetic Demonstration PPO',
  CURRENT_DATE - 365, CURRENT_DATE + 365
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO aso.payer_plan_enrollments (
  id, practice_id, payer_plan_id, member_id, source_document_id,
  valid_from, valid_to
) VALUES (
  '10000000-0000-4000-8000-000000000009',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000008',
  'SYNTHETIC-MEMBER-001',
  '10000000-0000-4000-8000-000000000006',
  CURRENT_DATE - 365, CURRENT_DATE + 365
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO aso.plan_delegation_rules (
  id, practice_id, payer_plan_id, procedure_code,
  administering_entity_id, criteria_set_key, submission_channel_key,
  appeal_path_key, source_document_id, valid_from, valid_to
) VALUES (
  '10000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000008',
  'SYN-LUMBAR-001',
  '10000000-0000-4000-8000-000000000007',
  'synthetic-lumbar-policy', 'manual_synthetic', 'synthetic-standard-appeal',
  '10000000-0000-4000-8000-000000000006',
  CURRENT_DATE - 365, CURRENT_DATE + 365
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO aso.documents (
  id, document_type_id, patient_id, case_id, name, effective_date,
  document_version, page_count, content_sha256, ingest_method, practice_id,
  processing_status, committed_at
)
SELECT
  '10000000-0000-4000-8000-000000000011', id,
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005',
  'Synthetic lumbar surgery medical policy', CURRENT_DATE - 365,
  1, 1, digest(convert_to('Synthetic lumbar surgery medical policy', 'UTF8'), 'sha256'),
  'api', '10000000-0000-4000-8000-000000000001',
  'ready', clock_timestamp()
FROM aso.document_types WHERE key = 'policy-document'
ON CONFLICT (id) DO NOTHING;

INSERT INTO aso.policies (
  id, policy_type_id, payer_id, name, policy_number, version,
  effective_from, effective_to, is_published, source_document_id,
  source_sha256, retrieved_at
)
SELECT
  '10000000-0000-4000-8000-000000000012', id,
  '10000000-0000-4000-8000-000000000003',
  'Synthetic Lumbar Surgery Medical Policy', 'SYN-LUMBAR', '2026.1',
  CURRENT_DATE - 365, CURRENT_DATE + 365, true,
  '10000000-0000-4000-8000-000000000011',
  digest(convert_to('Synthetic policy source 2026.1', 'UTF8'), 'sha256'),
  clock_timestamp()
FROM aso.policy_types WHERE key = 'medical-policy'
ON CONFLICT (id) DO NOTHING;

INSERT INTO aso.criteria (
  id, payer_id, evidence_grade, policy_id, section, document_id,
  label, requirement, ordinal, source_page_number, content_sha256,
  procedure_family, is_mandatory, validity, last_confirmed_at, data
) VALUES (
  '10000000-0000-4000-8000-000000000013',
  '10000000-0000-4000-8000-000000000003', 'published',
  '10000000-0000-4000-8000-000000000012', '4.1',
  '10000000-0000-4000-8000-000000000011',
  'Documented conservative treatment',
  'The chart documents a supervised conservative-treatment course and the clinical response.',
  1, 1,
  digest(convert_to('The chart documents a supervised conservative-treatment course and the clinical response.', 'UTF8'), 'sha256'),
  'lumbar-surgery', true,
  daterange(CURRENT_DATE - 365, CURRENT_DATE + 365, '[)'),
  clock_timestamp(), '{"demo":"synthetic"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

UPDATE aso.cases
SET resolution_revision = GREATEST(resolution_revision, 1),
    criteria_selection_revision = GREATEST(criteria_selection_revision, 1)
WHERE id = '10000000-0000-4000-8000-000000000005';

INSERT INTO aso.administering_entity_resolutions (
  case_id, practice_id, entity_id, criteria_set_key,
  submission_channel_key, appeal_path_key, source_document_id,
  entity_revision, plan_revision, enrollment_revision, rule_revision,
  source_document_version, valid_from, valid_to, state, revision,
  case_input_revision, matched_rule_id, resolved_at
) VALUES (
  '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000007',
  'synthetic-lumbar-policy', 'manual_synthetic', 'synthetic-standard-appeal',
  '10000000-0000-4000-8000-000000000006',
  1, 1, 1, 1, 1, CURRENT_DATE - 365, CURRENT_DATE + 365,
  'resolved',
  (SELECT resolution_revision FROM aso.cases WHERE id = '10000000-0000-4000-8000-000000000005'),
  (SELECT case_input_revision FROM aso.cases WHERE id = '10000000-0000-4000-8000-000000000005'),
  '10000000-0000-4000-8000-000000000010', clock_timestamp()
)
ON CONFLICT (case_id) DO NOTHING;

INSERT INTO aso.case_criteria_selections (
  case_id, practice_id, resolution_revision, criteria_catalog_revision,
  criteria_snapshot_id, policy_id, selected_criterion_ids, selected_by,
  selected_at, state, revision
) VALUES (
  '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000001',
  (SELECT resolution_revision FROM aso.cases
    WHERE id = '10000000-0000-4000-8000-000000000005'),
  (SELECT revision_token FROM aso.criteria_catalog_state WHERE singleton),
  '10000000-0000-4000-8000-000000000014',
  '10000000-0000-4000-8000-000000000012',
  ARRAY['10000000-0000-4000-8000-000000000013'::uuid],
  '10000000-0000-4000-8000-000000000002', clock_timestamp(), 'current',
  (SELECT criteria_selection_revision FROM aso.cases
    WHERE id = '10000000-0000-4000-8000-000000000005')
)
ON CONFLICT (case_id) DO NOTHING;
\endif
-- Reconcile the synthetic transport label on every startup without advancing
-- any clinical revision or replacing case, letter, gate, or evidence records.
UPDATE aso.administering_entity_resolutions
SET submission_channel_key = 'manual_synthetic'
WHERE case_id = '10000000-0000-4000-8000-000000000005'
  AND matched_rule_id = '10000000-0000-4000-8000-000000000010'
  AND submission_channel_key = 'synthetic-portal';

-- Inference eligibility is an administrator-owned fixture attestation, separate
-- from clinical case data. Repeated startup never advances case revisions.
INSERT INTO aso.synthetic_generation_cases(case_id, fixture)
SELECT c.id, 'web-case-to-letter' FROM aso.cases c
JOIN aso.practices p ON p.id=c.practice_id
WHERE c.id='10000000-0000-4000-8000-000000000005' AND p.key='aso-demo'
ON CONFLICT (case_id) DO NOTHING;
COMMIT;
SQL

echo "Demo identity and synthetic case are ready."
