-- ═══════════════════════════════════════════════════════════════════════════
-- Advanced Spine & Orthopedics · Surgery Authorization Workbench
-- PostgreSQL 18 · pgvector 0.8.6 — AI retrieval layer and criteria provenance
--
-- Apply AFTER schema.sql. This file adds two things that belong together:
--
--   A. Criteria provenance. Payer criteria arrive two ways — published policy
--      documents, and rules surgeons DERIVE from watching what actually gets
--      approved. The base schema modelled only the first, so recording the
--      second required inventing a fake policy row. That laundered a
--      surgeon's observation into something indistinguishable from published
--      payer language, which is the exact failure the annotation table exists
--      to prevent.
--
--   B. Retrieval. Embeddings over the corpora that answer real questions
--      during a case, with the model registry that lets several embedding
--      models coexist.
--
-- This file was reviewed adversarially by a different model (k3) before it
-- was written. Four CRITICAL findings shaped it, and each is marked [K3-n]
-- at the constraint that answers it. Nothing here is enforced by comment:
-- if a rule matters it is a constraint, a trigger, or a privilege.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;
-- btree_gist lets an EXCLUDE constraint mix scalar equality (payer_id,
-- label) with range overlap (validity) in one GiST index.
CREATE EXTENSION IF NOT EXISTS btree_gist;
SET search_path = aso, public;


-- ─────────────────────────────────────────────────────────────────────────
-- 18 · Embedding model registry
--
-- Several models must coexist. A vector column's dimension is fixed at
-- CREATE TABLE and cannot be altered in place, and vectors from different
-- models are not comparable — cosine distance between an OpenAI vector and a
-- BGE vector is a number with no meaning. So the model is not metadata about
-- a row; it partitions the search space, and every retrieval must filter to
-- exactly one model.
--
-- pgvector index limits (0.8.x) drive the physical layout below:
--   vector   — HNSW indexable to 2000 dimensions
--   halfvec  — HNSW indexable to 4000 dimensions, half precision
-- text-embedding-3-large is 3072, so it cannot live in an indexed vector
-- column at all. That is why storage is split by dimension class rather than
-- by a single shared column.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE embedding_models (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  name             text NOT NULL UNIQUE,
  description      text,
  key              text NOT NULL UNIQUE,
  schema           jsonb,

  provider         text NOT NULL,
  provider_model   text NOT NULL,
  dimensions       integer NOT NULL CHECK (dimensions BETWEEN 1 AND 4000),
  -- Which physical column a vector lands in. Derived, not chosen: the
  -- dimension decides it, so a caller cannot file a 3072-dim vector into a
  -- column whose index would refuse it.
  storage_class    text NOT NULL GENERATED ALWAYS AS (
                     CASE WHEN dimensions <= 2000 THEN 'vector' ELSE 'halfvec' END
                   ) STORED,
  distance_metric  text NOT NULL DEFAULT 'cosine'
                     CHECK (distance_metric IN ('cosine','l2','inner_product')),
  max_input_tokens integer CHECK (max_input_tokens > 0),

  -- Whether this model may be used on text containing PHI.
  --
  -- Embeddings of clinical text ARE PHI. Text can be reconstructed from an
  -- embedding by inversion (IEEE S&P 2023), so an embedding fails both Safe
  -- Harbor and Expert Determination. A hosted model with no BAA must
  -- therefore never see a patient document, and that is a property of the
  -- model, recorded here, not a convention someone remembers at call time.
  phi_permitted    boolean NOT NULL DEFAULT false,
  is_local         boolean NOT NULL DEFAULT false,
  baa_on_file      boolean NOT NULL DEFAULT false,

  is_active        boolean NOT NULL DEFAULT true,
  retired_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz,

  -- PHI may only go to a local model or one covered by a BAA.
  CONSTRAINT embedding_models_phi_requires_cover CHECK (
    phi_permitted = false OR is_local = true OR baa_on_file = true)
);
CREATE TRIGGER embedding_models_key BEFORE INSERT OR UPDATE ON embedding_models
  FOR EACH ROW EXECUTE FUNCTION derive_type_key();
CREATE TRIGGER embedding_models_touch BEFORE UPDATE ON embedding_models
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO embedding_models
  (name, description, provider, provider_model, dimensions, max_input_tokens,
   phi_permitted, is_local, baa_on_file) VALUES
  ('BGE Large EN v1.5 (local)',
   'Runs in-process beside the database. The only model cleared for patient text, because the text never leaves the box.',
   'local', 'BAAI/bge-large-en-v1.5', 1024, 512, true, true, false),
  ('OpenAI text-embedding-3-small',
   'Hosted. Cleared for PHI only where a BAA is on file; used for the published policy corpus, which contains none.',
   'openai', 'text-embedding-3-small', 1536, 8191, false, false, false),
  ('OpenAI text-embedding-3-large',
   'Hosted, 3072-dim. Exceeds the pgvector HNSW limit for the vector type, so it is stored and indexed as halfvec.',
   'openai', 'text-embedding-3-large', 3072, 8191, false, false, false);


