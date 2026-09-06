-- ═══════════════════════════════════════════════════════════════════════════
-- Advanced Spine & Orthopedics · Surgery Authorization Workbench
-- PostgreSQL 16 schema
--
-- Two structural commitments run through this file.
--
-- 1. Ory Kratos owns identity; this database owns authority.
--    Kratos holds credentials, MFA, recovery and the session lifecycle. We
--    store only the immutable Kratos identity UUID and everything the
--    application must reason about that Kratos has no opinion on: which
--    practice a person belongs to, what they are allowed to do, and whether
--    they hold the clinical credentials to affirm a medical decision.
--
-- 2. Typed metadata where types genuinely differ, relational where they do
--    not. An MRI report, an HbA1c result and a physical-therapy note are all
--    clinical documents with the same lifecycle and wholly different payloads.
--    Those get `*_types` + JSONB `data` validated against a per-type JSON
--    Schema. Things with one fixed shape (a case, a submission receipt) stay
--    ordinary columns, because burying a NOT NULL business rule inside JSONB
--    trades a constraint the database enforces for one nobody does.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- fuzzy patient/document search

CREATE SCHEMA IF NOT EXISTS aso;
SET search_path = aso, public;


-- ─────────────────────────────────────────────────────────────────────────
-- 0 · Shared infrastructure
-- ─────────────────────────────────────────────────────────────────────────

-- Every table with an updated_at gets this trigger. updated_at is nullable
-- and stays NULL until the first update, so "never modified since creation"
-- is a distinguishable state rather than a value equal to created_at.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Derives the kebab-case `key` from `name` when the caller does not supply
-- one. Keys are the stable programmatic handle: application code switches on
-- 'ct-myelogram', never on the display name, so renaming a type for the UI
-- does not break the code that depends on it.
CREATE OR REPLACE FUNCTION derive_type_key()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.key IS NULL OR btrim(NEW.key) = '' THEN
    NEW.key := trim(both '-' from
                 regexp_replace(
                   regexp_replace(lower(NEW.name), '[^a-z0-9]+', '-', 'g'),
                   '-{2,}', '-', 'g'));
  END IF;
  RETURN NEW;
END;
$$;

-- Guards the JSONB payload of a typed row against its type's JSON Schema.
--
-- Postgres has no native JSON Schema validator. Three honest options:
--   (a) the `pg_jsonschema` extension  — preferred where the platform allows
--       it (available on Supabase, RDS via extension allowlist);
--   (b) validation in the application layer before write;
--   (c) this shim, which enforces only the cheap structural subset.
--
-- We ship (c) as the floor so an unvalidated payload can never be written
-- silently, and document (a) as the production configuration. The shim
-- checks type, required properties and declared property types — it does not
-- implement the full specification, and does not pretend to.
CREATE OR REPLACE FUNCTION jsonschema_basic_check(schema jsonb, payload jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  req    text;
  prop   text;
  expect text;
  actual text;
BEGIN
  IF schema IS NULL OR schema = 'null'::jsonb THEN
    RETURN true;                       -- untyped payloads are allowed
  END IF;
  IF payload IS NULL THEN
    RETURN jsonb_array_length(COALESCE(schema->'required', '[]'::jsonb)) = 0;
  END IF;
  IF jsonb_typeof(payload) <> 'object' THEN
    RETURN false;
  END IF;

  FOR req IN SELECT jsonb_array_elements_text(COALESCE(schema->'required', '[]'::jsonb))
  LOOP
    IF NOT (payload ? req) THEN
      RETURN false;
    END IF;
  END LOOP;

  FOR prop, expect IN
    SELECT k, v->>'type'
      FROM jsonb_each(COALESCE(schema->'properties', '{}'::jsonb)) AS e(k, v)
     WHERE v->>'type' IS NOT NULL
  LOOP
    IF payload ? prop AND jsonb_typeof(payload->prop) <> 'null' THEN
      actual := jsonb_typeof(payload->prop);
      IF expect = 'integer' THEN expect := 'number'; END IF;
      IF actual <> expect THEN
        RETURN false;
      END IF;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;


-- Applies jsonschema_basic_check as a trigger rather than a CHECK constraint.
--
-- A CHECK constraint may not contain a subquery: Postgres requires it to be
-- immutable and row-local, and resolving the type's schema means reading
-- another table. A BEFORE trigger is the sanctioned mechanism, and it carries
-- a second advantage — it can name the offending type in the error, which a
-- CHECK violation cannot.
--
-- Arguments: TG_ARGV[0] = types table, TG_ARGV[1] = FK column on this row.
CREATE OR REPLACE FUNCTION validate_typed_payload()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  type_table  text := TG_ARGV[0];
  fk_column   text := TG_ARGV[1];
  type_id     uuid;
  type_schema jsonb;
  type_name   text;
  payload     jsonb;
BEGIN
  EXECUTE format('SELECT ($1).%I, ($1).data', fk_column)
     INTO type_id, payload USING NEW;

  IF type_id IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT schema, name FROM %I WHERE id = $1', type_table)
     INTO type_schema, type_name USING type_id;

  IF NOT jsonschema_basic_check(type_schema, payload) THEN
    RAISE EXCEPTION
      'data does not conform to the JSON Schema for % type "%"', type_table, type_name
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────
-- 1 · Tenancy — practices and facilities
--
-- A surgeon operates at more than one site. The practice is the tenant
-- boundary for policy, users and cases; a facility is a place where surgery
-- happens and where a distinct EMR usually lives.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE practices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  key         text NOT NULL UNIQUE,
  npi         text,                       -- organizational NPI
  tax_id      text,
  timezone    text NOT NULL DEFAULT 'America/Chicago',
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);
CREATE TRIGGER practices_touch BEFORE UPDATE ON practices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE facility_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  key         text NOT NULL UNIQUE,
  schema      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);
CREATE TRIGGER facility_types_key BEFORE INSERT OR UPDATE ON facility_types
  FOR EACH ROW EXECUTE FUNCTION derive_type_key();
CREATE TRIGGER facility_types_touch BEFORE UPDATE ON facility_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE facilities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_type_id  uuid NOT NULL REFERENCES facility_types(id) ON DELETE RESTRICT,
  practice_id       uuid REFERENCES practices(id) ON DELETE SET NULL,
  name              text NOT NULL,
  data              jsonb,
  npi               text,
  address           jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz
);
CREATE INDEX facilities_practice_ix ON facilities(practice_id);
CREATE INDEX facilities_data_gin    ON facilities USING gin (data jsonb_path_ops);
CREATE TRIGGER facilities_touch BEFORE UPDATE ON facilities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER facilities_validate_data BEFORE INSERT OR UPDATE ON facilities
  FOR EACH ROW EXECUTE FUNCTION validate_typed_payload('facility_types', 'facility_type_id');


-- ─────────────────────────────────────────────────────────────────────────
-- 2 · Identity — Kratos-backed users, roles, capabilities
--
-- kratos_identity_id is the join to Ory. It is UNIQUE and immutable: one
-- Kratos identity is exactly one application user, forever. Email is
-- mirrored for display, search and letterhead only — Kratos remains the
-- authority on the verified address, and a mirrored copy that drifts is a
-- display bug, never an authentication one.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kratos_identity_id  uuid NOT NULL UNIQUE,
  practice_id         uuid NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,

  email               citext NOT NULL,
  full_name           text   NOT NULL,
  display_name        text,
  initials            text,
  title               text,                       -- 'MD', 'PA-C', 'RN'
  job_title           text,                       -- 'Prior-auth coordinator'

  npi                 text,                       -- individual NPI, clinicians only
  status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('invited','active','suspended','deactivated')),
  last_seen_at        timestamptz,
  data                jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz,

  CONSTRAINT users_email_unique_per_practice UNIQUE (practice_id, email)
);
CREATE INDEX users_practice_ix ON users(practice_id) WHERE status = 'active';
CREATE INDEX users_name_trgm   ON users USING gin (full_name gin_trgm_ops);
CREATE TRIGGER users_touch BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Capabilities are named verbs, not a bitmask, so the audit log can record
-- "attempted affirm_gate, denied" in words a compliance reviewer reads.
--
-- is_clinical marks the safety boundary that motivates the whole role model:
-- affirm_gate and sign_letter are medical acts. An administrator holds every
-- configuration power in the system and must still be unable to perform them.
CREATE TABLE capabilities (
  key          text PRIMARY KEY,
  label        text NOT NULL,
  description  text NOT NULL,
  is_clinical  boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO capabilities (key, label, description, is_clinical) VALUES
  ('configure',    'Configure the practice',
   'EMR connections, users, role assignment, retention policy.', false),
  ('affirm_gate',  'Affirm the surgeon gate',
   'Confirm controlling policy, criterion section, pathway and operative plan. Clinical act.', true),
  ('sign_letter',  'Apply an electronic signature',
   'Bind the surgeon''s signature to a letter of medical necessity. Clinical act.', true),
  ('annotate',     'Record a clinical annotation',
   'Enter a clinical judgment that may be argued in the letter under attribution. Clinical act.', true),
  ('submit',       'Submit to a payer',
   'Transmit the packet and record the receipt.', false),
  ('view_audit',   'Read the audit log',
   'Read the immutable record of who did what.', false);

CREATE TABLE roles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text NOT NULL UNIQUE,
  label        text NOT NULL,
  description  text NOT NULL,
  is_system    boolean NOT NULL DEFAULT false,   -- system roles cannot be deleted
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz
);
CREATE TRIGGER roles_touch BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO roles (key, label, description, is_system) VALUES
  ('admin',   'Administrator',
   'Practice configuration, EMR connections, users and audit. Holds no clinical authority.', true),
  ('surgeon', 'Surgeon',
   'Clinical authority. Affirms the gate, annotates evidence, signs letters, takes peer-to-peer calls.', true),
  ('staff',   'Staff',
   'Coordinators, schedulers and billing. Prepares and submits; affirms nothing clinical.', true);

