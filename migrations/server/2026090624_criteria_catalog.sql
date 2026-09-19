-- web-06. Canonical, provenance-aware criteria catalog and legacy cutover.
-- The deployed runtime starts from schema.sql, so this migration owns the
-- criteria provenance subset needed by the browser workflow. It remains
-- compatible with databases that already applied the design-only AI schema.

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_publication WHERE puballtables)
     OR EXISTS (
       SELECT FROM pg_catalog.pg_publication_namespace pn
       JOIN pg_catalog.pg_namespace n ON n.oid = pn.pnnspid
       WHERE n.nspname = 'aso'
     ) THEN
    RAISE EXCEPTION
      'criteria catalog requires explicit-table publications';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS aso.evidence_grades (
  key text PRIMARY KEY,
  label text NOT NULL,
  rank integer NOT NULL UNIQUE CHECK (rank > 0),
  description text NOT NULL,
  citable_as_policy boolean NOT NULL,
  attribution_phrase text,
  decay_half_life_days integer CHECK (decay_half_life_days > 0)
);

INSERT INTO aso.evidence_grades (
  key, label, rank, description, citable_as_policy,
  attribution_phrase, decay_half_life_days
) VALUES
  ('published', 'Published policy', 1,
   'Verbatim from a hash-verified published payer policy.',
   true, NULL, NULL),
  ('obtained_by_request', 'Obtained on request', 2,
   'Supplied by the payer in writing on request; a source document exists.',
   true, NULL, NULL),
  ('payer_verbal', 'Stated by the payer verbally', 3,
   'Stated by a named payer representative on a referenced call.',
   false, 'as confirmed by the plan on', 365),
  ('derived_observed', 'Derived from observed determinations', 4,
   'Inferred by this practice from its own approvals and denials.',
   false, 'in this practice''s experience', 180),
  ('peer_shared', 'Shared by a peer practice', 5,
   'Derived by another practice and shared with its originating grade.',
   false, 'as reported by peer practices', 180)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  rank = EXCLUDED.rank,
  description = EXCLUDED.description,
  citable_as_policy = EXCLUDED.citable_as_policy,
  attribution_phrase = EXCLUDED.attribution_phrase,
  decay_half_life_days = EXCLUDED.decay_half_life_days;

CREATE TABLE IF NOT EXISTS aso.criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_id uuid NOT NULL REFERENCES aso.payers(id) ON DELETE CASCADE,
  practice_id uuid REFERENCES aso.practices(id) ON DELETE SET NULL,
  evidence_grade text NOT NULL
    REFERENCES aso.evidence_grades(key) ON DELETE RESTRICT,
  origin_grade text REFERENCES aso.evidence_grades(key) ON DELETE RESTRICT,
  policy_id uuid REFERENCES aso.policies(id) ON DELETE RESTRICT,
  section text,
  document_id uuid REFERENCES aso.documents(id) ON DELETE RESTRICT,
  recorded_by uuid REFERENCES aso.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz,
  payer_reference text,
  source_practice_id uuid REFERENCES aso.practices(id) ON DELETE SET NULL,
  label text NOT NULL CHECK (btrim(label) <> ''),
  requirement text NOT NULL CHECK (btrim(requirement) <> ''),
  ordinal integer NOT NULL DEFAULT 1 CHECK (ordinal > 0),
  source_page_number integer CHECK (source_page_number > 0),
  content_sha256 bytea NOT NULL CHECK (octet_length(content_sha256) = 32),
  procedure_family text,
  is_mandatory boolean NOT NULL DEFAULT true,
  validity daterange NOT NULL DEFAULT daterange(CURRENT_DATE, NULL, '[)'),
  last_confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_by uuid REFERENCES aso.criteria(id) ON DELETE SET NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(data) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz,
  CONSTRAINT criteria_published_needs_policy CHECK (
    evidence_grade <> 'published'
    OR (policy_id IS NOT NULL AND NULLIF(btrim(section), '') IS NOT NULL)),
  CONSTRAINT criteria_requested_needs_document CHECK (
    evidence_grade <> 'obtained_by_request' OR document_id IS NOT NULL),
  CONSTRAINT criteria_verbal_needs_attribution CHECK (
    evidence_grade <> 'payer_verbal'
    OR (recorded_by IS NOT NULL AND recorded_at IS NOT NULL
        AND NULLIF(btrim(payer_reference), '') IS NOT NULL)),
  CONSTRAINT criteria_derived_needs_practice CHECK (
    evidence_grade <> 'derived_observed' OR practice_id IS NOT NULL),
  CONSTRAINT criteria_peer_needs_origin CHECK (
    evidence_grade <> 'peer_shared'
    OR (source_practice_id IS NOT NULL AND origin_grade IS NOT NULL)),
  CONSTRAINT criteria_peer_no_promotion CHECK (
    origin_grade IS NULL OR evidence_grade = 'peer_shared'),
  CONSTRAINT criteria_derived_has_no_policy CHECK (
    evidence_grade NOT IN ('derived_observed', 'peer_shared')
    OR (policy_id IS NULL AND document_id IS NULL)),
  CONSTRAINT criteria_source_page_needs_document CHECK (
    source_page_number IS NULL OR document_id IS NOT NULL),
  CONSTRAINT criteria_validity_nonempty CHECK (NOT isempty(validity)),
  CONSTRAINT criteria_no_overlapping_validity
    EXCLUDE USING gist (payer_id WITH =, label WITH =, validity WITH &&)
);

