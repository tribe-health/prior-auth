//! Clinical PostgreSQL adapter. Runtime logins may execute only the approved
//! functions; migration credentials never enter this repository.

use aso_host::{
    administering_entity::{
        AdministeringEntityResolution, ResolutionCommandReceipt, ResolutionError,
        ResolveAdministeringEntityCommand,
    },
    affirmation::*,
    annotation::{AnnotationCommand, AnnotationDisposition, AnnotationError, AnnotationResult},
    case_management::{
        CaseCommandResult, CaseError, CaseRecord, CreateCaseCommand, TransitionCaseCommand,
        UpdateCaseCommand,
    },
    criteria_catalog::{
        CatalogCriterion, CriteriaCatalogError, CriteriaCatalogImportResult,
        CriteriaCatalogSnapshot, ImportCriteriaCatalogCommand,
    },
    criteria_selection::{
        CriteriaSelectionError, CriteriaSelectionResult, CriteriaSelectionSnapshot,
        SelectCriteriaCommand,
    },
    document_processing::{
        DocumentProcessingError, DocumentProcessingResult, ProcessCaseDocumentCommand,
    },
    document_upload::{
        DocumentMediaType, DocumentMetadata, DocumentProcessingStatus, DocumentUploadError,
        DocumentUploadResult, MAX_DOCUMENT_UPLOAD_PAGES, UploadCaseDocumentCommand,
    },
    domain::*,
    evidence_assembly::{
        AssembleEvidenceCommand, EvidenceAssemblyError, EvidenceCommandResult, EvidenceSnapshot,
    },
    letter_workflow::{
        ApproveLetterCommand, GenerateLetterCommand, LetterCommandResult, LetterSnapshot,
        LetterWorkflowError, ReviewLetterCommand,
    },
    ports::{
        AuthorityPort, CaseRepository, CriteriaRepository, Criterion, DocumentProcessor,
        EvidenceCounts, EvidenceRepository, LetterRepository,
    },
    reassessment::{
        EvidenceReassessmentTarget, ReassessEvidenceCommand, ReassessEvidenceResult,
        ReassessmentError,
    },
    signing::{SignLetterCommand, SignLetterResult, SigningError, SigningTarget},
    source::{DocumentSource, DocumentSourceError, DocumentSourceRequest},
    submission_workflow::{
        RecordAcknowledgementCommand, SubmissionPacketSnapshot, SubmissionReceiptView,
        SubmissionWorkflowError, SubmitPacketCommand,
    },
};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Transaction, postgres::PgPoolOptions};
use std::{sync::Arc, time::Duration};
use uuid::Uuid;

#[cfg(test)]
use super::document_store::UnavailableDocumentStore;
use super::{document_processor::BoundedDocumentProcessor, document_store::DocumentStore};

mod document_generation;

#[derive(Clone)]
pub struct PgGateRepository {
    pool: PgPool,
    document_store: Arc<dyn DocumentStore>,
    document_processor: Arc<dyn DocumentProcessor>,
    document_generation: Option<Arc<document_generation::Runtime>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DocumentSourceGrant {
    storage_key: String,
    name: String,
    effective_date: chrono::NaiveDate,
    page_count: u32,
    media_type: Option<String>,
    content_sha256: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExpiredDocumentUpload {
    identity_id: Uuid,
    practice_id: Uuid,
    command_id: Uuid,
    staging_id: Uuid,
    storage_key: String,
    content_sha256: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DocumentUploadReservation {
    state: String,
    command_id: Uuid,
    case_id: Uuid,
    document_id: Uuid,
    staging_id: Option<Uuid>,
    storage_key: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DocumentProcessingClaim {
    state: String,
    command_id: Uuid,
    case_id: Uuid,
    document_id: Uuid,
    storage_key: Option<String>,
    media_type: Option<DocumentMediaType>,
    content_sha256: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct QueuedDocumentJob {
    case_id: Uuid,
    document_id: Uuid,
    document_set_revision: i64,
}

// Check effective ownership and writes as well as role flags: a non-superuser
// with an inherited owner role could otherwise bypass the function boundary.
const ROLE_CHECK: &str = "
    SELECT pg_has_role(session_user, 'aso_gate_executor', 'USAGE')
      AND NOT EXISTS (
        SELECT 1 FROM pg_roles r
        WHERE (r.rolname = 'aso_gate_executor'
          OR pg_has_role(session_user, r.oid, 'MEMBER')) AND (
          r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication
          OR (r.rolname = 'aso_gate_executor' AND r.rolcanlogin)
          OR has_schema_privilege(r.oid, 'aso', 'CREATE')
          OR has_database_privilege(r.oid, current_database(), 'CREATE')
          OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname = 'aso'
                     AND pg_has_role(r.oid, n.nspowner, 'MEMBER'))
          OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                     WHERE n.nspname='aso' AND (
                       pg_has_role(r.oid, c.relowner, 'MEMBER') OR
                       (c.relkind IN ('r','p','v','m','f') AND (
                         has_table_privilege(r.oid,c.oid,
                           'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') OR
                         CASE WHEN current_setting('server_version_num')::integer >= 170000
                           THEN has_table_privilege(r.oid,c.oid,'MAINTAIN')
                           ELSE false END OR
                         has_any_column_privilege(r.oid,c.oid,'INSERT, UPDATE, REFERENCES')))))
          OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                     WHERE n.nspname='aso' AND pg_has_role(r.oid,p.proowner,'MEMBER'))))";

const CASE_ROLE_CHECK: &str = "
    SELECT pg_has_role(session_user, 'aso_case_executor', 'USAGE')
      AND NOT EXISTS (
        SELECT 1 FROM pg_roles r
        WHERE (r.rolname = 'aso_case_executor'
          OR pg_has_role(session_user, r.oid, 'MEMBER')) AND (
          r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication
          OR (r.rolname = 'aso_case_executor' AND r.rolcanlogin)
          OR has_schema_privilege(r.oid, 'aso', 'CREATE')
          OR has_database_privilege(r.oid, current_database(), 'CREATE')
          OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname = 'aso'
                     AND pg_has_role(r.oid, n.nspowner, 'MEMBER'))
          OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                     WHERE n.nspname='aso' AND (
                       pg_has_role(r.oid, c.relowner, 'MEMBER') OR
                       (c.relkind IN ('r','p','v','m','f') AND (
                         has_table_privilege(r.oid,c.oid,
                           'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') OR
                         CASE WHEN current_setting('server_version_num')::integer >= 170000
                           THEN has_table_privilege(r.oid,c.oid,'MAINTAIN')
                           ELSE false END OR
                         has_any_column_privilege(r.oid,c.oid,'INSERT, UPDATE, REFERENCES')))))
          OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                     WHERE n.nspname='aso' AND pg_has_role(r.oid,p.proowner,'MEMBER'))))";

fn failure(error: sqlx::Error) -> GateError {
    match error.as_database_error().and_then(|e| e.code()).as_deref() {
        Some("42501") => GateError::Denied,
        Some("P0002") => GateError::NotFound,
        Some("23505") => GateError::CommandConflict,
        _ => GateError::Unavailable,
    }
}

fn case_failure(error: sqlx::Error) -> CaseError {
    match error.as_database_error().and_then(|e| e.code()).as_deref() {
        Some("42501") => CaseError::Denied,
        Some("P0002") => CaseError::NotFound,
        Some("23505") => CaseError::CommandConflict,
        Some("40001") => CaseError::RevisionConflict,
        Some("22023") => CaseError::Invalid,
        Some("23514") => CaseError::InvalidTransition,
        _ => CaseError::Unavailable,
    }
}

fn criteria_failure(error: sqlx::Error) -> CriteriaCatalogError {
    #[cfg(test)]
    eprintln!(
        "criteria_database_error: sqlstate={} message={}",
        error
            .as_database_error()
            .and_then(|value| value.code())
            .as_deref()
            .unwrap_or("none"),
        error
            .as_database_error()
            .map(|value| value.message())
            .unwrap_or("non-database error")
    );
    match error
        .as_database_error()
        .and_then(|value| value.code())
        .as_deref()
    {
        Some("42501") => CriteriaCatalogError::Denied,
        Some("P0002") => CriteriaCatalogError::NotFound,
        Some("40001") => CriteriaCatalogError::RevisionConflict,
        Some("23505") => CriteriaCatalogError::CommandConflict,
        Some("23P01") => CriteriaCatalogError::OverlapConflict,
        Some("23514") => CriteriaCatalogError::InvalidProvenance,
        Some("22023" | "22P02") => CriteriaCatalogError::Invalid,
        _ => CriteriaCatalogError::Unavailable,
    }
}

fn case_to_criteria(error: CaseError) -> CriteriaCatalogError {
    match error {
        CaseError::Unauthenticated => CriteriaCatalogError::Unauthenticated,
        CaseError::Denied => CriteriaCatalogError::Denied,
        CaseError::NotFound => CriteriaCatalogError::NotFound,
        CaseError::RevisionConflict => CriteriaCatalogError::RevisionConflict,
        CaseError::CommandConflict => CriteriaCatalogError::CommandConflict,
        CaseError::Invalid | CaseError::InvalidTransition => CriteriaCatalogError::Invalid,
        CaseError::Unavailable => CriteriaCatalogError::Unavailable,
    }
}

fn criteria_selection_failure(error: sqlx::Error) -> CriteriaSelectionError {
    match error
        .as_database_error()
        .and_then(|value| value.code())
        .as_deref()
    {
        Some("42501") => CriteriaSelectionError::Denied,
        Some("P0002") => CriteriaSelectionError::NotFound,
        Some("P0003") => CriteriaSelectionError::ResolutionRequired,
        Some("40001") => CriteriaSelectionError::RevisionConflict,
        Some("23505") => CriteriaSelectionError::CommandConflict,
        Some("23514") => CriteriaSelectionError::InvalidSelection,
        Some("22023" | "22P02") => CriteriaSelectionError::Invalid,
        _ => CriteriaSelectionError::Unavailable,
    }
}

fn evidence_assembly_failure(error: sqlx::Error) -> EvidenceAssemblyError {
    #[cfg(test)]
    if let Some(database) = error.as_database_error() {
        eprintln!(
            "evidence_assembly_database_error: sqlstate={} message={}",
            database.code().as_deref().unwrap_or("unknown"),
            database.message()
        );
    }
    match error
        .as_database_error()
        .and_then(|value| value.code())
        .as_deref()
    {
        Some("42501") => EvidenceAssemblyError::Denied,
        Some("P0002") => EvidenceAssemblyError::NotFound,
        Some("P0003") => EvidenceAssemblyError::CriteriaUnresolved,
        Some("P0004") => EvidenceAssemblyError::CitationIncomplete,
        Some("40001") => EvidenceAssemblyError::RevisionConflict,
        Some("23505") => EvidenceAssemblyError::CommandConflict,
        Some("23514") => EvidenceAssemblyError::InvalidEvidence,
        Some("22023" | "22P02") => EvidenceAssemblyError::Invalid,
        _ => EvidenceAssemblyError::Unavailable,
    }
}

