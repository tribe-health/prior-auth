# PatientGPT · data model

**Status** Proposed · **Date** 2026-10-04 · **Applies to** web, Tauri and Flutter shells

PatientGPT adds a conversational layer to the Prior Authorization Workbench.
It does not own clinical facts. Patients, cases, documents, criteria evidence,
gates, letters, submissions, receipts, peer reviews and determinations stay in
the workbench schema (`../../../docs/design/schema/schema.sql`) with their
existing authority triggers. This document names what PatientGPT adds, what it
derives, and what it deliberately does not store.

The DDL is in [`schema/patient-gpt.sql`](schema/patient-gpt.sql). Every table
lives in the `patient_gpt` schema and references the workbench's `aso`
tables by foreign key.

## 1. Principles

1. **One source of clinical truth.** A criterion's state is `case_evidence.state`.
   A gate is `gate_affirmations`. A letter is `letters`. PatientGPT reads
   them; it never keeps a second copy that could disagree.
2. **A statement is not evidence.** What the surgeon says in chat is recorded
   as a `surgeon_statement`, attributed to the surgeon with a timestamp. It can
   be quoted in a letter as the surgeon's statement. It can never be cited as
   support for a criterion; `evidence_citations` only reference documents.
3. **The assistant proposes, the surgeon acts.** Every assistant output is an
   append-only event or a surface. Every clinical act goes through the
   workbench's existing command path and triggers, from the same session the
   surgeon is signed into.
4. **Append-only where it matters.** Run events, surface messages, surface
   actions, statements and search queries are never updated or deleted.
5. **No outcome without a source.** A case becomes approved or denied only from
   a filed determination document or a surgeon-recorded peer-to-peer result.

## 2. Entity map

```
aso.patients ──< aso.cases ──< aso.case_evidence ──< aso.evidence_citations ──> aso.documents
      │                 │
      │                 ├──< patient_gpt.conversations (scope = case)
      ├──< patient_gpt.conversations (scope = patient)        │
      │                                                        ├──< patient_gpt.messages ──< patient_gpt.message_documents
      │                                                        └──< patient_gpt.runs ──< patient_gpt.run_events
      │                                                                   └──< patient_gpt.surfaces ──< surface_messages, surface_actions
      ├──< patient_gpt.coach_questions ──< question_answers ──> patient_gpt.surgeon_statements
      ├──< patient_gpt.case_conflicts ──────────────────────────> patient_gpt.surgeon_statements
      ├──< patient_gpt.staff_requests ──< staff_request_items
      ├──< patient_gpt.peer_review_briefs ──> aso.peer_reviews
      └──< patient_gpt.peer_review_call_outcomes ──> aso.peer_reviews
patient_gpt.passages ──> (document page | case_evidence | letter_claim | conversation)
patient_gpt.search_queries
```

Conversations with `scope_kind = 'global'` reference neither a patient nor a
case.

## 3. Tables

### 3.1 Conversations and messages

| Table | Purpose | Key columns |
|---|---|---|
| `conversations` | one chat; scoped to all patients, one patient or one case | `scope_kind`, `patient_id`, `case_id`, `owner_user_id`, `title`, `last_activity_at`, `archived_at` |
| `conversation_rescopes` | the history of a chat moving from global to a patient or case when a context row is chosen | `from_scope_kind`, `to_scope_kind`, `patient_id`, `case_id`, `by_user_id` |
| `messages` | a user or assistant turn in display order | `seq`, `role`, `body`, `author_user_id`, `run_id` |
| `message_documents` | documents attached to a user message; attaching is what files an unfiled document to the case | `message_id`, `document_id` |

Scope rules, enforced by check constraint: `global` has no patient and no
case; `patient` has a patient and no case; `case` has both, and the case must
belong to that patient (trigger). A rescope only narrows: global → patient,
global → case, patient → case.

History lists in the sidebar are queries over `conversations`: global rows,
one patient's rows, one case's rows, ordered by `last_activity_at`.

### 3.2 Runs and events (AG-UI)

| Table | Purpose | Key columns |
|---|---|---|
| `runs` | one assistant turn answering one user message | `conversation_id`, `message_id`, `status` (`running`, `success`, `interrupt`, `stopped`, `failed`), `interrupt_id`, `interrupt_reason`, `model_name`, `started_at`, `finished_at` |
| `run_events` | the streamed event log, append-only | `seq`, `at_ms`, `event_type`, `payload` |

`event_type` is the AG-UI vocabulary the prototype already uses:
`RUN_STARTED`, `STEP_STARTED`, `STEP_FINISHED`, `TOOL_CALL_START`,
`TOOL_CALL_ARGS`, `TOOL_CALL_END`, `TOOL_CALL_RESULT`, `TEXT_MESSAGE_START`,
`TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END`, `STATE_DELTA`, `CUSTOM`,
`RUN_FINISHED`. The log is the replayable record of what the assistant did; the
"Worked for 9 s · 4 tool calls" disclosure is a projection of it
(`run_tool_calls` view).