CREATE INDEX IF NOT EXISTS criteria_payer_ix
  ON aso.criteria(payer_id, evidence_grade);
CREATE INDEX IF NOT EXISTS criteria_live_ix
  ON aso.criteria(payer_id) WHERE superseded_by IS NULL;
CREATE INDEX IF NOT EXISTS criteria_practice_ix
  ON aso.criteria(practice_id) WHERE practice_id IS NOT NULL;

CREATE OR REPLACE FUNCTION aso.criteria_provenance_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  IF NEW.payer_id IS DISTINCT FROM OLD.payer_id
     OR NEW.practice_id IS DISTINCT FROM OLD.practice_id
     OR NEW.evidence_grade IS DISTINCT FROM OLD.evidence_grade
     OR NEW.origin_grade IS DISTINCT FROM OLD.origin_grade
     OR NEW.policy_id IS DISTINCT FROM OLD.policy_id
     OR NEW.section IS DISTINCT FROM OLD.section
     OR NEW.document_id IS DISTINCT FROM OLD.document_id
     OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by
     OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at
     OR NEW.payer_reference IS DISTINCT FROM OLD.payer_reference
     OR NEW.source_practice_id IS DISTINCT FROM OLD.source_practice_id
     OR NEW.label IS DISTINCT FROM OLD.label
     OR NEW.requirement IS DISTINCT FROM OLD.requirement
     OR NEW.ordinal IS DISTINCT FROM OLD.ordinal
     OR NEW.source_page_number IS DISTINCT FROM OLD.source_page_number
     OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
     OR NEW.procedure_family IS DISTINCT FROM OLD.procedure_family
     OR NEW.is_mandatory IS DISTINCT FROM OLD.is_mandatory THEN
    RAISE EXCEPTION
      'criterion % provenance is immutable; supersede it with a new row', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS criteria_immutable ON aso.criteria;
DROP TRIGGER IF EXISTS criteria_provenance_immutable ON aso.criteria;
CREATE TRIGGER criteria_provenance_immutable
BEFORE UPDATE ON aso.criteria
FOR EACH ROW EXECUTE FUNCTION aso.criteria_provenance_immutable();

DROP TRIGGER IF EXISTS criteria_touch ON aso.criteria;
CREATE TRIGGER criteria_touch
BEFORE UPDATE ON aso.criteria
FOR EACH ROW EXECUTE FUNCTION aso.set_updated_at();