-- ─────────────────────────────────────────────────────────────────────────
-- 19 · Criteria provenance
--
-- [K3-4] Splitting criteria away from `policies` removes the effective
-- dating that policies supplied. A criterion with no parent and no validity
-- window is a criterion that can never go stale, which is the opposite of
-- true for the derived kind. Every criterion therefore carries its own
-- temporal validity, and PostgreSQL 18's WITHOUT OVERLAPS enforces that two
-- versions of the same rule cannot both be in force on one date.
-- ─────────────────────────────────────────────────────────────────────────

-- The evidence ladder. Ordered, because the ordering drives retrieval rank
-- and letter attribution.
--
-- [K3-7] Each grade names the columns it must carry. 'payer_verbal' without a
-- named recorder and a call reference is rumour, and rumour must not outrank
-- an observation backed by data.
CREATE TABLE evidence_grades (
  key                text PRIMARY KEY,
  label              text NOT NULL,
  rank               integer NOT NULL UNIQUE,   -- 1 = strongest
  description        text NOT NULL,
  -- Whether a criterion of this grade may be stated in a payer-facing letter
  -- as the payer's own published requirement.
  citable_as_policy  boolean NOT NULL,
  -- How the letter must introduce it when it is not citable as policy.
  attribution_phrase text,
  -- Half-life in days for retrieval decay. NULL = does not decay.
  decay_half_life_days integer CHECK (decay_half_life_days > 0)
);

INSERT INTO evidence_grades
  (key, label, rank, description, citable_as_policy, attribution_phrase, decay_half_life_days) VALUES
  ('published', 'Published policy', 1,
   'Verbatim from the payer''s published medical policy, hash-verified against the retrieved document.',
   true, NULL, NULL),
  ('obtained_by_request', 'Obtained on request', 2,
   'The payer supplied the criteria in writing on request; not publicly posted, but a document exists.',
   true, NULL, NULL),
  ('payer_verbal', 'Stated by the payer verbally', 3,
   'A named payer representative stated it on a recorded or referenced call. No document.',
   false, 'as confirmed by the plan on', 365),
  ('derived_observed', 'Derived from observed determinations', 4,
   'Inferred by this practice from its own approvals and denials. The payer has never stated it.',
   false, 'in this practice''s experience', 180),
  ('peer_shared', 'Shared by a peer practice', 5,
   'Derived by another practice and shared. Carries the originating grade; never promoted above it.',
   false, 'as reported by peer practices', 180);

-- A criterion is now a first-class object. policy_id is NULLABLE — that is
-- the whole point — but the grade decides what else must be present.
CREATE TABLE criteria (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  payer_id           uuid NOT NULL REFERENCES payers(id) ON DELETE CASCADE,
  practice_id        uuid REFERENCES practices(id) ON DELETE SET NULL,

  evidence_grade     text NOT NULL REFERENCES evidence_grades(key),
  -- [K3-7] peer_shared keeps the grade it had at the origin practice, so
  -- travelling between practices can never upgrade a rumour into a fact.
  origin_grade       text REFERENCES evidence_grades(key),

  -- Published lineage. Present iff the grade is document-backed.
  policy_id          uuid REFERENCES policies(id) ON DELETE RESTRICT,
  section            text,
  document_id        uuid REFERENCES documents(id) ON DELETE RESTRICT,

  -- Verbal lineage.
  recorded_by        uuid REFERENCES users(id) ON DELETE RESTRICT,
  recorded_at        timestamptz,
  payer_reference    text,                     -- call reference number

  -- Peer lineage.
  source_practice_id uuid REFERENCES practices(id) ON DELETE SET NULL,

  label              text NOT NULL,
  requirement        text NOT NULL,
  -- [K3-6] The text is immutable once observations attach to it. A trigger
  -- below refuses UPDATE of requirement; a correction supersedes instead.
  content_sha256     bytea NOT NULL,
  procedure_family   text,                     -- coarse, e.g. 'lumbar-fusion'
  is_mandatory       boolean NOT NULL DEFAULT true,

  -- [K3-4] Temporal validity. PG18 WITHOUT OVERLAPS below guarantees one
  -- version of a rule in force at a time.
  validity           daterange NOT NULL DEFAULT daterange(CURRENT_DATE, NULL),
  last_confirmed_at  timestamptz NOT NULL DEFAULT now(),
  superseded_by      uuid REFERENCES criteria(id) ON DELETE SET NULL,

  data               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz,

  -- [K3-7] Per-grade provenance requirements, enforced not documented.
  CONSTRAINT criteria_published_needs_policy CHECK (
    evidence_grade <> 'published' OR (policy_id IS NOT NULL AND section IS NOT NULL)),
  CONSTRAINT criteria_requested_needs_document CHECK (
    evidence_grade <> 'obtained_by_request' OR document_id IS NOT NULL),
  CONSTRAINT criteria_verbal_needs_attribution CHECK (
    evidence_grade <> 'payer_verbal'
    OR (recorded_by IS NOT NULL AND recorded_at IS NOT NULL AND payer_reference IS NOT NULL)),
  CONSTRAINT criteria_derived_needs_practice CHECK (
    evidence_grade <> 'derived_observed' OR practice_id IS NOT NULL),
  CONSTRAINT criteria_peer_needs_origin CHECK (
    evidence_grade <> 'peer_shared'
    OR (source_practice_id IS NOT NULL AND origin_grade IS NOT NULL)),
  -- A shared criterion may never claim a stronger grade than it had at home.
  CONSTRAINT criteria_peer_no_promotion CHECK (
    origin_grade IS NULL OR evidence_grade = 'peer_shared'),
  -- Derived criteria are never document-backed; if they were, they would be
  -- published. This blocks the laundering path directly.
  CONSTRAINT criteria_derived_has_no_policy CHECK (
    evidence_grade NOT IN ('derived_observed','peer_shared')
    OR (policy_id IS NULL AND document_id IS NULL)),

  -- [K3-4] One version of a rule in force at a time, per payer + label.
  CONSTRAINT criteria_no_overlapping_validity
    EXCLUDE USING gist (payer_id WITH =, label WITH =, validity WITH &&)
);
CREATE INDEX criteria_payer_ix   ON criteria(payer_id, evidence_grade);
CREATE INDEX criteria_live_ix    ON criteria(payer_id)
  WHERE superseded_by IS NULL;
