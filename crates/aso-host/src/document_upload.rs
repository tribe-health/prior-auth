//! Verified, bounded case-document ingestion shared by every shell.
//!
//! Bytes are accepted only with an exact caller-provided SHA-256 digest. The
//! repository owns durable staging, object storage, and metadata commit; UI
//! code never receives a storage key or writes the store directly.

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{AppServices, affirmation::ClinicalContext, session::Principal};

pub const MAX_DOCUMENT_UPLOAD_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_DOCUMENT_UPLOAD_PAGES: usize = 500;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DocumentMediaType {
    #[serde(rename = "application/pdf")]
    ApplicationPdf,
    #[serde(rename = "text/plain")]
    TextPlain,
}

impl DocumentMediaType {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ApplicationPdf => "application/pdf",
            Self::TextPlain => "text/plain",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DocumentProcessingStatus {
    Queued,
    Processing,
    Ready,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DocumentUploadAction {
    Upload,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UploadCaseDocumentCommand {
    pub command_id: Uuid,
    pub document_id: Uuid,
    pub case_id: Uuid,
    pub expected_case_input_revision: i64,
    pub expected_document_set_revision: i64,
    pub document_type_key: String,
    pub name: String,
    pub effective_date: NaiveDate,
    pub media_type: DocumentMediaType,
    pub content_sha256: String,
    pub data: Option<Value>,
}

impl UploadCaseDocumentCommand {
    pub fn content_digest(&self) -> Result<[u8; 32], DocumentUploadError> {
        if self.content_sha256.len() != 64
            || !self
                .content_sha256
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(DocumentUploadError::Invalid);
        }
        let mut digest = [0_u8; 32];
        for (index, pair) in self.content_sha256.as_bytes().chunks_exact(2).enumerate() {
            let pair = std::str::from_utf8(pair).map_err(|_| DocumentUploadError::Invalid)?;
            digest[index] =
                u8::from_str_radix(pair, 16).map_err(|_| DocumentUploadError::Invalid)?;
        }
        Ok(digest)
    }

    fn is_valid(&self) -> bool {
        !self.command_id.is_nil()
            && !self.document_id.is_nil()
            && !self.case_id.is_nil()
            && self.expected_case_input_revision > 0
            && self.expected_document_set_revision >= 0
            && !self.document_type_key.trim().is_empty()
            && !self.name.trim().is_empty()
            && self.data.as_ref().is_none_or(Value::is_object)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentUploadResult {
    pub command_id: Uuid,
    pub action: DocumentUploadAction,
    pub case_id: Uuid,
    pub document_id: Uuid,
    pub committed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentMetadata {
    pub id: Uuid,
    pub case_id: Uuid,
    pub document_type_id: Uuid,
    pub name: String,
    pub effective_date: NaiveDate,
    pub content_sha256: String,
    pub media_type: DocumentMediaType,
    pub byte_size: i64,
    pub page_count: Option<u32>,
    pub processing_status: DocumentProcessingStatus,
    pub processing_error_code: Option<String>,
    pub document_version: i32,
    pub revision: i64,
    pub committed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum DocumentUploadError {
    #[error("authentication required")]
    Unauthenticated,
    #[error("document upload denied")]
    Denied,
    #[error("case, document, staging, or command not found")]
    NotFound,
    #[error("case or document set changed after it was loaded")]
    RevisionConflict,
    #[error("command identifier already has a different payload")]
    CommandConflict,
    #[error("document exceeds the upload limit")]
    TooLarge,
    #[error("document media type is unsupported")]
    UnsupportedType,
    #[error("document integrity check failed")]
    IntegrityMismatch,
    #[error("document upload request is invalid")]
    Invalid,
    #[error("document upload service unavailable")]
    Unavailable,
}

impl AppServices {
    fn check_document_context(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        required_capability: &str,
    ) -> Result<(), DocumentUploadError> {
        if context.expires_at <= self.clock.now() {
            return Err(DocumentUploadError::Unauthenticated);
        }
        if context.principal != Principal::User {
            return Err(DocumentUploadError::Denied);
        }
        if !capabilities
            .iter()
            .any(|capability| capability == required_capability)
        {
            return Err(DocumentUploadError::Denied);
        }
        Ok(())
    }

    pub async fn authorize_document_upload_target(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        case_id: Uuid,
    ) -> Result<(), DocumentUploadError> {
        self.check_document_context(context, capabilities, "document_upload")?;
        if case_id.is_nil() {
            return Err(DocumentUploadError::Invalid);
        }
        self.evidence
            .authorize_document_upload_target(context, case_id)
            .await
    }

    pub async fn upload_case_document(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        command: &UploadCaseDocumentCommand,
        bytes: Vec<u8>,
    ) -> Result<DocumentUploadResult, DocumentUploadError> {
        self.check_document_context(context, capabilities, "document_upload")?;
        if !command.is_valid() || bytes.is_empty() {
            return Err(DocumentUploadError::Invalid);
        }
        if bytes.len() > MAX_DOCUMENT_UPLOAD_BYTES {
            return Err(DocumentUploadError::TooLarge);
        }
        let expected = command.content_digest()?;
        if Sha256::digest(&bytes).as_slice() != expected {
            return Err(DocumentUploadError::IntegrityMismatch);
        }
        self.evidence
            .upload_case_document(context, command, bytes)
            .await
    }

    pub async fn read_case_document(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        case_id: Uuid,
        document_id: Uuid,
    ) -> Result<DocumentMetadata, DocumentUploadError> {
        self.check_document_context(context, capabilities, "case:read")?;
        if case_id.is_nil() || document_id.is_nil() {
            return Err(DocumentUploadError::Invalid);
        }
        self.evidence
            .read_case_document(context, case_id, document_id)
            .await
    }

    pub async fn lookup_document_upload_command(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        case_id: Uuid,
        command_id: Uuid,
    ) -> Result<Option<DocumentUploadResult>, DocumentUploadError> {
        self.check_document_context(context, capabilities, "document_upload")?;
        if case_id.is_nil() || command_id.is_nil() {
            return Err(DocumentUploadError::Invalid);
        }
        self.evidence
            .lookup_document_upload_command(context, case_id, command_id)
            .await
    }
}
