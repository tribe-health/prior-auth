-- web-05. Expose the authoritative ready-document-set token through the
-- already authorized case detail read. Upload commands must carry this token;
-- the browser must never infer it from the eventually consistent replica.

CREATE OR REPLACE FUNCTION aso.case_record_json(target_case uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', clinical_case.id,
    'practiceId', clinical_case.practice_id,
    'patientId', clinical_case.patient_id,
    'surgeonId', clinical_case.surgeon_id,
    'coordinatorId', clinical_case.coordinator_id,
    'facilityId', clinical_case.facility_id,
    'payerId', clinical_case.payer_id,
    'caseNumber', clinical_case.case_number,
    'status', clinical_case.status,
    'memberId', clinical_case.member_id,
    'dateOfService', clinical_case.date_of_service,
    'procedureCode', clinical_case.procedure_code,
    'planKey', clinical_case.plan_key,
    'data', clinical_case.data,
    'gateAffirmedAt', clinical_case.gate_affirmed_at,
    'gateAffirmedBy', clinical_case.gate_affirmed_by,
    'revision', clinical_case.revision,
    'caseInputRevision', clinical_case.case_input_revision,
    'statusRevision', clinical_case.status_revision,
    'documentSetRevision', clinical_case.document_set_revision,
    'createdAt', clinical_case.created_at,
    'updatedAt', clinical_case.updated_at)
  FROM aso.cases clinical_case WHERE clinical_case.id = target_case;
$$;

REVOKE ALL ON FUNCTION aso.case_record_json(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aso.case_record_json(uuid) TO aso_case_owner;
