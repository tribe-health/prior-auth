//! Outbound ports. The core depends on these traits; adapters implement them.
//!
//! Nothing here names a database, an HTTP client, or a shell. A Postgres
//! adapter and an in-memory test adapter are interchangeable from the core's
//! point of view, which is what makes the core testable without a container.

use crate::domain::*;
use async_trait::async_trait;

#[async_trait]
pub trait DocumentProcessor: Send + Sync {
    async fn extract_pages(
        &self,
        media_type: crate::document_upload::DocumentMediaType,
        bytes: Vec<u8>,
    ) -> Result<
        Vec<crate::document_processing::ExtractedDocumentPage>,
        crate::document_processing::DocumentExtractionError,
    >;
}

#[async_trait]
pub trait CaseRepository: Send + Sync {
    async fn authorize_administering_entity_target(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
    ) -> Result<(), crate::administering_entity::ResolutionError> {
        Err(crate::administering_entity::ResolutionError::Unavailable)
    }

    async fn resolve_administering_entity(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: &crate::administering_entity::ResolveAdministeringEntityCommand,
    ) -> Result<
        crate::administering_entity::ResolutionCommandReceipt,
        crate::administering_entity::ResolutionError,
    > {
        Err(crate::administering_entity::ResolutionError::Unavailable)
    }

    async fn read_administering_entity(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
    ) -> Result<
        crate::administering_entity::AdministeringEntityResolution,
        crate::administering_entity::ResolutionError,
    > {
        Err(crate::administering_entity::ResolutionError::Unavailable)
    }

    async fn lookup_administering_entity_command(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
        _: uuid::Uuid,
    ) -> Result<
        Option<crate::administering_entity::ResolutionCommandReceipt>,
        crate::administering_entity::ResolutionError,
    > {
        Err(crate::administering_entity::ResolutionError::Unavailable)
    }

    async fn create_case(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: &crate::case_management::CreateCaseCommand,
    ) -> Result<crate::case_management::CaseCommandResult, crate::case_management::CaseError> {
        Err(crate::case_management::CaseError::Unavailable)
    }

    async fn update_case(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: &crate::case_management::UpdateCaseCommand,
    ) -> Result<crate::case_management::CaseCommandResult, crate::case_management::CaseError> {
        Err(crate::case_management::CaseError::Unavailable)
    }

    async fn transition_case(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: &crate::case_management::TransitionCaseCommand,
    ) -> Result<crate::case_management::CaseCommandResult, crate::case_management::CaseError> {
        Err(crate::case_management::CaseError::Unavailable)
    }

    async fn read_case(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
    ) -> Result<crate::case_management::CaseRecord, crate::case_management::CaseError> {
        Err(crate::case_management::CaseError::Unavailable)
    }

    async fn authorize_case_write_target(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
    ) -> Result<(), crate::case_management::CaseError> {
        Err(crate::case_management::CaseError::Unavailable)
    }

    async fn list_cases(
        &self,
        _: &crate::affirmation::ClinicalContext,
    ) -> Result<Vec<crate::case_management::CaseRecord>, crate::case_management::CaseError> {
        Err(crate::case_management::CaseError::Unavailable)
    }

    async fn lookup_create_case_command(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
    ) -> Result<Option<crate::case_management::CaseCommandResult>, crate::case_management::CaseError>
    {
        Err(crate::case_management::CaseError::Unavailable)
    }

    async fn lookup_case_command(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
        _: uuid::Uuid,
    ) -> Result<Option<crate::case_management::CaseCommandResult>, crate::case_management::CaseError>
    {
        Err(crate::case_management::CaseError::Unavailable)
    }

    /// Legacy adapters cannot silently accept authenticated durable commands.
    async fn execute_gate_command(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: &crate::affirmation::GateCommand,
    ) -> Result<crate::affirmation::GateCommandResult, crate::affirmation::GateError> {
        Err(crate::affirmation::GateError::Unavailable)
    }

    async fn read_verified_gate(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
    ) -> Result<crate::affirmation::GateSnapshot, crate::affirmation::GateError> {
        Err(crate::affirmation::GateError::Unavailable)
    }

    async fn lookup_gate_command(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
    ) -> Result<Option<crate::affirmation::GateCommandResult>, crate::affirmation::GateError> {
        Err(crate::affirmation::GateError::Unavailable)
    }

    async fn gate_state(&self, case_id: CaseId) -> Result<GateState, DomainError>;

    async fn record_affirmation(
        &self,
        case_id: CaseId,
        kind: GateAffirmationKind,
        actor: ActorId,
        at: chrono::DateTime<chrono::Utc>,
    ) -> Result<GateState, DomainError>;
}