fn case_to_evidence_assembly(error: CaseError) -> EvidenceAssemblyError {
    match error {
        CaseError::Unauthenticated => EvidenceAssemblyError::Unauthenticated,
        CaseError::Denied => EvidenceAssemblyError::Denied,
        CaseError::NotFound => EvidenceAssemblyError::NotFound,
        CaseError::RevisionConflict => EvidenceAssemblyError::RevisionConflict,
        CaseError::CommandConflict => EvidenceAssemblyError::CommandConflict,
        CaseError::Invalid | CaseError::InvalidTransition => EvidenceAssemblyError::Invalid,
        CaseError::Unavailable => EvidenceAssemblyError::Unavailable,
    }
}

fn letter_workflow_failure(error: sqlx::Error) -> LetterWorkflowError {
    #[cfg(test)]
    if let Some(database) = error.as_database_error() {
        eprintln!(
            "letter_workflow_database_error: sqlstate={} message={}",
            database.code().as_deref().unwrap_or("unknown"),
            database.message()
        );
    }
    match error
        .as_database_error()
        .and_then(|value| value.code())
        .as_deref()
    {
        Some("42501") => LetterWorkflowError::Denied,
        Some("P0002") => LetterWorkflowError::NotFound,
        Some("P0005") => LetterWorkflowError::GateIncomplete,
        Some("P0006") => LetterWorkflowError::EvidenceIncomplete,
        Some("P0007") => LetterWorkflowError::QaIncomplete,
        Some("P0004") => LetterWorkflowError::CitationIncomplete,
        Some("40001") => LetterWorkflowError::RevisionConflict,
        Some("23505") => LetterWorkflowError::CommandConflict,
        Some("22023" | "22P02" | "23514") => LetterWorkflowError::Invalid,
        _ => LetterWorkflowError::Unavailable,
    }
}

fn submission_workflow_failure(error: sqlx::Error) -> SubmissionWorkflowError {
    match error
        .as_database_error()
        .and_then(|value| value.code())
        .as_deref()
    {
        Some("42501") => SubmissionWorkflowError::Denied,
        Some("P0002") => SubmissionWorkflowError::NotFound,
        Some("P0007" | "23514") => SubmissionWorkflowError::NotReady,
        Some("40001") => SubmissionWorkflowError::RevisionConflict,
        Some("23505") => SubmissionWorkflowError::CommandConflict,
        Some("22023" | "22P02") => SubmissionWorkflowError::Invalid,
        _ => SubmissionWorkflowError::Unavailable,
    }
}

fn letter_to_submission(error: LetterWorkflowError) -> SubmissionWorkflowError {
    match error {
        LetterWorkflowError::Unauthenticated => SubmissionWorkflowError::Unauthenticated,
        LetterWorkflowError::Denied => SubmissionWorkflowError::Denied,
        LetterWorkflowError::NotFound => SubmissionWorkflowError::NotFound,
        LetterWorkflowError::RevisionConflict => SubmissionWorkflowError::RevisionConflict,
        LetterWorkflowError::CommandConflict => SubmissionWorkflowError::CommandConflict,
        LetterWorkflowError::GateIncomplete
        | LetterWorkflowError::EvidenceIncomplete
        | LetterWorkflowError::QaIncomplete
        | LetterWorkflowError::CitationIncomplete => SubmissionWorkflowError::NotReady,
        LetterWorkflowError::Invalid => SubmissionWorkflowError::Invalid,
        LetterWorkflowError::Unavailable => SubmissionWorkflowError::Unavailable,
    }
}

fn case_to_letter_workflow(error: CaseError) -> LetterWorkflowError {
    match error {
        CaseError::Unauthenticated => LetterWorkflowError::Unauthenticated,
        CaseError::Denied => LetterWorkflowError::Denied,
        CaseError::NotFound => LetterWorkflowError::NotFound,
        CaseError::RevisionConflict => LetterWorkflowError::RevisionConflict,
        CaseError::CommandConflict => LetterWorkflowError::CommandConflict,
        CaseError::Invalid | CaseError::InvalidTransition => LetterWorkflowError::Invalid,
        CaseError::Unavailable => LetterWorkflowError::Unavailable,
    }
}

fn case_to_criteria_selection(error: CaseError) -> CriteriaSelectionError {
    match error {
        CaseError::Unauthenticated => CriteriaSelectionError::Unauthenticated,
        CaseError::Denied => CriteriaSelectionError::Denied,
        CaseError::NotFound => CriteriaSelectionError::NotFound,
        CaseError::RevisionConflict => CriteriaSelectionError::RevisionConflict,
        CaseError::CommandConflict => CriteriaSelectionError::CommandConflict,
        CaseError::Invalid | CaseError::InvalidTransition => CriteriaSelectionError::Invalid,
        CaseError::Unavailable => CriteriaSelectionError::Unavailable,
    }
}

fn document_upload_failure(error: sqlx::Error) -> DocumentUploadError {
    match error
        .as_database_error()
        .and_then(|value| value.code())
        .as_deref()
    {
        Some("42501") => DocumentUploadError::Denied,
        Some("P0002") => DocumentUploadError::NotFound,
        Some("23505") => DocumentUploadError::CommandConflict,
        Some("40001") => DocumentUploadError::RevisionConflict,
        Some("22023" | "23514") => DocumentUploadError::Invalid,
        _ => DocumentUploadError::Unavailable,
    }
}

fn case_to_document_upload(error: CaseError) -> DocumentUploadError {
    match error {
        CaseError::Unauthenticated => DocumentUploadError::Unauthenticated,
        CaseError::Denied => DocumentUploadError::Denied,
        CaseError::NotFound => DocumentUploadError::NotFound,
        CaseError::RevisionConflict => DocumentUploadError::RevisionConflict,
        CaseError::CommandConflict => DocumentUploadError::CommandConflict,
        CaseError::Invalid | CaseError::InvalidTransition => DocumentUploadError::Invalid,
        CaseError::Unavailable => DocumentUploadError::Unavailable,
    }
}

fn document_processing_failure(error: sqlx::Error) -> DocumentProcessingError {
    #[cfg(test)]
    eprintln!(
        "document_processing_database_error: sqlstate={} message={}",
        error
            .as_database_error()
            .and_then(|value| value.code())
            .as_deref()
            .unwrap_or("none"),
        error
            .as_database_error()
            .map(|value| value.message())
            .unwrap_or("non-database error")
    );
    match error
        .as_database_error()
        .and_then(|value| value.code())
        .as_deref()
    {
        Some("42501") => DocumentProcessingError::Denied,
        Some("P0002") => DocumentProcessingError::NotFound,
        Some("23505") => DocumentProcessingError::CommandConflict,
        Some("40001") => DocumentProcessingError::RevisionConflict,
        Some("22023" | "23514") => DocumentProcessingError::Invalid,
        _ => DocumentProcessingError::Unavailable,
    }
}

fn case_to_document_processing(error: CaseError) -> DocumentProcessingError {
    match error {
        CaseError::Unauthenticated => DocumentProcessingError::Unauthenticated,
        CaseError::Denied => DocumentProcessingError::Denied,
        CaseError::NotFound => DocumentProcessingError::NotFound,
        CaseError::RevisionConflict => DocumentProcessingError::RevisionConflict,
        CaseError::CommandConflict => DocumentProcessingError::CommandConflict,
        CaseError::Invalid | CaseError::InvalidTransition => DocumentProcessingError::Invalid,
        CaseError::Unavailable => DocumentProcessingError::Unavailable,
    }
}

fn inspect_document_upload(
    media_type: DocumentMediaType,
    bytes: &[u8],
) -> Result<usize, DocumentUploadError> {
    let page_count = match media_type {
        DocumentMediaType::ApplicationPdf => {
            if !bytes.starts_with(b"%PDF-") {
                return Err(DocumentUploadError::UnsupportedType);
            }
            let document = lopdf::Document::load_mem(bytes)
                .map_err(|_| DocumentUploadError::IntegrityMismatch)?;
            if document.is_encrypted() {
                return Err(DocumentUploadError::IntegrityMismatch);
            }
            document.get_pages().len()
        }
        DocumentMediaType::TextPlain => {
            if bytes.starts_with(b"%PDF-") {
                return Err(DocumentUploadError::UnsupportedType);
            }
            let text =
                std::str::from_utf8(bytes).map_err(|_| DocumentUploadError::UnsupportedType)?;
            if text.contains('\0') || text.trim().is_empty() {
                return Err(DocumentUploadError::IntegrityMismatch);
            }
            bytes.iter().filter(|byte| **byte == b'\x0c').count() + 1
        }
    };
    if page_count == 0 {
        return Err(DocumentUploadError::IntegrityMismatch);
    }
    if page_count > MAX_DOCUMENT_UPLOAD_PAGES {
        return Err(DocumentUploadError::TooLarge);
    }
    Ok(page_count)
}

#[cfg(test)]
mod document_upload_inspection_tests {
    use super::*;
    use lopdf::{Document, Object, dictionary};

    fn one_page_pdf() -> Vec<u8> {
        let mut document = Document::with_version("1.5");
        let pages_id = document.new_object_id();
        let page_id = document.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
        });
        document.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages",
                "Kids" => vec![page_id.into()],
                "Count" => 1,
            }),
        );
        let catalog_id = document.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        });
        document.trailer.set("Root", catalog_id);
        let mut bytes = Vec::new();
        document.save_to(&mut bytes).unwrap();
        bytes
    }

    #[test]
    fn accepts_a_parseable_pdf_and_counts_its_pages() {
        assert_eq!(
            inspect_document_upload(DocumentMediaType::ApplicationPdf, &one_page_pdf()),
            Ok(1)
        );
    }

    #[test]
    fn refuses_a_malformed_pdf_after_its_signature() {
        assert_eq!(
            inspect_document_upload(DocumentMediaType::ApplicationPdf, b"%PDF-not-a-document"),
            Err(DocumentUploadError::IntegrityMismatch)
        );
    }
}

fn resolution_failure(error: sqlx::Error) -> ResolutionError {
    match error
        .as_database_error()
        .and_then(|value| value.code())
        .as_deref()
    {
        Some("42501") => ResolutionError::Denied,
        Some("P0002") => ResolutionError::NotFound,
        Some("23505") => ResolutionError::CommandConflict,
        Some("A0313") => ResolutionError::InputsIncomplete,
        Some("A0314") => ResolutionError::RevisionConflict,
        Some("22023" | "23514") => ResolutionError::Invalid,
        _ => ResolutionError::Unavailable,
    }
}