LOCK TABLE aso.policy_criteria, aso.criteria, aso.case_evidence
  IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM aso.policy_criteria
    WHERE data ? '_web00_migration'
  ) THEN
    RAISE EXCEPTION
      'policy_criteria.data already owns reserved key _web00_migration';
  END IF;
END;
$$;

INSERT INTO aso.criteria (
  id, payer_id, practice_id, evidence_grade, policy_id, section, ordinal,
  label, requirement, content_sha256, validity, is_mandatory, data,
  document_id, source_page_number, last_confirmed_at, created_at, updated_at
)
SELECT legacy.id,
       policy.payer_id,
       NULL,
       'published',
       legacy.policy_id,
       legacy.section,
       legacy.ordinal,
       legacy.label,
       legacy.requirement,
       digest(convert_to(legacy.requirement, 'UTF8'), 'sha256'),
       daterange(policy.effective_from, policy.effective_to, '[)'),
       legacy.is_mandatory,
       legacy.data || jsonb_build_object(
         '_web00_migration',
         jsonb_build_object(
           'legacy_relation', 'policy_criteria',
           'legacy_ordinal', legacy.ordinal)),
       NULL,
       NULL,
       COALESCE(legacy.updated_at, legacy.created_at),
       legacy.created_at,
       legacy.updated_at
FROM aso.policy_criteria legacy
JOIN aso.policies policy ON policy.id = legacy.policy_id
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF (SELECT count(*) FROM aso.policy_criteria) <>
     (SELECT count(*)
        FROM aso.criteria
       WHERE data->'_web00_migration'->>'legacy_relation' = 'policy_criteria')
  THEN
    RAISE EXCEPTION 'criteria migration row count mismatch';
  END IF;

  IF EXISTS (
    SELECT
    FROM aso.policy_criteria legacy
    JOIN aso.policies policy ON policy.id = legacy.policy_id
    LEFT JOIN aso.criteria canonical ON canonical.id = legacy.id
    WHERE canonical.id IS NULL
       OR canonical.payer_id IS DISTINCT FROM policy.payer_id
       OR canonical.practice_id IS NOT NULL
       OR canonical.evidence_grade IS DISTINCT FROM 'published'
       OR canonical.policy_id IS DISTINCT FROM legacy.policy_id
       OR canonical.section IS DISTINCT FROM legacy.section
       OR canonical.ordinal IS DISTINCT FROM legacy.ordinal
       OR canonical.label IS DISTINCT FROM legacy.label
       OR canonical.requirement IS DISTINCT FROM legacy.requirement
       OR canonical.content_sha256 IS DISTINCT FROM
          digest(convert_to(legacy.requirement, 'UTF8'), 'sha256')
       OR canonical.validity IS DISTINCT FROM
          daterange(policy.effective_from, policy.effective_to, '[)')
       OR canonical.is_mandatory IS DISTINCT FROM legacy.is_mandatory
       OR (canonical.data - '_web00_migration') IS DISTINCT FROM legacy.data
       OR canonical.data->'_web00_migration'->>'legacy_ordinal'
          IS DISTINCT FROM legacy.ordinal::text
       OR canonical.document_id IS NOT NULL
       OR canonical.source_page_number IS NOT NULL
       OR canonical.last_confirmed_at IS DISTINCT FROM
          COALESCE(legacy.updated_at, legacy.created_at)
       OR canonical.created_at IS DISTINCT FROM legacy.created_at
       OR canonical.updated_at IS DISTINCT FROM legacy.updated_at
  ) THEN
    RAISE EXCEPTION 'criteria migration field reconciliation failed';
  END IF;
END;
$$;

ALTER TABLE aso.case_evidence
  DROP CONSTRAINT case_evidence_policy_criterion_id_fkey;
ALTER TABLE aso.case_evidence
  RENAME COLUMN policy_criterion_id TO criterion_id;
ALTER TABLE aso.case_evidence
  ADD CONSTRAINT case_evidence_criterion_id_fkey
  FOREIGN KEY (criterion_id) REFERENCES aso.criteria(id) ON DELETE RESTRICT;

ALTER TABLE aso.policy_criteria RENAME TO policy_criteria_legacy;