#[async_trait]
pub trait EvidenceRepository: Send + Sync {
    async fn assemble_case_evidence(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
        _: &crate::evidence_assembly::AssembleEvidenceCommand,
    ) -> Result<
        crate::evidence_assembly::EvidenceCommandResult,
        crate::evidence_assembly::EvidenceAssemblyError,
    > {
        Err(crate::evidence_assembly::EvidenceAssemblyError::Unavailable)
    }

    async fn read_case_evidence(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
    ) -> Result<
        crate::evidence_assembly::EvidenceSnapshot,
        crate::evidence_assembly::EvidenceAssemblyError,
    > {
        Err(crate::evidence_assembly::EvidenceAssemblyError::Unavailable)
    }

    async fn lookup_evidence_assembly_command(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
        _: uuid::Uuid,
    ) -> Result<
        Option<crate::evidence_assembly::EvidenceCommandResult>,
        crate::evidence_assembly::EvidenceAssemblyError,
    > {
        Err(crate::evidence_assembly::EvidenceAssemblyError::Unavailable)
    }

    async fn process_case_document(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: &crate::document_processing::ProcessCaseDocumentCommand,
    ) -> Result<
        crate::document_processing::DocumentProcessingResult,
        crate::document_processing::DocumentProcessingError,
    > {
        Err(crate::document_processing::DocumentProcessingError::Unavailable)
    }

    async fn lookup_document_process_command(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
        _: uuid::Uuid,
        _: uuid::Uuid,
    ) -> Result<
        Option<crate::document_processing::DocumentProcessingResult>,
        crate::document_processing::DocumentProcessingError,
    > {
        Err(crate::document_processing::DocumentProcessingError::Unavailable)
    }

    async fn authorize_document_upload_target(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
    ) -> Result<(), crate::document_upload::DocumentUploadError> {
        Err(crate::document_upload::DocumentUploadError::Unavailable)
    }

    async fn upload_case_document(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: &crate::document_upload::UploadCaseDocumentCommand,
        _: Vec<u8>,
    ) -> Result<
        crate::document_upload::DocumentUploadResult,
        crate::document_upload::DocumentUploadError,
    > {
        Err(crate::document_upload::DocumentUploadError::Unavailable)
    }

    async fn read_case_document(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
        _: uuid::Uuid,
    ) -> Result<crate::document_upload::DocumentMetadata, crate::document_upload::DocumentUploadError>
    {
        Err(crate::document_upload::DocumentUploadError::Unavailable)
    }

    async fn lookup_document_upload_command(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
        _: uuid::Uuid,
    ) -> Result<
        Option<crate::document_upload::DocumentUploadResult>,
        crate::document_upload::DocumentUploadError,
    > {
        Err(crate::document_upload::DocumentUploadError::Unavailable)
    }

    /// Opens source bytes only after repository-level scope authorization and
    /// commits the corresponding read audit before returning.
    async fn open_document_source(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: crate::source::DocumentSourceRequest,
    ) -> Result<crate::source::DocumentSource, crate::source::DocumentSourceError> {
        Err(crate::source::DocumentSourceError::Unavailable)
    }

    async fn read_annotation_target(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
        _: uuid::Uuid,
    ) -> Result<(), crate::annotation::AnnotationError> {
        Err(crate::annotation::AnnotationError::Unavailable)
    }

    async fn execute_annotation(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: &crate::annotation::AnnotationCommand,
    ) -> Result<crate::annotation::AnnotationResult, crate::annotation::AnnotationError> {
        Err(crate::annotation::AnnotationError::Unavailable)
    }

    async fn lookup_annotation_command(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
    ) -> Result<Option<crate::annotation::AnnotationResult>, crate::annotation::AnnotationError>
    {
        Err(crate::annotation::AnnotationError::Unavailable)
    }

    async fn read_reassessment_target(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
        _: uuid::Uuid,
    ) -> Result<
        crate::reassessment::EvidenceReassessmentTarget,
        crate::reassessment::ReassessmentError,
    > {
        Err(crate::reassessment::ReassessmentError::Unavailable)
    }

    async fn execute_reassessment(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: &crate::reassessment::ReassessEvidenceCommand,
    ) -> Result<crate::reassessment::ReassessEvidenceResult, crate::reassessment::ReassessmentError>
    {
        Err(crate::reassessment::ReassessmentError::Unavailable)
    }

    async fn lookup_reassessment_command(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
    ) -> Result<
        Option<crate::reassessment::ReassessEvidenceResult>,
        crate::reassessment::ReassessmentError,
    > {
        Err(crate::reassessment::ReassessmentError::Unavailable)
    }

    /// Counts by state, which is what the dashboard tiles read. Returned as a
    /// triple rather than a map so a caller cannot forget that `Void` exists.
    async fn counts(&self, case_id: CaseId) -> Result<EvidenceCounts, DomainError>;
}

#[derive(Debug, Clone, Copy, Default, serde::Serialize, serde::Deserialize)]
pub struct EvidenceCounts {
    pub met: u32,
    pub gap: u32,
    pub void: u32,
}