CREATE TABLE role_capabilities (
  role_id         uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  capability_key  text NOT NULL REFERENCES capabilities(key) ON DELETE CASCADE,
  PRIMARY KEY (role_id, capability_key)
);

INSERT INTO role_capabilities (role_id, capability_key)
SELECT r.id, c.key
  FROM roles r
  JOIN LATERAL (VALUES
        ('admin','configure'),   ('admin','submit'),      ('admin','view_audit'),
        ('surgeon','affirm_gate'),('surgeon','sign_letter'),('surgeon','annotate'),
        ('surgeon','submit'),
        ('staff','submit')
      ) AS c(role_key, key) ON c.role_key = r.key;

-- A user's role is scoped to a practice: the same person may be a surgeon at
-- their own practice and hold no role at a partner office.
CREATE TABLE user_roles (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id      uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  practice_id  uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  granted_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  granted_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id, practice_id)
);
CREATE INDEX user_roles_practice_ix ON user_roles(practice_id, role_id);

-- Resolved capability set for a user. Application code asks this view, never
-- the role name, so adding a fourth role never requires touching a call site.
CREATE VIEW user_capabilities AS
SELECT ur.user_id,
       ur.practice_id,
       rc.capability_key,
       c.is_clinical
  FROM user_roles ur
  JOIN role_capabilities rc ON rc.role_id = ur.role_id
  JOIN capabilities c       ON c.key = rc.capability_key
 GROUP BY ur.user_id, ur.practice_id, rc.capability_key, c.is_clinical;

-- Clinician credentials — licensure and board certification. Held separately
-- from the role because a role is an application grant while a credential is
-- an external fact with an expiry date. A surgeon whose licence lapsed still
-- holds the surgeon role and must still be blocked from signing.
CREATE TABLE credential_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  key         text NOT NULL UNIQUE,
  schema      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);
CREATE TRIGGER credential_types_key BEFORE INSERT OR UPDATE ON credential_types
  FOR EACH ROW EXECUTE FUNCTION derive_type_key();
CREATE TRIGGER credential_types_touch BEFORE UPDATE ON credential_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE credentials (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_type_id  uuid NOT NULL REFERENCES credential_types(id) ON DELETE RESTRICT,
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                text NOT NULL,
  data                jsonb,
  issued_on           date,
  expires_on          date,
  verified_at         timestamptz,
  verified_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz
);
CREATE INDEX credentials_user_ix    ON credentials(user_id);
CREATE INDEX credentials_expiry_ix  ON credentials(expires_on) WHERE expires_on IS NOT NULL;
CREATE TRIGGER credentials_touch BEFORE UPDATE ON credentials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER credentials_validate_data BEFORE INSERT OR UPDATE ON credentials
  FOR EACH ROW EXECUTE FUNCTION validate_typed_payload('credential_types', 'credential_type_id');

-- The stored signature is a distinct object from the user. It is versioned:
-- replacing a signature never rewrites letters already signed with the old one.
CREATE TABLE signatures (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version      integer NOT NULL,
  image_uri    text NOT NULL,
  image_sha256 bytea NOT NULL,
  credential_line text NOT NULL,          -- 'Kevin B. James, MD · NPI 1234567890'
  is_current   boolean NOT NULL DEFAULT true,
  retired_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz,
  UNIQUE (user_id, version)
);
CREATE UNIQUE INDEX signatures_one_current
  ON signatures(user_id) WHERE is_current;
CREATE TRIGGER signatures_touch BEFORE UPDATE ON signatures
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────
-- 3 · EMR integration — multiple simultaneous systems
--
-- A connection belongs to a practice, not a user, because the credential is
-- a site credential. The consequence the product must handle is that one
-- human patient legitimately exists in several systems under different MRNs.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE emr_connection_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,       -- 'FHIR R4 · SMART Backend Services'
  description text,
  key         text NOT NULL UNIQUE,       -- 'fhir-r4-smart-backend-services'
  schema      jsonb,                      -- per-protocol connection parameters
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);
CREATE TRIGGER emr_connection_types_key BEFORE INSERT OR UPDATE ON emr_connection_types
  FOR EACH ROW EXECUTE FUNCTION derive_type_key();
CREATE TRIGGER emr_connection_types_touch BEFORE UPDATE ON emr_connection_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Each protocol needs genuinely different connection parameters. A FHIR
-- backend-services connection needs an issuer, a JWKS URL and a scope list;
-- an HL7 v2 MLLP link needs a host, a port and a client certificate. Forcing
-- both into one column set produces a table where two-thirds of the columns
-- are NULL for every row and no NOT NULL means anything.
INSERT INTO emr_connection_types (name, description, schema) VALUES
  ('FHIR R4 SMART Backend Services',
   'Server-to-server OAuth 2.0 with a signed JWT assertion. No human in the loop.',
   '{"type":"object",
     "required":["fhir_base_url","token_url","client_id","scopes"],
     "properties":{
       "fhir_base_url":{"type":"string","format":"uri"},
       "token_url":{"type":"string","format":"uri"},
       "client_id":{"type":"string"},
       "jwks_uri":{"type":"string","format":"uri"},
       "scopes":{"type":"array","items":{"type":"string"}},
       "us_core_version":{"type":"string"}}}'::jsonb),

  ('SMART on FHIR user-launched',
   'Per-clinician authorization code flow. Tokens expire and require interactive re-consent.',
   '{"type":"object",
     "required":["fhir_base_url","authorize_url","token_url","client_id"],
     "properties":{
       "fhir_base_url":{"type":"string","format":"uri"},
       "authorize_url":{"type":"string","format":"uri"},
       "token_url":{"type":"string","format":"uri"},
       "client_id":{"type":"string"},
       "redirect_uri":{"type":"string","format":"uri"},
       "requires_interactive_reconsent":{"type":"boolean"}}}'::jsonb),

  ('HL7 v2 MLLP',
   'Legacy message feed over a VPN tunnel with mutual TLS.',
   '{"type":"object",
     "required":["host","port","sending_facility"],
     "properties":{
       "host":{"type":"string"},
       "port":{"type":"number"},
       "sending_facility":{"type":"string"},
       "receiving_application":{"type":"string"},
       "mllp_tls":{"type":"boolean"},
       "message_types":{"type":"array","items":{"type":"string"}}}}'::jsonb),

  ('Vendor REST API',
   'Proprietary vendor API where no standards-based interface is exposed.',
   '{"type":"object",
     "required":["base_url","auth_style"],
     "properties":{
       "base_url":{"type":"string","format":"uri"},
       "auth_style":{"type":"string","enum":["api-key","oauth2","basic"]},
       "vendor_tenant_id":{"type":"string"}}}'::jsonb);

