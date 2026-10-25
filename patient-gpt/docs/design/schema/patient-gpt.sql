-- PatientGPT · conversational layer over the Prior Authorization Workbench
-- PostgreSQL 18. Apply after ../../../../docs/design/schema/schema.sql and
-- schema-ai.sql. Everything here lives in the patient_gpt schema and refers to
-- the workbench's aso tables by foreign key. Clinical facts (evidence
-- states, gates, letters, submissions, determinations) are never duplicated
-- here; see data-model.md for the rules this DDL enforces.
--
-- Status: proposed (2026-10-04). Synthetic data only.

CREATE SCHEMA IF NOT EXISTS patient_gpt;
SET search_path = patient_gpt, aso, public;

-- ---------------------------------------------------------------------------
-- 1. Conversations and messages
-- ---------------------------------------------------------------------------

CREATE TABLE patient_gpt.conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id      uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  owner_user_id    uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  scope_kind       text NOT NULL CHECK (scope_kind IN ('global','patient','case')),
  patient_id       uuid REFERENCES aso.patients(id) ON DELETE RESTRICT,
  case_id          uuid REFERENCES aso.cases(id) ON DELETE RESTRICT,
  title            text NOT NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  archived_at      timestamptz,
  data             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz,
  -- a scope names exactly the records it is in the context of
  CONSTRAINT conversations_scope_shape CHECK (
    (scope_kind = 'global'  AND patient_id IS NULL     AND case_id IS NULL) OR
    (scope_kind = 'patient' AND patient_id IS NOT NULL AND case_id IS NULL) OR
    (scope_kind = 'case'    AND patient_id IS NOT NULL AND case_id IS NOT NULL))
);
CREATE INDEX conversations_scope_ix ON patient_gpt.conversations (practice_id, scope_kind, patient_id, case_id, last_activity_at DESC);
CREATE INDEX conversations_owner_ix ON patient_gpt.conversations (owner_user_id, last_activity_at DESC);

-- A case-scoped conversation must sit inside the case's own patient and practice.
CREATE OR REPLACE FUNCTION patient_gpt.enforce_conversation_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c record;
BEGIN
  IF NEW.case_id IS NOT NULL THEN
    SELECT patient_id, practice_id INTO c FROM aso.cases WHERE id = NEW.case_id;
    IF c.patient_id IS DISTINCT FROM NEW.patient_id OR c.practice_id IS DISTINCT FROM NEW.practice_id THEN
      RAISE EXCEPTION 'conversation % does not match the patient or practice of case %', NEW.id, NEW.case_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.patient_id IS NOT NULL THEN
    IF (SELECT practice_id FROM aso.patients WHERE id = NEW.patient_id) IS DISTINCT FROM NEW.practice_id THEN
      RAISE EXCEPTION 'conversation % does not match the practice of patient %', NEW.id, NEW.patient_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER conversations_scope BEFORE INSERT OR UPDATE ON patient_gpt.conversations
  FOR EACH ROW EXECUTE FUNCTION patient_gpt.enforce_conversation_scope();

-- A conversation only narrows: all patients -> one patient -> one case.
CREATE TABLE patient_gpt.conversation_rescopes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES patient_gpt.conversations(id) ON DELETE CASCADE,
  from_scope_kind  text NOT NULL CHECK (from_scope_kind IN ('global','patient')),
  to_scope_kind    text NOT NULL CHECK (to_scope_kind IN ('patient','case')),
  patient_id       uuid NOT NULL REFERENCES aso.patients(id) ON DELETE RESTRICT,
  case_id          uuid REFERENCES aso.cases(id) ON DELETE RESTRICT,
  by_user_id       uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  surface_action_id uuid,                       -- set below once surface_actions exists
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rescopes_narrow CHECK (
    (from_scope_kind = 'global' AND to_scope_kind IN ('patient','case')) OR
    (from_scope_kind = 'patient' AND to_scope_kind = 'case')),
  CONSTRAINT rescopes_case_needs_case CHECK (to_scope_kind <> 'case' OR case_id IS NOT NULL)
);

CREATE TABLE patient_gpt.messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES patient_gpt.conversations(id) ON DELETE CASCADE,
  seq              integer NOT NULL CHECK (seq > 0),
  role             text NOT NULL CHECK (role IN ('user','assistant','host')),
  body             text NOT NULL,
  author_user_id   uuid REFERENCES aso.users(id) ON DELETE SET NULL,
  run_id           uuid,                        -- the assistant turn that produced this message
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, seq),
  CONSTRAINT messages_user_has_author CHECK (role <> 'user' OR author_user_id IS NOT NULL)
);

