-- Reversible reader cutback for the web case-to-letter criteria migration.
-- Disable canonical criteria writers before running this file. Reapply with
-- schema-web-case-to-letter.sql after the cause of rollback is corrected.

BEGIN;
SET search_path = aso, public;

LOCK TABLE criteria, policy_criteria_legacy, case_evidence IN ACCESS EXCLUSIVE MODE;

SELECT verify_web00_criteria_rollback();

DROP VIEW policy_criteria;

DROP TRIGGER policy_criteria_legacy_write_refusal ON policy_criteria_legacy;
ALTER TABLE policy_criteria_legacy RENAME TO policy_criteria;

ALTER TABLE case_evidence
  DROP CONSTRAINT case_evidence_criterion_id_fkey;
ALTER TABLE case_evidence
  RENAME COLUMN criterion_id TO policy_criterion_id;
ALTER TABLE case_evidence
  ADD CONSTRAINT case_evidence_policy_criterion_id_fkey
  FOREIGN KEY (policy_criterion_id) REFERENCES policy_criteria(id) ON DELETE RESTRICT;

COMMIT;
