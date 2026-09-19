#!/usr/bin/env bash
set -euo pipefail

database_url="${ASO_MIGRATION_DATABASE_URL:?ASO_MIGRATION_DATABASE_URL is required}"
case_id='10000000-0000-4000-8000-000000000005'
command_id='94f4b4db-cc3d-486a-a9dd-0842a01b24f6'
submission_id="$(psql "$database_url" -X -qAt -v ON_ERROR_STOP=1 -c \
  "SELECT s.id FROM aso.submissions s LEFT JOIN aso.receipts r ON r.submission_id=s.id WHERE s.case_id='$case_id' AND s.status='sent' AND r.id IS NULL ORDER BY s.submitted_at DESC LIMIT 1")"

if [[ -z "$submission_id" ]]; then
  echo 'No unacknowledged synthetic submission is available.' >&2
  exit 1
fi

first="$(mktemp)"
second="$(mktemp)"
trap 'rm -f "$first" "$second"' EXIT

run_acknowledgement() {
  local output="$1"
  psql "$database_url" -X -qAt -v ON_ERROR_STOP=1 >"$output" <<SQL
BEGIN;
SET ROLE aso_demo_runtime;
SELECT set_config('aso.actor_id','10000000-0000-4000-8000-000000000002',true) \gset
SELECT set_config('aso.kratos_identity_id','c87af03e-9155-4f7b-9ae8-b945a396d02a',true) \gset
SELECT set_config('aso.practice_id','10000000-0000-4000-8000-000000000001',true) \gset
SELECT set_config('aso.session_expires_at',(clock_timestamp()+interval '1 hour')::text,true) \gset
SELECT set_config('aso.principal','user',true) \gset
SELECT aso.acknowledge_case_submission(
  '$command_id','$case_id','$submission_id',
  'SYN-ACK-CONCURRENT-001','2026-09-19T16:03:00Z',2)::text;
COMMIT;
SQL
}

run_acknowledgement "$first" &
first_pid=$!
run_acknowledgement "$second" &
second_pid=$!
wait "$first_pid"
wait "$second_pid"

diff -u "$first" "$second"
psql "$database_url" -X -qAt -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF (SELECT count(*) FROM aso.submission_commands
      WHERE command_id='$command_id') <> 1 THEN
    RAISE EXCEPTION 'concurrent retry created more than one command receipt';
  END IF;
  IF (SELECT count(*) FROM aso.receipts WHERE submission_id='$submission_id') <> 1 THEN
    RAISE EXCEPTION 'concurrent retry created more than one payer receipt';
  END IF;
  IF (SELECT count(*) FROM aso.custody_events
      WHERE submission_id='$submission_id' AND sequence=4) <> 1 THEN
    RAISE EXCEPTION 'concurrent retry created more than one acknowledgement custody event';
  END IF;
END \$\$;
SQL

echo 'Concurrent acknowledgement retry returned one durable result.'