-- Attaching a document to a message is what files an unfiled document to the
-- conversation's case; the filing itself is a workbench command on documents.
CREATE TABLE patient_gpt.message_documents (
  message_id       uuid NOT NULL REFERENCES patient_gpt.messages(id) ON DELETE CASCADE,
  document_id      uuid NOT NULL REFERENCES aso.documents(id) ON DELETE RESTRICT,
  PRIMARY KEY (message_id, document_id)
);

-- ---------------------------------------------------------------------------
-- 2. Runs and events (AG-UI)
-- ---------------------------------------------------------------------------

CREATE TABLE patient_gpt.runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES patient_gpt.conversations(id) ON DELETE CASCADE,
  message_id       uuid NOT NULL REFERENCES patient_gpt.messages(id) ON DELETE CASCADE,  -- the user turn being answered
  status           text NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running','success','interrupt','stopped','failed')),
  interrupt_id     text CHECK (interrupt_id IN ('gates','p2p_outcome')),
  interrupt_reason text,
  model_name       text,
  model_version    text,
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  data             jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT runs_interrupt_shape CHECK ((status = 'interrupt') = (interrupt_id IS NOT NULL))
);
CREATE INDEX runs_conversation_ix ON patient_gpt.runs (conversation_id, started_at);
ALTER TABLE patient_gpt.messages
  ADD CONSTRAINT messages_run_fkey FOREIGN KEY (run_id) REFERENCES patient_gpt.runs(id) ON DELETE SET NULL;

CREATE TABLE patient_gpt.run_events (
  run_id           uuid NOT NULL REFERENCES patient_gpt.runs(id) ON DELETE CASCADE,
  seq              integer NOT NULL CHECK (seq >= 0),
  at_ms            integer NOT NULL CHECK (at_ms >= 0),          -- offset from run start
  event_type       text NOT NULL CHECK (event_type IN (
                     'RUN_STARTED','STEP_STARTED','STEP_FINISHED',
                     'TOOL_CALL_START','TOOL_CALL_ARGS','TOOL_CALL_END','TOOL_CALL_RESULT',
                     'TEXT_MESSAGE_START','TEXT_MESSAGE_CONTENT','TEXT_MESSAGE_END',
                     'STATE_DELTA','CUSTOM','RUN_FINISHED')),
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (run_id, seq)
);

CREATE OR REPLACE FUNCTION patient_gpt.append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER run_events_append_only BEFORE UPDATE OR DELETE ON patient_gpt.run_events
  FOR EACH ROW EXECUTE FUNCTION patient_gpt.append_only();

-- The "Worked for 9 s · 4 tool calls" disclosure, projected from the log.
CREATE VIEW patient_gpt.run_tool_calls AS
SELECT s.run_id,
       s.payload->>'toolCallId'   AS tool_call_id,
       s.payload->>'toolCallName' AS tool_name,
       a.payload->>'delta'        AS args,
       r.payload->>'content'      AS result,
       s.at_ms                    AS started_ms,
       r.at_ms                    AS finished_ms
  FROM patient_gpt.run_events s
  LEFT JOIN patient_gpt.run_events a
         ON a.run_id = s.run_id AND a.event_type = 'TOOL_CALL_ARGS'   AND a.payload->>'toolCallId' = s.payload->>'toolCallId'
  LEFT JOIN patient_gpt.run_events r
         ON r.run_id = s.run_id AND r.event_type = 'TOOL_CALL_RESULT' AND r.payload->>'toolCallId' = s.payload->>'toolCallId'
 WHERE s.event_type = 'TOOL_CALL_START';

-- ---------------------------------------------------------------------------
-- 3. Surfaces and actions (A2UI), with the allow-list as data
-- ---------------------------------------------------------------------------

CREATE TABLE patient_gpt.surface_catalog_components (
  catalog_id       text NOT NULL,
  component        text NOT NULL,
  PRIMARY KEY (catalog_id, component)
);
INSERT INTO patient_gpt.surface_catalog_components (catalog_id, component) VALUES
  ('aso.workbench/v1','Column'),       ('aso.workbench/v1','Row'),           ('aso.workbench/v1','Section'),
  ('aso.workbench/v1','Text'),         ('aso.workbench/v1','Citation'),      ('aso.workbench/v1','Button'),
  ('aso.workbench/v1','CaseHeader'),   ('aso.workbench/v1','CriteriaList'),  ('aso.workbench/v1','ConflictList'),
  ('aso.workbench/v1','BlockerList'),  ('aso.workbench/v1','NextMove'),      ('aso.workbench/v1','ChoiceQuestion'),
  ('aso.workbench/v1','StaffRequest'), ('aso.workbench/v1','ContextList'),   ('aso.workbench/v1','DocumentList'),
  ('aso.workbench/v1','PointList'),    ('aso.workbench/v1','Suggestions');

