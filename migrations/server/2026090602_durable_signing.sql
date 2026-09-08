-- RA-03. Verified-context signing over a dedicated clinical command ledger.
-- Lane: server-authoritative relational. Privacy: local. Neither signing
-- commands nor their immutable results are eligible for client replay.

ALTER TABLE aso.letters
  ADD COLUMN qa_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN approved_qa_revision bigint;

-- Existing approved rows retain their exact attached QA generation. Disable
-- only the legacy signing/touch triggers while the new columns are backfilled.
ALTER TABLE aso.letters DISABLE TRIGGER letters_signing_rules;
ALTER TABLE aso.letters DISABLE TRIGGER letters_touch;
WITH qa AS (
  SELECT l.id, count(r.id)::bigint AS count
  FROM aso.letters l
  LEFT JOIN aso.letter_qa_results r ON r.letter_id = l.id
  GROUP BY l.id
)
UPDATE aso.letters l
SET qa_revision = qa.count,
    approved_qa_revision = CASE
      WHEN l.status IN ('approved', 'signed') THEN qa.count
      ELSE NULL
    END
FROM qa
WHERE qa.id = l.id;
ALTER TABLE aso.letters ENABLE TRIGGER letters_touch;
ALTER TABLE aso.letters ENABLE TRIGGER letters_signing_rules;

CREATE TABLE aso.letter_sign_commands (
  kratos_identity_id uuid NOT NULL,
  practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  command_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES aso.cases(id) ON DELETE RESTRICT,
  letter_id uuid NOT NULL REFERENCES aso.letters(id) ON DELETE RESTRICT,
  expected_letter_version integer NOT NULL CHECK (expected_letter_version > 0),
  expected_qa_revision bigint NOT NULL CHECK (expected_qa_revision >= 0),
  expected_signature_version integer NOT NULL CHECK (expected_signature_version > 0),
  signature_id uuid NOT NULL REFERENCES aso.signatures(id) ON DELETE RESTRICT,
  result jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  PRIMARY KEY (kratos_identity_id, practice_id, command_id),
  UNIQUE (letter_id)
);
COMMENT ON TABLE aso.letter_sign_commands IS
  'Lane: server-authoritative relational. Privacy: local. Immutable signing results; excluded from replication and automatic replay.';
ALTER TABLE aso.letter_sign_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.letter_sign_commands FROM PUBLIC;

GRANT SELECT (id, case_id, version, status, content_sha256, approved_by,
  approved_at, signature_id, signed_at, qa_revision, approved_qa_revision),
  UPDATE (status, signature_id, signed_at, qa_revision, approved_qa_revision)
  ON aso.letters TO aso_gate_owner;
GRANT SELECT (id, practice_id, patient_id, gate_affirmed_at, gate_affirmed_by)
  ON aso.cases TO aso_gate_owner;
GRANT SELECT (id, user_id, version, is_current, retired_at),
  UPDATE (is_current)
  ON aso.signatures TO aso_gate_owner;
GRANT SELECT ON aso.letter_claims, aso.qa_check_types, aso.letter_qa_results,
  aso.documents, aso.letter_sign_commands TO aso_gate_owner;
GRANT INSERT ON aso.letter_sign_commands TO aso_gate_owner;

CREATE POLICY letters_sign_owner ON aso.letters TO aso_gate_owner
  USING (true) WITH CHECK (true);
CREATE POLICY signatures_sign_owner ON aso.signatures TO aso_gate_owner
  USING (true);
CREATE POLICY letter_claims_sign_owner ON aso.letter_claims TO aso_gate_owner
  USING (true);
CREATE POLICY qa_check_types_sign_owner ON aso.qa_check_types TO aso_gate_owner
  USING (true);
CREATE POLICY letter_qa_sign_owner ON aso.letter_qa_results TO aso_gate_owner
  USING (true);
CREATE POLICY documents_sign_owner ON aso.documents TO aso_gate_owner
  USING (true);
