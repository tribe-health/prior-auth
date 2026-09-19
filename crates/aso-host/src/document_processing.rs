//! Host-neutral document processing for an authorized internal job.
//!
//! A human can upload a source document but cannot process it. Processing is
//! available only to a service principal holding the narrow job grant. Source
//! bytes and extracted page text remain behind the repository port.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    AppServices, affirmation::ClinicalContext, document_upload::DocumentProcessingStatus,
    session::Principal,
};

pub const AUTHORIZED_DOCUMENT_JOB_GRANT: &str = "authorized_document_job_only";
pub const MAX_EXTRACTED_PAGE_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum DocumentExtractionError {
    #[error("document source integrity failed")]
    SourceIntegrity,
    #[error("document has too many pages")]
    PageLimitExceeded,
    #[error("document page text is empty")]
    EmptyPageText,
    #[error("document text extraction failed")]
    TextExtractionFailed,
}

impl DocumentExtractionError {
    pub const fn code(self) -> &'static str {
        match self {
            Self::SourceIntegrity => "source_integrity_failed",
            Self::PageLimitExceeded => "page_limit_exceeded",
            Self::EmptyPageText => "empty_page_text",
            Self::TextExtractionFailed => "text_extraction_failed",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProcessCaseDocumentCommand {
    pub command_id: Uuid,
    pub case_id: Uuid,
    pub document_id: Uuid,
    pub expected_document_set_revision: i64,
}

impl ProcessCaseDocumentCommand {
    pub fn is_valid(&self) -> bool {
        !self.command_id.is_nil()
            && !self.case_id.is_nil()
            && !self.document_id.is_nil()
            && self.expected_document_set_revision >= 0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DocumentProcessingAction {
    Process,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentProcessingResult {
    pub command_id: Uuid,
    pub action: DocumentProcessingAction,
    pub case_id: Uuid,
    pub document_id: Uuid,
    pub status: DocumentProcessingStatus,
    pub page_count: Option<u32>,
    pub document_set_revision: i64,
    pub committed_at: DateTime<Utc>,
}

/// Page content passed only from a processor adapter to the durable repository.
/// It is intentionally not serializable so it cannot become an HTTP result.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExtractedDocumentPage {
    pub page_number: u32,
    pub text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum DocumentProcessingError {
    #[error("authentication required")]
    Unauthenticated,
    #[error("document processing denied")]
    Denied,
    #[error("case, document, or command not found")]
    NotFound,
    #[error("document set changed after the job was queued")]
    RevisionConflict,
    #[error("command identifier already has a different payload")]
    CommandConflict,
    #[error("document processing failed")]
    ProcessingFailed,
    #[error("document processing request is invalid")]
    Invalid,
    #[error("document processing service unavailable")]
    Unavailable,
}

impl AppServices {
    fn check_document_processing_context(
        &self,
        context: &ClinicalContext,
        job_grants: &[String],
    ) -> Result<(), DocumentProcessingError> {
        if context.expires_at <= self.clock.now() {
            return Err(DocumentProcessingError::Unauthenticated);
        }
        if context.principal != Principal::Service
            || !job_grants
                .iter()
                .any(|grant| grant == AUTHORIZED_DOCUMENT_JOB_GRANT)
        {
            return Err(DocumentProcessingError::Denied);
        }
        Ok(())
    }

    pub async fn process_case_document(
        &self,
        context: &ClinicalContext,
        job_grants: &[String],
        command: &ProcessCaseDocumentCommand,
    ) -> Result<DocumentProcessingResult, DocumentProcessingError> {
        self.check_document_processing_context(context, job_grants)?;
        if !command.is_valid() {
            return Err(DocumentProcessingError::Invalid);
        }
        self.evidence.process_case_document(context, command).await
    }

    pub async fn lookup_document_process_command(
        &self,
        context: &ClinicalContext,
        job_grants: &[String],
        case_id: Uuid,
        document_id: Uuid,
        command_id: Uuid,
    ) -> Result<Option<DocumentProcessingResult>, DocumentProcessingError> {
        self.check_document_processing_context(context, job_grants)?;
        if case_id.is_nil() || document_id.is_nil() || command_id.is_nil() {
            return Err(DocumentProcessingError::Invalid);
        }
        self.evidence
            .lookup_document_process_command(context, case_id, document_id, command_id)
            .await
    }
}
