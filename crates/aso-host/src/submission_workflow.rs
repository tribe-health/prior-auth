//! Durable submission packet, acknowledgement, and custody contracts.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    AppServices, affirmation::ClinicalContext, letter_workflow::LetterPurpose, session::Principal,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SubmitPacketCommand {
    pub command_id: Uuid,
    pub expected_letter_revision: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecordAcknowledgementCommand {
    pub command_id: Uuid,
    pub submission_id: Uuid,
    pub payer_reference: String,
    pub acknowledged_at: DateTime<Utc>,
    pub page_count: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SubmissionLetterSnapshot {
    pub id: Uuid,
    pub purpose: LetterPurpose,
    pub status: String,
    pub version: i32,
    pub revision: i64,
    pub content_sha256_text: String,
    pub signed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SubmissionAttachmentSnapshot {
    pub ordinal: i32,
    pub kind: String,
    pub name: String,
    pub document_id: Option<Uuid>,
    pub page_count: i32,
    pub content_sha256_text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SubmissionSnapshot {
    pub id: Uuid,
    pub command_id: Uuid,
    pub letter_id: Uuid,
    pub status: String,
    pub channel: String,
    pub attempt: i32,
    pub submitted_at: DateTime<Utc>,
    pub total_pages: i32,
    pub manifest_sha256_text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SubmissionPacketSnapshot {
    pub case_id: Uuid,
    pub letter: Option<SubmissionLetterSnapshot>,
    pub submission: Option<SubmissionSnapshot>,
    pub attachments: Vec<SubmissionAttachmentSnapshot>,
    pub can_submit: bool,
    pub block_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReceiptSnapshot {
    pub id: Uuid,
    pub command_id: Uuid,
    pub submission_id: Uuid,
    pub payer_reference: String,
    pub acknowledged_at: DateTime<Utc>,
    pub page_count: i32,
    pub recorded_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CustodyEventSnapshot {
    pub sequence: i32,
    pub event: String,
    pub occurred_at: DateTime<Utc>,
    pub actor_label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SubmissionReceiptView {
    pub packet: SubmissionPacketSnapshot,
    pub receipt: Option<ReceiptSnapshot>,
    pub custody: Vec<CustodyEventSnapshot>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum SubmissionWorkflowError {
    #[error("authentication required")]
    Unauthenticated,
    #[error("submission workflow denied")]
    Denied,
    #[error("case, letter, submission, or command not found")]
    NotFound,
    #[error("the packet changed after it was loaded")]
    RevisionConflict,
    #[error("command identifier already has a different payload")]
    CommandConflict,
    #[error("the packet is not ready for submission")]
    NotReady,
    #[error("submission request is invalid")]
    Invalid,
    #[error("submission service unavailable")]
    Unavailable,
}

impl AppServices {
    fn check_submission_context(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        require_submit: bool,
    ) -> Result<(), SubmissionWorkflowError> {
        if context.expires_at <= self.clock.now() {
            return Err(SubmissionWorkflowError::Unauthenticated);
        }
        if context.principal != Principal::User {
            return Err(SubmissionWorkflowError::Denied);
        }
        let allowed = capabilities
            .iter()
            .any(|value| value == "submit" || (!require_submit && value == "case:read"));
        allowed.then_some(()).ok_or(SubmissionWorkflowError::Denied)
    }

    pub async fn read_submission_packet(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        case_id: Uuid,
    ) -> Result<SubmissionPacketSnapshot, SubmissionWorkflowError> {
        self.check_submission_context(context, capabilities, false)?;
        if case_id.is_nil() {
            return Err(SubmissionWorkflowError::Invalid);
        }
        self.letters.read_submission_packet(context, case_id).await
    }

    pub async fn submit_packet(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        case_id: Uuid,
        command: &SubmitPacketCommand,
    ) -> Result<SubmissionPacketSnapshot, SubmissionWorkflowError> {
        self.check_submission_context(context, capabilities, true)?;
        if case_id.is_nil() || command.command_id.is_nil() || command.expected_letter_revision < 1 {
            return Err(SubmissionWorkflowError::Invalid);
        }
        self.letters.submit_packet(context, case_id, command).await
    }

    pub async fn read_submission_receipt(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        case_id: Uuid,
    ) -> Result<SubmissionReceiptView, SubmissionWorkflowError> {
        self.check_submission_context(context, capabilities, false)?;
        if case_id.is_nil() {
            return Err(SubmissionWorkflowError::Invalid);
        }
        self.letters.read_submission_receipt(context, case_id).await
    }

    pub async fn record_submission_acknowledgement(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        case_id: Uuid,
        command: &RecordAcknowledgementCommand,
    ) -> Result<SubmissionReceiptView, SubmissionWorkflowError> {
        self.check_submission_context(context, capabilities, true)?;
        if case_id.is_nil()
            || command.command_id.is_nil()
            || command.submission_id.is_nil()
            || command.payer_reference.trim().is_empty()
            || command.page_count < 0
        {
            return Err(SubmissionWorkflowError::Invalid);
        }
        self.letters
            .record_submission_acknowledgement(context, case_id, command)
            .await
    }
}