#[async_trait]
pub trait CriteriaRepository: Send + Sync {
    async fn select_case_criteria(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
        _: &crate::criteria_selection::SelectCriteriaCommand,
    ) -> Result<
        crate::criteria_selection::CriteriaSelectionResult,
        crate::criteria_selection::CriteriaSelectionError,
    > {
        Err(crate::criteria_selection::CriteriaSelectionError::Unavailable)
    }

    async fn read_criteria_selection(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
    ) -> Result<
        crate::criteria_selection::CriteriaSelectionSnapshot,
        crate::criteria_selection::CriteriaSelectionError,
    > {
        Err(crate::criteria_selection::CriteriaSelectionError::Unavailable)
    }

    async fn lookup_criteria_selection_command(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
        _: uuid::Uuid,
    ) -> Result<
        Option<crate::criteria_selection::CriteriaSelectionResult>,
        crate::criteria_selection::CriteriaSelectionError,
    > {
        Err(crate::criteria_selection::CriteriaSelectionError::Unavailable)
    }

    async fn import_catalog(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: &crate::criteria_catalog::ImportCriteriaCatalogCommand,
    ) -> Result<
        crate::criteria_catalog::CriteriaCatalogImportResult,
        crate::criteria_catalog::CriteriaCatalogError,
    > {
        Err(crate::criteria_catalog::CriteriaCatalogError::Unavailable)
    }

    async fn list_catalog(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: Option<uuid::Uuid>,
    ) -> Result<
        crate::criteria_catalog::CriteriaCatalogSnapshot,
        crate::criteria_catalog::CriteriaCatalogError,
    > {
        Err(crate::criteria_catalog::CriteriaCatalogError::Unavailable)
    }

    async fn read_catalog_criterion(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
    ) -> Result<
        crate::criteria_catalog::CatalogCriterion,
        crate::criteria_catalog::CriteriaCatalogError,
    > {
        Err(crate::criteria_catalog::CriteriaCatalogError::Unavailable)
    }

    async fn lookup_import_command(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
    ) -> Result<
        Option<crate::criteria_catalog::CriteriaCatalogImportResult>,
        crate::criteria_catalog::CriteriaCatalogError,
    > {
        Err(crate::criteria_catalog::CriteriaCatalogError::Unavailable)
    }

    async fn get(&self, id: CriterionId) -> Result<Criterion, DomainError>;

    /// Live criteria for a payer, ranked by grade and recency decay.
    async fn live_for_payer(&self, payer: &str) -> Result<Vec<Criterion>, DomainError>;
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Criterion {
    pub id: CriterionId,
    pub label: String,
    pub requirement: String,
    pub grade: EvidenceGrade,
    /// Blended similarity × grade × recency. A two-year-old derived rule sinks
    /// below current published policy rather than tying with it.
    pub retrieval_weight: f32,
}

#[async_trait]
pub trait LetterRepository: Send + Sync {
    fn document_tasks(&self) -> Option<&dyn crate::document_generation::DurableDocumentTasks> {
        None
    }
    async fn read_submission_packet(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
    ) -> Result<
        crate::submission_workflow::SubmissionPacketSnapshot,
        crate::submission_workflow::SubmissionWorkflowError,
    > {
        Err(crate::submission_workflow::SubmissionWorkflowError::Unavailable)
    }
    async fn submit_packet(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
        _: &crate::submission_workflow::SubmitPacketCommand,
    ) -> Result<
        crate::submission_workflow::SubmissionPacketSnapshot,
        crate::submission_workflow::SubmissionWorkflowError,
    > {
        Err(crate::submission_workflow::SubmissionWorkflowError::Unavailable)
    }
    async fn read_submission_receipt(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
    ) -> Result<
        crate::submission_workflow::SubmissionReceiptView,
        crate::submission_workflow::SubmissionWorkflowError,
    > {
        Err(crate::submission_workflow::SubmissionWorkflowError::Unavailable)
    }
    async fn record_submission_acknowledgement(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
        _: &crate::submission_workflow::RecordAcknowledgementCommand,
    ) -> Result<
        crate::submission_workflow::SubmissionReceiptView,
        crate::submission_workflow::SubmissionWorkflowError,
    > {
        Err(crate::submission_workflow::SubmissionWorkflowError::Unavailable)
    }
    async fn record_determination(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
        _: &crate::letter_workflow::RecordDeterminationCommand,
    ) -> Result<
        crate::letter_workflow::DeterminationSnapshot,
        crate::letter_workflow::LetterWorkflowError,
    > {
        Err(crate::letter_workflow::LetterWorkflowError::Unavailable)
    }
    async fn read_latest_determination(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
    ) -> Result<
        crate::letter_workflow::DeterminationSnapshot,
        crate::letter_workflow::LetterWorkflowError,
    > {
        Err(crate::letter_workflow::LetterWorkflowError::Unavailable)
    }
    async fn confirm_response_mode(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
        _: &crate::letter_workflow::ConfirmResponseModeCommand,
    ) -> Result<
        crate::letter_workflow::DeterminationResponseModeResult,
        crate::letter_workflow::LetterWorkflowError,
    > {
        Err(crate::letter_workflow::LetterWorkflowError::Unavailable)
    }
    async fn generate_letter(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
        _: &crate::letter_workflow::GenerateLetterCommand,
    ) -> Result<
        crate::letter_workflow::LetterCommandResult,
        crate::letter_workflow::LetterWorkflowError,
    > {
        Err(crate::letter_workflow::LetterWorkflowError::Unavailable)
    }
    async fn read_letter(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
    ) -> Result<crate::letter_workflow::LetterSnapshot, crate::letter_workflow::LetterWorkflowError>
    {
        Err(crate::letter_workflow::LetterWorkflowError::Unavailable)
    }
    async fn review_letter(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
        _: &crate::letter_workflow::ReviewLetterCommand,
    ) -> Result<
        crate::letter_workflow::LetterCommandResult,
        crate::letter_workflow::LetterWorkflowError,
    > {
        Err(crate::letter_workflow::LetterWorkflowError::Unavailable)
    }
    async fn approve_letter(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
        _: &crate::letter_workflow::ApproveLetterCommand,
    ) -> Result<
        crate::letter_workflow::LetterCommandResult,
        crate::letter_workflow::LetterWorkflowError,
    > {
        Err(crate::letter_workflow::LetterWorkflowError::Unavailable)
    }
    async fn lookup_letter_workflow_command(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
    ) -> Result<
        Option<crate::letter_workflow::LetterCommandResult>,
        crate::letter_workflow::LetterWorkflowError,
    > {
        Err(crate::letter_workflow::LetterWorkflowError::Unavailable)
    }