CREATE POLICY letter_sign_commands_owner ON aso.letter_sign_commands TO aso_gate_owner
  USING (true) WITH CHECK (true);

CREATE FUNCTION aso.require_signing_letter(target_letter uuid, clinical boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  letter_practice uuid;
BEGIN
  SELECT * INTO STRICT actor FROM aso.gate_actor_context();
  SELECT c.practice_id INTO letter_practice
  FROM aso.letters l JOIN aso.cases c ON c.id = l.case_id
  WHERE l.id = target_letter;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'letter not found' USING ERRCODE = 'P0002';
  END IF;
  IF letter_practice <> actor.practice_id OR (clinical AND NOT EXISTS (
    SELECT FROM aso.user_capabilities uc
    WHERE uc.user_id = actor.actor_id AND uc.practice_id = actor.practice_id
      AND uc.capability_key = 'sign_letter' AND uc.is_clinical
  )) THEN
    RAISE EXCEPTION 'letter signing authority denied' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION aso.may_sign_letter(target_letter uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  PERFORM aso.require_signing_letter(target_letter, true);
  RETURN true;
EXCEPTION WHEN insufficient_privilege OR no_data_found THEN
  RETURN false;
END;
$$;

CREATE FUNCTION aso.read_signing_target(target_letter uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  result jsonb;
BEGIN
  SELECT * INTO STRICT actor FROM aso.gate_actor_context();
  PERFORM aso.require_signing_letter(target_letter, false);
  SELECT jsonb_build_object(
    'letterId', l.id,
    'caseId', l.case_id,
    'letterVersion', l.version,
    'qaRevision', l.qa_revision,
    'signatureVersion', signature.version,
    'status', l.status,
    'approvedByActor', l.approved_by = actor.actor_id AND l.approved_at IS NOT NULL,
    'isCurrent', NOT EXISTS (
      SELECT FROM aso.letters newer
      WHERE newer.case_id = l.case_id AND newer.version > l.version
    ),
    'gateAffirmed', c.gate_affirmed_at IS NOT NULL AND NOT EXISTS (
      SELECT FROM aso.gate_affirmation_kinds required
      WHERE NOT EXISTS (
        SELECT FROM aso.gate_affirmations affirmation
        WHERE affirmation.case_id = c.id AND affirmation.kind = required.key
      )
    ),
    'qaComplete', l.approved_qa_revision = l.qa_revision AND NOT EXISTS (
      SELECT FROM aso.qa_check_types check_type
      LEFT JOIN aso.letter_qa_results result
        ON result.qa_check_type_id = check_type.id AND result.letter_id = l.id
      WHERE result.id IS NULL
         OR (check_type.severity = 'blocking' AND result.outcome <> 'pass')
    ),
    'sourcesComplete', EXISTS (
      SELECT FROM aso.letter_claims claim WHERE claim.letter_id = l.id
    ) AND NOT EXISTS (
      SELECT FROM aso.letter_claims claim
      LEFT JOIN aso.documents document ON document.id = claim.document_id
      WHERE claim.letter_id = l.id AND (
        claim.document_id IS NULL OR claim.annotation_id IS NOT NULL OR (
          claim.page_number IS NULL OR document.id IS NULL
          OR document.effective_date IS NULL OR document.content_sha256 IS NULL
          OR document.page_count IS NULL OR claim.page_number > document.page_count
          OR document.patient_id <> c.patient_id
          OR (document.case_id IS NOT NULL AND document.case_id <> c.id)
        )
      )
    )
  ) INTO result
  FROM aso.letters l
  JOIN aso.cases c ON c.id = l.case_id
  LEFT JOIN LATERAL (
    SELECT s.version FROM aso.signatures s
    WHERE s.user_id = actor.actor_id AND s.is_current AND s.retired_at IS NULL
    ORDER BY s.version DESC LIMIT 1
  ) signature ON true
  WHERE l.id = target_letter;
  RETURN result;
END;
$$;

CREATE FUNCTION aso.bump_letter_qa_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  target_letter uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.letter_id ELSE NEW.letter_id END;
  letter_status text;
BEGIN
  SELECT status INTO letter_status FROM aso.letters WHERE id = target_letter FOR UPDATE;
  IF letter_status IN ('approved', 'signed') THEN
    RAISE EXCEPTION 'approved letter QA is immutable' USING ERRCODE = '42501';
  END IF;
  UPDATE aso.letters SET qa_revision = qa_revision + 1 WHERE id = target_letter;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER letter_qa_revision
  BEFORE INSERT OR UPDATE OR DELETE ON aso.letter_qa_results
  FOR EACH ROW EXECUTE FUNCTION aso.bump_letter_qa_revision();

CREATE FUNCTION aso.bind_letter_approval_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IN ('approved', 'signed') AND (
    NEW.case_id IS DISTINCT FROM OLD.case_id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.body_markdown IS DISTINCT FROM OLD.body_markdown
    OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NEW.qa_revision IS DISTINCT FROM OLD.qa_revision
    OR NEW.approved_qa_revision IS DISTINCT FROM OLD.approved_qa_revision
  ) THEN
    RAISE EXCEPTION 'approved letter revision is immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status <> 'approved') THEN
    IF NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR NEW.content_sha256 IS NULL THEN
      RAISE EXCEPTION 'letter approval is incomplete' USING ERRCODE = 'A0303';
    END IF;
    NEW.approved_qa_revision := NEW.qa_revision;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER letters_approval_revision
  BEFORE INSERT OR UPDATE ON aso.letters
  FOR EACH ROW EXECUTE FUNCTION aso.bind_letter_approval_revision();

CREATE FUNCTION aso.guard_approved_letter_claims()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND EXISTS (
    SELECT FROM aso.letters l
    WHERE l.id = OLD.letter_id AND l.status IN ('approved', 'signed')
  ) THEN
    RAISE EXCEPTION 'approved letter sources are immutable' USING ERRCODE = '42501';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND EXISTS (
    SELECT FROM aso.letters l
    WHERE l.id = NEW.letter_id AND l.status IN ('approved', 'signed')
  ) THEN
    RAISE EXCEPTION 'approved letter sources are immutable' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER letter_claims_approved_guard
  BEFORE INSERT OR UPDATE OR DELETE ON aso.letter_claims
  FOR EACH ROW EXECUTE FUNCTION aso.guard_approved_letter_claims();

CREATE OR REPLACE FUNCTION aso.enforce_letter_signing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  signature_record record;
  target jsonb;
BEGIN
  IF NEW.status <> 'signed' AND NEW.signed_at IS NULL AND NEW.signature_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'signed' OR NEW.signed_at IS NULL OR NEW.signature_id IS NULL THEN
    RAISE EXCEPTION 'signed letter fields are incomplete' USING ERRCODE = 'A0303';
  END IF;
  IF current_user <> 'aso_gate_owner' THEN
    RAISE EXCEPTION 'letter signing requires the bounded command role' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status <> 'approved' THEN
    RAISE EXCEPTION 'only an approved letter may be signed' USING ERRCODE = 'A0303';
  END IF;
  SELECT * INTO STRICT actor FROM aso.gate_actor_context();
  PERFORM aso.require_signing_letter(NEW.id, true);
  SELECT s.id, s.version INTO signature_record
  FROM aso.signatures s
  WHERE s.id = NEW.signature_id AND s.user_id = actor.actor_id
    AND s.is_current AND s.retired_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current signature revision required' USING ERRCODE = 'A0302';
  END IF;
  target := aso.read_signing_target(NEW.id);
  IF target->>'status' <> 'approved'
     OR NOT (target->>'approvedByActor')::boolean
     OR NOT (target->>'isCurrent')::boolean THEN
    RAISE EXCEPTION 'current approved letter required' USING ERRCODE = 'A0303';
  ELSIF NOT (target->>'gateAffirmed')::boolean THEN
    RAISE EXCEPTION 'surgeon gate incomplete' USING ERRCODE = 'A0304';
  ELSIF NOT (target->>'qaComplete')::boolean THEN
    RAISE EXCEPTION 'letter QA incomplete' USING ERRCODE = 'A0305';
  ELSIF NOT (target->>'sourcesComplete')::boolean THEN
    RAISE EXCEPTION 'letter sources incomplete' USING ERRCODE = 'A0306';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION aso.lookup_letter_sign_command(target_command uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  original jsonb;
BEGIN
  SELECT * INTO STRICT actor FROM aso.gate_actor_context();
  SELECT command.result INTO original
  FROM aso.letter_sign_commands command
  WHERE command.kratos_identity_id = actor.identity_id
    AND command.practice_id = actor.practice_id
    AND command.command_id = target_command;
  RETURN original;
END;
$$;

CREATE FUNCTION aso.letter_sign_commands_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'letter signing results are immutable' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER letter_sign_commands_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON aso.letter_sign_commands
  FOR EACH STATEMENT EXECUTE FUNCTION aso.letter_sign_commands_immutable();

CREATE FUNCTION aso.apply_letter_sign_command(
  target_command uuid,
  target_letter uuid,
  target_letter_version integer,
  target_qa_revision bigint,
  target_signature_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  actor record;
  original aso.letter_sign_commands%ROWTYPE;
  letter_record record;
  signature_record record;
  target jsonb;
  result jsonb;
  committed_at timestamptz;
BEGIN
  SELECT * INTO STRICT actor FROM aso.gate_actor_context();
  IF target_command IS NULL OR target_letter IS NULL
     OR target_letter_version IS NULL OR target_letter_version <= 0
     OR target_qa_revision IS NULL OR target_qa_revision < 0
     OR target_signature_version IS NULL OR target_signature_version <= 0 THEN
    RAISE EXCEPTION 'invalid signing command payload' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    actor.identity_id::text || ':' || actor.practice_id::text || ':' || target_command::text, 0));
  SELECT * INTO original FROM aso.letter_sign_commands command
  WHERE command.kratos_identity_id = actor.identity_id
    AND command.practice_id = actor.practice_id
    AND command.command_id = target_command;
  IF FOUND THEN
    PERFORM aso.require_signing_letter(original.letter_id, true);
    IF original.letter_id IS DISTINCT FROM target_letter
       OR original.expected_letter_version IS DISTINCT FROM target_letter_version
       OR original.expected_qa_revision IS DISTINCT FROM target_qa_revision
       OR original.expected_signature_version IS DISTINCT FROM target_signature_version
       OR original.actor_id IS DISTINCT FROM actor.actor_id THEN
      RAISE EXCEPTION 'signing command ID has a different payload' USING ERRCODE = '23505';
    END IF;
    RETURN original.result;
  END IF;

  PERFORM aso.require_signing_letter(target_letter, true);
  SELECT l.id, l.case_id INTO STRICT letter_record
  FROM aso.letters l WHERE l.id = target_letter;
  PERFORM c.id FROM aso.cases c WHERE c.id = letter_record.case_id FOR UPDATE;
  PERFORM l.id FROM aso.letters l WHERE l.id = target_letter FOR UPDATE;
  PERFORM aso.require_signing_letter(target_letter, true);

  target := aso.read_signing_target(target_letter);
  IF (target->>'letterVersion')::integer <> target_letter_version
     OR (target->>'qaRevision')::bigint <> target_qa_revision THEN
    RAISE EXCEPTION 'letter or QA revision is stale' USING ERRCODE = 'A0301';
  ELSIF (target->>'signatureVersion') IS NULL
     OR (target->>'signatureVersion')::integer <> target_signature_version THEN
    RAISE EXCEPTION 'signature revision is stale' USING ERRCODE = 'A0302';
  ELSIF target->>'status' <> 'approved'
     OR NOT (target->>'approvedByActor')::boolean
     OR NOT (target->>'isCurrent')::boolean THEN
    RAISE EXCEPTION 'current approved letter required' USING ERRCODE = 'A0303';
  ELSIF NOT (target->>'gateAffirmed')::boolean THEN
    RAISE EXCEPTION 'surgeon gate incomplete' USING ERRCODE = 'A0304';
  ELSIF NOT (target->>'qaComplete')::boolean THEN
    RAISE EXCEPTION 'letter QA incomplete' USING ERRCODE = 'A0305';
  ELSIF NOT (target->>'sourcesComplete')::boolean THEN
    RAISE EXCEPTION 'letter sources incomplete' USING ERRCODE = 'A0306';
  END IF;
  SELECT s.id, s.version INTO STRICT signature_record
  FROM aso.signatures s
  WHERE s.user_id = actor.actor_id AND s.version = target_signature_version
    AND s.is_current AND s.retired_at IS NULL
  FOR UPDATE;

  committed_at := clock_timestamp();
  UPDATE aso.letters
  SET status = 'signed', signature_id = signature_record.id, signed_at = committed_at
  WHERE id = target_letter;
  result := jsonb_build_object(
    'commandId', target_command,
    'letterId', target_letter,
    'caseId', letter_record.case_id,
    'letterVersion', target_letter_version,
    'qaRevision', target_qa_revision,
    'signatureId', signature_record.id,
    'signatureVersion', signature_record.version,
    'signedAt', committed_at);
  INSERT INTO aso.audit_events (
    practice_id, occurred_at, actor_id, actor_kratos_id, actor_label, actor_role,
    action, outcome, entity_table, entity_id, case_id, summary, data)
  VALUES (
    actor.practice_id, committed_at, actor.actor_id, actor.identity_id,
    actor.actor_label, 'clinical:sign_letter', 'letter.sign', 'success',
    'letters', target_letter, letter_record.case_id,
    'Letter revision signed',
    jsonb_build_object('commandId', target_command,
      'letterVersion', target_letter_version,
      'qaRevision', target_qa_revision,
      'signatureVersion', signature_record.version));
  INSERT INTO aso.letter_sign_commands (
    kratos_identity_id, practice_id, command_id, actor_id, case_id, letter_id,
    expected_letter_version, expected_qa_revision, expected_signature_version,
    signature_id, result, committed_at)
  VALUES (
    actor.identity_id, actor.practice_id, target_command, actor.actor_id,
    letter_record.case_id, target_letter, target_letter_version,
    target_qa_revision, target_signature_version, signature_record.id,
    result, committed_at);
  RETURN result;
END;
$$;

GRANT CREATE ON SCHEMA aso TO aso_gate_owner;
DO $$
DECLARE
  signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'aso.require_signing_letter(uuid,boolean)',
    'aso.may_sign_letter(uuid)',
    'aso.read_signing_target(uuid)',
    'aso.bump_letter_qa_revision()',
    'aso.bind_letter_approval_revision()',
    'aso.guard_approved_letter_claims()',
    'aso.enforce_letter_signing()',
    'aso.lookup_letter_sign_command(uuid)',
    'aso.letter_sign_commands_immutable()',
    'aso.apply_letter_sign_command(uuid,uuid,integer,bigint,integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', signature);
    EXECUTE format('ALTER FUNCTION %s OWNER TO aso_gate_owner', signature);
  END LOOP;
END;
$$;
REVOKE CREATE ON SCHEMA aso FROM aso_gate_owner;
GRANT EXECUTE ON FUNCTION
  aso.may_sign_letter(uuid),
  aso.read_signing_target(uuid),
  aso.lookup_letter_sign_command(uuid),
  aso.apply_letter_sign_command(uuid,uuid,integer,bigint,integer)
  TO aso_gate_executor;