A `STATE_DELTA` in the prototype patches the case record directly. In the
product it is a *proposal*: the host applies it through the workbench command
path (for example, filing a document and re-assessing `case_evidence`), and the
event stays as the record of what the assistant asserted. A delta the host
rejects leaves the event in the log with `payload->>'applied' = 'false'`.

An `interrupt` run is how the assistant pauses for a surgeon act. Interrupt
ids are a closed set: `gates`, `p2p_outcome`.

### 3.3 Surfaces and actions (A2UI)

| Table | Purpose | Key columns |
|---|---|---|
| `surfaces` | the current projection of one drawn surface | `surface_id`, `catalog_id`, `components`, `data_model`, `run_id` |
| `surface_messages` | the append-only A2UI messages that built it (`createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface`) | `seq`, `kind`, `payload` |
| `surface_actions` | what the user did on a surface | `action_name`, `context`, `actor_user_id`, `resulting_run_id` |
| `surface_catalog_components` | the allow-list, per catalogue version | `catalog_id`, `component` |
| `surface_action_names` | the allow-list of actions | `action_name` |

Catalogue `aso.workbench/v1` allows: `Column`, `Row`, `Section`, `Text`,
`Citation`, `Button`, `CaseHeader`, `CriteriaList`, `ConflictList`,
`BlockerList`, `NextMove`, `ChoiceQuestion`, `StaffRequest`, `ContextList`,
`DocumentList`, `PointList`, `Suggestions`. Allowed actions:
`answer_question`, `send_staff_request`, `open_source`, `set_context`,
`run_prompt`. Anything else is refused in place by the renderer and rejected
by the `surface_actions` foreign key. No affirmation, signing, submission or
outcome control is in the catalogue, by design.

### 3.4 Questions, statements and conflicts

| Table | Purpose | Key columns |
|---|---|---|
| `coach_questions` | the one question the assistant may have open on a case | `case_id`, `question_key`, `ask`, `basis`, `source_document_id`, `source_page`, `options`, `status`, `asked_in_run_id` |
| `question_answers` | the surgeon's answer; one per question | `value`, `label`, `note`, `answered_by`, `statement_id` |
| `surgeon_statements` | a clinical statement attributed to the surgeon, dated | `case_id`, `statement_key`, `title`, `body`, `author_user_id`, `origin` |
| `case_conflicts` | a clinical clarification the chart raises (the left-calf question) that blocks a gate until resolved | `kind`, `body`, `source_document_id`, `source_page`, `blocks_gate_kind`, `status`, `resolved_by_statement_id` |

One open question per case at a time is a partial unique index on
`coach_questions (case_id) WHERE status = 'open'`. A statement's
`author_user_id` must hold the `surgeon` role in the case's practice
(`enforce_statement_authority` trigger, mirroring the gate trigger).

Question keys seen in the prototype: `side` (operative side vs. new symptom),
`policy` (confirm the matched policy at intake), `prior_care` (care given
outside the chart), `pt_stop` (why therapy stopped, before a peer-to-peer).
Keys are data, not an enum, so the agent can add questions without a
migration.

### 3.5 Staff requests

| Table | Purpose | Key columns |
|---|---|---|
| `staff_requests` | a request from the surgeon to the coordinator, sent from a surface | `case_id`, `conversation_id`, `requested_by`, `assignee_user_id`, `sent_at`, `status` |
| `staff_request_items` | one line per thing asked for | `body`, `policy_criterion_id`, `status`, `fulfilled_by_document_id` |

A request changes nothing on `case_evidence`. An item is fulfilled only by
pointing at the document that arrived; the re-assessment that moves the
criterion happens through the workbench, not here.

### 3.6 Peer-to-peer

| Table | Purpose | Key columns |
|---|---|---|
| `peer_review_briefs` | the talking points prepared for a call, each point with its citations | `peer_review_id`, `case_id`, `points`, `statement_id`, `prepared_in_run_id` |
| `peer_review_call_outcomes` | the surgeon's record of how the call went, before the written determination arrives | `peer_review_id`, `result` (`overturned`, `upheld`), `recorded_by`, `recorded_at` |

Recording a call outcome updates `aso.peer_reviews.outcome` through the
workbench command path and moves the case to `approved` or `denied`; the
written determination, when it arrives, is filed as a document and a
`determinations` row like any other.

### 3.7 Search

| Table | Purpose | Key columns |
|---|---|---|
| `passages` | one embeddable passage per document page, criterion assessment, letter claim or conversation | `source_kind`, `source_id`, `patient_id`, `case_id`, `body`, `chunk_id` |
| `search_queries` | who searched what, in which scope; audit only | `user_id`, `scope_kind`, `patient_id`, `case_id`, `query`, `result_count` |

Vectors are not stored here. `passages.chunk_id` points at the workbench's AI
retrieval layer (`schema-ai.sql`: `chunks` and the `chunk_vectors_*` tables),
so one embedding model policy serves both products. Unfiled documents
(`documents.case_id IS NULL`) have no passages until they are filed.

