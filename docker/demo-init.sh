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

if [ -n "$identity_id" ]; then
  curl -fsS -X DELETE "${kratos_admin}/admin/identities/${identity_id}" >/dev/null
fi

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

psql "${ASO_MIGRATION_DATABASE_URL:?ASO_MIGRATION_DATABASE_URL is required}" \
  -X -v ON_ERROR_STOP=1 \
  -v identity_id="$identity_id" \
  -v demo_email="$demo_email" \
  -v runtime_password="${ASO_RUNTIME_DATABASE_PASSWORD:?ASO_RUNTIME_DATABASE_PASSWORD is required}" \
  -v authority_password="${ASO_AUTHORITY_DATABASE_PASSWORD:?ASO_AUTHORITY_DATABASE_PASSWORD is required}" \
  -v gate_authority_password="${ASO_GATE_AUTHORITY_DATABASE_PASSWORD:?ASO_GATE_AUTHORITY_DATABASE_PASSWORD is required}" <<'SQL'
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
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

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
  status = 'active';

INSERT INTO aso.user_roles (user_id, role_id, practice_id)
SELECT '10000000-0000-4000-8000-000000000002', id,
       '10000000-0000-4000-8000-000000000001'
FROM aso.roles WHERE key = 'surgeon'
ON CONFLICT DO NOTHING;

INSERT INTO aso.payers (id, name, key)
VALUES ('10000000-0000-4000-8000-000000000003', 'Synthetic Demonstration Health Plan', 'synthetic-demo-plan')
ON CONFLICT (id) DO NOTHING;

INSERT INTO aso.patients (id, practice_id, family_name, given_name, birth_date, sex_at_birth)
VALUES (
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000001',
  'Example', 'Synthetic Patient', DATE '1970-01-01', 'unknown'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO aso.cases (
  id, practice_id, patient_id, surgeon_id, payer_id, case_number,
  status, member_id, date_of_service, data
) VALUES (
  '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  'DEMO-CASE-001', 'intake', 'SYNTHETIC-MEMBER-001',
  CURRENT_DATE + 30, '{"procedure_code":"SYN-LUMBAR-001","plan_key":"synthetic-ppo"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
SQL

echo "Demo identity and synthetic case are ready."