CREATE TABLE emr_connections (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emr_connection_type_id   uuid NOT NULL REFERENCES emr_connection_types(id) ON DELETE RESTRICT,
  practice_id              uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  facility_id              uuid REFERENCES facilities(id) ON DELETE SET NULL,
  name                     text NOT NULL,          -- 'Methodist Southlake · Epic'
  data                     jsonb,                  -- conforms to the type's schema

  vendor                   text NOT NULL,          -- 'Epic', 'AdvancedMD', 'athenahealth'
  status                   text NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','connected','degraded','down','disabled')),
  status_detail            text,                   -- why it is degraded, in plain words
  sync_cadence_minutes     integer CHECK (sync_cadence_minutes > 0),
  last_sync_at             timestamptz,
  last_success_at          timestamptz,
  credentials_expire_at    timestamptz,

  -- Capability flags are first-class columns, not JSONB, because the UI
  -- filters on them and the intake checklist reasons about them: a tenant
  -- that does not expose DocumentReference means imaging reports must be
  -- attached by hand, and that changes what staff are asked to do.
  can_read_clinical        boolean NOT NULL DEFAULT false,
  can_read_documents       boolean NOT NULL DEFAULT false,
  can_write_back           boolean NOT NULL DEFAULT false,
  can_read_schedule        boolean NOT NULL DEFAULT false,
  can_subscribe            boolean NOT NULL DEFAULT false,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz
);
CREATE INDEX emr_connections_practice_ix ON emr_connections(practice_id, status);
CREATE TRIGGER emr_connections_touch BEFORE UPDATE ON emr_connections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER emr_connections_validate_data BEFORE INSERT OR UPDATE ON emr_connections
  FOR EACH ROW EXECUTE FUNCTION validate_typed_payload('emr_connection_types', 'emr_connection_type_id');

-- Secrets live in a secret manager. This table holds only a reference and
-- the metadata needed to warn before an expiry, never the material itself.
CREATE TABLE emr_connection_secrets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emr_connection_id  uuid NOT NULL REFERENCES emr_connections(id) ON DELETE CASCADE,
  user_id            uuid REFERENCES users(id) ON DELETE CASCADE,  -- per-clinician tokens
  secret_ref         text NOT NULL,        -- 'vault://aso/epic-methodist/kjames'
  kind               text NOT NULL CHECK (kind IN ('client_secret','private_key','refresh_token','client_cert')),
  expires_at         timestamptz,
  rotated_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz
);
CREATE INDEX emr_connection_secrets_conn_ix ON emr_connection_secrets(emr_connection_id);
CREATE TRIGGER emr_connection_secrets_touch BEFORE UPDATE ON emr_connection_secrets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────
-- 4 · Patients — one human, many source systems
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE patients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id   uuid NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  family_name   text NOT NULL,
  given_name    text NOT NULL,
  birth_date    date NOT NULL,
  sex_at_birth  text CHECK (sex_at_birth IN ('female','male','intersex','unknown')),
  data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz
);
CREATE INDEX patients_practice_ix ON patients(practice_id);
CREATE INDEX patients_name_trgm   ON patients USING gin ((family_name || ' ' || given_name) gin_trgm_ops);
CREATE TRIGGER patients_touch BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The same human in four systems under four MRNs. `match_status` is the
-- explicit reconciliation state the product surfaces rather than silently
-- merging records — a wrong automatic merge is a patient-safety event.
CREATE TABLE patient_identities (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id         uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  emr_connection_id  uuid NOT NULL REFERENCES emr_connections(id) ON DELETE CASCADE,
  mrn                text NOT NULL,
  fhir_patient_id    text,
  match_status       text NOT NULL DEFAULT 'unreviewed'
                       CHECK (match_status IN ('unreviewed','confirmed','rejected','needs_review')),
  match_confidence   numeric(4,3) CHECK (match_confidence BETWEEN 0 AND 1),
  reconciled_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  reconciled_at      timestamptz,
  last_synced_at     timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz,
  UNIQUE (emr_connection_id, mrn)
);
CREATE INDEX patient_identities_patient_ix ON patient_identities(patient_id);
CREATE INDEX patient_identities_review_ix
  ON patient_identities(match_status) WHERE match_status IN ('unreviewed','needs_review');
CREATE TRIGGER patient_identities_touch BEFORE UPDATE ON patient_identities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────
-- 5 · Payers and policies
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE payers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  key          text NOT NULL UNIQUE,
  payer_type   text NOT NULL DEFAULT 'commercial'
                 CHECK (payer_type IN ('commercial','medicare','medicaid','tricare','workers_comp','self_pay')),
  portal_url   text,
  data         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz
);
CREATE TRIGGER payers_touch BEFORE UPDATE ON payers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE policy_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,        -- 'Medical policy', 'LCD', 'NCD'
  description text,
  key         text NOT NULL UNIQUE,
  schema      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);
CREATE TRIGGER policy_types_key BEFORE INSERT OR UPDATE ON policy_types
  FOR EACH ROW EXECUTE FUNCTION derive_type_key();
CREATE TRIGGER policy_types_touch BEFORE UPDATE ON policy_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Policies are versioned and effective-dated. A letter must be judged against
-- the policy version in force on the date of service, not today's text, so
-- the version is never updated in place.
CREATE TABLE policies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_type_id  uuid NOT NULL REFERENCES policy_types(id) ON DELETE RESTRICT,
  payer_id        uuid NOT NULL REFERENCES payers(id) ON DELETE CASCADE,
  name            text NOT NULL,
  data            jsonb,
  policy_number   text NOT NULL,           -- 'CPB 0743'
  version         text NOT NULL,
  effective_from  date NOT NULL,
  effective_to    date,
  source_url      text,
  source_sha256   bytea,                   -- proof of the exact text retrieved
  retrieved_at    timestamptz,
  is_published    boolean NOT NULL DEFAULT true,   -- false = obtained by request
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz,
  UNIQUE (payer_id, policy_number, version),
  CONSTRAINT policies_effective_range CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE INDEX policies_payer_ix ON policies(payer_id, effective_from DESC);
CREATE TRIGGER policies_touch BEFORE UPDATE ON policies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER policies_validate_data BEFORE INSERT OR UPDATE ON policies
  FOR EACH ROW EXECUTE FUNCTION validate_typed_payload('policy_types', 'policy_type_id');

-- A criterion is one addressable requirement inside a policy section. The
-- letter cites these individually, so they need stable identity, and the
-- gap analysis counts them.
CREATE TABLE policy_criteria (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id     uuid NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  section       text NOT NULL,             -- '3.2'
  ordinal       integer NOT NULL,
  label         text NOT NULL,
  requirement   text NOT NULL,             -- verbatim policy language
  data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_mandatory  boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz,
  UNIQUE (policy_id, section, ordinal)
);
CREATE INDEX policy_criteria_policy_ix ON policy_criteria(policy_id);
CREATE TRIGGER policy_criteria_touch BEFORE UPDATE ON policy_criteria
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────
-- 6 · Authorization cases — the spine of the product
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE case_statuses (
  key       text PRIMARY KEY,
  label     text NOT NULL,
  ordinal   integer NOT NULL UNIQUE,
  is_terminal boolean NOT NULL DEFAULT false
);
INSERT INTO case_statuses (key, label, ordinal, is_terminal) VALUES
  ('intake',        'Intake',                  10, false),
  ('evidence',      'Evidence assembly',       20, false),
  ('policy_review', 'Policy review',           30, false),
  ('awaiting_gate', 'Awaiting surgeon',        40, false),
  ('drafting',      'Drafting',                50, false),
  ('ready',         'Ready to submit',         60, false),
  ('submitted',     'Submitted',               70, false),
  ('peer_review',   'Peer-to-peer',            80, false),
  ('approved',      'Approved',                90, true),
  ('denied',        'Denied',                 100, true),
  ('withdrawn',     'Withdrawn',              110, true);

