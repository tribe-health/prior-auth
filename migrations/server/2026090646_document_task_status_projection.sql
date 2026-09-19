-- Sanitized document-generation task status for authorized browser sync.
-- Protected inputs, event payloads, result artifacts, error details, command
-- identity, and actor identity remain in the local-only task tables.

CREATE TABLE aso.document_task_statuses (
  id uuid PRIMARY KEY,
  practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES aso.cases(id) ON DELETE CASCADE,
  purpose text NOT NULL
    CHECK (purpose IN (
      'prior_authorization_request',
      'corrected_resubmission',
      'clinical_appeal'
    )),
  state text NOT NULL
    CHECK (state IN (
      'submitted',
      'working',
      'input-required',
      'auth-required',
      'completed',
      'canceled',
      'failed',
      'rejected'
    )),
  stage text NOT NULL,
  last_sequence bigint NOT NULL CHECK (last_sequence >= 0),
  updated_at timestamptz NOT NULL
);

COMMENT ON TABLE aso.document_task_statuses IS
  'Lane: server-authoritative relational. Privacy: trusted PHI. Sanitized task status projection; prompts, sources, results, errors, commands, actors, and event payloads are structurally absent.';
COMMENT ON COLUMN aso.document_task_statuses.practice_id IS
  'Internal verified-practice predicate. Excluded from the public status column projection.';

ALTER TABLE aso.document_task_statuses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.document_task_statuses FROM PUBLIC;

CREATE FUNCTION aso.refresh_document_task_status_projection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM aso.document_task_statuses status WHERE status.id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO aso.document_task_statuses (
    id,
    practice_id,
    case_id,
    purpose,
    state,
    stage,
    last_sequence,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.practice_id,
    NEW.case_id,
    NEW.purpose,
    NEW.state,
    NEW.stage,
    NEW.last_sequence,
    NEW.updated_at
  )
  ON CONFLICT (id) DO UPDATE SET
    practice_id = EXCLUDED.practice_id,
    case_id = EXCLUDED.case_id,
    purpose = EXCLUDED.purpose,
    state = EXCLUDED.state,
    stage = EXCLUDED.stage,
    last_sequence = EXCLUDED.last_sequence,
    updated_at = EXCLUDED.updated_at;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION aso.refresh_document_task_status_projection() FROM PUBLIC;

CREATE TRIGGER document_task_status_projection_refresh
AFTER INSERT OR UPDATE OR DELETE ON aso.document_generation_tasks
FOR EACH ROW EXECUTE FUNCTION aso.refresh_document_task_status_projection();

INSERT INTO aso.document_task_statuses (
  id,
  practice_id,
  case_id,
  purpose,
  state,
  stage,
  last_sequence,
  updated_at
)
SELECT
  id,
  practice_id,
  case_id,
  purpose,
  state,
  stage,
  last_sequence,
  updated_at
FROM aso.document_generation_tasks;

CREATE INDEX document_task_statuses_case_ix
  ON aso.document_task_statuses(case_id, purpose, updated_at DESC);
CREATE INDEX document_task_statuses_practice_ix
  ON aso.document_task_statuses(practice_id);