### 3.8 Generated records (a view)

`case_records` is a view, not a table. It unions what a case has produced into
the list the Files panel shows, oldest first:

| kind | source |
|---|---|
| `statement` | `surgeon_statements` |
| `request` | `staff_requests` |
| `gates` | `aso.gate_affirmations` |
| `letter` | `aso.letters` |
| `packet` | `aso.submissions` + `submission_attachments` |
| `receipt` | `aso.receipts` |
| `brief` | `peer_review_briefs` |
| `outcome` | `peer_review_call_outcomes` |
| `determination` | `aso.determinations` |

Keeping it a view means a record can never exist without the fact that
produced it.

## 4. Case state

`aso.cases.status` stays authoritative and is written by the host. The
prototype derives the status from the working record; the product keeps that
derivation as the *expected* status the host asserts after each command, so a
mismatch is a bug rather than a second opinion. The order and labels are the
workbench's `case_statuses`.

| Condition, first match wins | Status |
|---|---|
| a determination with outcome `approved` / `denied`, or a call outcome | `approved` / `denied` |
| a peer review scheduled and not held | `peer_review` |
| a submission exists | `submitted` |
| the current letter is signed | `ready` |
| the gates are affirmed | `drafting` |
| no policy confirmed | `intake` |
| a criterion is `void` and a request for it is open | `evidence` |
| an open conflict, or any `gap` / `void` not deferred | `policy_review` |
| otherwise | `awaiting_gate` |

"Deferred" is a `case_evidence.data->>'deferred'` flag the surgeon sets when a
`void` criterion is knowingly left out (the HbA1c that will be listed as "not
asserted").

**Next move** and **blockers** are derived the same way and never stored:
blockers are open conflicts, non-met criteria (owner from the criterion), an
unfiled determination, and unaffirmed gates; the next move is the first
blocker's remedy, or "Draft the letter".

## 5. Suggested prompts

The chips under the composer and the suggestions after every answer are a
function of scope and status, not a table:

| Status | Prompts |
|---|---|
| intake | Catch me up · Which policy applies? · What's blocking? |
| evidence | Catch me up · What's missing? · Ask staff for records |
| policy_review | Catch me up · What's blocking? · Draft the letter |
| awaiting_gate | Draft the letter · Show the evidence · Catch me up |
| drafting / ready | Open the letter / Open the packet · What's blocking? · Catch me up |
| submitted | Check payer status · Open the receipt · Catch me up |
| peer_review | Prep peer-to-peer · What did the denial cite? · Catch me up |
| approved / denied | Open the determination / What would an appeal need? · Show the evidence · Catch me up |

## 6. Authority and privacy

- Every `patient_gpt` table carries `practice_id` and is covered by the same
  row-level security policy as the workbench tables (`current_app_practice_ids()`).
- `surgeon_statements`, `question_answers`, `peer_review_call_outcomes` and
  `surface_actions` with `action_name IN ('answer_question', 'send_staff_request')`
  require the acting user to hold the matching role in the case's practice.
- Conversations are owned by a user and readable by that user and the case's
  coordinator; staff see a surgeon's chat only when the surgeon sends a
  request from it.
- Assistant-generated text is never stored in `aso.*` tables. The letter the
  assistant drafts is written through the workbench's letter workflow, which
  records `model_name` and `generated_at`.
- Synthetic data only in this repository.

## 7. Replication and shells

Following the workbench runtime architecture (Postgres → Electric → authorized
shape facade → local replica → entity graph), the web and Tauri shells receive
these shapes, scoped to the signed-in practice and user:

| Shape | Filter |
|---|---|
| `conversations`, `messages`, `message_documents` | owner or case coordinator |
| `runs` (status columns only), `surfaces` | by conversation |
| `coach_questions`, `question_answers`, `surgeon_statements`, `case_conflicts` | by case |
| `staff_requests`, `staff_request_items` | by case or assignee |
| `peer_review_briefs`, `peer_review_call_outcomes` | by case |

`run_events`, `surface_messages`, `surface_actions`, `passages` and
`search_queries` are not replicated; they stream or are queried through the
host. The Flutter client holds no replica and reads the same views through the
API.

## 8. Not stored

- Approval odds, scores or predictions of any kind.
- A second copy of criterion states, gate status, letter text or submission
  status.
- Prompt text for the composer chips (derived; section 5).
- Vectors (owned by `schema-ai.sql`).

## 9. Open questions

1. Whether the coordinator can submit a packet the surgeon signed, or only the
   surgeon. The prototype lets the surgeon submit; `enforce_submission_gate`
   decides in the product.
2. Appeal letters as a `letters.purpose = 'clinical_appeal'` flow in chat; the
   prototype lists what an appeal needs but does not draft one.
3. Retention of `run_events` and `surface_messages` (full replay vs. summary
   after N days).
4. Whether a new case opened from chat may auto-match a policy on payer alone,
   or must wait for the coordinator.