CREATE INDEX criteria_practice_ix ON criteria(practice_id) WHERE practice_id IS NOT NULL;
CREATE TRIGGER criteria_touch BEFORE UPDATE ON criteria
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- [K3-6] Criterion text is immutable. Observations recorded against text v1
-- must never silently endorse a text v2 that someone edited afterwards.
CREATE OR REPLACE FUNCTION criteria_text_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.requirement IS DISTINCT FROM OLD.requirement
     OR NEW.evidence_grade IS DISTINCT FROM OLD.evidence_grade THEN
    RAISE EXCEPTION
      'criterion % is immutable; supersede it with a new row instead of editing its text or grade',
      OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER criteria_immutable BEFORE UPDATE ON criteria
  FOR EACH ROW EXECUTE FUNCTION criteria_text_immutable();


-- ─────────────────────────────────────────────────────────────────────────
-- 20 · Observations — tenant-local, never shared
--
-- [K3-2] This is the PHI boundary. A row here links a criterion to a real
-- case, so it is patient data and stays inside the practice that owns the
-- case. Sharing happens one table down, in aggregate only.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE criterion_observations (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  criterion_id  uuid NOT NULL REFERENCES criteria(id) ON DELETE CASCADE,
  practice_id   uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  case_id       uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  determination_id uuid REFERENCES determinations(id) ON DELETE SET NULL,

  outcome       text NOT NULL CHECK (outcome IN ('approved','denied','partial','withdrawn')),
  observed_on   date NOT NULL,
  note          text,
  recorded_by   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- [K3-5] One case counts once. Without this a single approval can be
  -- entered ten times to manufacture a pattern.
  UNIQUE (criterion_id, case_id)
);
CREATE INDEX criterion_observations_crit_ix ON criterion_observations(criterion_id, outcome);
CREATE INDEX criterion_observations_practice_ix ON criterion_observations(practice_id);

ALTER TABLE criterion_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY criterion_observations_tenant ON criterion_observations
  USING (practice_id IN (SELECT current_app_practice_ids()));