-- No affirmation, signing, submission or outcome action exists here, by design.
CREATE TABLE patient_gpt.surface_action_names (
  action_name      text PRIMARY KEY,
  description      text NOT NULL
);
INSERT INTO patient_gpt.surface_action_names VALUES
  ('answer_question',    'The surgeon answers the one open question; recorded as a statement.'),
  ('send_staff_request', 'The surgeon sends a request to the coordinator.'),
  ('open_source',        'Open a cited document page in the viewer.'),
  ('set_context',        'Narrow this conversation to a patient or case.'),
  ('run_prompt',         'Send a suggested prompt as the next user message.');

CREATE TABLE patient_gpt.surfaces (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface_id       text NOT NULL,                -- the id the assistant chose
  run_id           uuid NOT NULL REFERENCES patient_gpt.runs(id) ON DELETE CASCADE,
  conversation_id  uuid NOT NULL REFERENCES patient_gpt.conversations(id) ON DELETE CASCADE,
  catalog_id       text NOT NULL,
  components       jsonb NOT NULL DEFAULT '[]'::jsonb,   -- flat component list, root id 'root'
  data_model       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- current bound data
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz,
  UNIQUE (run_id, surface_id)
);

CREATE TABLE patient_gpt.surface_messages (
  surface_pk       uuid NOT NULL REFERENCES patient_gpt.surfaces(id) ON DELETE CASCADE,
  seq              integer NOT NULL CHECK (seq >= 0),
  kind             text NOT NULL CHECK (kind IN ('createSurface','updateComponents','updateDataModel','deleteSurface')),
  payload          jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (surface_pk, seq)
);
CREATE TRIGGER surface_messages_append_only BEFORE UPDATE OR DELETE ON patient_gpt.surface_messages
  FOR EACH ROW EXECUTE FUNCTION patient_gpt.append_only();

-- Every component named in a surface must be in its catalogue; the renderer
-- refuses the rest in place, and the database refuses to record them.
CREATE OR REPLACE FUNCTION patient_gpt.enforce_surface_catalog()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bad text;
BEGIN
  SELECT c->>'component' INTO bad
    FROM jsonb_array_elements(NEW.components) c
   WHERE NOT EXISTS (SELECT 1 FROM patient_gpt.surface_catalog_components s
                      WHERE s.catalog_id = NEW.catalog_id AND s.component = c->>'component')
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'component % is not in catalogue %', bad, NEW.catalog_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER surfaces_catalog BEFORE INSERT OR UPDATE ON patient_gpt.surfaces
  FOR EACH ROW EXECUTE FUNCTION patient_gpt.enforce_surface_catalog();

CREATE TABLE patient_gpt.surface_actions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface_pk       uuid NOT NULL REFERENCES patient_gpt.surfaces(id) ON DELETE CASCADE,
  action_name      text NOT NULL REFERENCES patient_gpt.surface_action_names(action_name),
  context          jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id    uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  resulting_run_id uuid REFERENCES patient_gpt.runs(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER surface_actions_append_only BEFORE UPDATE OR DELETE ON patient_gpt.surface_actions
  FOR EACH ROW EXECUTE FUNCTION patient_gpt.append_only();
ALTER TABLE patient_gpt.conversation_rescopes
  ADD CONSTRAINT rescopes_action_fkey FOREIGN KEY (surface_action_id) REFERENCES patient_gpt.surface_actions(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 4. Statements, questions and conflicts
-- ---------------------------------------------------------------------------

-- A clinical statement by the surgeon, attributed and dated. It may be quoted
-- in a letter as the surgeon's statement. It is never a citation: the
-- workbench's evidence_citations reference documents only.
CREATE TABLE patient_gpt.surgeon_statements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id      uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  case_id          uuid NOT NULL REFERENCES aso.cases(id) ON DELETE CASCADE,
  statement_key    text NOT NULL,                -- 'side', 'prior_care', 'pt_stop', ...
  title            text NOT NULL,
  body             text NOT NULL,
  origin           text NOT NULL CHECK (origin IN ('question_answer','conflict','peer_review','free_text')),
  author_user_id   uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  recorded_in_run_id uuid REFERENCES patient_gpt.runs(id) ON DELETE SET NULL,
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, statement_key)
);
CREATE TRIGGER surgeon_statements_append_only BEFORE UPDATE OR DELETE ON patient_gpt.surgeon_statements
  FOR EACH ROW EXECUTE FUNCTION patient_gpt.append_only();