CREATE TABLE cases (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id         uuid NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  patient_id          uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  surgeon_id          uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  coordinator_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  facility_id         uuid REFERENCES facilities(id) ON DELETE SET NULL,
  payer_id            uuid NOT NULL REFERENCES payers(id) ON DELETE RESTRICT,
  source_connection_id uuid REFERENCES emr_connections(id) ON DELETE SET NULL,

  case_number         text NOT NULL,
  status              text NOT NULL DEFAULT 'intake' REFERENCES case_statuses(key),
  member_id           text,                    -- payer member number
  authorization_number text,                   -- assigned by the payer on approval

  -- The gate outcome. Denormalized onto the case because every downstream
  -- screen asks "is this affirmed" and a join to find out invites a caller
  -- who forgets to ask. Written only by the affirmation transaction.
  gate_affirmed_at    timestamptz,
  gate_affirmed_by    uuid REFERENCES users(id) ON DELETE RESTRICT,

  date_of_service     date,
  data                jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz,

  UNIQUE (practice_id, case_number),
  -- The two gate columns are written together or not at all.
  CONSTRAINT cases_gate_pair CHECK (
    (gate_affirmed_at IS NULL) = (gate_affirmed_by IS NULL))
);
CREATE INDEX cases_queue_ix     ON cases(practice_id, status);
CREATE INDEX cases_surgeon_ix   ON cases(surgeon_id, status);
CREATE INDEX cases_patient_ix   ON cases(patient_id);
CREATE INDEX cases_awaiting_ix  ON cases(surgeon_id) WHERE gate_affirmed_at IS NULL;
CREATE TRIGGER cases_touch BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────
-- 7 · Clinical documents — the archetypal typed table
--
-- An MRI report, an HbA1c result, a supervised-therapy note and an operative
-- report share a lifecycle (retrieved, dated, attributable, attachable) and
-- share almost no fields. This is the case the typed pattern exists for.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE document_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  key         text NOT NULL UNIQUE,
  schema      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);
CREATE TRIGGER document_types_key BEFORE INSERT OR UPDATE ON document_types
  FOR EACH ROW EXECUTE FUNCTION derive_type_key();
CREATE TRIGGER document_types_touch BEFORE UPDATE ON document_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO document_types (name, description, schema) VALUES
  ('MRI Report',
   'Cross-sectional imaging report. The findings block is what the criteria are matched against.',
   '{"type":"object",
     "required":["modality","body_region","impression"],
     "properties":{
       "modality":{"type":"string"},
       "body_region":{"type":"string"},
       "contrast":{"type":"boolean"},
       "levels":{"type":"array","items":{"type":"string"}},
       "impression":{"type":"string"},
       "stenosis_grade":{"type":"string","enum":["none","mild","moderate","severe"]},
       "radiologist_npi":{"type":"string"}}}'::jsonb),

  ('CT Myelogram Report',
   'Contrast myelography. Distinguished from MRI because the surgeon may argue it is the more accurate study for nerve-root stenosis.',
   '{"type":"object",
     "required":["body_region","impression"],
     "properties":{
       "body_region":{"type":"string"},
       "contrast_agent":{"type":"string"},
       "levels":{"type":"array","items":{"type":"string"}},
       "impression":{"type":"string"},
       "root_compression":{"type":"array","items":{"type":"string"}},
       "radiologist_npi":{"type":"string"}}}'::jsonb),

  ('Laboratory Result',
   'A discrete lab value with units and a reference range.',
   '{"type":"object",
     "required":["loinc_code","analyte","value","units"],
     "properties":{
       "loinc_code":{"type":"string"},
       "analyte":{"type":"string"},
       "value":{"type":"number"},
       "units":{"type":"string"},
       "reference_low":{"type":"number"},
       "reference_high":{"type":"number"},
       "abnormal_flag":{"type":"string"},
       "collected_at":{"type":"string","format":"date-time"}}}'::jsonb),

  ('Physical Therapy Note',
   'Supervised therapy documentation. Duration and supervision are what most policies actually require.',
   '{"type":"object",
     "required":["sessions_completed","start_date"],
     "properties":{
       "sessions_completed":{"type":"number"},
       "start_date":{"type":"string","format":"date"},
       "end_date":{"type":"string","format":"date"},
       "supervised":{"type":"boolean"},
       "provider_name":{"type":"string"},
       "modalities":{"type":"array","items":{"type":"string"}},
       "outcome_measure":{"type":"string"},
       "outcome_score":{"type":"number"}}}'::jsonb),

  ('Injection Procedure Note',
   'Epidural or facet injection with the response that determines whether conservative care failed.',
   '{"type":"object",
     "required":["injection_type","performed_on"],
     "properties":{
       "injection_type":{"type":"string"},
       "levels":{"type":"array","items":{"type":"string"}},
       "performed_on":{"type":"string","format":"date"},
       "relief_percent":{"type":"number"},
       "relief_duration_days":{"type":"number"},
       "cpt_code":{"type":"string"}}}'::jsonb),

  ('Operative Report',
   'Prior surgery at or adjacent to the index level.',
   '{"type":"object",
     "required":["performed_on","procedure"],
     "properties":{
       "performed_on":{"type":"string","format":"date"},
       "procedure":{"type":"string"},
       "cpt_codes":{"type":"array","items":{"type":"string"}},
       "levels":{"type":"array","items":{"type":"string"}},
       "surgeon_npi":{"type":"string"}}}'::jsonb),

  ('Office Visit Note',
   'Clinical encounter documenting symptoms, duration and examination findings.',
   '{"type":"object",
     "required":["encounter_date"],
     "properties":{
       "encounter_date":{"type":"string","format":"date"},
       "chief_complaint":{"type":"string"},
       "symptom_duration_weeks":{"type":"number"},
       "neuro_deficit":{"type":"boolean"},
       "exam_findings":{"type":"string"},
       "provider_npi":{"type":"string"}}}'::jsonb);

CREATE TABLE documents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type_id   uuid NOT NULL REFERENCES document_types(id) ON DELETE RESTRICT,
  patient_id         uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  case_id            uuid REFERENCES cases(id) ON DELETE SET NULL,
  name               text NOT NULL,
  data               jsonb,

  -- Shared across every document type.
  effective_date     date NOT NULL,           -- the clinical date, not the retrieval date
  author_name        text,
  author_npi         text,
  source_connection_id uuid REFERENCES emr_connections(id) ON DELETE SET NULL,
  source_system_id   text,                    -- DocumentReference id in the EMR
  storage_uri        text,                    -- object store location of the PDF
  content_sha256     bytea,                   -- integrity, and the basis of custody proof
  page_count         integer CHECK (page_count > 0),
  retrieved_at       timestamptz,
  ingest_method      text NOT NULL DEFAULT 'api'
                       CHECK (ingest_method IN ('api','hl7','manual_upload','fax','scan')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz
);
CREATE INDEX documents_patient_ix ON documents(patient_id, effective_date DESC);
CREATE INDEX documents_case_ix    ON documents(case_id) WHERE case_id IS NOT NULL;
CREATE INDEX documents_type_ix    ON documents(document_type_id);
CREATE INDEX documents_data_gin   ON documents USING gin (data jsonb_path_ops);
CREATE TRIGGER documents_touch BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER documents_validate_data BEFORE INSERT OR UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION validate_typed_payload('document_types', 'document_type_id');


-- ─────────────────────────────────────────────────────────────────────────
-- 8 · Evidence — the three-state model
--
-- met / gap / void are three states, never two. "Not documented" is not a
-- weak "not met": one is a chart that says no, the other is a chart that is
-- silent, and they call for opposite actions — argue, or go obtain.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE evidence_states (
  key      text PRIMARY KEY,
  label    text NOT NULL,
  meaning  text NOT NULL
);
INSERT INTO evidence_states (key, label, meaning) VALUES
  ('met',  'Met',
   'A dated source document satisfies the criterion.'),
  ('gap',  'Not met',
   'A source document exists and it contradicts or falls short of the criterion.'),
  ('void', 'Not documented',
   'No source document addresses the criterion at all. Nothing has been disproved; something must be obtained.');

CREATE TABLE case_evidence (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id             uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  policy_criterion_id uuid NOT NULL REFERENCES policy_criteria(id) ON DELETE RESTRICT,
  state               text NOT NULL REFERENCES evidence_states(key),
  rationale           text,
  data                jsonb NOT NULL DEFAULT '{}'::jsonb,
  assessed_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  assessed_at         timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz,
  UNIQUE (case_id, policy_criterion_id)
);
CREATE INDEX case_evidence_case_ix ON case_evidence(case_id, state);
CREATE TRIGGER case_evidence_touch BEFORE UPDATE ON case_evidence
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The join that makes a summary tile clickable. A tile reads a count from
-- case_evidence; clicking it must land on the specific documents behind that
-- count, with the page and quote that support the claim.
CREATE TABLE evidence_citations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_evidence_id  uuid NOT NULL REFERENCES case_evidence(id) ON DELETE CASCADE,
  document_id       uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  page_number       integer CHECK (page_number > 0),
  quote             text,
  relevance         text NOT NULL DEFAULT 'supports'
                      CHECK (relevance IN ('supports','contradicts','context')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_evidence_id, document_id, page_number)
);
CREATE INDEX evidence_citations_doc_ix ON evidence_citations(document_id);