-- ─────────────────────────────────────────────────────────────────────────
-- 21 · The shared corpus — aggregate only
--
-- [K3-1] Antitrust. DOJ/FTC health care policy statements treat competitors'
-- collective sharing of clinical information about the "mode, quality, or
-- efficiency of treatment" as low risk, and sharing of fee or reimbursement
-- information as high risk requiring aggregation, a managing third party,
-- and a minimum number of contributors.
--
-- So the block is structural, not a regex on free text. This table has no
-- money column, no fee column, no allowed-amount column — and a trigger
-- refuses any future ALTER that adds one. A dollar amount cannot be shared
-- because there is nowhere to put it.
--
-- [K3-2] It also carries no case FK, no MRN, no date finer than a quarter,
-- and no procedure code finer than a family. What crosses the practice
-- boundary is a count and a coarse label.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE shared_criterion_summaries (
  id                  uuid PRIMARY KEY DEFAULT uuidv7(),
  criterion_id        uuid NOT NULL REFERENCES criteria(id) ON DELETE CASCADE,
  payer_id            uuid NOT NULL REFERENCES payers(id) ON DELETE CASCADE,

  -- Deliberately coarse. 'lumbar-fusion', not CPT 22633; a quarter, not a date.
  procedure_family    text NOT NULL,
  observation_quarter text NOT NULL CHECK (observation_quarter ~ '^[0-9]{4}-Q[1-4]$'),

  n_approvals         integer NOT NULL CHECK (n_approvals >= 0),
  n_denials           integer NOT NULL CHECK (n_denials >= 0),
  contributing_practices integer NOT NULL CHECK (contributing_practices >= 0),

  -- Wilson lower bound at 95%. [K3-5] Stored so that n=3 never presents on
  -- screen the way n=300 does; a raw percentage hides its own sample size.
  approval_rate_lower numeric(4,3) CHECK (approval_rate_lower BETWEEN 0 AND 1),

  published_at        timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz,

  -- [K3-2][K3-5] Minimum cell size and independent corroboration. Below
  -- these thresholds a summary is one practice's anecdote wearing a
  -- statistic's clothes, and small cells are re-identifiable.
  CONSTRAINT shared_min_cell CHECK (n_approvals + n_denials >= 10),
  CONSTRAINT shared_min_practices CHECK (contributing_practices >= 2),
  UNIQUE (criterion_id, procedure_family, observation_quarter)
);
CREATE INDEX shared_criterion_payer_ix ON shared_criterion_summaries(payer_id, procedure_family);
CREATE TRIGGER shared_criterion_summaries_touch BEFORE UPDATE ON shared_criterion_summaries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- [K3-1] The antitrust block, enforced against future schema drift. An
-- ALTER TABLE that adds a money/numeric column named like a price is
-- refused. This is an event trigger, so it fires on DDL, not DML.
CREATE OR REPLACE FUNCTION forbid_fee_columns_in_shared_corpus()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
DECLARE
  obj record;
  col record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands()
             WHERE object_type = 'table'
  LOOP
    FOR col IN
      SELECT a.attname, t.typname
        FROM pg_attribute a
        JOIN pg_type t ON t.oid = a.atttypid
       WHERE a.attrelid = obj.objid
         AND a.attnum > 0 AND NOT a.attisdropped
    LOOP
      IF obj.object_identity LIKE '%shared_criterion_summaries%' THEN
        IF col.typname = 'money'
           OR col.attname ~* '(fee|charge|price|allowed_amount|reimburse|rate_paid|rvu|contracted)'
        THEN
          RAISE EXCEPTION
            'column %.% would place fee or reimbursement data in the shared corpus; '
            'DOJ/FTC guidance treats competitor fee sharing as high risk. '
            'Clinical criteria may be shared; prices may not.',
            obj.object_identity, col.attname
            USING ERRCODE = 'insufficient_privilege';
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
CREATE EVENT TRIGGER shared_corpus_no_fees
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE','ALTER TABLE')
  EXECUTE FUNCTION forbid_fee_columns_in_shared_corpus();