-- Mirrors enforce_gate_authority: the author must be the verified session
-- actor and hold the clinical capability in the case's practice.
CREATE OR REPLACE FUNCTION patient_gpt.enforce_statement_authority()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_practice uuid;
BEGIN
  SELECT c.practice_id INTO target_practice FROM aso.cases c WHERE c.id = NEW.case_id;
  IF target_practice IS DISTINCT FROM NEW.practice_id
     OR target_practice IS DISTINCT FROM aso.current_verified_practice_id()
     OR NEW.author_user_id IS DISTINCT FROM aso.current_app_user_id()
  THEN
    RAISE EXCEPTION 'statement author % is not the verified actor for practice %', NEW.author_user_id, target_practice
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM aso.user_capabilities uc
      JOIN aso.users u ON u.id = uc.user_id AND u.status = 'active'
     WHERE uc.user_id = NEW.author_user_id AND uc.practice_id = target_practice AND uc.capability_key = 'affirm_gate')
  THEN
    RAISE EXCEPTION 'user % may not record a surgeon statement; it is a clinical act', NEW.author_user_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER surgeon_statements_authority BEFORE INSERT ON patient_gpt.surgeon_statements
  FOR EACH ROW EXECUTE FUNCTION patient_gpt.enforce_statement_authority();

-- The one question the assistant may have open on a case.
CREATE TABLE patient_gpt.coach_questions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id        uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  case_id            uuid NOT NULL REFERENCES aso.cases(id) ON DELETE CASCADE,
  question_key       text NOT NULL,
  ask                text NOT NULL,
  basis              text,
  source_document_id uuid REFERENCES aso.documents(id) ON DELETE SET NULL,
  source_page        integer CHECK (source_page > 0),
  options            jsonb NOT NULL,              -- [{value,label}]
  note_label         text,                        -- present when a free-text note is invited
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','withdrawn')),
  asked_in_run_id    uuid REFERENCES patient_gpt.runs(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz
);
CREATE UNIQUE INDEX coach_questions_one_open ON patient_gpt.coach_questions (case_id) WHERE status = 'open';

CREATE TABLE patient_gpt.question_answers (
  question_id      uuid PRIMARY KEY REFERENCES patient_gpt.coach_questions(id) ON DELETE CASCADE,
  value            text NOT NULL,
  label            text NOT NULL,
  note             text,
  answered_by      uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  statement_id     uuid REFERENCES patient_gpt.surgeon_statements(id) ON DELETE RESTRICT,
  surface_action_id uuid REFERENCES patient_gpt.surface_actions(id) ON DELETE SET NULL,
  answered_at      timestamptz NOT NULL DEFAULT now()
);

-- A clinical clarification the chart raises (a new symptom on the other side).
-- It blocks one gate until the surgeon's statement resolves it.
CREATE TABLE patient_gpt.case_conflicts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id        uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  case_id            uuid NOT NULL REFERENCES aso.cases(id) ON DELETE CASCADE,
  conflict_key       text NOT NULL,
  kind               text NOT NULL,
  body               text NOT NULL,
  source_document_id uuid REFERENCES aso.documents(id) ON DELETE SET NULL,
  source_page        integer CHECK (source_page > 0),
  blocks_gate_kind   text,                        -- a gate_affirmation_kinds key, e.g. operative plan
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolved_by_statement_id uuid REFERENCES patient_gpt.surgeon_statements(id) ON DELETE RESTRICT,
  question_id        uuid REFERENCES patient_gpt.coach_questions(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz,
  UNIQUE (case_id, conflict_key),
  CONSTRAINT conflicts_resolution_shape CHECK ((status = 'resolved') = (resolved_by_statement_id IS NOT NULL))
);

-- ---------------------------------------------------------------------------
-- 5. Staff requests
-- ---------------------------------------------------------------------------

