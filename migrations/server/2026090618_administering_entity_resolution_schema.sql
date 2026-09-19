-- web-03. Practice-scoped payer plans, delegation rules, and durable outcomes.
-- Resolver commands and functions are added separately after this schema is proved.

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_publication WHERE puballtables)
     OR EXISTS (
       SELECT FROM pg_catalog.pg_publication_namespace pn
       JOIN pg_catalog.pg_namespace n ON n.oid = pn.pnnspid
       WHERE n.nspname = 'aso'
     ) THEN
    RAISE EXCEPTION
      'local administering-entity rule data requires explicit-table publications';
  END IF;
END;
$$;

ALTER TABLE aso.cases
  ADD CONSTRAINT cases_id_practice_unique UNIQUE (id, practice_id);

CREATE TABLE aso.administering_entities (
  id uuid PRIMARY KEY,
  practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (key ~ '^[a-z0-9]+(?:[-_][a-z0-9]+)*$'),
  name text NOT NULL CHECK (btrim(name) <> ''),
  active boolean NOT NULL DEFAULT true,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz,
  UNIQUE (practice_id, key),
  UNIQUE (id, practice_id)
);

COMMENT ON TABLE aso.administering_entities IS
  'Lane: server-authoritative relational. Privacy: local. Practice-owned resolver input; excluded from replication.';

CREATE TABLE aso.payer_plans (
  id uuid PRIMARY KEY,
  practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE CASCADE,
  payer_id uuid NOT NULL REFERENCES aso.payers(id) ON DELETE RESTRICT,
  plan_key text NOT NULL CHECK (plan_key ~ '^[a-z0-9]+(?:[-_][a-z0-9]+)*$'),
  name text NOT NULL CHECK (btrim(name) <> ''),
  valid_from date NOT NULL,
  valid_to date,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz,
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  UNIQUE (practice_id, payer_id, plan_key, valid_from),
  UNIQUE (id, practice_id)
);

COMMENT ON TABLE aso.payer_plans IS
  'Lane: server-authoritative relational. Privacy: local. Practice-owned resolver input; excluded from replication.';

CREATE TABLE aso.payer_plan_enrollments (
  id uuid PRIMARY KEY,
  practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE CASCADE,
  payer_plan_id uuid NOT NULL,
  member_id text NOT NULL CHECK (btrim(member_id) <> ''),
  source_document_id uuid NOT NULL REFERENCES aso.documents(id) ON DELETE RESTRICT,
  valid_from date NOT NULL,
  valid_to date,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz,
  CONSTRAINT payer_plan_enrollments_plan_fkey
    FOREIGN KEY (payer_plan_id, practice_id)
    REFERENCES aso.payer_plans(id, practice_id) ON DELETE CASCADE,
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  UNIQUE (practice_id, member_id, payer_plan_id, valid_from),
  UNIQUE (id, practice_id)
);

COMMENT ON TABLE aso.payer_plan_enrollments IS
  'Lane: server-authoritative relational. Privacy: local. Effective-dated member-to-plan evidence; excluded from replication.';

CREATE TABLE aso.plan_delegation_rules (
  id uuid PRIMARY KEY,
  practice_id uuid NOT NULL REFERENCES aso.practices(id) ON DELETE CASCADE,
  payer_plan_id uuid NOT NULL,
  procedure_code text NOT NULL CHECK (btrim(procedure_code) <> ''),
  administering_entity_id uuid NOT NULL,
  criteria_set_key text NOT NULL
    CHECK (criteria_set_key ~ '^[a-z0-9]+(?:[-_][a-z0-9]+)*$'),
  submission_channel_key text NOT NULL
    CHECK (submission_channel_key ~ '^[a-z0-9]+(?:[-_][a-z0-9]+)*$'),
  appeal_path_key text NOT NULL
    CHECK (appeal_path_key ~ '^[a-z0-9]+(?:[-_][a-z0-9]+)*$'),
  source_document_id uuid NOT NULL REFERENCES aso.documents(id) ON DELETE RESTRICT,
  valid_from date NOT NULL,
  valid_to date,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz,
  CONSTRAINT plan_delegation_rules_plan_fkey
    FOREIGN KEY (payer_plan_id, practice_id)
    REFERENCES aso.payer_plans(id, practice_id) ON DELETE CASCADE,
  CONSTRAINT plan_delegation_rules_entity_fkey
    FOREIGN KEY (administering_entity_id, practice_id)
    REFERENCES aso.administering_entities(id, practice_id) ON DELETE RESTRICT,
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  UNIQUE (
    payer_plan_id, procedure_code, administering_entity_id, criteria_set_key,
    submission_channel_key, appeal_path_key, source_document_id, valid_from
  ),
  UNIQUE (id, practice_id)
);