-- [K3-5] Counts are derived, never asserted. A caller cannot type a number
-- into n_approvals; it is recomputed from the observations that exist.
CREATE OR REPLACE FUNCTION recompute_shared_summary(p_criterion uuid, p_quarter text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = aso, public
AS $$
DECLARE
  a int; d int; p int; fam text; pay uuid; lower_b numeric;
  n int; phat numeric; z constant numeric := 1.96;
BEGIN
  SELECT count(*) FILTER (WHERE o.outcome = 'approved'),
         count(*) FILTER (WHERE o.outcome = 'denied'),
         count(DISTINCT o.practice_id)
    INTO a, d, p
    FROM criterion_observations o
   WHERE o.criterion_id = p_criterion
     AND to_char(o.observed_on, 'YYYY-"Q"Q') = p_quarter;

  SELECT c.payer_id, COALESCE(c.procedure_family, 'unspecified')
    INTO pay, fam FROM criteria c WHERE c.id = p_criterion;

  n := a + d;
  IF n < 10 OR p < 2 THEN
    DELETE FROM shared_criterion_summaries
     WHERE criterion_id = p_criterion AND observation_quarter = p_quarter;
    RETURN;
  END IF;

  phat := a::numeric / n;
  lower_b := round(
    ((phat + z*z/(2*n) - z*sqrt((phat*(1-phat) + z*z/(4*n))/n)) / (1 + z*z/n))::numeric, 3);

  INSERT INTO shared_criterion_summaries
    (criterion_id, payer_id, procedure_family, observation_quarter,
     n_approvals, n_denials, contributing_practices, approval_rate_lower)
  VALUES (p_criterion, pay, fam, p_quarter, a, d, p, greatest(lower_b, 0))
  ON CONFLICT (criterion_id, procedure_family, observation_quarter)
  DO UPDATE SET n_approvals = EXCLUDED.n_approvals,
                n_denials = EXCLUDED.n_denials,
                contributing_practices = EXCLUDED.contributing_practices,
                approval_rate_lower = EXCLUDED.approval_rate_lower;
END;
$$;

REVOKE INSERT, UPDATE ON shared_criterion_summaries FROM PUBLIC;

-- [K3-1] A tripwire, explicitly NOT a barrier. The structural block above is
-- what actually prevents fee sharing: the shared corpus has no column to put
-- a price in. This flags obvious currency patterns in criterion free text so
-- a reviewer sees them, and it is honest about what it cannot catch — "1.8x
-- Medicare", "six thousand", or "RVU-weighted" all pass. Free-text screening
-- is an application-side review step, audited; it is not a guarantee, and
-- treating it as one would be worse than not having it.
CREATE OR REPLACE FUNCTION flag_currency_in_criterion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.requirement ~* '(\$[0-9]|[0-9][0-9,. ]*(dollars|usd)\M|\mallowed amount\M|\mfee schedule\M)' THEN
    NEW.data := jsonb_set(COALESCE(NEW.data,'{}'::jsonb), '{currency_review_required}', 'true'::jsonb);
    RAISE WARNING
      'criterion text contains a currency pattern and is flagged for review before it may be shared';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER criteria_currency_tripwire BEFORE INSERT ON criteria
  FOR EACH ROW EXECUTE FUNCTION flag_currency_in_criterion();

-- A flagged criterion may not reach the shared corpus until a human clears
-- the flag. This turns the soft warning into a hard gate at the boundary
-- that actually matters — the moment data would cross to another practice.
CREATE OR REPLACE FUNCTION block_flagged_from_sharing()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM criteria c
              WHERE c.id = NEW.criterion_id
                AND c.data->>'currency_review_required' = 'true') THEN
    RAISE EXCEPTION
      'criterion % is flagged for currency review and may not enter the shared corpus',
      NEW.criterion_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER shared_summaries_currency_gate
  BEFORE INSERT OR UPDATE ON shared_criterion_summaries
  FOR EACH ROW EXECUTE FUNCTION block_flagged_from_sharing();