CREATE TABLE patient_gpt.staff_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id      uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  case_id          uuid NOT NULL REFERENCES aso.cases(id) ON DELETE CASCADE,
  conversation_id  uuid REFERENCES patient_gpt.conversations(id) ON DELETE SET NULL,
  requested_by     uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  assignee_user_id uuid REFERENCES aso.users(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','fulfilled','cancelled')),
  sent_at          timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz
);

CREATE TABLE patient_gpt.staff_request_items (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id                uuid NOT NULL REFERENCES patient_gpt.staff_requests(id) ON DELETE CASCADE,
  ordinal                   integer NOT NULL CHECK (ordinal > 0),
  body                      text NOT NULL,
  policy_criterion_id       uuid REFERENCES aso.policy_criteria(id) ON DELETE SET NULL,
  status                    text NOT NULL DEFAULT 'open' CHECK (status IN ('open','fulfilled','cancelled')),
  fulfilled_by_document_id  uuid REFERENCES aso.documents(id) ON DELETE SET NULL,
  fulfilled_at              timestamptz,
  UNIQUE (request_id, ordinal),
  -- a request is fulfilled only by the document that arrived
  CONSTRAINT items_fulfilled_by_document CHECK (status <> 'fulfilled' OR fulfilled_by_document_id IS NOT NULL)
);

-- ---------------------------------------------------------------------------
-- 6. Peer-to-peer
-- ---------------------------------------------------------------------------

CREATE TABLE patient_gpt.peer_review_briefs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id      uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  case_id          uuid NOT NULL REFERENCES aso.cases(id) ON DELETE CASCADE,
  peer_review_id   uuid NOT NULL REFERENCES aso.peer_reviews(id) ON DELETE CASCADE,
  points           jsonb NOT NULL,               -- [{text, cites:[{document_id,page}]}]
  statement_id     uuid REFERENCES patient_gpt.surgeon_statements(id) ON DELETE SET NULL,
  prepared_in_run_id uuid REFERENCES patient_gpt.runs(id) ON DELETE SET NULL,
  prepared_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (peer_review_id)
);

-- The surgeon's own record of the call, made before the written determination
-- arrives. The host copies result into aso.peer_reviews.outcome and moves
-- the case; the determination letter is filed later like any document.
CREATE TABLE patient_gpt.peer_review_call_outcomes (
  peer_review_id   uuid PRIMARY KEY REFERENCES aso.peer_reviews(id) ON DELETE CASCADE,
  case_id          uuid NOT NULL REFERENCES aso.cases(id) ON DELETE CASCADE,
  result           text NOT NULL CHECK (result IN ('overturned','upheld')),
  recorded_by      uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  note             text
);
CREATE TRIGGER peer_review_call_outcomes_append_only BEFORE UPDATE OR DELETE ON patient_gpt.peer_review_call_outcomes
  FOR EACH ROW EXECUTE FUNCTION patient_gpt.append_only();

-- ---------------------------------------------------------------------------
-- 7. Search: passages over the workbench's retrieval layer
-- ---------------------------------------------------------------------------

-- Vectors live in schema-ai.sql (chunks, chunk_vectors_*). A passage ties a
-- chunk to the case and patient it serves and to the kind of thing it came
-- from, so results group by case. Unfiled documents have no passages.
CREATE TABLE patient_gpt.passages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id      uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  source_kind      text NOT NULL CHECK (source_kind IN ('document_page','criterion','letter_claim','conversation')),
  source_id        uuid NOT NULL,                -- documents.id, case_evidence.id, letter_claims.id or conversations.id
  source_page      integer CHECK (source_page > 0),
  patient_id       uuid REFERENCES aso.patients(id) ON DELETE CASCADE,
  case_id          uuid REFERENCES aso.cases(id) ON DELETE CASCADE,
  label            text NOT NULL,                -- 'EXAM-0924 p.2', '§4.1(b) · GAP', 'v1 §4.1(a)'
  body             text NOT NULL,
  chunk_id         uuid REFERENCES aso.chunks(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_kind, source_id, source_page)
);
CREATE INDEX passages_scope_ix ON patient_gpt.passages (practice_id, patient_id, case_id);

