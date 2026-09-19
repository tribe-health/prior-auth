\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  target_case aso.cases%ROWTYPE;
  task_id uuid := gen_random_uuid();
  projected aso.document_task_statuses%ROWTYPE;
  forbidden_count integer;
BEGIN
  SELECT * INTO STRICT target_case
  FROM aso.cases
  ORDER BY id
  LIMIT 1;

  INSERT INTO aso.document_generation_tasks (
    id,
    practice_id,
    kratos_identity_id,
    actor_id,
    case_id,
    command_id,
    purpose,
    request_payload,
    input_snapshot
  ) VALUES (
    task_id,
    target_case.practice_id,
    gen_random_uuid(),
    target_case.surgeon_id,
    target_case.id,
    gen_random_uuid(),
    'prior_authorization_request',
    '{}'::jsonb,
    '{}'::jsonb
  );

  SELECT * INTO STRICT projected
  FROM aso.document_task_statuses
  WHERE id = task_id;
  IF projected.practice_id <> target_case.practice_id
    OR projected.case_id <> target_case.id
    OR projected.state <> 'submitted'
    OR projected.stage <> 'submitted'
    OR projected.last_sequence <> 0
  THEN
    RAISE EXCEPTION 'inserted task status projection does not match its source task';
  END IF;
  RAISE NOTICE 'Passed: task insert materialized the sanitized status row';

  UPDATE aso.document_generation_tasks
  SET state = 'working',
      stage = 'qa',
      last_sequence = 7,
      updated_at = clock_timestamp()
  WHERE id = task_id;

  SELECT * INTO STRICT projected
  FROM aso.document_task_statuses
  WHERE id = task_id;
  IF projected.state <> 'working'
    OR projected.stage <> 'qa'
    OR projected.last_sequence <> 7
  THEN
    RAISE EXCEPTION 'updated task status projection does not match its source task';
  END IF;
  RAISE NOTICE 'Passed: task update refreshed the status and sequence';

  SELECT count(*) INTO forbidden_count
  FROM information_schema.columns
  WHERE table_schema = 'aso'
    AND table_name = 'document_task_statuses'
    AND column_name IN (
      'kratos_identity_id',
      'actor_id',
      'command_id',
      'request_payload',
      'input_snapshot',
      'letter_id',
      'result',
      'assembly',
      'error_code'
    );
  IF forbidden_count <> 0 THEN
    RAISE EXCEPTION 'protected task fields entered the status projection';
  END IF;
  RAISE NOTICE 'Passed: protected task fields are structurally absent';

  DELETE FROM aso.document_generation_tasks WHERE id = task_id;
  IF EXISTS (SELECT FROM aso.document_task_statuses WHERE id = task_id) THEN
    RAISE EXCEPTION 'deleted task left a stale status projection';
  END IF;
  RAISE NOTICE 'Passed: task deletion removed the status projection';
END;
$$;

ROLLBACK;