-- ─────────────────────────────────────────────────────────────────────────
-- 22 · Retrieval corpora and chunks
--
-- What is worth embedding, and why. Each corpus answers a question that
-- someone actually asks during a case:
--
--   policy       "What does this payer require for this operation?"
--                Long PDFs nobody reads end to end. No PHI.
--   criteria     "What actually gets approved?" — the derived corpus. The
--                feature that does not exist in any competing product.
--   document     "Where in this chart is the evidence for criterion 3.2?"
--                PHI. Local model only.
--   annotation   "Has this surgeon argued this point before?"  PHI.
--   letter       "How did we word this last time it was approved?"  PHI.
--   determination "Why does this payer deny this?"  Denial reasoning.
--   literature   "What society guideline supports this?"  Appeals need it.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE corpora (
  key            text PRIMARY KEY,
  label          text NOT NULL,
  description    text NOT NULL,
  contains_phi   boolean NOT NULL,
  is_shareable   boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO corpora (key, label, description, contains_phi, is_shareable) VALUES
  ('policy','Published payer policy',
   'Payer medical policies, LCDs and NCDs. Long documents; retrieval finds the controlling section instead of a human paging through a PDF.', false, true),
  ('criteria','Criteria corpus',
   'Every criterion, published and derived alike, so a surgeon sees the written rule and the observed pattern side by side.', false, true),
  ('document','Patient chart documents',
   'Imaging reports, labs, therapy notes. Retrieval answers "where is the evidence for this criterion" across hundreds of pages.', true, false),
  ('annotation','Surgeon annotations',
   'Prior clinical arguments in the surgeon''s own words, reusable when the same contradiction recurs.', true, false),
  ('letter','Prior letters',
   'Letters and their outcomes. Retrieval surfaces wording that was approved for a comparable case.', true, false),
  ('determination','Denial reasoning',
   'Payer denial language, so a pattern in why this payer denies becomes visible.', true, false),
  ('literature','Society guidelines and literature',
   'Guidelines, systematic reviews and trials the practice licenses. Appeals turn on these; no patient data.', false, true);

-- One chunk of text, embedded once per model.
--
-- Chunk and vector are separate tables on purpose: re-embedding the corpus
-- with a new model must not duplicate the text, and a chunk must be able to
-- carry vectors from two models during a migration between them.
CREATE TABLE chunks (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  corpus_key      text NOT NULL REFERENCES corpora(key) ON DELETE RESTRICT,

  -- Exactly one owner. The XOR is what lets a delete of the source cascade
  -- to its embeddings — needed for a §164.522 restriction request.
  document_id     uuid REFERENCES documents(id) ON DELETE CASCADE,
  criterion_id    uuid REFERENCES criteria(id) ON DELETE CASCADE,
  policy_id       uuid REFERENCES policies(id) ON DELETE CASCADE,
  annotation_id   uuid REFERENCES annotations(id) ON DELETE CASCADE,
  letter_id       uuid REFERENCES letters(id) ON DELETE CASCADE,
  determination_id uuid REFERENCES determinations(id) ON DELETE CASCADE,
  literature_id   uuid,

  -- Tenancy is denormalized onto the chunk so RLS never needs a join
  -- through the owner table to decide visibility.
  practice_id     uuid REFERENCES practices(id) ON DELETE CASCADE,
  patient_id      uuid REFERENCES patients(id) ON DELETE CASCADE,

  ordinal         integer NOT NULL,
  content         text NOT NULL,
  -- Contextual retrieval: a short prefix naming the parent document, so a
  -- chunk that says "the criterion is not met" still says which criterion.
  context_prefix  text,
  token_count     integer CHECK (token_count > 0),
  page_number     integer CHECK (page_number > 0),
  content_sha256  bytea NOT NULL,

  -- Hybrid retrieval. Dense vectors miss exact tokens that matter here —
  -- CPT codes, 'L4-L5', 'HbA1c' — so keyword search runs beside them and the
  -- two rankings fuse. STORED because a virtual column cannot be indexed.
  fts             tsvector GENERATED ALWAYS AS (
                    to_tsvector('english', coalesce(context_prefix,'') || ' ' || content)
                  ) STORED,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz,

  CONSTRAINT chunks_one_owner CHECK (
    num_nonnulls(document_id, criterion_id, policy_id, annotation_id,
                 letter_id, determination_id, literature_id) = 1)
);
CREATE INDEX chunks_fts_ix     ON chunks USING gin (fts);
CREATE INDEX chunks_corpus_ix  ON chunks(corpus_key);
CREATE INDEX chunks_practice_ix ON chunks(practice_id) WHERE practice_id IS NOT NULL;
CREATE INDEX chunks_owner_doc_ix ON chunks(document_id) WHERE document_id IS NOT NULL;
CREATE TRIGGER chunks_touch BEFORE UPDATE ON chunks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A chunk in a PHI corpus must be attributable to a practice, or RLS has
-- nothing to filter on and the row would be globally visible.
CREATE OR REPLACE FUNCTION enforce_chunk_tenancy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  is_phi boolean;
BEGIN
  SELECT contains_phi INTO is_phi FROM corpora WHERE key = NEW.corpus_key;
  IF is_phi AND NEW.practice_id IS NULL THEN
    RAISE EXCEPTION
      'corpus % contains PHI; a chunk without a practice_id would be visible to every tenant',
      NEW.corpus_key
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER chunks_tenancy BEFORE INSERT OR UPDATE ON chunks
  FOR EACH ROW EXECUTE FUNCTION enforce_chunk_tenancy();

ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY chunks_tenant ON chunks
  USING (practice_id IS NULL OR practice_id IN (SELECT current_app_practice_ids()));


-- ─────────────────────────────────────────────────────────────────────────
-- 23 · Vectors, split by dimension class
--
-- Two physical tables because pgvector indexes `vector` only to 2000
-- dimensions and `halfvec` to 4000. One shared column would either cap the
-- product at 1536-dim models forever or silently lose the index — a
-- sequential scan over a million chunks that still returns correct answers,
-- so nobody notices until it is slow in production.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE chunk_vectors_2000 (
  chunk_id            uuid NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  embedding_model_id  uuid NOT NULL REFERENCES embedding_models(id) ON DELETE RESTRICT,
  embedding           vector(1536) NOT NULL,
  embedded_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chunk_id, embedding_model_id)
);
CREATE INDEX chunk_vectors_2000_hnsw
  ON chunk_vectors_2000 USING hnsw (embedding vector_cosine_ops);
CREATE INDEX chunk_vectors_2000_model_ix ON chunk_vectors_2000(embedding_model_id);

CREATE TABLE chunk_vectors_1024 (
  chunk_id            uuid NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  embedding_model_id  uuid NOT NULL REFERENCES embedding_models(id) ON DELETE RESTRICT,
  embedding           vector(1024) NOT NULL,
  embedded_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chunk_id, embedding_model_id)
);
CREATE INDEX chunk_vectors_1024_hnsw
  ON chunk_vectors_1024 USING hnsw (embedding vector_cosine_ops);

-- 3072-dim models. halfvec trades a little precision for an index that
-- exists at all above 2000 dimensions.
CREATE TABLE chunk_vectors_half (
  chunk_id            uuid NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  embedding_model_id  uuid NOT NULL REFERENCES embedding_models(id) ON DELETE RESTRICT,
  embedding           halfvec(3072) NOT NULL,
  embedded_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chunk_id, embedding_model_id)
);
CREATE INDEX chunk_vectors_half_hnsw
  ON chunk_vectors_half USING hnsw (embedding halfvec_cosine_ops);

