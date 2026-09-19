-- Capability keys and role grants required by the browser case-to-letter flow.
-- Apply after schema.sql and before mounting any web-01 through web-15 command.

BEGIN;
SET search_path = aso, public;

INSERT INTO capabilities (key, label, description, is_clinical) VALUES
  ('case:read', 'Read an authorized case', 'Read a case under verified practice scope.', false),
  ('case_write', 'Prepare a case', 'Create, edit, and advance nonclinical case state.', false),
  ('document_upload', 'Upload case documents', 'Commit document metadata and protected bytes.', false),
  ('document_process', 'Process an authorized document job', 'Narrow internal processor grant; never assigned to a human role.', false),
  ('resolve_administering_entity', 'Resolve the administering entity', 'Commit the payer delegate and submission path.', false),
  ('criteria_select', 'Select controlling criteria', 'Commit an immutable criteria snapshot for a case.', false),
  ('evidence_assemble', 'Assemble case evidence', 'Commit a three-state evidence revision.', false),
  ('evidence_obtain', 'Complete missing-evidence work', 'Request and complete coordinator evidence work.', false),
  ('letter_generate', 'Generate a cited draft', 'Create a draft from current committed evidence and gate revisions.', false),
  ('letter_review', 'Record letter QA', 'Record QA and claim-support decisions.', false),
  ('letter_approve', 'Approve a clinical letter', 'Bind a surgeon approval to the reviewed claim set. Clinical act.', true),
  ('determination_record', 'Record a payer determination', 'Commit a sourced decision against an acknowledged submission.', false),
  ('determination_correct', 'Correct parsed determination fields', 'Commit a human-reviewed correction without changing its source.', false),
  ('determination_classify', 'Confirm the response class', 'Commit the reviewed denial-response path.', false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_capabilities (role_id, capability_key)
SELECT r.id, grant_key.key
  FROM roles r
  JOIN LATERAL (VALUES
    ('staff','case:read'), ('staff','case_write'),
    ('staff','document_upload'), ('staff','resolve_administering_entity'),
    ('staff','criteria_select'), ('staff','evidence_assemble'),
    ('staff','evidence_obtain'), ('staff','letter_generate'),
    ('staff','letter_review'), ('staff','determination_record'),
    ('staff','determination_correct'), ('staff','determination_classify'),
    ('surgeon','case:read'), ('surgeon','case_write'),
    ('surgeon','document_upload'), ('surgeon','resolve_administering_entity'),
    ('surgeon','criteria_select'), ('surgeon','evidence_assemble'),
    ('surgeon','letter_generate'), ('surgeon','letter_review'),
    ('surgeon','letter_approve'), ('surgeon','determination_record'),
    ('surgeon','determination_correct'), ('surgeon','determination_classify')
  ) AS grant_key(role_key, key) ON grant_key.role_key = r.key
ON CONFLICT DO NOTHING;

-- Submission acknowledgement is case work. Configuration authority does not
-- grant it, including on databases created from an older baseline that did.
DELETE FROM role_capabilities rc
 USING roles r
 WHERE rc.role_id = r.id
   AND r.key = 'admin'
   AND rc.capability_key = 'submit';

COMMIT;