-- ─────────────────────────────────────────────────────────────────────────
-- 9 · Surgeon annotations
--
-- The one mechanism by which a claim enters a letter without a chart
-- document behind it. That makes provenance load-bearing rather than
-- cosmetic, and it is why this is a separate table from case_evidence: an
-- annotation must never be rendered as though a document said it.
--
-- `is_included` is deliberately separate from existence. A surgeon may record
-- a point for the record, for a peer-to-peer, or for a future appeal without
-- arguing it in this letter. Recording a thought and arguing it are
-- different acts, and the schema should not conflate them.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE annotation_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  key         text NOT NULL UNIQUE,
  schema      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);
CREATE TRIGGER annotation_types_key BEFORE INSERT OR UPDATE ON annotation_types
  FOR EACH ROW EXECUTE FUNCTION derive_type_key();
CREATE TRIGGER annotation_types_touch BEFORE UPDATE ON annotation_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO annotation_types (name, description, schema) VALUES
  ('Modality Superiority',
   'A statement that one imaging modality demonstrates a finding better than another. The CT-myelogram-over-MRI argument is this type.',
   '{"type":"object",
     "required":["preferred_modality","over_modality","finding"],
     "properties":{
       "preferred_modality":{"type":"string"},
       "over_modality":{"type":"string"},
       "finding":{"type":"string"},
       "literature_support":{"type":"array","items":{"type":"string"}}}}'::jsonb),

  ('Clinical Judgment',
   'The treating surgeon''s assessment where the chart is silent or ambiguous.',
   '{"type":"object",
     "required":["assertion"],
     "properties":{
       "assertion":{"type":"string"},
       "basis":{"type":"string","enum":["examination","operative-experience","imaging-review","longitudinal-history"]}}}'::jsonb),

  ('Measurement Correction',
   'A correction to a measurement reported in the chart, with the surgeon''s own value.',
   '{"type":"object",
     "required":["measurement","reported_value","corrected_value"],
     "properties":{
       "measurement":{"type":"string"},
       "reported_value":{"type":"string"},
       "corrected_value":{"type":"string"},
       "method":{"type":"string"}}}'::jsonb),

  ('Contraindication Note',
   'A reason a policy-preferred alternative is unsafe or futile for this patient.',
   '{"type":"object",
     "required":["alternative","reason"],
     "properties":{
       "alternative":{"type":"string"},
       "reason":{"type":"string"},
       "risk_category":{"type":"string"}}}'::jsonb);

CREATE TABLE annotations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annotation_type_id  uuid NOT NULL REFERENCES annotation_types(id) ON DELETE RESTRICT,
  case_id             uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name                text NOT NULL,           -- short label shown on the tile
  data                jsonb,

  body                text NOT NULL,           -- the surgeon's words, verbatim
  -- Attribution is NOT NULL and NOT SET NULL on delete. An annotation whose
  -- author became unknown would be an unattributed clinical claim inside a
  -- letter, which is precisely what this table exists to prevent.
  author_id           uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provenance          text NOT NULL DEFAULT 'surgeon'
                        CHECK (provenance IN ('surgeon')),
  is_included         boolean NOT NULL DEFAULT false,
  included_at         timestamptz,

  -- What the annotation attaches to. Exactly one target, or none (a general
  -- note about the case).
  target_evidence_id  uuid REFERENCES case_evidence(id) ON DELETE CASCADE,
  target_document_id  uuid REFERENCES documents(id) ON DELETE CASCADE,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz,

  CONSTRAINT annotations_single_target CHECK (
    num_nonnulls(target_evidence_id, target_document_id) <= 1),
  CONSTRAINT annotations_included_pair CHECK (
    (is_included = false) OR (included_at IS NOT NULL))
);
CREATE INDEX annotations_case_ix     ON annotations(case_id);
CREATE INDEX annotations_included_ix ON annotations(case_id) WHERE is_included;
CREATE TRIGGER annotations_touch BEFORE UPDATE ON annotations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER annotations_validate_data BEFORE INSERT OR UPDATE ON annotations
  FOR EACH ROW EXECUTE FUNCTION validate_typed_payload('annotation_types', 'annotation_type_id');

-- Only a user holding the clinical `annotate` capability may author one.
CREATE OR REPLACE FUNCTION enforce_annotation_authority()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_capabilities uc
     WHERE uc.user_id = NEW.author_id
       AND uc.capability_key = 'annotate')
  THEN
    RAISE EXCEPTION
      'user % does not hold the annotate capability; a clinical annotation requires it',
      NEW.author_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER annotations_authority BEFORE INSERT OR UPDATE OF author_id ON annotations
  FOR EACH ROW EXECUTE FUNCTION enforce_annotation_authority();


-- ─────────────────────────────────────────────────────────────────────────
-- 10 · Pathways — competing theories of the case
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE pathway_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  key         text NOT NULL UNIQUE,
  schema      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);
CREATE TRIGGER pathway_types_key BEFORE INSERT OR UPDATE ON pathway_types
  FOR EACH ROW EXECUTE FUNCTION derive_type_key();
CREATE TRIGGER pathway_types_touch BEFORE UPDATE ON pathway_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO pathway_types (name, description, schema) VALUES
  ('Decompression Only',
   'Decompression without instrumentation. Fewest criteria, weakest durability argument.',
   '{"type":"object",
     "required":["levels"],
     "properties":{
       "levels":{"type":"array","items":{"type":"string"}},
       "approach":{"type":"string"},
       "facetectomy_extent_percent":{"type":"number"}}}'::jsonb),

  ('Decompression with Fusion',
   'Instrumented fusion. Requires an instability or iatrogenic-instability predicate.',
   '{"type":"object",
     "required":["levels","instability_basis"],
     "properties":{
       "levels":{"type":"array","items":{"type":"string"}},
       "instability_basis":{"type":"string","enum":["translation","angulation","planned-facetectomy","prior-surgery"]},
       "translation_mm":{"type":"number"},
       "facetectomy_extent_percent":{"type":"number"},
       "interbody":{"type":"boolean"}}}'::jsonb),

  ('Continued Conservative Care',
   'The non-operative pathway. Modelled explicitly so the letter can say why it was rejected.',
   '{"type":"object",
     "properties":{
       "additional_weeks":{"type":"number"},
       "modalities":{"type":"array","items":{"type":"string"}},
       "expected_benefit":{"type":"string"}}}'::jsonb);

CREATE TABLE case_pathways (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pathway_type_id  uuid NOT NULL REFERENCES pathway_types(id) ON DELETE RESTRICT,
  case_id          uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name             text NOT NULL,
  data             jsonb,

  rank             integer NOT NULL CHECK (rank > 0),
  criteria_met     integer NOT NULL DEFAULT 0 CHECK (criteria_met >= 0),
  criteria_total   integer NOT NULL DEFAULT 0 CHECK (criteria_total >= 0),
  is_selected      boolean NOT NULL DEFAULT false,
  selected_by      uuid REFERENCES users(id) ON DELETE RESTRICT,
  selected_at      timestamptz,
  rationale        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz,

  UNIQUE (case_id, rank),
  CONSTRAINT case_pathways_counts CHECK (criteria_met <= criteria_total),
  CONSTRAINT case_pathways_selection_pair CHECK (
    (is_selected = false) OR (selected_by IS NOT NULL AND selected_at IS NOT NULL))
);
-- Exactly one selected pathway per case.
CREATE UNIQUE INDEX case_pathways_one_selected
  ON case_pathways(case_id) WHERE is_selected;
CREATE TRIGGER case_pathways_touch BEFORE UPDATE ON case_pathways
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER case_pathways_validate_data BEFORE INSERT OR UPDATE ON case_pathways
  FOR EACH ROW EXECUTE FUNCTION validate_typed_payload('pathway_types', 'pathway_type_id');

CREATE TABLE case_procedure_codes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_pathway_id  uuid NOT NULL REFERENCES case_pathways(id) ON DELETE CASCADE,
  code_system      text NOT NULL CHECK (code_system IN ('CPT','HCPCS','ICD-10-PCS')),
  code             text NOT NULL,
  description      text NOT NULL,
  units            integer NOT NULL DEFAULT 1 CHECK (units > 0),
  is_primary       boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_pathway_id, code_system, code)
);