fn signing_failure(error: sqlx::Error) -> SigningError {
    match error.as_database_error().and_then(|e| e.code()).as_deref() {
        Some("42501") => SigningError::Denied,
        Some("P0002") => SigningError::NotFound,
        Some("23505") => SigningError::CommandConflict,
        Some("A0301") => SigningError::RevisionConflict,
        Some("A0302") => SigningError::SignatureConflict,
        Some("A0303") => SigningError::NotApproved,
        Some("A0304") => SigningError::GateNotAffirmed,
        Some("A0305") => SigningError::QaIncomplete,
        Some("A0306") => SigningError::SourceIncomplete,
        _ => SigningError::Unavailable,
    }
}

fn gate_to_signing(error: GateError) -> SigningError {
    match error {
        GateError::Unauthenticated => SigningError::Unauthenticated,
        GateError::Denied => SigningError::Denied,
        GateError::NotFound => SigningError::NotFound,
        GateError::CommandConflict => SigningError::CommandConflict,
        GateError::Unavailable | GateError::NativeAuthenticationUnavailable => {
            SigningError::Unavailable
        }
    }
}

fn reassessment_failure(error: sqlx::Error) -> ReassessmentError {
    match error.as_database_error().and_then(|e| e.code()).as_deref() {
        Some("42501") => ReassessmentError::Denied,
        Some("P0002") => ReassessmentError::NotFound,
        Some("23505") => ReassessmentError::CommandConflict,
        Some("A0307") => ReassessmentError::RevisionConflict,
        _ => ReassessmentError::Unavailable,
    }
}

fn gate_to_reassessment(error: GateError) -> ReassessmentError {
    match error {
        GateError::Unauthenticated => ReassessmentError::Unauthenticated,
        GateError::Denied => ReassessmentError::Denied,
        GateError::NotFound => ReassessmentError::NotFound,
        GateError::CommandConflict => ReassessmentError::CommandConflict,
        GateError::Unavailable | GateError::NativeAuthenticationUnavailable => {
            ReassessmentError::Unavailable
        }
    }
}

fn annotation_failure(error: sqlx::Error) -> AnnotationError {
    match error.as_database_error().and_then(|e| e.code()).as_deref() {
        Some("42501") => AnnotationError::Denied,
        Some("P0002") => AnnotationError::NotFound,
        Some("23505") => AnnotationError::CommandConflict,
        Some("22023" | "23514") => AnnotationError::Invalid,
        Some("A0310") => AnnotationError::RevisionConflict,
        _ => AnnotationError::Unavailable,
    }
}

fn gate_to_annotation(error: GateError) -> AnnotationError {
    match error {
        GateError::Unauthenticated => AnnotationError::Unauthenticated,
        GateError::Denied => AnnotationError::Denied,
        GateError::NotFound => AnnotationError::NotFound,
        GateError::CommandConflict => AnnotationError::CommandConflict,
        GateError::Unavailable | GateError::NativeAuthenticationUnavailable => {
            AnnotationError::Unavailable
        }
    }
}

fn source_failure(error: sqlx::Error) -> DocumentSourceError {
    match error
        .as_database_error()
        .and_then(|value| value.code())
        .as_deref()
    {
        Some("42501") => DocumentSourceError::Denied,
        Some("P0002") => DocumentSourceError::NotFound,
        Some("22023") => DocumentSourceError::Invalid,
        Some("A0311") => DocumentSourceError::Unavailable,
        Some("A0312") => DocumentSourceError::IntegrityMismatch,
        _ => DocumentSourceError::Unavailable,
    }
}

fn gate_to_source(error: GateError) -> DocumentSourceError {
    match error {
        GateError::Unauthenticated => DocumentSourceError::Unauthenticated,
        GateError::Denied => DocumentSourceError::Denied,
        GateError::NotFound => DocumentSourceError::NotFound,
        GateError::CommandConflict | GateError::Unavailable => DocumentSourceError::Unavailable,
        GateError::NativeAuthenticationUnavailable => {
            DocumentSourceError::NativeAuthenticationUnavailable
        }
    }
}

fn decode_sha256(value: &str) -> Result<Vec<u8>, DocumentSourceError> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(DocumentSourceError::Unavailable);
    }
    value
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let pair = std::str::from_utf8(pair).map_err(|_| DocumentSourceError::Unavailable)?;
            u8::from_str_radix(pair, 16).map_err(|_| DocumentSourceError::Unavailable)
        })
        .collect()
}

fn source_media_type(storage_key: &str) -> &'static str {
    let key = storage_key.to_ascii_lowercase();
    if key.ends_with(".pdf") {
        "application/pdf"
    } else if key.ends_with(".png") {
        "image/png"
    } else if key.ends_with(".jpg") || key.ends_with(".jpeg") {
        "image/jpeg"
    } else {
        "application/octet-stream"
    }
}

impl PgGateRepository {
    #[cfg(test)]
    pub async fn connect(url: &str) -> Result<Self, GateError> {
        Self::connect_with_document_store(url, Arc::new(UnavailableDocumentStore)).await
    }