CREATE OR REPLACE FUNCTION aso.refuse_policy_criteria_legacy_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION
    'policy_criteria is read-only after the criteria catalog cutover'
    USING ERRCODE = 'read_only_sql_transaction';
END;
$$;

CREATE TRIGGER policy_criteria_legacy_write_refusal
BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON aso.policy_criteria_legacy
FOR EACH STATEMENT EXECUTE FUNCTION aso.refuse_policy_criteria_legacy_write();

CREATE VIEW aso.policy_criteria AS
SELECT canonical.id,
       canonical.policy_id,
       canonical.section,
       canonical.ordinal,
       canonical.label,
       canonical.requirement,
       canonical.data - '_web00_migration' AS data,
       canonical.is_mandatory,
       canonical.created_at,
       canonical.updated_at
FROM aso.criteria canonical
WHERE canonical.evidence_grade = 'published'
  AND canonical.policy_id IS NOT NULL;

CREATE TRIGGER policy_criteria_view_write_refusal
INSTEAD OF INSERT OR UPDATE OR DELETE ON aso.policy_criteria
FOR EACH ROW EXECUTE FUNCTION aso.refuse_policy_criteria_legacy_write();

CREATE TABLE aso.criteria_catalog (
  id uuid PRIMARY KEY REFERENCES aso.criteria(id) ON DELETE CASCADE,
  payer_id uuid NOT NULL REFERENCES aso.payers(id) ON DELETE CASCADE,
  practice_id uuid REFERENCES aso.practices(id) ON DELETE CASCADE,
  evidence_grade text NOT NULL
    REFERENCES aso.evidence_grades(key) ON DELETE RESTRICT,
  policy_id uuid REFERENCES aso.policies(id) ON DELETE RESTRICT,
  section text,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  document_id uuid REFERENCES aso.documents(id) ON DELETE RESTRICT,
  source_page_number integer CHECK (source_page_number > 0),
  label text NOT NULL,
  requirement text NOT NULL,
  content_sha256_text text NOT NULL
    CHECK (content_sha256_text ~ '^[0-9a-f]{64}$'),
  procedure_family text,
  is_mandatory boolean NOT NULL,
  validity daterange NOT NULL,
  superseded_by uuid REFERENCES aso.criteria(id) ON DELETE SET NULL
);

COMMENT ON TABLE aso.criteria_catalog IS
  'Lane: server-authoritative relational. Privacy: trusted mixed provenance. Exact criteria projection; command ledgers and source content are structurally absent.';
COMMENT ON COLUMN aso.criteria_catalog.practice_id IS
  'NULL for published public policy; otherwise the verified selected-practice predicate.';

ALTER TABLE aso.criteria_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON aso.evidence_grades, aso.criteria, aso.criteria_catalog,
  aso.policy_criteria_legacy, aso.policy_criteria FROM PUBLIC;

CREATE OR REPLACE FUNCTION aso.refresh_criteria_catalog_projection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM aso.criteria_catalog catalog WHERE catalog.id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO aso.criteria_catalog (
    id, payer_id, practice_id, evidence_grade, policy_id, section, ordinal,
    document_id, source_page_number, label, requirement,
    content_sha256_text, procedure_family, is_mandatory, validity,
    superseded_by)
  VALUES (
    NEW.id, NEW.payer_id, NEW.practice_id, NEW.evidence_grade,
    NEW.policy_id, NEW.section, NEW.ordinal, NEW.document_id,
    NEW.source_page_number, NEW.label, NEW.requirement,
    encode(NEW.content_sha256, 'hex'), NEW.procedure_family,
    NEW.is_mandatory, NEW.validity, NEW.superseded_by)
  ON CONFLICT (id) DO UPDATE SET
    payer_id = EXCLUDED.payer_id,
    practice_id = EXCLUDED.practice_id,
    evidence_grade = EXCLUDED.evidence_grade,
    policy_id = EXCLUDED.policy_id,
    section = EXCLUDED.section,
    ordinal = EXCLUDED.ordinal,
    document_id = EXCLUDED.document_id,
    source_page_number = EXCLUDED.source_page_number,
    label = EXCLUDED.label,
    requirement = EXCLUDED.requirement,
    content_sha256_text = EXCLUDED.content_sha256_text,
    procedure_family = EXCLUDED.procedure_family,
    is_mandatory = EXCLUDED.is_mandatory,
    validity = EXCLUDED.validity,
    superseded_by = EXCLUDED.superseded_by;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION aso.refresh_criteria_catalog_projection() FROM PUBLIC;