CREATE TABLE case_diagnosis_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  code_system  text NOT NULL DEFAULT 'ICD-10-CM' CHECK (code_system IN ('ICD-10-CM')),
  code         text NOT NULL,
  description  text NOT NULL,
  ordinal      integer NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, code_system, code)
);


-- ─────────────────────────────────────────────────────────────────────────
-- 11 · The surgeon gate
--
-- Four affirmations, each recorded individually with who and when. The gate
-- is a hard gate enforced in code, not advice: no letter may be signed and
-- no packet submitted until all four exist.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE gate_affirmation_kinds (
  key      text PRIMARY KEY,
  label    text NOT NULL,
  ordinal  integer NOT NULL UNIQUE,
  prompt   text NOT NULL
);
INSERT INTO gate_affirmation_kinds (key, label, ordinal, prompt) VALUES
  ('policy',    'Controlling policy',  1,
   'This is the policy and version that governs this request on the date of service.'),
  ('section',   'Criterion section',   2,
   'This is the section of that policy the request must satisfy.'),
  ('pathway',   'Surgical pathway',    3,
   'This is the operation I intend to perform.'),
  ('plan',      'Operative plan',      4,
   'The described levels, approach and extent match my operative plan.');

CREATE TABLE gate_affirmations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  kind          text NOT NULL REFERENCES gate_affirmation_kinds(key),
  -- RESTRICT, not SET NULL: an affirmation without an affirmer is not a
  -- weaker record, it is a false one.
  affirmed_by   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  affirmed_at   timestamptz NOT NULL DEFAULT now(),

  policy_id           uuid REFERENCES policies(id) ON DELETE RESTRICT,
  policy_section      text,
  case_pathway_id     uuid REFERENCES case_pathways(id) ON DELETE RESTRICT,

  data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, kind)
);
CREATE INDEX gate_affirmations_case_ix ON gate_affirmations(case_id);

-- Only a holder of the clinical `affirm_gate` capability may affirm. This is
-- the safety boundary the role model exists for: an administrator has every
-- configuration power and is refused here.
CREATE OR REPLACE FUNCTION enforce_gate_authority()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_capabilities uc
     WHERE uc.user_id = NEW.affirmed_by
       AND uc.capability_key = 'affirm_gate')
  THEN
    RAISE EXCEPTION
      'user % may not affirm the surgeon gate; affirm_gate is a clinical capability',
      NEW.affirmed_by
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER gate_affirmations_authority BEFORE INSERT OR UPDATE ON gate_affirmations
  FOR EACH ROW EXECUTE FUNCTION enforce_gate_authority();

-- Maintains cases.gate_affirmed_at as a derived fact. All four kinds present
-- sets it; removing any clears it. The denormalized column can therefore
-- never disagree with the affirmations themselves.
CREATE OR REPLACE FUNCTION refresh_case_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_case  uuid := COALESCE(NEW.case_id, OLD.case_id);
  n_kinds      integer;
  n_required   integer;
  last_by      uuid;
  last_at      timestamptz;
BEGIN
  SELECT count(*) INTO n_required FROM gate_affirmation_kinds;
  SELECT count(*), max(affirmed_at) INTO n_kinds, last_at
    FROM gate_affirmations WHERE case_id = target_case;

  IF n_kinds = n_required THEN
    SELECT affirmed_by INTO last_by
      FROM gate_affirmations
     WHERE case_id = target_case
     ORDER BY affirmed_at DESC, kind DESC
     LIMIT 1;
    UPDATE cases
       SET gate_affirmed_at = last_at, gate_affirmed_by = last_by
     WHERE id = target_case;
  ELSE
    UPDATE cases
       SET gate_affirmed_at = NULL, gate_affirmed_by = NULL
     WHERE id = target_case AND gate_affirmed_at IS NOT NULL;
  END IF;

  RETURN NULL;
END;
$$;
CREATE TRIGGER gate_affirmations_refresh
  AFTER INSERT OR UPDATE OR DELETE ON gate_affirmations
  FOR EACH ROW EXECUTE FUNCTION refresh_case_gate();


-- ─────────────────────────────────────────────────────────────────────────
-- 12 · Letters, QA and signature
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE letters (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  version        integer NOT NULL,
  status         text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','in_review','approved','signed','superseded')),
  body_markdown  text NOT NULL,
  rendered_uri   text,
  content_sha256 bytea,
  model_name     text,                    -- which model produced the draft
  model_version  text,
  generated_at   timestamptz,
  approved_by    uuid REFERENCES users(id) ON DELETE RESTRICT,
  approved_at    timestamptz,
  signature_id   uuid REFERENCES signatures(id) ON DELETE RESTRICT,
  signed_at      timestamptz,
  data           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz,
  UNIQUE (case_id, version),
  CONSTRAINT letters_signed_pair CHECK (
    (signed_at IS NULL) = (signature_id IS NULL))
);
CREATE INDEX letters_case_ix ON letters(case_id, version DESC);
CREATE TRIGGER letters_touch BEFORE UPDATE ON letters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A letter cannot be signed before the gate is affirmed. Enforced in the
-- database, so a future API route, a batch job, or a psql session cannot
-- route around the product rule.
CREATE OR REPLACE FUNCTION enforce_letter_signing()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  affirmed  timestamptz;
  signer    uuid;
BEGIN
  IF NEW.signed_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT gate_affirmed_at INTO affirmed FROM cases WHERE id = NEW.case_id;
  IF affirmed IS NULL THEN
    RAISE EXCEPTION
      'case % has not been affirmed at the surgeon gate; a letter may not be signed',
      NEW.case_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT user_id INTO signer FROM signatures WHERE id = NEW.signature_id;
  IF NOT EXISTS (
    SELECT 1 FROM user_capabilities uc
     WHERE uc.user_id = signer AND uc.capability_key = 'sign_letter')
  THEN
    RAISE EXCEPTION
      'user % may not sign a letter of medical necessity', signer
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER letters_signing_rules BEFORE INSERT OR UPDATE ON letters
  FOR EACH ROW EXECUTE FUNCTION enforce_letter_signing();

-- Every factual claim in the letter traces to a document or an annotation.
-- The XOR is the mechanism that stops surgeon opinion from being rendered as
-- though a chart document said it.
CREATE TABLE letter_claims (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_id     uuid NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
  ordinal       integer NOT NULL,
  claim_text    text NOT NULL,
  document_id   uuid REFERENCES documents(id) ON DELETE RESTRICT,
  annotation_id uuid REFERENCES annotations(id) ON DELETE RESTRICT,
  page_number   integer CHECK (page_number > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (letter_id, ordinal),
  CONSTRAINT letter_claims_one_source CHECK (
    num_nonnulls(document_id, annotation_id) = 1)
);
CREATE INDEX letter_claims_letter_ix ON letter_claims(letter_id);

CREATE TABLE qa_check_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  key         text NOT NULL UNIQUE,
  schema      jsonb,
  severity    text NOT NULL DEFAULT 'warning'
                CHECK (severity IN ('blocking','warning','advisory')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);
CREATE TRIGGER qa_check_types_key BEFORE INSERT OR UPDATE ON qa_check_types
  FOR EACH ROW EXECUTE FUNCTION derive_type_key();
CREATE TRIGGER qa_check_types_touch BEFORE UPDATE ON qa_check_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO qa_check_types (name, description, severity, schema) VALUES
  ('Unsupported Claim', 'Every factual claim resolves to a document or an attributed annotation.', 'blocking',
   '{"type":"object","properties":{"claim_ordinals":{"type":"array","items":{"type":"number"}}}}'::jsonb),
  ('Annotation Attribution', 'No annotation is rendered as though a chart document stated it.', 'blocking',
   '{"type":"object","properties":{"annotation_ids":{"type":"array","items":{"type":"string"}}}}'::jsonb),
  ('Criterion Coverage', 'Every mandatory criterion in the affirmed section is addressed.', 'blocking',
   '{"type":"object","properties":{"uncovered":{"type":"array","items":{"type":"string"}}}}'::jsonb),
  ('Policy Version Currency', 'The cited policy version is in force on the date of service.', 'blocking',
   '{"type":"object","properties":{"cited_version":{"type":"string"},"in_force_version":{"type":"string"}}}'::jsonb),
  ('Code Consistency', 'Procedure codes match the affirmed pathway.', 'warning',
   '{"type":"object","properties":{"mismatched_codes":{"type":"array","items":{"type":"string"}}}}'::jsonb),
  ('Date Consistency', 'No cited document post-dates the request.', 'warning',
   '{"type":"object","properties":{"offending_document_ids":{"type":"array","items":{"type":"string"}}}}'::jsonb),
  ('Readability', 'The letter reads as clinical prose, not as a checklist dump.', 'advisory',
   '{"type":"object","properties":{"grade_level":{"type":"number"}}}'::jsonb);

CREATE TABLE letter_qa_results (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_check_type_id uuid NOT NULL REFERENCES qa_check_types(id) ON DELETE RESTRICT,
  letter_id        uuid NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
  name             text NOT NULL,
  data             jsonb,
  outcome          text NOT NULL CHECK (outcome IN ('pass','fail','not_applicable')),
  detail           text,
  evaluated_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz,
  UNIQUE (letter_id, qa_check_type_id)
);
CREATE INDEX letter_qa_letter_ix ON letter_qa_results(letter_id, outcome);
CREATE TRIGGER letter_qa_touch BEFORE UPDATE ON letter_qa_results
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER letter_qa_results_validate_data BEFORE INSERT OR UPDATE ON letter_qa_results
  FOR EACH ROW EXECUTE FUNCTION validate_typed_payload('qa_check_types', 'qa_check_type_id');


-- ─────────────────────────────────────────────────────────────────────────
-- 13 · Submission, receipt and chain of custody
--
-- From the Submission & Receipt Verification addendum. The question is not
-- "did we send it" but "can we prove what the payer received". Every
-- attachment carries a hash and a page count taken at the moment of
-- transmission, so a later dispute is decidable rather than a matter of
-- recollection.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE submission_channel_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,        -- 'Payer portal', 'Fax', 'X12 278'
  description text,
  key         text NOT NULL UNIQUE,
  schema      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);