    pub async fn connect_with_document_store(
        url: &str,
        document_store: Arc<dyn DocumentStore>,
    ) -> Result<Self, GateError> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(5))
            .connect(url)
            .await
            .map_err(failure)?;
        let allowed: bool = sqlx::query_scalar(ROLE_CHECK)
            .fetch_one(&pool)
            .await
            .map_err(failure)?;
        if !allowed {
            return Err(GateError::Unavailable);
        }
        let repository = Self {
            pool,
            document_store,
            document_processor: Arc::new(BoundedDocumentProcessor),
            document_generation: None,
        };
        repository
            .reconcile_expired_document_uploads()
            .await
            .map_err(|_| GateError::Unavailable)?;
        Ok(repository)
    }

    async fn begin(
        &self,
        context: &ClinicalContext,
    ) -> Result<Transaction<'static, Postgres>, GateError> {
        let mut tx = self.pool.begin().await.map_err(failure)?;
        let allowed: bool = sqlx::query_scalar(ROLE_CHECK)
            .fetch_one(&mut *tx)
            .await
            .map_err(failure)?;
        if !allowed {
            return Err(GateError::Unavailable);
        }
        sqlx::query("SET LOCAL ROLE aso_gate_executor")
            .execute(&mut *tx)
            .await
            .map_err(failure)?;
        sqlx::query("SET LOCAL search_path = pg_catalog, aso, pg_temp")
            .execute(&mut *tx)
            .await
            .map_err(failure)?;
        sqlx::query("SET LOCAL statement_timeout = '5s'")
            .execute(&mut *tx)
            .await
            .map_err(failure)?;
        let principal = match context.principal {
            aso_host::session::Principal::User => "user",
            aso_host::session::Principal::Agent => "agent",
            aso_host::session::Principal::Service => "service",
        };
        sqlx::query(
            "SELECT set_config('aso.kratos_identity_id',$1,true),
            set_config('aso.actor_id',$2,true), set_config('aso.practice_id',$3,true),
            set_config('aso.principal',$4,true), set_config('aso.session_expires_at',$5,true)",
        )
        .bind(context.identity_id.to_string())
        .bind(context.actor.to_string())
        .bind(context.practice.to_string())
        .bind(principal)
        .bind(context.expires_at.to_rfc3339())
        .execute(&mut *tx)
        .await
        .map_err(failure)?;
        Ok(tx)
    }

    async fn begin_case(
        &self,
        context: &ClinicalContext,
    ) -> Result<Transaction<'static, Postgres>, CaseError> {
        let mut tx = self.pool.begin().await.map_err(case_failure)?;
        let allowed: bool = sqlx::query_scalar(CASE_ROLE_CHECK)
            .fetch_one(&mut *tx)
            .await
            .map_err(case_failure)?;
        if !allowed {
            return Err(CaseError::Unavailable);
        }
        sqlx::query("SET LOCAL ROLE aso_case_executor")
            .execute(&mut *tx)
            .await
            .map_err(case_failure)?;
        sqlx::query("SET LOCAL search_path = pg_catalog, aso, pg_temp")
            .execute(&mut *tx)
            .await
            .map_err(case_failure)?;
        sqlx::query("SET LOCAL statement_timeout = '5s'")
            .execute(&mut *tx)
            .await
            .map_err(case_failure)?;
        let principal = match context.principal {
            aso_host::session::Principal::User => "user",
            aso_host::session::Principal::Agent => "agent",
            aso_host::session::Principal::Service => "service",
        };
        sqlx::query(
            "SELECT set_config('aso.kratos_identity_id',$1,true),
            set_config('aso.actor_id',$2,true), set_config('aso.practice_id',$3,true),
            set_config('aso.principal',$4,true), set_config('aso.session_expires_at',$5,true)",
        )
        .bind(context.identity_id.to_string())
        .bind(context.actor.to_string())
        .bind(context.practice.to_string())
        .bind(principal)
        .bind(context.expires_at.to_rfc3339())
        .execute(&mut *tx)
        .await
        .map_err(case_failure)?;
        Ok(tx)
    }

    async fn begin_resolution(
        &self,
        context: &ClinicalContext,
    ) -> Result<Transaction<'static, Postgres>, ResolutionError> {
        let mut tx = self.pool.begin().await.map_err(resolution_failure)?;
        let allowed: bool = sqlx::query_scalar(CASE_ROLE_CHECK)
            .fetch_one(&mut *tx)
            .await
            .map_err(resolution_failure)?;
        if !allowed {
            return Err(ResolutionError::Unavailable);
        }
        sqlx::query("SET LOCAL ROLE aso_case_executor")
            .execute(&mut *tx)
            .await
            .map_err(resolution_failure)?;
        sqlx::query("SET LOCAL search_path = pg_catalog, aso, pg_temp")
            .execute(&mut *tx)
            .await
            .map_err(resolution_failure)?;
        sqlx::query("SET LOCAL statement_timeout = '5s'")
            .execute(&mut *tx)
            .await
            .map_err(resolution_failure)?;
        let principal = match context.principal {
            aso_host::session::Principal::User => "user",
            aso_host::session::Principal::Agent => "agent",
            aso_host::session::Principal::Service => "service",
        };
        sqlx::query(
            "SELECT set_config('aso.kratos_identity_id',$1,true),
            set_config('aso.actor_id',$2,true), set_config('aso.practice_id',$3,true),
            set_config('aso.principal',$4,true), set_config('aso.session_expires_at',$5,true)",
        )
        .bind(context.identity_id.to_string())
        .bind(context.actor.to_string())
        .bind(context.practice.to_string())
        .bind(principal)
        .bind(context.expires_at.to_rfc3339())
        .execute(&mut *tx)
        .await
        .map_err(resolution_failure)?;
        Ok(tx)
    }

    async fn begin_criteria(
        &self,
        context: &ClinicalContext,
    ) -> Result<Transaction<'static, Postgres>, CriteriaCatalogError> {
        self.begin_case(context).await.map_err(case_to_criteria)
    }

    async fn begin_criteria_selection(
        &self,
        context: &ClinicalContext,
    ) -> Result<Transaction<'static, Postgres>, CriteriaSelectionError> {
        self.begin_case(context)
            .await
            .map_err(case_to_criteria_selection)
    }

    async fn begin_evidence_assembly(
        &self,
        context: &ClinicalContext,
    ) -> Result<Transaction<'static, Postgres>, EvidenceAssemblyError> {
        self.begin_case(context)
            .await
            .map_err(case_to_evidence_assembly)
    }

    async fn begin_letter_workflow(
        &self,
        context: &ClinicalContext,
    ) -> Result<Transaction<'static, Postgres>, LetterWorkflowError> {
        self.begin_case(context)
            .await
            .map_err(case_to_letter_workflow)
    }

    async fn begin_document_upload(
        &self,
        context: &ClinicalContext,
    ) -> Result<Transaction<'static, Postgres>, DocumentUploadError> {
        self.begin_case(context)
            .await
            .map_err(case_to_document_upload)
    }

    async fn begin_document_processing(
        &self,
        context: &ClinicalContext,
    ) -> Result<Transaction<'static, Postgres>, DocumentProcessingError> {
        self.begin_case(context)
            .await
            .map_err(case_to_document_processing)
    }

    pub(crate) async fn next_queued_document_job(
        &self,
        context: &ClinicalContext,
    ) -> Result<Option<(Uuid, Uuid, i64)>, DocumentProcessingError> {
        let mut tx = self.begin_document_processing(context).await?;
        let value: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT aso.next_document_processing_job()")
                .fetch_one(&mut *tx)
                .await
                .map_err(document_processing_failure)?;
        tx.commit().await.map_err(document_processing_failure)?;
        value
            .map(serde_json::from_value::<QueuedDocumentJob>)
            .transpose()
            .map(|job| job.map(|job| (job.case_id, job.document_id, job.document_set_revision)))
            .map_err(|_| DocumentProcessingError::Unavailable)
    }

    async fn fail_document_processing(
        &self,
        context: &ClinicalContext,
        command_id: Uuid,
        error_code: &str,
    ) -> Result<DocumentProcessingResult, DocumentProcessingError> {
        let mut tx = self.begin_document_processing(context).await?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.fail_document_processing_command($1,$2)")
                .bind(command_id)
                .bind(error_code)
                .fetch_one(&mut *tx)
                .await
                .map_err(document_processing_failure)?;
        let result =
            serde_json::from_value(value).map_err(|_| DocumentProcessingError::Unavailable)?;
        tx.commit().await.map_err(document_processing_failure)?;
        Ok(result)
    }

    async fn begin_document_cleanup(
        &self,
    ) -> Result<Transaction<'static, Postgres>, DocumentUploadError> {
        let mut tx = self.pool.begin().await.map_err(document_upload_failure)?;
        let allowed: bool = sqlx::query_scalar(ROLE_CHECK)
            .fetch_one(&mut *tx)
            .await
            .map_err(document_upload_failure)?;
        if !allowed {
            return Err(DocumentUploadError::Unavailable);
        }
        sqlx::query("SET LOCAL ROLE aso_case_executor")
            .execute(&mut *tx)
            .await
            .map_err(document_upload_failure)?;
        sqlx::query("SET LOCAL search_path = pg_catalog, aso, pg_temp")
            .execute(&mut *tx)
            .await
            .map_err(document_upload_failure)?;
        sqlx::query("SET LOCAL statement_timeout = '5s'")
            .execute(&mut *tx)
            .await
            .map_err(document_upload_failure)?;
        Ok(tx)
    }

    async fn claim_expired_document_uploads(
        &self,
    ) -> Result<Vec<ExpiredDocumentUpload>, DocumentUploadError> {
        let mut tx = self.begin_document_cleanup().await?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.claim_expired_document_upload_cleanup(32)")
                .fetch_one(&mut *tx)
                .await
                .map_err(document_upload_failure)?;
        let claims = serde_json::from_value(value).map_err(|_| DocumentUploadError::Unavailable)?;
        tx.commit().await.map_err(document_upload_failure)?;
        Ok(claims)
    }

    async fn complete_expired_document_upload(
        &self,
        claim: &ExpiredDocumentUpload,
        digest: &[u8; 32],
    ) -> Result<(), DocumentUploadError> {
        let mut tx = self.begin_document_cleanup().await?;
        sqlx::query("SELECT aso.complete_expired_document_upload_cleanup($1,$2,$3,$4,$5,$6)")
            .bind(claim.identity_id)
            .bind(claim.practice_id)
            .bind(claim.command_id)
            .bind(claim.staging_id)
            .bind(&claim.storage_key)
            .bind(digest.as_slice())
            .execute(&mut *tx)
            .await
            .map_err(document_upload_failure)?;
        tx.commit().await.map_err(document_upload_failure)?;
        Ok(())
    }

    pub async fn reconcile_expired_document_uploads(&self) -> Result<usize, DocumentUploadError> {
        let mut removed = 0;
        for _ in 0..8 {
            let claims = self.claim_expired_document_uploads().await?;
            let claim_count = claims.len();
            for claim in claims {
                let digest: [u8; 32] = decode_sha256(&claim.content_sha256)
                    .map_err(|_| DocumentUploadError::Unavailable)?
                    .try_into()
                    .map_err(|_| DocumentUploadError::Unavailable)?;
                self.document_store
                    .delete_if_matches(&claim.storage_key, digest)
                    .await?;
                self.complete_expired_document_upload(&claim, &digest)
                    .await?;
                removed += 1;
            }
            if claim_count < 32 {
                break;
            }
        }
        Ok(removed)
    }

    async fn lookup_document_upload_result(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        command_id: Uuid,
    ) -> Result<Option<DocumentUploadResult>, DocumentUploadError> {
        let mut tx = self.begin_document_upload(context).await?;
        let value: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT aso.lookup_document_upload_command($1,$2)")
                .bind(case_id)
                .bind(command_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(document_upload_failure)?;
        let result = value
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| DocumentUploadError::Unavailable)?;
        tx.commit().await.map_err(document_upload_failure)?;
        Ok(result)
    }

    async fn abandon_document_upload(
        &self,
        context: &ClinicalContext,
        command_id: Uuid,
        staging_id: Uuid,
    ) -> Result<Option<String>, DocumentUploadError> {
        let mut tx = self.begin_document_upload(context).await?;
        let storage_key: Option<String> =
            sqlx::query_scalar("SELECT aso.abandon_document_upload_staging($1,$2)")
                .bind(command_id)
                .bind(staging_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(document_upload_failure)?;
        tx.commit().await.map_err(document_upload_failure)?;
        Ok(storage_key)
    }

    async fn remove_abandoned_document(
        &self,
        context: &ClinicalContext,
        command_id: Uuid,
        staging_id: Uuid,
        expected_storage_key: &str,
        digest: [u8; 32],
    ) {
        if let Ok(Some(storage_key)) = self
            .abandon_document_upload(context, command_id, staging_id)
            .await
            && storage_key == expected_storage_key
        {
            let _ = self
                .document_store
                .delete_if_matches(&storage_key, digest)
                .await;
        }
    }
}

#[async_trait]
impl CaseRepository for PgGateRepository {
    async fn authorize_administering_entity_target(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
    ) -> Result<(), ResolutionError> {
        let mut tx = self.begin_resolution(context).await?;
        sqlx::query("SELECT aso.authorize_administering_entity_target($1)")
            .bind(case_id)
            .execute(&mut *tx)
            .await
            .map_err(resolution_failure)?;
        tx.commit().await.map_err(resolution_failure)?;
        Ok(())
    }

    async fn resolve_administering_entity(
        &self,
        context: &ClinicalContext,
        command: &ResolveAdministeringEntityCommand,
    ) -> Result<ResolutionCommandReceipt, ResolutionError> {
        let mut tx = self.begin_resolution(context).await?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.resolve_administering_entity_command($1,$2,$3)")
                .bind(command.command_id)
                .bind(command.case_id)
                .bind(command.expected_case_input_revision)
                .fetch_one(&mut *tx)
                .await
                .map_err(resolution_failure)?;
        let result = serde_json::from_value(value).map_err(|_| ResolutionError::Unavailable)?;
        tx.commit().await.map_err(resolution_failure)?;
        Ok(result)
    }