COMMENT ON TABLE aso.plan_delegation_rules IS
  'Lane: server-authoritative relational. Privacy: local. Effective-dated resolver input; excluded from replication.';

CREATE TABLE aso.administering_entity_resolution_states (
  key text PRIMARY KEY,
  label text NOT NULL,
  blocks_downstream boolean NOT NULL
);

INSERT INTO aso.administering_entity_resolution_states
  (key, label, blocks_downstream) VALUES
  ('resolved', 'Resolved', false),
  ('missing', 'No matching rule', true),
  ('ambiguous', 'More than one administering entity', true),
  ('conflicting', 'Conflicting paths for one entity', true),
  ('expired', 'Coverage path expired', true);

CREATE TABLE aso.administering_entity_resolutions (
  case_id uuid PRIMARY KEY,
  practice_id uuid NOT NULL,
  entity_id uuid,
  criteria_set_key text,
  submission_channel_key text,
  appeal_path_key text,
  source_document_id uuid REFERENCES aso.documents(id) ON DELETE RESTRICT,
  entity_revision bigint,
  plan_revision bigint,
  enrollment_revision bigint,
  rule_revision bigint,
  source_document_version integer,
  valid_from date,
  valid_to date,
  state text NOT NULL REFERENCES aso.administering_entity_resolution_states(key),
  revision bigint NOT NULL CHECK (revision > 0),
  case_input_revision bigint NOT NULL CHECK (case_input_revision > 0),
  matched_rule_id uuid,
  resolved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz,
  CONSTRAINT administering_entity_resolutions_case_fkey
    FOREIGN KEY (case_id, practice_id)
    REFERENCES aso.cases(id, practice_id) ON DELETE CASCADE,
  CONSTRAINT administering_entity_resolutions_entity_fkey
    FOREIGN KEY (entity_id, practice_id)
    REFERENCES aso.administering_entities(id, practice_id) ON DELETE RESTRICT,
  CONSTRAINT administering_entity_resolutions_rule_fkey
    FOREIGN KEY (matched_rule_id, practice_id)
    REFERENCES aso.plan_delegation_rules(id, practice_id) ON DELETE RESTRICT,
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from),
  CHECK (
    (state = 'resolved'
      AND entity_id IS NOT NULL
      AND criteria_set_key IS NOT NULL
      AND submission_channel_key IS NOT NULL
      AND appeal_path_key IS NOT NULL
      AND source_document_id IS NOT NULL
      AND entity_revision IS NOT NULL
      AND plan_revision IS NOT NULL
      AND enrollment_revision IS NOT NULL
      AND rule_revision IS NOT NULL
      AND source_document_version IS NOT NULL
      AND valid_from IS NOT NULL
      AND matched_rule_id IS NOT NULL)
    OR
    (state <> 'resolved'
      AND entity_id IS NULL
      AND criteria_set_key IS NULL
      AND submission_channel_key IS NULL
      AND appeal_path_key IS NULL
      AND source_document_id IS NULL
      AND entity_revision IS NULL
      AND plan_revision IS NULL
      AND enrollment_revision IS NULL
      AND rule_revision IS NULL
      AND source_document_version IS NULL
      AND valid_from IS NULL
      AND valid_to IS NULL
      AND matched_rule_id IS NULL)
  )
);

COMMENT ON TABLE aso.administering_entity_resolutions IS
  'Lane: server-authoritative relational. Privacy: trusted. Exact case resolution output; publication requires the reviewed column allowlist and verified-practice join.';