    /// Legacy adapters refuse verified signing until they implement the
    /// authoritative clinical transaction.
    async fn read_signing_target(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: LetterId,
    ) -> Result<crate::signing::SigningTarget, crate::signing::SigningError> {
        Err(crate::signing::SigningError::Unavailable)
    }

    async fn execute_sign_letter(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: &crate::signing::SignLetterCommand,
    ) -> Result<crate::signing::SignLetterResult, crate::signing::SigningError> {
        Err(crate::signing::SigningError::Unavailable)
    }

    async fn lookup_sign_letter_command(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
    ) -> Result<Option<crate::signing::SignLetterResult>, crate::signing::SigningError> {
        Err(crate::signing::SigningError::Unavailable)
    }

    async fn get(&self, id: LetterId) -> Result<Letter, DomainError>;

    /// Retrieved criteria that are not citable as policy and have neither been
    /// attributed nor explicitly excluded by the surgeon. Signing is blocked
    /// while this is non-empty.
    async fn unresolved_non_policy_retrievals(
        &self,
        id: LetterId,
    ) -> Result<Vec<CriterionId>, DomainError>;

    async fn sign(
        &self,
        id: LetterId,
        actor: ActorId,
        at: chrono::DateTime<chrono::Utc>,
    ) -> Result<Letter, DomainError>;
}

/// Resolves capabilities for an actor.
///
/// Backed by the gateway's policy decision in production. An AI assistant
/// acting for a surgeon is a *different principal* and resolves to a different
/// capability set — it does not inherit the surgeon's clinical authority.
#[async_trait]
pub trait AuthorityPort: Send + Sync {
    async fn may_annotate(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
        _: uuid::Uuid,
    ) -> Result<bool, crate::annotation::AnnotationError> {
        Ok(false)
    }

    /// The existing actor-only scaffold grants no verified clinical authority.
    async fn may_affirm_gate(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
    ) -> Result<bool, crate::affirmation::GateError> {
        Ok(false)
    }

    async fn may_sign_letter(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: LetterId,
    ) -> Result<bool, crate::signing::SigningError> {
        Ok(false)
    }

    async fn may_reassess_evidence(
        &self,
        _: &crate::affirmation::ClinicalContext,
        _: uuid::Uuid,
        _: uuid::Uuid,
    ) -> Result<bool, crate::reassessment::ReassessmentError> {
        Ok(false)
    }

    async fn holds(&self, actor: ActorId, capability: Capability) -> Result<bool, DomainError>;
}

/// Injected so tests can pin time rather than sleep.
pub trait Clock: Send + Sync {
    fn now(&self) -> chrono::DateTime<chrono::Utc>;
}

pub struct SystemClock;
impl Clock for SystemClock {
    fn now(&self) -> chrono::DateTime<chrono::Utc> {
        chrono::Utc::now()
    }
}