    async fn read_administering_entity(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
    ) -> Result<AdministeringEntityResolution, ResolutionError> {
        let mut tx = self.begin_resolution(context).await?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.read_administering_entity_resolution($1)")
                .bind(case_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(resolution_failure)?;
        let result = serde_json::from_value(value).map_err(|_| ResolutionError::Unavailable)?;
        tx.commit().await.map_err(resolution_failure)?;
        Ok(result)
    }

    async fn lookup_administering_entity_command(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        command_id: Uuid,
    ) -> Result<Option<ResolutionCommandReceipt>, ResolutionError> {
        let mut tx = self.begin_resolution(context).await?;
        let value: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT aso.lookup_administering_entity_resolution_command($1,$2)")
                .bind(case_id)
                .bind(command_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(resolution_failure)?;
        let result = value
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| ResolutionError::Unavailable)?;
        tx.commit().await.map_err(resolution_failure)?;
        Ok(result)
    }

    async fn create_case(
        &self,
        context: &ClinicalContext,
        command: &CreateCaseCommand,
    ) -> Result<CaseCommandResult, CaseError> {
        let input = &command.input;
        let mut tx = self.begin_case(context).await?;
        let value: serde_json::Value = sqlx::query_scalar(
            "SELECT aso.create_case_command($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
        )
        .bind(command.command_id)
        .bind(command.case_id)
        .bind(&input.case_number)
        .bind(input.patient_id)
        .bind(input.surgeon_id)
        .bind(input.coordinator_id)
        .bind(input.facility_id)
        .bind(input.payer_id)
        .bind(&input.member_id)
        .bind(input.date_of_service)
        .bind(&input.procedure_code)
        .bind(&input.plan_key)
        .bind(&input.data)
        .fetch_one(&mut *tx)
        .await
        .map_err(case_failure)?;
        let result = serde_json::from_value(value).map_err(|_| CaseError::Unavailable)?;
        tx.commit().await.map_err(case_failure)?;
        Ok(result)
    }

    async fn update_case(
        &self,
        context: &ClinicalContext,
        command: &UpdateCaseCommand,
    ) -> Result<CaseCommandResult, CaseError> {
        let input = &command.input;
        let mut tx = self.begin_case(context).await?;
        let value: serde_json::Value = sqlx::query_scalar(
            "SELECT aso.update_case_command($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
        )
        .bind(command.command_id)
        .bind(command.case_id)
        .bind(command.expected_revision)
        .bind(&input.case_number)
        .bind(input.patient_id)
        .bind(input.surgeon_id)
        .bind(input.coordinator_id)
        .bind(input.facility_id)
        .bind(input.payer_id)
        .bind(&input.member_id)
        .bind(input.date_of_service)
        .bind(&input.procedure_code)
        .bind(&input.plan_key)
        .bind(&input.data)
        .fetch_one(&mut *tx)
        .await
        .map_err(case_failure)?;
        let result = serde_json::from_value(value).map_err(|_| CaseError::Unavailable)?;
        tx.commit().await.map_err(case_failure)?;
        Ok(result)
    }

    async fn transition_case(
        &self,
        context: &ClinicalContext,
        command: &TransitionCaseCommand,
    ) -> Result<CaseCommandResult, CaseError> {
        let mut tx = self.begin_case(context).await?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.transition_case_command($1,$2,$3,$4)")
                .bind(command.command_id)
                .bind(command.case_id)
                .bind(command.expected_status_revision)
                .bind(command.target_status.as_str())
                .fetch_one(&mut *tx)
                .await
                .map_err(case_failure)?;
        let result = serde_json::from_value(value).map_err(|_| CaseError::Unavailable)?;
        tx.commit().await.map_err(case_failure)?;
        Ok(result)
    }

    async fn read_case(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
    ) -> Result<CaseRecord, CaseError> {
        let mut tx = self.begin_case(context).await?;
        let value: serde_json::Value = sqlx::query_scalar("SELECT aso.read_case($1)")
            .bind(case_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(case_failure)?;
        let result = serde_json::from_value(value).map_err(|_| CaseError::Unavailable)?;
        tx.commit().await.map_err(case_failure)?;
        Ok(result)
    }

    async fn authorize_case_write_target(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
    ) -> Result<(), CaseError> {
        let mut tx = self.begin_case(context).await?;
        sqlx::query("SELECT aso.authorize_case_write_target($1)")
            .bind(case_id)
            .execute(&mut *tx)
            .await
            .map_err(case_failure)?;
        tx.commit().await.map_err(case_failure)?;
        Ok(())
    }

    async fn list_cases(&self, context: &ClinicalContext) -> Result<Vec<CaseRecord>, CaseError> {
        let mut tx = self.begin_case(context).await?;
        let value: serde_json::Value = sqlx::query_scalar("SELECT aso.list_cases()")
            .fetch_one(&mut *tx)
            .await
            .map_err(case_failure)?;
        let result = serde_json::from_value(value).map_err(|_| CaseError::Unavailable)?;
        tx.commit().await.map_err(case_failure)?;
        Ok(result)
    }

    async fn lookup_create_case_command(
        &self,
        context: &ClinicalContext,
        command_id: Uuid,
    ) -> Result<Option<CaseCommandResult>, CaseError> {
        let mut tx = self.begin_case(context).await?;
        let value: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT aso.lookup_create_case_command($1)")
                .bind(command_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(case_failure)?;
        let result = value
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| CaseError::Unavailable)?;
        tx.commit().await.map_err(case_failure)?;
        Ok(result)
    }

    async fn lookup_case_command(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        command_id: Uuid,
    ) -> Result<Option<CaseCommandResult>, CaseError> {
        let mut tx = self.begin_case(context).await?;
        let value: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT aso.lookup_case_command($1,$2)")
                .bind(case_id)
                .bind(command_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(case_failure)?;
        let result = value
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| CaseError::Unavailable)?;
        tx.commit().await.map_err(case_failure)?;
        Ok(result)
    }

    async fn gate_state(&self, _: CaseId) -> Result<GateState, DomainError> {
        Err(DomainError::Storage(
            "verified gate context required".into(),
        ))
    }

    async fn record_affirmation(
        &self,
        _: CaseId,
        _: GateAffirmationKind,
        _: ActorId,
        _: DateTime<Utc>,
    ) -> Result<GateState, DomainError> {
        Err(DomainError::Storage(
            "verified gate command required".into(),
        ))
    }

    async fn execute_gate_command(
        &self,
        context: &ClinicalContext,
        command: &GateCommand,
    ) -> Result<GateCommandResult, GateError> {
        let kind = match command.kind {
            GateAffirmationKind::Policy => "policy",
            GateAffirmationKind::Section => "section",
            GateAffirmationKind::Pathway => "pathway",
            GateAffirmationKind::Plan => "plan",
        };
        let action = match command.action {
            GateAction::Affirm => "affirm",
            GateAction::Remove => "remove",
        };
        let mut tx = self.begin(context).await?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.apply_gate_command($1,$2,$3,$4)")
                .bind(command.command_id)
                .bind(command.case_id)
                .bind(kind)
                .bind(action)
                .fetch_one(&mut *tx)
                .await
                .map_err(failure)?;
        let result = serde_json::from_value(value).map_err(|_| GateError::Unavailable)?;
        tx.commit().await.map_err(failure)?;
        Ok(result)
    }

    async fn read_verified_gate(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
    ) -> Result<GateSnapshot, GateError> {
        let mut tx = self.begin(context).await?;
        let value: serde_json::Value = sqlx::query_scalar("SELECT aso.read_gate($1)")
            .bind(case_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(failure)?;
        let result = serde_json::from_value(value).map_err(|_| GateError::Unavailable)?;
        tx.commit().await.map_err(failure)?;
        Ok(result)
    }

    async fn lookup_gate_command(
        &self,
        context: &ClinicalContext,
        command_id: Uuid,
    ) -> Result<Option<GateCommandResult>, GateError> {
        let mut tx = self.begin(context).await?;
        let value: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT aso.lookup_gate_command($1)")
                .bind(command_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(failure)?;
        let result = value
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| GateError::Unavailable)?;
        tx.commit().await.map_err(failure)?;
        Ok(result)
    }
}

#[async_trait]
impl AuthorityPort for PgGateRepository {
    async fn may_annotate(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        annotation_id: Uuid,
    ) -> Result<bool, AnnotationError> {
        let mut tx = self.begin(context).await.map_err(gate_to_annotation)?;
        let result = sqlx::query_scalar("SELECT aso.may_annotate($1,$2)")
            .bind(case_id)
            .bind(annotation_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(annotation_failure)?;
        tx.commit().await.map_err(annotation_failure)?;
        Ok(result)
    }

    async fn holds(&self, _: ActorId, _: Capability) -> Result<bool, DomainError> {
        Err(DomainError::Storage(
            "verified authority context required".into(),
        ))
    }

    async fn may_affirm_gate(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
    ) -> Result<bool, GateError> {
        let mut tx = self.begin(context).await?;
        let result = sqlx::query_scalar("SELECT aso.may_affirm_gate($1)")
            .bind(case_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(failure)?;
        tx.commit().await.map_err(failure)?;
        Ok(result)
    }

    async fn may_sign_letter(
        &self,
        context: &ClinicalContext,
        letter_id: LetterId,
    ) -> Result<bool, SigningError> {
        let mut tx = self.begin(context).await.map_err(gate_to_signing)?;
        let result = sqlx::query_scalar("SELECT aso.may_sign_letter($1)")
            .bind(letter_id.0)
            .fetch_one(&mut *tx)
            .await
            .map_err(signing_failure)?;
        tx.commit().await.map_err(signing_failure)?;
        Ok(result)
    }

    async fn may_reassess_evidence(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        evidence_id: Uuid,
    ) -> Result<bool, ReassessmentError> {
        let mut tx = self.begin(context).await.map_err(gate_to_reassessment)?;
        let result = sqlx::query_scalar("SELECT aso.may_reassess_evidence($1,$2)")
            .bind(case_id)
            .bind(evidence_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(reassessment_failure)?;
        tx.commit().await.map_err(reassessment_failure)?;
        Ok(result)
    }
}

#[async_trait]
impl EvidenceRepository for PgGateRepository {
    async fn assemble_case_evidence(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        command: &AssembleEvidenceCommand,
    ) -> Result<EvidenceCommandResult, EvidenceAssemblyError> {
        let mut tx = self.begin_evidence_assembly(context).await?;
        let inputs = serde_json::to_value(&command.evidence_inputs)
            .map_err(|_| EvidenceAssemblyError::Invalid)?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.assemble_case_evidence($1,$2,$3,$4,$5,$6)")
                .bind(command.command_id)
                .bind(case_id)
                .bind(&command.expected_revisions.document_set_revision)
                .bind(&command.expected_revisions.criteria_selection_revision)
                .bind(&command.expected_revisions.evidence_work_revision)
                .bind(inputs)
                .fetch_one(&mut *tx)
                .await
                .map_err(evidence_assembly_failure)?;
        let result =
            serde_json::from_value(value).map_err(|_| EvidenceAssemblyError::Unavailable)?;
        tx.commit().await.map_err(evidence_assembly_failure)?;
        Ok(result)
    }

    async fn read_case_evidence(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
    ) -> Result<EvidenceSnapshot, EvidenceAssemblyError> {
        let mut tx = self.begin_evidence_assembly(context).await?;
        let value: serde_json::Value = sqlx::query_scalar("SELECT aso.read_case_evidence($1)")
            .bind(case_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(evidence_assembly_failure)?;
        let result =
            serde_json::from_value(value).map_err(|_| EvidenceAssemblyError::Unavailable)?;
        tx.commit().await.map_err(evidence_assembly_failure)?;
        Ok(result)
    }

    async fn lookup_evidence_assembly_command(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        command_id: Uuid,
    ) -> Result<Option<EvidenceCommandResult>, EvidenceAssemblyError> {
        let mut tx = self.begin_evidence_assembly(context).await?;
        let value: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT aso.lookup_evidence_assembly_command($1,$2)")
                .bind(case_id)
                .bind(command_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(evidence_assembly_failure)?;
        let result = value
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| EvidenceAssemblyError::Unavailable)?;
        tx.commit().await.map_err(evidence_assembly_failure)?;
        Ok(result)
    }

    async fn process_case_document(
        &self,
        context: &ClinicalContext,
        command: &ProcessCaseDocumentCommand,
    ) -> Result<DocumentProcessingResult, DocumentProcessingError> {
        let mut claim_tx = self.begin_document_processing(context).await?;
        let mut value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.claim_document_processing_command($1,$2,$3,$4)")
                .bind(command.command_id)
                .bind(command.case_id)
                .bind(command.document_id)
                .bind(command.expected_document_set_revision)
                .fetch_one(&mut *claim_tx)
                .await
                .map_err(document_processing_failure)?;
        claim_tx
            .commit()
            .await
            .map_err(document_processing_failure)?;

        let claim: DocumentProcessingClaim = serde_json::from_value(value.clone())
            .map_err(|_| DocumentProcessingError::Unavailable)?;
        #[cfg(test)]
        eprintln!("document_processing_adapter_stage: claim_parsed");
        if claim.command_id != command.command_id
            || claim.case_id != command.case_id
            || claim.document_id != command.document_id
        {
            return Err(DocumentProcessingError::Unavailable);
        }
        if claim.state == "committed" {
            value
                .as_object_mut()
                .ok_or(DocumentProcessingError::Unavailable)?
                .remove("state");
            let result: DocumentProcessingResult =
                serde_json::from_value(value).map_err(|_| DocumentProcessingError::Unavailable)?;
            return if result.status == DocumentProcessingStatus::Failed {
                Err(DocumentProcessingError::ProcessingFailed)
            } else {
                Ok(result)
            };
        }
        if claim.state != "claimed" {
            return Err(DocumentProcessingError::Unavailable);
        }

        let storage_key = claim
            .storage_key
            .ok_or(DocumentProcessingError::Unavailable)?;
        let media_type = claim
            .media_type
            .ok_or(DocumentProcessingError::Unavailable)?;
        let content_sha256 = claim
            .content_sha256
            .ok_or(DocumentProcessingError::Unavailable)?;
        let expected_digest: [u8; 32] = decode_sha256(&content_sha256)
            .map_err(|_| DocumentProcessingError::Unavailable)?
            .try_into()
            .map_err(|_| DocumentProcessingError::Unavailable)?;
        #[cfg(test)]
        eprintln!("document_processing_adapter_stage: digest_decoded");
        let bytes = match self.document_store.read(&storage_key).await {
            Ok(bytes) => bytes,
            Err(
                DocumentSourceError::NotFound
                | DocumentSourceError::TooLarge
                | DocumentSourceError::IntegrityMismatch,
            ) => {
                self.fail_document_processing(
                    context,
                    command.command_id,
                    "source_integrity_failed",
                )
                .await?;
                return Err(DocumentProcessingError::ProcessingFailed);
            }
            Err(_) => {
                self.fail_document_processing(context, command.command_id, "source_unavailable")
                    .await?;
                return Err(DocumentProcessingError::ProcessingFailed);
            }
        };
        if Sha256::digest(&bytes).as_slice() != expected_digest {
            self.fail_document_processing(context, command.command_id, "source_integrity_failed")
                .await?;
            return Err(DocumentProcessingError::ProcessingFailed);
        }
        #[cfg(test)]
        eprintln!("document_processing_adapter_stage: source_verified");

        let pages = match self
            .document_processor
            .extract_pages(media_type, bytes)
            .await
        {
            Ok(pages) => pages,
            Err(error) => {
                self.fail_document_processing(context, command.command_id, error.code())
                    .await?;
                return Err(DocumentProcessingError::ProcessingFailed);
            }
        };
        #[cfg(test)]
        eprintln!("document_processing_adapter_stage: pages_extracted");
        if pages.is_empty() || pages.len() > MAX_DOCUMENT_UPLOAD_PAGES {
            let code = if pages.is_empty() {
                "empty_page_text"
            } else {
                "page_limit_exceeded"
            };
            self.fail_document_processing(context, command.command_id, code)
                .await?;
            return Err(DocumentProcessingError::ProcessingFailed);
        }
        let mut processed_pages = Vec::with_capacity(pages.len());
        for (index, page) in pages.into_iter().enumerate() {
            let expected_page_number =
                u32::try_from(index + 1).map_err(|_| DocumentProcessingError::ProcessingFailed)?;
            if page.page_number != expected_page_number
                || page.text.trim().is_empty()
                || page.text.len() > aso_host::document_processing::MAX_EXTRACTED_PAGE_BYTES
            {
                self.fail_document_processing(
                    context,
                    command.command_id,
                    "text_extraction_failed",
                )
                .await?;
                return Err(DocumentProcessingError::ProcessingFailed);
            }
            let text_sha256 = Sha256::digest(page.text.as_bytes());
            processed_pages.push(serde_json::json!({
                "pageNumber": page.page_number,
                "text": page.text,
                "textSha256": format!("{text_sha256:x}"),
            }));
        }

        let mut complete_tx = self.begin_document_processing(context).await?;
        #[cfg(test)]
        eprintln!("document_processing_adapter_stage: completion_started");
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.complete_document_processing_command($1,$2)")
                .bind(command.command_id)
                .bind(serde_json::Value::Array(processed_pages))
                .fetch_one(&mut *complete_tx)
                .await
                .map_err(document_processing_failure)?;
        #[cfg(test)]
        eprintln!("document_processing_adapter_stage: completion_returned");
        let result =
            serde_json::from_value(value).map_err(|_| DocumentProcessingError::Unavailable)?;
        complete_tx
            .commit()
            .await
            .map_err(document_processing_failure)?;
        Ok(result)
    }

    async fn lookup_document_process_command(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        document_id: Uuid,
        command_id: Uuid,
    ) -> Result<Option<DocumentProcessingResult>, DocumentProcessingError> {
        let mut tx = self.begin_document_processing(context).await?;
        let value: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT aso.lookup_document_processing_command($1,$2,$3)")
                .bind(case_id)
                .bind(document_id)
                .bind(command_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(document_processing_failure)?;
        let result = value
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| DocumentProcessingError::Unavailable)?;
        tx.commit().await.map_err(document_processing_failure)?;
        Ok(result)
    }

    async fn authorize_document_upload_target(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
    ) -> Result<(), DocumentUploadError> {
        let mut tx = self.begin_document_upload(context).await?;
        // Command IDs are non-nil at the AppServices boundary. A nil lookup
        // therefore exercises the existing non-mutating capability and case
        // scope check without disclosing a command result.
        sqlx::query_scalar::<_, Option<serde_json::Value>>(
            "SELECT aso.lookup_document_upload_command($1,$2)",
        )
        .bind(case_id)
        .bind(Uuid::nil())
        .fetch_one(&mut *tx)
        .await
        .map_err(document_upload_failure)?;
        tx.commit().await.map_err(document_upload_failure)?;
        Ok(())
    }

    async fn upload_case_document(
        &self,
        context: &ClinicalContext,
        command: &UploadCaseDocumentCommand,
        bytes: Vec<u8>,
    ) -> Result<DocumentUploadResult, DocumentUploadError> {
        self.reconcile_expired_document_uploads().await?;
        inspect_document_upload(command.media_type, &bytes)?;
        let digest = command.content_digest()?;
        let byte_size = i64::try_from(bytes.len()).map_err(|_| DocumentUploadError::TooLarge)?;

        let mut reserve = self.begin_document_upload(context).await?;
        let value: serde_json::Value = sqlx::query_scalar(
            "SELECT aso.reserve_document_upload_staging($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        )
        .bind(command.command_id)
        .bind(command.document_id)
        .bind(command.case_id)
        .bind(command.expected_case_input_revision)
        .bind(command.expected_document_set_revision)
        .bind(command.document_type_key.trim())
        .bind(command.name.trim())
        .bind(command.effective_date)
        .bind(command.media_type.as_str())
        .bind(byte_size)
        .bind(digest.as_slice())
        .bind(&command.data)
        .fetch_one(&mut *reserve)
        .await
        .map_err(document_upload_failure)?;
        reserve.commit().await.map_err(document_upload_failure)?;

        let reservation: DocumentUploadReservation =
            serde_json::from_value(value.clone()).map_err(|_| DocumentUploadError::Unavailable)?;
        if reservation.command_id != command.command_id
            || reservation.case_id != command.case_id
            || reservation.document_id != command.document_id
        {
            return Err(DocumentUploadError::Unavailable);
        }
        let expected_storage_key = format!(
            "documents/{}/{}/{}",
            context.practice.0,
            command.document_id,
            command.content_sha256.to_ascii_lowercase()
        );

        if reservation.state == "committed" {
            self.document_store
                .write_verified(&expected_storage_key, bytes, digest)
                .await?;
            let mut receipt = value;
            receipt
                .as_object_mut()
                .ok_or(DocumentUploadError::Unavailable)?
                .remove("state");
            return serde_json::from_value(receipt).map_err(|_| DocumentUploadError::Unavailable);
        }
        if reservation.state != "staged" {
            return Err(DocumentUploadError::Unavailable);
        }
        let staging_id = reservation
            .staging_id
            .ok_or(DocumentUploadError::Unavailable)?;
        let storage_key = reservation
            .storage_key
            .ok_or(DocumentUploadError::Unavailable)?;
        if storage_key != expected_storage_key {
            return Err(DocumentUploadError::Unavailable);
        }

        let mut commit = match self.begin_document_upload(context).await {
            Ok(commit) => commit,
            Err(error) => {
                self.remove_abandoned_document(
                    context,
                    command.command_id,
                    staging_id,
                    &storage_key,
                    digest,
                )
                .await;
                return Err(error);
            }
        };

        if let Err(error) = self
            .document_store
            .write_verified(&storage_key, bytes, digest)
            .await
        {
            let _ = commit.rollback().await;
            self.remove_abandoned_document(
                context,
                command.command_id,
                staging_id,
                &storage_key,
                digest,
            )
            .await;
            return Err(error);
        }

        let committed: Result<serde_json::Value, sqlx::Error> =
            sqlx::query_scalar("SELECT aso.commit_document_upload_command($1,$2)")
                .bind(command.command_id)
                .bind(staging_id)
                .fetch_one(&mut *commit)
                .await;
        let value = match committed {
            Ok(value) => value,
            Err(error) => {
                let mapped = document_upload_failure(error);
                let _ = commit.rollback().await;
                self.remove_abandoned_document(
                    context,
                    command.command_id,
                    staging_id,
                    &storage_key,
                    digest,
                )
                .await;
                return Err(mapped);
            }
        };
        if commit.commit().await.is_err() {
            match self
                .lookup_document_upload_result(context, command.case_id, command.command_id)
                .await
            {
                Ok(Some(result)) => return Ok(result),
                Ok(None) => {
                    self.remove_abandoned_document(
                        context,
                        command.command_id,
                        staging_id,
                        &storage_key,
                        digest,
                    )
                    .await;
                }
                Err(_) => {}
            }
            return Err(DocumentUploadError::Unavailable);
        }
        serde_json::from_value(value).map_err(|_| DocumentUploadError::Unavailable)
    }

    async fn read_case_document(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        document_id: Uuid,
    ) -> Result<DocumentMetadata, DocumentUploadError> {
        let mut tx = self.begin_document_upload(context).await?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.read_case_document_metadata($1,$2)")
                .bind(case_id)
                .bind(document_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(document_upload_failure)?;
        let result = serde_json::from_value(value).map_err(|_| DocumentUploadError::Unavailable)?;
        tx.commit().await.map_err(document_upload_failure)?;
        Ok(result)
    }

    async fn lookup_document_upload_command(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        command_id: Uuid,
    ) -> Result<Option<DocumentUploadResult>, DocumentUploadError> {
        self.lookup_document_upload_result(context, case_id, command_id)
            .await
    }

    async fn open_document_source(
        &self,
        context: &ClinicalContext,
        request: DocumentSourceRequest,
    ) -> Result<DocumentSource, DocumentSourceError> {
        let mut tx = self.begin(context).await.map_err(gate_to_source)?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.read_document_source_grant($1,$2,$3)")
                .bind(request.case_id)
                .bind(request.document_id)
                .bind(i32::try_from(request.page_number).map_err(|_| DocumentSourceError::Invalid)?)
                .fetch_one(&mut *tx)
                .await
                .map_err(source_failure)?;
        let grant: DocumentSourceGrant =
            serde_json::from_value(value).map_err(|_| DocumentSourceError::Unavailable)?;
        tx.commit().await.map_err(source_failure)?;

        let expected_hash = decode_sha256(&grant.content_sha256)?;
        let bytes = self.document_store.read(&grant.storage_key).await?;
        if Sha256::digest(&bytes).as_slice() != expected_hash {
            return Err(DocumentSourceError::IntegrityMismatch);
        }

        // Recheck authority after file I/O and commit the audit before any
        // shell can receive the body. Revocation during the read therefore
        // converts the operation to a refusal rather than a final data frame.
        let mut audit = self.begin(context).await.map_err(gate_to_source)?;
        sqlx::query("SELECT aso.record_document_source_read($1,$2,$3,$4,$5)")
            .bind(request.case_id)
            .bind(request.document_id)
            .bind(i32::try_from(request.page_number).map_err(|_| DocumentSourceError::Invalid)?)
            .bind(&expected_hash)
            .bind(i64::try_from(bytes.len()).map_err(|_| DocumentSourceError::TooLarge)?)
            .execute(&mut *audit)
            .await
            .map_err(source_failure)?;
        audit.commit().await.map_err(source_failure)?;

        Ok(DocumentSource {
            case_id: request.case_id,
            document_id: request.document_id,
            name: grant.name,
            effective_date: grant.effective_date,
            page_count: grant.page_count,
            page_number: request.page_number,
            media_type: grant
                .media_type
                .unwrap_or_else(|| source_media_type(&grant.storage_key).into()),
            content_sha256: expected_hash,
            bytes,
        })
    }

    async fn read_annotation_target(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        annotation_id: Uuid,
    ) -> Result<(), AnnotationError> {
        let mut tx = self.begin(context).await.map_err(gate_to_annotation)?;
        let allowed: bool = sqlx::query_scalar("SELECT aso.read_annotation_target($1,$2)")
            .bind(case_id)
            .bind(annotation_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(annotation_failure)?;
        tx.commit().await.map_err(annotation_failure)?;
        if allowed {
            Ok(())
        } else {
            Err(AnnotationError::Denied)
        }
    }

    async fn execute_annotation(
        &self,
        context: &ClinicalContext,
        command: &AnnotationCommand,
    ) -> Result<AnnotationResult, AnnotationError> {
        let disposition = match command.disposition {
            AnnotationDisposition::Included => "included",
            AnnotationDisposition::Held => "held",
        };
        let mut tx = self.begin(context).await.map_err(gate_to_annotation)?;
        let value: serde_json::Value = sqlx::query_scalar(
            "SELECT aso.apply_annotation_command($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        )
        .bind(command.command_id)
        .bind(command.annotation_id)
        .bind(command.case_id)
        .bind(command.annotation_type_id)
        .bind(&command.name)
        .bind(&command.data)
        .bind(&command.body)
        .bind(command.target_evidence_id)
        .bind(command.target_document_id)
        .bind(disposition)
        .bind(command.expected_revision)
        .fetch_one(&mut *tx)
        .await
        .map_err(annotation_failure)?;
        let result = serde_json::from_value(value).map_err(|_| AnnotationError::Unavailable)?;
        tx.commit().await.map_err(annotation_failure)?;
        Ok(result)
    }

    async fn lookup_annotation_command(
        &self,
        context: &ClinicalContext,
        command_id: Uuid,
    ) -> Result<Option<AnnotationResult>, AnnotationError> {
        let mut tx = self.begin(context).await.map_err(gate_to_annotation)?;
        let value: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT aso.lookup_annotation_command($1)")
                .bind(command_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(annotation_failure)?;
        let result = value
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| AnnotationError::Unavailable)?;
        tx.commit().await.map_err(annotation_failure)?;
        Ok(result)
    }

    async fn read_reassessment_target(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        evidence_id: Uuid,
    ) -> Result<EvidenceReassessmentTarget, ReassessmentError> {
        let mut tx = self.begin(context).await.map_err(gate_to_reassessment)?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.read_reassessment_target($1,$2)")
                .bind(case_id)
                .bind(evidence_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(reassessment_failure)?;
        let result = serde_json::from_value(value).map_err(|_| ReassessmentError::Unavailable)?;
        tx.commit().await.map_err(reassessment_failure)?;
        Ok(result)
    }

    async fn execute_reassessment(
        &self,
        context: &ClinicalContext,
        command: &ReassessEvidenceCommand,
    ) -> Result<ReassessEvidenceResult, ReassessmentError> {
        let state = match command.state {
            EvidenceState::Met => "met",
            EvidenceState::Gap => "gap",
            EvidenceState::Void => "void",
        };
        let mut tx = self.begin(context).await.map_err(gate_to_reassessment)?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.apply_evidence_reassessment_command($1,$2,$3,$4,$5)")
                .bind(command.command_id)
                .bind(command.case_id)
                .bind(command.evidence_id)
                .bind(command.expected_assessed_at)
                .bind(state)
                .fetch_one(&mut *tx)
                .await
                .map_err(reassessment_failure)?;
        let result = serde_json::from_value(value).map_err(|_| ReassessmentError::Unavailable)?;
        tx.commit().await.map_err(reassessment_failure)?;
        Ok(result)
    }

    async fn lookup_reassessment_command(
        &self,
        context: &ClinicalContext,
        command_id: Uuid,
    ) -> Result<Option<ReassessEvidenceResult>, ReassessmentError> {
        let mut tx = self.begin(context).await.map_err(gate_to_reassessment)?;
        let value: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT aso.lookup_evidence_reassessment_command($1)")
                .bind(command_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(reassessment_failure)?;
        let result = value
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| ReassessmentError::Unavailable)?;
        tx.commit().await.map_err(reassessment_failure)?;
        Ok(result)
    }

    async fn counts(&self, _: CaseId) -> Result<EvidenceCounts, DomainError> {
        Err(DomainError::Storage(
            "verified evidence read context required".into(),
        ))
    }
}

#[async_trait]
impl CriteriaRepository for PgGateRepository {
    async fn select_case_criteria(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        command: &SelectCriteriaCommand,
    ) -> Result<CriteriaSelectionResult, CriteriaSelectionError> {
        let mut tx = self.begin_criteria_selection(context).await?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.select_case_criteria($1,$2,$3,$4,$5)")
                .bind(command.command_id)
                .bind(case_id)
                .bind(&command.expected_revisions.resolution_revision)
                .bind(&command.expected_revisions.criteria_catalog_revision)
                .bind(&command.criterion_ids)
                .fetch_one(&mut *tx)
                .await
                .map_err(criteria_selection_failure)?;
        let result =
            serde_json::from_value(value).map_err(|_| CriteriaSelectionError::Unavailable)?;
        tx.commit().await.map_err(criteria_selection_failure)?;
        Ok(result)
    }

    async fn read_criteria_selection(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
    ) -> Result<CriteriaSelectionSnapshot, CriteriaSelectionError> {
        let mut tx = self.begin_criteria_selection(context).await?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.read_case_criteria_selection($1)")
                .bind(case_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(criteria_selection_failure)?;
        let result =
            serde_json::from_value(value).map_err(|_| CriteriaSelectionError::Unavailable)?;
        tx.commit().await.map_err(criteria_selection_failure)?;
        Ok(result)
    }

    async fn lookup_criteria_selection_command(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        command_id: Uuid,
    ) -> Result<Option<CriteriaSelectionResult>, CriteriaSelectionError> {
        let mut tx = self.begin_criteria_selection(context).await?;
        let value: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT aso.lookup_criteria_selection_command($1,$2)")
                .bind(case_id)
                .bind(command_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(criteria_selection_failure)?;
        let result = value
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| CriteriaSelectionError::Unavailable)?;
        tx.commit().await.map_err(criteria_selection_failure)?;
        Ok(result)
    }

    async fn import_catalog(
        &self,
        context: &ClinicalContext,
        command: &ImportCriteriaCatalogCommand,
    ) -> Result<CriteriaCatalogImportResult, CriteriaCatalogError> {
        let mut tx = self.begin_criteria(context).await?;
        let policy =
            serde_json::to_value(&command.policy).map_err(|_| CriteriaCatalogError::Invalid)?;
        let criteria =
            serde_json::to_value(&command.criteria).map_err(|_| CriteriaCatalogError::Invalid)?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.import_criteria_catalog($1,$2,$3,$4)")
                .bind(command.command_id)
                .bind(&command.expected_revisions.criteria_catalog_revision)
                .bind(policy)
                .bind(criteria)
                .fetch_one(&mut *tx)
                .await
                .map_err(criteria_failure)?;
        let result =
            serde_json::from_value(value).map_err(|_| CriteriaCatalogError::Unavailable)?;
        tx.commit().await.map_err(criteria_failure)?;
        Ok(result)
    }

    async fn list_catalog(
        &self,
        context: &ClinicalContext,
        payer_id: Option<Uuid>,
    ) -> Result<CriteriaCatalogSnapshot, CriteriaCatalogError> {
        let mut tx = self.begin_criteria(context).await?;
        let value: serde_json::Value = sqlx::query_scalar("SELECT aso.list_criteria_catalog($1)")
            .bind(payer_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(criteria_failure)?;
        let result =
            serde_json::from_value(value).map_err(|_| CriteriaCatalogError::Unavailable)?;
        tx.commit().await.map_err(criteria_failure)?;
        Ok(result)
    }

    async fn read_catalog_criterion(
        &self,
        context: &ClinicalContext,
        criterion_id: Uuid,
    ) -> Result<CatalogCriterion, CriteriaCatalogError> {
        let mut tx = self.begin_criteria(context).await?;
        let value: serde_json::Value = sqlx::query_scalar("SELECT aso.read_catalog_criterion($1)")
            .bind(criterion_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(criteria_failure)?;
        let result =
            serde_json::from_value(value).map_err(|_| CriteriaCatalogError::Unavailable)?;
        tx.commit().await.map_err(criteria_failure)?;
        Ok(result)
    }

    async fn lookup_import_command(
        &self,
        context: &ClinicalContext,
        command_id: Uuid,
    ) -> Result<Option<CriteriaCatalogImportResult>, CriteriaCatalogError> {
        let mut tx = self.begin_criteria(context).await?;
        let value: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT aso.lookup_criteria_import_command($1)")
                .bind(command_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(criteria_failure)?;
        let result = value
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| CriteriaCatalogError::Unavailable)?;
        tx.commit().await.map_err(criteria_failure)?;
        Ok(result)
    }

    async fn get(&self, _: CriterionId) -> Result<Criterion, DomainError> {
        Err(DomainError::Storage(
            "verified criteria context required".into(),
        ))
    }

    async fn live_for_payer(&self, _: &str) -> Result<Vec<Criterion>, DomainError> {
        Err(DomainError::Storage(
            "verified criteria context required".into(),
        ))
    }
}

#[async_trait]
impl LetterRepository for PgGateRepository {
    fn document_tasks(&self) -> Option<&dyn aso_host::document_generation::DurableDocumentTasks> {
        Some(self)
    }

    async fn read_submission_packet(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
    ) -> Result<SubmissionPacketSnapshot, SubmissionWorkflowError> {
        let mut tx = self
            .begin_letter_workflow(context)
            .await
            .map_err(letter_to_submission)?;
        let value: serde_json::Value = sqlx::query_scalar("SELECT aso.read_submission_packet($1)")
            .bind(case_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(submission_workflow_failure)?;
        let result =
            serde_json::from_value(value).map_err(|_| SubmissionWorkflowError::Unavailable)?;
        tx.commit().await.map_err(submission_workflow_failure)?;
        Ok(result)
    }

    async fn submit_packet(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        command: &SubmitPacketCommand,
    ) -> Result<SubmissionPacketSnapshot, SubmissionWorkflowError> {
        let mut tx = self
            .begin_letter_workflow(context)
            .await
            .map_err(letter_to_submission)?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.submit_case_packet($1,$2,$3)")
                .bind(command.command_id)
                .bind(case_id)
                .bind(command.expected_letter_revision)
                .fetch_one(&mut *tx)
                .await
                .map_err(submission_workflow_failure)?;
        let result =
            serde_json::from_value(value).map_err(|_| SubmissionWorkflowError::Unavailable)?;
        tx.commit().await.map_err(submission_workflow_failure)?;
        Ok(result)
    }

    async fn read_submission_receipt(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
    ) -> Result<SubmissionReceiptView, SubmissionWorkflowError> {
        let mut tx = self
            .begin_letter_workflow(context)
            .await
            .map_err(letter_to_submission)?;
        let value: serde_json::Value = sqlx::query_scalar("SELECT aso.read_submission_receipt($1)")
            .bind(case_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(submission_workflow_failure)?;
        let result =
            serde_json::from_value(value).map_err(|_| SubmissionWorkflowError::Unavailable)?;
        tx.commit().await.map_err(submission_workflow_failure)?;
        Ok(result)
    }

    async fn record_submission_acknowledgement(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        command: &RecordAcknowledgementCommand,
    ) -> Result<SubmissionReceiptView, SubmissionWorkflowError> {
        let mut tx = self
            .begin_letter_workflow(context)
            .await
            .map_err(letter_to_submission)?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.acknowledge_case_submission($1,$2,$3,$4,$5,$6)")
                .bind(command.command_id)
                .bind(case_id)
                .bind(command.submission_id)
                .bind(command.payer_reference.trim())
                .bind(command.acknowledged_at)
                .bind(command.page_count)
                .fetch_one(&mut *tx)
                .await
                .map_err(submission_workflow_failure)?;
        let result =
            serde_json::from_value(value).map_err(|_| SubmissionWorkflowError::Unavailable)?;
        tx.commit().await.map_err(submission_workflow_failure)?;
        Ok(result)
    }

    async fn record_determination(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        command: &aso_host::letter_workflow::RecordDeterminationCommand,
    ) -> Result<aso_host::letter_workflow::DeterminationSnapshot, LetterWorkflowError> {
        let mut tx = self.begin_letter_workflow(context).await?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.record_denied_determination($1,$2,$3,$4,$5,$6,$7)")
                .bind(command.command_id)
                .bind(case_id)
                .bind(command.document_id)
                .bind(command.decided_on)
                .bind(&command.reason_code)
                .bind(command.reason_text.trim())
                .bind(command.appeal_deadline)
                .fetch_one(&mut *tx)
                .await
                .map_err(letter_workflow_failure)?;
        let result = serde_json::from_value(value).map_err(|_| LetterWorkflowError::Unavailable)?;
        tx.commit().await.map_err(letter_workflow_failure)?;
        Ok(result)
    }

    async fn confirm_response_mode(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        command: &aso_host::letter_workflow::ConfirmResponseModeCommand,
    ) -> Result<aso_host::letter_workflow::DeterminationResponseModeResult, LetterWorkflowError>
    {
        let mut tx = self.begin_letter_workflow(context).await?;
        let mode = match command.mode {
            aso_host::letter_workflow::DenialResponseMode::CorrectedResubmission => {
                "corrected_resubmission"
            }
            aso_host::letter_workflow::DenialResponseMode::ClinicalAppeal => "clinical_appeal",
        };
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.confirm_determination_response_mode($1,$2,$3,$4)")
                .bind(case_id)
                .bind(command.command_id)
                .bind(command.expected_determination_id)
                .bind(mode)
                .fetch_one(&mut *tx)
                .await
                .map_err(letter_workflow_failure)?;
        let result = serde_json::from_value(value).map_err(|_| LetterWorkflowError::Unavailable)?;
        tx.commit().await.map_err(letter_workflow_failure)?;
        Ok(result)
    }

    async fn read_latest_determination(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
    ) -> Result<aso_host::letter_workflow::DeterminationSnapshot, LetterWorkflowError> {
        let mut tx = self.begin_letter_workflow(context).await?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.read_latest_denied_determination($1)")
                .bind(case_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(letter_workflow_failure)?;
        let result = serde_json::from_value(value).map_err(|_| LetterWorkflowError::Unavailable)?;
        tx.commit().await.map_err(letter_workflow_failure)?;
        Ok(result)
    }

    async fn generate_letter(
        &self,
        _context: &ClinicalContext,
        _case_id: Uuid,
        _command: &GenerateLetterCommand,
    ) -> Result<LetterCommandResult, LetterWorkflowError> {
        // Generation requires the durable task's live session authorization.
        Err(LetterWorkflowError::Unavailable)
    }

    async fn read_letter(
        &self,
        context: &ClinicalContext,
        letter_id: Uuid,
    ) -> Result<LetterSnapshot, LetterWorkflowError> {
        let mut tx = self.begin_letter_workflow(context).await?;
        let value: serde_json::Value = sqlx::query_scalar("SELECT aso.read_letter_workflow($1)")
            .bind(letter_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(letter_workflow_failure)?;
        let result = serde_json::from_value(value).map_err(|_| LetterWorkflowError::Unavailable)?;
        tx.commit().await.map_err(letter_workflow_failure)?;
        Ok(result)
    }

    async fn review_letter(
        &self,
        context: &ClinicalContext,
        letter_id: Uuid,
        command: &ReviewLetterCommand,
    ) -> Result<LetterCommandResult, LetterWorkflowError> {
        let mut tx = self.begin_letter_workflow(context).await?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.review_letter_workflow($1,$2,$3)")
                .bind(command.command_id)
                .bind(letter_id)
                .bind(command.expected_letter_version)
                .fetch_one(&mut *tx)
                .await
                .map_err(letter_workflow_failure)?;
        let result = serde_json::from_value(value).map_err(|_| LetterWorkflowError::Unavailable)?;
        tx.commit().await.map_err(letter_workflow_failure)?;
        Ok(result)
    }

    async fn approve_letter(
        &self,
        context: &ClinicalContext,
        letter_id: Uuid,
        command: &ApproveLetterCommand,
    ) -> Result<LetterCommandResult, LetterWorkflowError> {
        let mut tx = self.begin_letter_workflow(context).await?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.approve_letter_workflow($1,$2,$3,$4)")
                .bind(command.command_id)
                .bind(letter_id)
                .bind(command.expected_letter_version)
                .bind(command.expected_qa_revision)
                .fetch_one(&mut *tx)
                .await
                .map_err(letter_workflow_failure)?;
        let result = serde_json::from_value(value).map_err(|_| LetterWorkflowError::Unavailable)?;
        tx.commit().await.map_err(letter_workflow_failure)?;
        Ok(result)
    }

    async fn lookup_letter_workflow_command(
        &self,
        context: &ClinicalContext,
        command_id: Uuid,
    ) -> Result<Option<LetterCommandResult>, LetterWorkflowError> {
        let mut tx = self.begin_letter_workflow(context).await?;
        let value: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT aso.lookup_letter_workflow_command($1)")
                .bind(command_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(letter_workflow_failure)?;
        let result = value
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| LetterWorkflowError::Unavailable)?;
        tx.commit().await.map_err(letter_workflow_failure)?;
        Ok(result)
    }

    async fn read_signing_target(
        &self,
        context: &ClinicalContext,
        letter_id: LetterId,
    ) -> Result<SigningTarget, SigningError> {
        let mut tx = self.begin(context).await.map_err(gate_to_signing)?;
        let value: serde_json::Value = sqlx::query_scalar("SELECT aso.read_signing_target($1)")
            .bind(letter_id.0)
            .fetch_one(&mut *tx)
            .await
            .map_err(signing_failure)?;
        let result = serde_json::from_value(value).map_err(|_| SigningError::Unavailable)?;
        tx.commit().await.map_err(signing_failure)?;
        Ok(result)
    }

    async fn execute_sign_letter(
        &self,
        context: &ClinicalContext,
        command: &SignLetterCommand,
    ) -> Result<SignLetterResult, SigningError> {
        let mut tx = self.begin(context).await.map_err(gate_to_signing)?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.apply_letter_sign_command($1,$2,$3,$4,$5)")
                .bind(command.command_id)
                .bind(command.letter_id.0)
                .bind(command.expected_letter_version)
                .bind(command.expected_qa_revision)
                .bind(command.expected_signature_version)
                .fetch_one(&mut *tx)
                .await
                .map_err(signing_failure)?;
        let result = serde_json::from_value(value).map_err(|_| SigningError::Unavailable)?;
        tx.commit().await.map_err(signing_failure)?;
        Ok(result)
    }

    async fn lookup_sign_letter_command(
        &self,
        context: &ClinicalContext,
        command_id: Uuid,
    ) -> Result<Option<SignLetterResult>, SigningError> {
        let mut tx = self.begin(context).await.map_err(gate_to_signing)?;
        let value: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT aso.lookup_letter_sign_command($1)")
                .bind(command_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(signing_failure)?;
        let result = value
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| SigningError::Unavailable)?;
        tx.commit().await.map_err(signing_failure)?;
        Ok(result)
    }

    async fn get(&self, _: LetterId) -> Result<Letter, DomainError> {
        Err(DomainError::Storage(
            "verified letter context required".into(),
        ))
    }

    async fn unresolved_non_policy_retrievals(
        &self,
        _: LetterId,
    ) -> Result<Vec<CriterionId>, DomainError> {
        Err(DomainError::Storage(
            "verified letter context required".into(),
        ))
    }

    async fn sign(&self, _: LetterId, _: ActorId, _: DateTime<Utc>) -> Result<Letter, DomainError> {
        Err(DomainError::Storage(
            "verified signing command required".into(),
        ))
    }
}

#[cfg(test)]
mod case_transaction_tests;
#[cfg(test)]
mod criteria_transaction_tests;
#[cfg(test)]
mod processing_transaction_tests;
#[cfg(test)]
mod reassessment_transaction_tests;
#[cfg(test)]
mod resolution_transaction_tests;
#[cfg(test)]
mod signing_transaction_tests;
#[cfg(test)]
mod source_transaction_tests;
#[cfg(test)]
mod transaction_tests;
#[cfg(test)]
mod upload_transaction_tests;
#[cfg(test)]
mod workflow_transaction_tests;