CREATE FUNCTION aso.assert_resolution_source_practice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  source_practice uuid;
BEGIN
  IF NEW.source_document_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT patient.practice_id INTO source_practice
    FROM aso.documents document
    JOIN aso.patients patient ON patient.id = document.patient_id
   WHERE document.id = NEW.source_document_id;

  IF source_practice IS NULL OR source_practice IS DISTINCT FROM NEW.practice_id THEN
    RAISE EXCEPTION 'resolution source document belongs to another practice'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER plan_delegation_rule_source_practice
  BEFORE INSERT OR UPDATE OF practice_id, source_document_id
  ON aso.plan_delegation_rules
  FOR EACH ROW EXECUTE FUNCTION aso.assert_resolution_source_practice();

CREATE TRIGGER payer_plan_enrollment_source_practice
  BEFORE INSERT OR UPDATE OF practice_id, source_document_id
  ON aso.payer_plan_enrollments
  FOR EACH ROW EXECUTE FUNCTION aso.assert_resolution_source_practice();

CREATE TRIGGER administering_resolution_source_practice
  BEFORE INSERT OR UPDATE OF practice_id, source_document_id
  ON aso.administering_entity_resolutions
  FOR EACH ROW EXECUTE FUNCTION aso.assert_resolution_source_practice();

CREATE INDEX payer_plans_lookup_ix
  ON aso.payer_plans(practice_id, payer_id, plan_key, valid_from, valid_to);
CREATE INDEX payer_plan_enrollments_lookup_ix
  ON aso.payer_plan_enrollments(
    practice_id, member_id, payer_plan_id, valid_from, valid_to
  );
CREATE INDEX plan_delegation_rules_lookup_ix
  ON aso.plan_delegation_rules(
    practice_id, payer_plan_id, procedure_code, valid_from, valid_to
  );
CREATE INDEX administering_entity_resolutions_practice_ix
  ON aso.administering_entity_resolutions(practice_id, state);

CREATE FUNCTION aso.bump_resolver_input_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER administering_entities_touch
  BEFORE UPDATE ON aso.administering_entities
  FOR EACH ROW EXECUTE FUNCTION aso.set_updated_at();
CREATE TRIGGER administering_entities_revision
  BEFORE UPDATE ON aso.administering_entities
  FOR EACH ROW EXECUTE FUNCTION aso.bump_resolver_input_revision();
CREATE TRIGGER payer_plans_touch
  BEFORE UPDATE ON aso.payer_plans
  FOR EACH ROW EXECUTE FUNCTION aso.set_updated_at();
CREATE TRIGGER payer_plans_revision
  BEFORE UPDATE ON aso.payer_plans
  FOR EACH ROW EXECUTE FUNCTION aso.bump_resolver_input_revision();
CREATE TRIGGER payer_plan_enrollments_touch
  BEFORE UPDATE ON aso.payer_plan_enrollments
  FOR EACH ROW EXECUTE FUNCTION aso.set_updated_at();
CREATE TRIGGER payer_plan_enrollments_revision
  BEFORE UPDATE ON aso.payer_plan_enrollments
  FOR EACH ROW EXECUTE FUNCTION aso.bump_resolver_input_revision();
CREATE TRIGGER plan_delegation_rules_touch
  BEFORE UPDATE ON aso.plan_delegation_rules
  FOR EACH ROW EXECUTE FUNCTION aso.set_updated_at();
CREATE TRIGGER plan_delegation_rules_revision
  BEFORE UPDATE ON aso.plan_delegation_rules
  FOR EACH ROW EXECUTE FUNCTION aso.bump_resolver_input_revision();
CREATE TRIGGER administering_entity_resolutions_touch
  BEFORE UPDATE ON aso.administering_entity_resolutions
  FOR EACH ROW EXECUTE FUNCTION aso.set_updated_at();

ALTER TABLE aso.administering_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE aso.payer_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE aso.payer_plan_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE aso.plan_delegation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE aso.administering_entity_resolutions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON aso.administering_entities FROM PUBLIC;
REVOKE ALL ON aso.payer_plans FROM PUBLIC;
REVOKE ALL ON aso.payer_plan_enrollments FROM PUBLIC;
REVOKE ALL ON aso.plan_delegation_rules FROM PUBLIC;
REVOKE ALL ON aso.administering_entity_resolution_states FROM PUBLIC;
REVOKE ALL ON aso.administering_entity_resolutions FROM PUBLIC;
REVOKE ALL ON FUNCTION aso.assert_resolution_source_practice() FROM PUBLIC;
REVOKE ALL ON FUNCTION aso.bump_resolver_input_revision() FROM PUBLIC;