CREATE TRIGGER submission_channel_types_key BEFORE INSERT OR UPDATE ON submission_channel_types
  FOR EACH ROW EXECUTE FUNCTION derive_type_key();
CREATE TRIGGER submission_channel_types_touch BEFORE UPDATE ON submission_channel_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Each channel yields a genuinely different receipt artifact, which is why
-- this is typed: a fax gives a transmission report with a page count, a
-- portal gives a confirmation number and a screenshot, X12 gives a 278
-- response with a trace number. Flattening them loses the proof.
INSERT INTO submission_channel_types (name, description, schema) VALUES
  ('Payer Portal',
   'Interactive web upload. Proof is a confirmation number and a captured screenshot.',
   '{"type":"object",
     "required":["portal_url","confirmation_number"],
     "properties":{
       "portal_url":{"type":"string","format":"uri"},
       "confirmation_number":{"type":"string"},
       "screenshot_uri":{"type":"string"},
       "submitted_by_username":{"type":"string"}}}'::jsonb),

  ('Fax',
   'Proof is the transmission report: remote CSID, page count and result.',
   '{"type":"object",
     "required":["destination_number","pages_sent","result"],
     "properties":{
       "destination_number":{"type":"string"},
       "pages_sent":{"type":"number"},
       "result":{"type":"string","enum":["ok","partial","failed"]},
       "remote_csid":{"type":"string"},
       "transmission_report_uri":{"type":"string"}}}'::jsonb),

  ('X12 278 Transaction',
   'EDI prior-authorization request. Proof is the 278 response and its trace number.',
   '{"type":"object",
     "required":["trace_number","clearinghouse"],
     "properties":{
       "trace_number":{"type":"string"},
       "clearinghouse":{"type":"string"},
       "isa_control_number":{"type":"string"},
       "response_code":{"type":"string"}}}'::jsonb),

  ('Secure Email',
   'Encrypted email with a delivery receipt.',
   '{"type":"object",
     "required":["recipient","message_id"],
     "properties":{
       "recipient":{"type":"string"},
       "message_id":{"type":"string"},
       "delivery_receipt_at":{"type":"string","format":"date-time"}}}'::jsonb);

CREATE TABLE submissions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_channel_type_id  uuid NOT NULL REFERENCES submission_channel_types(id) ON DELETE RESTRICT,
  case_id                     uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  letter_id                   uuid NOT NULL REFERENCES letters(id) ON DELETE RESTRICT,
  name                        text NOT NULL,
  data                        jsonb,

  attempt                     integer NOT NULL DEFAULT 1 CHECK (attempt > 0),
  submitted_by                uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at                timestamptz NOT NULL DEFAULT now(),
  status                      text NOT NULL DEFAULT 'sent'
                                CHECK (status IN ('sent','acknowledged','rejected','disputed','superseded')),
  manifest_sha256             bytea NOT NULL,     -- hash over the ordered attachment manifest
  total_pages                 integer NOT NULL CHECK (total_pages > 0),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz,
  UNIQUE (case_id, attempt)
);
CREATE INDEX submissions_case_ix ON submissions(case_id, submitted_at DESC);
CREATE TRIGGER submissions_touch BEFORE UPDATE ON submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER submissions_validate_data BEFORE INSERT OR UPDATE ON submissions
  FOR EACH ROW EXECUTE FUNCTION validate_typed_payload('submission_channel_types', 'submission_channel_type_id');

-- A submission may only carry a signed letter for an affirmed case.
CREATE OR REPLACE FUNCTION enforce_submission_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  sig  uuid;
BEGIN
  SELECT signature_id INTO sig FROM letters WHERE id = NEW.letter_id;
  IF sig IS NULL THEN
    RAISE EXCEPTION
      'letter % is not signed; it may not be submitted to a payer', NEW.letter_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER submissions_gate BEFORE INSERT ON submissions
  FOR EACH ROW EXECUTE FUNCTION enforce_submission_gate();

-- The manifest. bates_start/bates_end plus the hash taken at transmission
-- are what make a later "we never received page 14" dispute decidable.
CREATE TABLE submission_attachments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  document_id    uuid REFERENCES documents(id) ON DELETE RESTRICT,
  letter_id      uuid REFERENCES letters(id) ON DELETE RESTRICT,
  ordinal        integer NOT NULL,
  label          text NOT NULL,
  page_count     integer NOT NULL CHECK (page_count > 0),
  bates_start    text,
  bates_end      text,
  content_sha256 bytea NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, ordinal),
  CONSTRAINT submission_attachments_one_source CHECK (
    num_nonnulls(document_id, letter_id) = 1)
);
CREATE INDEX submission_attachments_sub_ix ON submission_attachments(submission_id);

CREATE TABLE receipts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id      uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  received_at        timestamptz,
  payer_reference    text,
  acknowledged_pages integer CHECK (acknowledged_pages >= 0),
  raw_response_uri   text,
  raw_response_sha256 bytea,
  recorded_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  data               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz
);
CREATE INDEX receipts_submission_ix ON receipts(submission_id);
CREATE TRIGGER receipts_touch BEFORE UPDATE ON receipts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Per-item acknowledgement. A payer that acknowledges 38 of 42 pages leaves
-- four disputed items, and those four are what staff chase.
CREATE TABLE receipt_items (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id                uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  submission_attachment_id  uuid NOT NULL REFERENCES submission_attachments(id) ON DELETE RESTRICT,
  state                     text NOT NULL DEFAULT 'unconfirmed'
                              CHECK (state IN ('acknowledged','disputed','unconfirmed')),
  payer_page_count          integer CHECK (payer_page_count >= 0),
  note                      text,
  resolved_at               timestamptz,
  resolved_by               uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz,
  UNIQUE (receipt_id, submission_attachment_id)
);
CREATE INDEX receipt_items_disputed_ix ON receipt_items(receipt_id) WHERE state = 'disputed';
CREATE TRIGGER receipt_items_touch BEFORE UPDATE ON receipt_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Append-only custody chain. Each row hashes the previous row's hash, so a
-- silent edit anywhere in the chain breaks verification from that point on.
CREATE TABLE custody_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  sequence       integer NOT NULL,
  event          text NOT NULL
                   CHECK (event IN ('assembled','sealed','transmitted','acknowledged','disputed','resolved')),
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  actor_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_label    text NOT NULL,             -- survives actor deletion
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_hash  bytea,
  entry_hash     bytea NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, sequence)
);
CREATE INDEX custody_events_sub_ix ON custody_events(submission_id, sequence);