CREATE TABLE patient_gpt.search_queries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id      uuid NOT NULL REFERENCES aso.practices(id) ON DELETE RESTRICT,
  user_id          uuid NOT NULL REFERENCES aso.users(id) ON DELETE RESTRICT,
  scope_kind       text NOT NULL CHECK (scope_kind IN ('global','patient','case')),
  patient_id       uuid REFERENCES aso.patients(id) ON DELETE SET NULL,
  case_id          uuid REFERENCES aso.cases(id) ON DELETE SET NULL,
  query            text NOT NULL,
  result_count     integer NOT NULL CHECK (result_count >= 0),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER search_queries_append_only BEFORE UPDATE OR DELETE ON patient_gpt.search_queries
  FOR EACH ROW EXECUTE FUNCTION patient_gpt.append_only();

-- ---------------------------------------------------------------------------
-- 8. Generated records: a view, so a record cannot outlive its source fact
-- ---------------------------------------------------------------------------

CREATE VIEW patient_gpt.case_records AS
  SELECT s.case_id, 'statement'::text AS kind, s.id AS record_id, s.title, s.recorded_at AS at
    FROM patient_gpt.surgeon_statements s
  UNION ALL
  SELECT r.case_id, 'request', r.id, 'Staff request', r.sent_at
    FROM patient_gpt.staff_requests r
  UNION ALL
  SELECT g.case_id, 'gates', g.id, 'Gate affirmation', g.affirmed_at
    FROM aso.gate_affirmations g
  UNION ALL
  SELECT l.case_id, 'letter', l.id, 'Letter of medical necessity v' || l.version, l.created_at
    FROM aso.letters l
  UNION ALL
  SELECT sb.case_id, 'packet', sb.id, 'Submission packet', sb.submitted_at
    FROM aso.submissions sb
  UNION ALL
  SELECT sb.case_id, 'receipt', rc.id, 'Submission receipt', coalesce(rc.received_at, rc.created_at)
    FROM aso.receipts rc JOIN aso.submissions sb ON sb.id = rc.submission_id
  UNION ALL
  SELECT b.case_id, 'brief', b.id, 'Peer-to-peer brief', b.prepared_at
    FROM patient_gpt.peer_review_briefs b
  UNION ALL
  SELECT o.case_id, 'outcome', o.peer_review_id, 'Peer-to-peer outcome: ' || o.result, o.recorded_at
    FROM patient_gpt.peer_review_call_outcomes o
  UNION ALL
  SELECT d.case_id, 'determination', d.id, 'Determination: ' || d.outcome, d.decided_on::timestamptz
    FROM aso.determinations d;

-- The documents waiting in a patient's inbox: received, not yet filed to a case.
CREATE VIEW patient_gpt.patient_inbox AS
  SELECT d.patient_id, d.id AS document_id, d.name, d.effective_date, d.ingest_method, d.retrieved_at
    FROM aso.documents d
   WHERE d.case_id IS NULL;

-- ---------------------------------------------------------------------------
-- 9. Tenant isolation, as in the workbench
-- ---------------------------------------------------------------------------

ALTER TABLE patient_gpt.conversations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_gpt.surgeon_statements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_gpt.coach_questions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_gpt.case_conflicts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_gpt.staff_requests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_gpt.peer_review_briefs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_gpt.passages                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_gpt.search_queries           ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_tenant      ON patient_gpt.conversations      USING (practice_id IN (SELECT aso.current_app_practice_ids()));
CREATE POLICY surgeon_statements_tenant ON patient_gpt.surgeon_statements USING (practice_id IN (SELECT aso.current_app_practice_ids()));
CREATE POLICY coach_questions_tenant    ON patient_gpt.coach_questions    USING (practice_id IN (SELECT aso.current_app_practice_ids()));
CREATE POLICY case_conflicts_tenant     ON patient_gpt.case_conflicts     USING (practice_id IN (SELECT aso.current_app_practice_ids()));
CREATE POLICY staff_requests_tenant     ON patient_gpt.staff_requests     USING (practice_id IN (SELECT aso.current_app_practice_ids()));
CREATE POLICY peer_review_briefs_tenant ON patient_gpt.peer_review_briefs USING (practice_id IN (SELECT aso.current_app_practice_ids()));
CREATE POLICY passages_tenant           ON patient_gpt.passages           USING (practice_id IN (SELECT aso.current_app_practice_ids()));
CREATE POLICY search_queries_tenant     ON patient_gpt.search_queries     USING (practice_id IN (SELECT aso.current_app_practice_ids()));

-- Child tables (messages, runs, run_events, surfaces, surface_messages,
-- surface_actions, question_answers, staff_request_items, call outcomes)
-- inherit isolation through their parent's foreign key and are reached only
-- through views and functions that join the parent; the host never queries
-- them directly for a practice it cannot see.

RESET search_path;