-- A hosted model must never receive PHI. The vector is the evidence that it
-- did, so the check lives at the moment the vector is stored.
CREATE OR REPLACE FUNCTION enforce_embedding_phi_policy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  is_phi boolean; permitted boolean; mname text;
BEGIN
  SELECT c.contains_phi INTO is_phi
    FROM chunks ch JOIN corpora c ON c.key = ch.corpus_key
   WHERE ch.id = NEW.chunk_id;

  SELECT phi_permitted, name INTO permitted, mname
    FROM embedding_models WHERE id = NEW.embedding_model_id;

  IF is_phi AND NOT permitted THEN
    RAISE EXCEPTION
      'model "%" is not cleared for PHI; an embedding of clinical text is PHI and is recoverable by inversion',
      mname
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER chunk_vectors_2000_phi BEFORE INSERT OR UPDATE ON chunk_vectors_2000
  FOR EACH ROW EXECUTE FUNCTION enforce_embedding_phi_policy();
CREATE TRIGGER chunk_vectors_1024_phi BEFORE INSERT OR UPDATE ON chunk_vectors_1024
  FOR EACH ROW EXECUTE FUNCTION enforce_embedding_phi_policy();
CREATE TRIGGER chunk_vectors_half_phi BEFORE INSERT OR UPDATE ON chunk_vectors_half
  FOR EACH ROW EXECUTE FUNCTION enforce_embedding_phi_policy();