CREATE TRIGGER criteria_catalog_projection_refresh
AFTER INSERT OR UPDATE OR DELETE ON aso.criteria
FOR EACH ROW EXECUTE FUNCTION aso.refresh_criteria_catalog_projection();

INSERT INTO aso.criteria_catalog (
  id, payer_id, practice_id, evidence_grade, policy_id, section, ordinal,
  document_id, source_page_number, label, requirement,
  content_sha256_text, procedure_family, is_mandatory, validity,
  superseded_by)
SELECT id, payer_id, practice_id, evidence_grade, policy_id, section, ordinal,
       document_id, source_page_number, label, requirement,
       encode(content_sha256, 'hex'), procedure_family, is_mandatory,
       validity, superseded_by
FROM aso.criteria;

CREATE INDEX criteria_catalog_payer_ix
  ON aso.criteria_catalog(payer_id, evidence_grade);
CREATE INDEX criteria_catalog_practice_ix
  ON aso.criteria_catalog(practice_id) WHERE practice_id IS NOT NULL;

CREATE OR REPLACE FUNCTION aso.verify_web00_criteria_rollback()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  IF (SELECT count(*) FROM aso.policy_criteria_legacy) <>
     (SELECT count(*)
        FROM aso.criteria
       WHERE data->'_web00_migration'->>'legacy_relation' = 'policy_criteria')
  THEN
    RAISE EXCEPTION 'rollback refused: canonical/legacy row count mismatch';
  END IF;

  IF EXISTS (
    (SELECT id FROM aso.policy_criteria_legacy
     EXCEPT
     SELECT id FROM aso.criteria
      WHERE data->'_web00_migration'->>'legacy_relation' = 'policy_criteria')
    UNION ALL
    (SELECT id FROM aso.criteria
      WHERE data->'_web00_migration'->>'legacy_relation' = 'policy_criteria'
     EXCEPT
     SELECT id FROM aso.policy_criteria_legacy)
  ) THEN
    RAISE EXCEPTION 'rollback refused: canonical/legacy UUID set mismatch';
  END IF;

  IF EXISTS (
    SELECT
    FROM aso.criteria canonical
    JOIN aso.policy_criteria_legacy legacy ON legacy.id = canonical.id
    WHERE canonical.requirement IS DISTINCT FROM legacy.requirement
       OR canonical.content_sha256 IS DISTINCT FROM
          digest(convert_to(legacy.requirement, 'UTF8'), 'sha256')
       OR canonical.last_confirmed_at IS DISTINCT FROM
          COALESCE(legacy.updated_at, legacy.created_at)
  ) THEN
    RAISE EXCEPTION 'rollback refused: canonical/legacy criterion mismatch';
  END IF;

  IF EXISTS (
    SELECT
    FROM aso.case_evidence evidence
    LEFT JOIN aso.policy_criteria_legacy legacy
      ON legacy.id = evidence.criterion_id
    WHERE legacy.id IS NULL
  ) THEN
    RAISE EXCEPTION 'rollback refused: case evidence lacks a legacy criterion';
  END IF;

  IF to_regclass('aso.criterion_observations') IS NOT NULL
     AND EXISTS (
       SELECT
       FROM aso.criterion_observations observation
       JOIN aso.policy_criteria_legacy legacy
         ON legacy.id = observation.criterion_id
     ) THEN
    RAISE EXCEPTION 'rollback refused: migrated criteria gained observations';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION aso.verify_web00_criteria_rollback() FROM PUBLIC;