CREATE OR REPLACE FUNCTION custody_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'custody_events is append-only; % is not permitted', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER custody_events_immutable BEFORE UPDATE OR DELETE ON custody_events
  FOR EACH ROW EXECUTE FUNCTION custody_append_only();


-- ─────────────────────────────────────────────────────────────────────────
-- 14 · Peer-to-peer and reviewer accountability
--
-- From the Reviewer Identity & Accountability addendum. A denial issued by
-- an unnamed reviewer, or by one whose specialty does not match the surgery,
-- is a fact the practice should be able to assert with evidence.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE reviewers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_id           uuid NOT NULL REFERENCES payers(id) ON DELETE CASCADE,
  full_name          text,                      -- NULL when the payer refused to name them
  npi                text,
  specialty          text,
  board_certified    boolean,
  license_state      text,
  license_number     text,
  -- The accountability question in one column: same-specialty review is what
  -- most state statutes and the practice's appeal argument turn on.
  specialty_matches  boolean,
  identity_disclosed boolean NOT NULL DEFAULT false,
  verified_at        timestamptz,
  verified_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  verification_source text,                     -- 'NPPES', 'state board', 'payer attestation'
  data               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz
);
CREATE INDEX reviewers_payer_ix ON reviewers(payer_id);
CREATE TRIGGER reviewers_touch BEFORE UPDATE ON reviewers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE peer_reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  submission_id  uuid REFERENCES submissions(id) ON DELETE SET NULL,
  reviewer_id    uuid REFERENCES reviewers(id) ON DELETE SET NULL,
  surgeon_id     uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  scheduled_for  timestamptz,
  occurred_at    timestamptz,
  duration_minutes integer CHECK (duration_minutes > 0),
  outcome        text CHECK (outcome IN ('overturned','upheld','partial','deferred','not_held')),
  outcome_detail text,
  recording_uri  text,
  notes          text,
  data           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz
);
CREATE INDEX peer_reviews_case_ix ON peer_reviews(case_id);
CREATE TRIGGER peer_reviews_touch BEFORE UPDATE ON peer_reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE determinations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  submission_id  uuid REFERENCES submissions(id) ON DELETE SET NULL,
  peer_review_id uuid REFERENCES peer_reviews(id) ON DELETE SET NULL,
  reviewer_id    uuid REFERENCES reviewers(id) ON DELETE SET NULL,
  outcome        text NOT NULL CHECK (outcome IN ('approved','denied','partial','pended','withdrawn')),
  decided_on     date NOT NULL,
  reason_code    text,
  reason_text    text,
  authorization_number text,
  valid_from     date,
  valid_to       date,
  appeal_deadline date,
  document_id    uuid REFERENCES documents(id) ON DELETE SET NULL,
  data           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz
);
CREATE INDEX determinations_case_ix ON determinations(case_id, decided_on DESC);
CREATE TRIGGER determinations_touch BEFORE UPDATE ON determinations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────
-- 15 · Audit
--
-- Append-only, and deliberately denormalized. actor_label and actor_role are
-- stored as text at the time of the act so the log still reads correctly
-- after a user is deleted or their role changes — an audit entry that says
-- "Staff did X" because the person was demoted last year is a false record.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE audit_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  practice_id   uuid REFERENCES practices(id) ON DELETE SET NULL,
  occurred_at   timestamptz NOT NULL DEFAULT now(),

  actor_id            uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_kratos_id     uuid,
  actor_label         text NOT NULL,
  actor_role          text NOT NULL,
  actor_ip            inet,
  actor_user_agent    text,

  action        text NOT NULL,              -- 'gate.affirm', 'letter.sign'
  outcome       text NOT NULL DEFAULT 'success'
                  CHECK (outcome IN ('success','denied','error')),
  entity_table  text NOT NULL,
  entity_id     uuid,
  case_id       uuid REFERENCES cases(id) ON DELETE SET NULL,
  summary       text NOT NULL,
  data          jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_events_case_ix    ON audit_events(case_id, occurred_at DESC);
CREATE INDEX audit_events_actor_ix   ON audit_events(actor_id, occurred_at DESC);
CREATE INDEX audit_events_action_ix  ON audit_events(action, occurred_at DESC);
CREATE INDEX audit_events_denied_ix  ON audit_events(occurred_at DESC) WHERE outcome = 'denied';

CREATE OR REPLACE FUNCTION audit_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only; % is not permitted', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_append_only();


-- ─────────────────────────────────────────────────────────────────────────
-- 16 · Row-level security
--
-- Tenancy is enforced by the database, not only by the application. The
-- current user's Kratos identity arrives as a session GUC set by the API on
-- connection checkout: SET LOCAL aso.kratos_identity_id = '<uuid>'.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT u.id
    FROM users u
   WHERE u.kratos_identity_id =
         NULLIF(current_setting('aso.kratos_identity_id', true), '')::uuid
     AND u.status = 'active';
$$;

CREATE OR REPLACE FUNCTION current_app_practice_ids()
RETURNS setof uuid
LANGUAGE sql
STABLE
AS $$
  SELECT ur.practice_id
    FROM user_roles ur
   WHERE ur.user_id = current_app_user_id();
$$;

ALTER TABLE cases        ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients     ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY cases_tenant ON cases
  USING (practice_id IN (SELECT current_app_practice_ids()));

CREATE POLICY patients_tenant ON patients
  USING (practice_id IN (SELECT current_app_practice_ids()));

CREATE POLICY documents_tenant ON documents
  USING (patient_id IN (
    SELECT p.id FROM patients p
     WHERE p.practice_id IN (SELECT current_app_practice_ids())));

CREATE POLICY annotations_tenant ON annotations
  USING (case_id IN (
    SELECT c.id FROM cases c
     WHERE c.practice_id IN (SELECT current_app_practice_ids())));

-- Audit is readable only by holders of view_audit, and never writable
-- through a policy: the application writes it with an elevated role.
CREATE POLICY audit_read ON audit_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_capabilities uc
     WHERE uc.user_id = current_app_user_id()
       AND uc.capability_key = 'view_audit'
       AND uc.practice_id = audit_events.practice_id));


-- ─────────────────────────────────────────────────────────────────────────
-- 17 · Reporting views
-- ─────────────────────────────────────────────────────────────────────────

-- The dashboard queue, including the gap/void split that drives the tiles.
CREATE VIEW case_queue AS
SELECT c.id                      AS case_id,
       c.case_number,
       c.status,
       cs.label                  AS status_label,
       p.family_name || ', ' || p.given_name AS patient_name,
       py.name                   AS payer_name,
       u.full_name               AS surgeon_name,
       c.gate_affirmed_at,
       count(*) FILTER (WHERE ce.state = 'met')  AS criteria_met,
       count(*) FILTER (WHERE ce.state = 'gap')  AS criteria_gap,
       count(*) FILTER (WHERE ce.state = 'void') AS criteria_void,
       count(a.id) FILTER (WHERE a.is_included)  AS included_annotations
  FROM cases c
  JOIN case_statuses cs ON cs.key = c.status
  JOIN patients p       ON p.id = c.patient_id
  JOIN payers py        ON py.id = c.payer_id
  JOIN users u          ON u.id = c.surgeon_id
  LEFT JOIN case_evidence ce ON ce.case_id = c.id
  LEFT JOIN annotations   a  ON a.case_id  = c.id
 GROUP BY c.id, cs.label, p.family_name, p.given_name, py.name, u.full_name;

-- Gate readiness: which of the four affirmations are outstanding.
CREATE VIEW gate_readiness AS
SELECT c.id AS case_id,
       k.key AS kind,
       k.label,
       (ga.id IS NOT NULL) AS affirmed,
       ga.affirmed_at,
       ga.affirmed_by
  FROM cases c
 CROSS JOIN gate_affirmation_kinds k
  LEFT JOIN gate_affirmations ga ON ga.case_id = c.id AND ga.kind = k.key;

-- Disputed custody items — the receipt-verification worklist.
CREATE VIEW disputed_items AS
SELECT s.case_id,
       s.id AS submission_id,
       sa.label,
       sa.page_count      AS sent_pages,
       ri.payer_page_count AS acknowledged_pages,
       ri.note,
       ri.created_at
  FROM receipt_items ri
  JOIN receipts r                ON r.id  = ri.receipt_id
  JOIN submissions s             ON s.id  = r.submission_id
  JOIN submission_attachments sa ON sa.id = ri.submission_attachment_id
 WHERE ri.state = 'disputed' AND ri.resolved_at IS NULL;

COMMIT;