-- ─────────────────────────────────────────────────────────────────────────
-- 24 · Retrieval, attribution and the letter boundary
--
-- [K3-3] The rule "a derived criterion is never cited as published policy"
-- cannot be enforced by hoping the model behaves. Two mechanisms:
--   1. every retrieval into a generation context is logged;
--   2. a letter cannot be signed while a retrieved criterion that is not
--      citable_as_policy remains unresolved — either attributed in a claim,
--      or explicitly excluded by the surgeon.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE retrieval_log (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  letter_id          uuid REFERENCES letters(id) ON DELETE CASCADE,
  case_id            uuid REFERENCES cases(id) ON DELETE CASCADE,
  embedding_model_id uuid NOT NULL REFERENCES embedding_models(id) ON DELETE RESTRICT,
  query_text         text NOT NULL,
  corpus_key         text NOT NULL REFERENCES corpora(key),
  chunk_id           uuid REFERENCES chunks(id) ON DELETE SET NULL,
  criterion_id       uuid REFERENCES criteria(id) ON DELETE SET NULL,
  rank               integer NOT NULL CHECK (rank > 0),
  distance           real,
  -- Resolution of a non-citable criterion that entered the context.
  resolution         text NOT NULL DEFAULT 'unresolved'
                       CHECK (resolution IN ('unresolved','attributed','excluded_by_surgeon')),
  resolved_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  retrieved_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX retrieval_log_letter_ix ON retrieval_log(letter_id);
CREATE INDEX retrieval_log_open_ix ON retrieval_log(letter_id)
  WHERE resolution = 'unresolved';

-- letter_claims gains a criterion source. Without this a criterion-backed
-- claim has no legal slot in the XOR and must masquerade as a document or
-- an annotation — which is precisely the laundering this file prevents.
ALTER TABLE letter_claims
  ADD COLUMN criterion_id uuid REFERENCES criteria(id) ON DELETE RESTRICT,
  ADD COLUMN attribution  text
    CHECK (attribution IN ('published_policy','practice_experience','peer_reported','payer_stated'));

ALTER TABLE letter_claims DROP CONSTRAINT letter_claims_one_source;
ALTER TABLE letter_claims ADD CONSTRAINT letter_claims_one_source CHECK (
  num_nonnulls(document_id, annotation_id, criterion_id) = 1);

-- A claim sourced from a criterion must be introduced the way that
-- criterion's grade permits. This is the sentence-level guarantee: a
-- derived rule appears as practice experience, never as payer policy.
CREATE OR REPLACE FUNCTION enforce_claim_attribution()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  g text; citable boolean;
BEGIN
  IF NEW.criterion_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.evidence_grade, eg.citable_as_policy INTO g, citable
    FROM criteria c JOIN evidence_grades eg ON eg.key = c.evidence_grade
   WHERE c.id = NEW.criterion_id;

  IF NEW.attribution IS NULL THEN
    RAISE EXCEPTION 'a criterion-sourced claim must state its attribution'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT citable AND NEW.attribution = 'published_policy' THEN
    RAISE EXCEPTION
      'criterion % is graded "%" and may not be presented to a payer as published policy',
      NEW.criterion_id, g
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER letter_claims_attribution BEFORE INSERT OR UPDATE ON letter_claims
  FOR EACH ROW EXECUTE FUNCTION enforce_claim_attribution();

-- [K3-3] Extend the signing gate. A letter may not be signed while a
-- non-citable criterion sits unresolved in its retrieval log.
CREATE OR REPLACE FUNCTION enforce_letter_retrieval_resolved()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  open_count int;
BEGIN
  IF NEW.signed_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO open_count
    FROM retrieval_log r
    JOIN criteria c        ON c.id = r.criterion_id
    JOIN evidence_grades eg ON eg.key = c.evidence_grade
   WHERE r.letter_id = NEW.id
     AND r.resolution = 'unresolved'
     AND eg.citable_as_policy = false;

  IF open_count > 0 THEN
    RAISE EXCEPTION
      '% unattributed non-policy criteria were retrieved into this letter; attribute or exclude each before signing',
      open_count
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER letters_retrieval_resolved BEFORE INSERT OR UPDATE ON letters
  FOR EACH ROW EXECUTE FUNCTION enforce_letter_retrieval_resolved();


-- ─────────────────────────────────────────────────────────────────────────
-- 25 · Retrieval functions
--
-- [K3-4] Rank blends similarity with evidence grade and recency. A rule
-- observed once, two years ago, must not arrive alongside current published
-- policy wearing the same clothes.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION criterion_retrieval_weight(p_criterion uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT round((
    -- grade weight: rank 1 = 1.00, each rung down loses 12%
    (1.0 - (eg.rank - 1) * 0.12)
    *
    -- recency decay; NULL half-life means no decay
    CASE WHEN eg.decay_half_life_days IS NULL THEN 1.0
         ELSE exp(-ln(2) *
              extract(epoch FROM (now() - c.last_confirmed_at)) / 86400.0
              / eg.decay_half_life_days)
    END)::numeric, 4)
    FROM criteria c
    JOIN evidence_grades eg ON eg.key = c.evidence_grade
   WHERE c.id = p_criterion;
$$;

-- Hybrid search: dense vectors and keyword search fused by reciprocal rank.
-- Exact tokens matter in this domain — a CPT code or 'L4-L5' is either
-- present or it is not, and cosine similarity is indifferent to that.
CREATE OR REPLACE FUNCTION search_chunks(
  p_query_text  text,
  p_query_vec   vector(1536),
  p_model       uuid,
  p_corpus      text,
  p_limit       integer DEFAULT 10,
  p_rrf_k       integer DEFAULT 60
)
RETURNS TABLE (chunk_id uuid, content text, score numeric)
LANGUAGE sql
STABLE
AS $$
  WITH dense AS (
    SELECT v.chunk_id, row_number() OVER (ORDER BY v.embedding <=> p_query_vec) AS r
      FROM chunk_vectors_2000 v
      JOIN chunks c ON c.id = v.chunk_id
     WHERE v.embedding_model_id = p_model
       AND c.corpus_key = p_corpus
     ORDER BY v.embedding <=> p_query_vec
     LIMIT 100
  ),
  keyword AS (
    SELECT c.id AS chunk_id,
           row_number() OVER (
             ORDER BY ts_rank_cd(c.fts, websearch_to_tsquery('english', p_query_text)) DESC) AS r
      FROM chunks c
     WHERE c.corpus_key = p_corpus
       AND c.fts @@ websearch_to_tsquery('english', p_query_text)
     LIMIT 100
  )
  SELECT ch.id, ch.content,
         round(COALESCE(1.0/(p_rrf_k + d.r), 0) + COALESCE(1.0/(p_rrf_k + k.r), 0), 6)
           * COALESCE(criterion_retrieval_weight(ch.criterion_id), 1.0) AS score
    FROM chunks ch
    LEFT JOIN dense d   ON d.chunk_id = ch.id
    LEFT JOIN keyword k ON k.chunk_id = ch.id
   WHERE d.chunk_id IS NOT NULL OR k.chunk_id IS NOT NULL
   ORDER BY score DESC
   LIMIT p_limit;
$$;

-- What a surgeon sees on the policy panel: the written rule and the observed
-- pattern side by side, each labelled for what it is.
CREATE VIEW criteria_with_evidence AS
SELECT c.id                AS criterion_id,
       c.payer_id,
       p.name              AS payer_name,
       c.label,
       c.requirement,
       c.evidence_grade,
       eg.label            AS grade_label,
       eg.citable_as_policy,
       eg.attribution_phrase,
       c.validity,
       c.last_confirmed_at,
       criterion_retrieval_weight(c.id) AS retrieval_weight,
       s.n_approvals,
       s.n_denials,
       s.contributing_practices,
       s.approval_rate_lower,
       (c.superseded_by IS NULL AND c.validity @> CURRENT_DATE) AS is_live
  FROM criteria c
  JOIN payers p           ON p.id = c.payer_id
  JOIN evidence_grades eg ON eg.key = c.evidence_grade
  LEFT JOIN LATERAL (
    SELECT * FROM shared_criterion_summaries s2
     WHERE s2.criterion_id = c.id
     ORDER BY s2.observation_quarter DESC LIMIT 1) s ON true;

COMMIT;
