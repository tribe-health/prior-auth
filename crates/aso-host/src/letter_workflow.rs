//! Deterministic cited letter generation, review, and approval.

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{AppServices, affirmation::ClinicalContext, session::Principal};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LetterPurpose {
    PriorAuthorizationRequest,
    CorrectedResubmission,
    ClinicalAppeal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LetterExpectedRevisions {
    pub resolution_revision: String,
    pub criteria_selection_revision: String,
    pub evidence_revision: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerateLetterCommand {
    pub command_id: Uuid,
    pub expected_revisions: LetterExpectedRevisions,
    pub purpose: LetterPurpose,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewLetterCommand {
    pub command_id: Uuid,
    pub expected_letter_version: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApproveLetterCommand {
    pub command_id: Uuid,
    pub expected_letter_version: i32,
    pub expected_qa_revision: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LetterClaimSnapshot {
    pub id: Uuid,
    pub ordinal: i32,
    pub claim_text: String,
    pub document_id: Uuid,
    pub document_name: String,
    pub page_number: i32,
    pub source_quote: String,
    pub source_date: NaiveDate,
    pub support_status: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LetterSnapshot {
    pub id: Uuid,
    pub case_id: Uuid,
    pub purpose: LetterPurpose,
    pub version: i32,
    pub status: String,
    pub body_markdown: String,
    pub content_sha256_text: String,
    pub generated_at: DateTime<Utc>,
    pub approved_at: Option<DateTime<Utc>>,
    pub signed_at: Option<DateTime<Utc>>,
    pub qa_revision: i64,
    pub revision: i64,
    pub claims: Vec<LetterClaimSnapshot>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LetterCommandResult {
    pub command_id: Uuid,
    pub letter_id: Uuid,
    pub case_id: Uuid,
    pub letter_version: i32,
    pub qa_revision: i64,
    pub status: String,
    pub committed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum LetterWorkflowError {
    #[error("authentication required")]
    Unauthenticated,
    #[error("letter workflow denied")]
    Denied,
    #[error("case, letter, or command not found")]
    NotFound,
    #[error("an upstream revision changed after it was loaded")]
    RevisionConflict,
    #[error("command identifier already has a different payload")]
    CommandConflict,
    #[error("the clinical gate is incomplete")]
    GateIncomplete,
    #[error("evidence work is incomplete")]
    EvidenceIncomplete,
    #[error("letter QA is incomplete")]
    QaIncomplete,
    #[error("a generated assertion has no complete source")]
    CitationIncomplete,
    #[error("letter request is invalid")]
    Invalid,
    #[error("letter service unavailable")]
    Unavailable,
}

impl AppServices {
    fn check_letter_context(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        required: &str,
    ) -> Result<(), LetterWorkflowError> {
        if context.expires_at <= self.clock.now() {
            return Err(LetterWorkflowError::Unauthenticated);
        }
        if context.principal != Principal::User {
            return Err(LetterWorkflowError::Denied);
        }
        capabilities
            .iter()
            .any(|capability| capability == required)
            .then_some(())
            .ok_or(LetterWorkflowError::Denied)
    }
    pub async fn generate_letter(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        case_id: Uuid,
        command: &GenerateLetterCommand,
    ) -> Result<LetterCommandResult, LetterWorkflowError> {
        self.check_letter_context(context, capabilities, "letter_generate")?;
        if case_id.is_nil()
            || command.command_id.is_nil()
            || command.purpose != LetterPurpose::PriorAuthorizationRequest
        {
            return Err(LetterWorkflowError::Invalid);
        }
        self.letters
            .generate_letter(context, case_id, command)
            .await
    }
    pub async fn read_letter(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        letter_id: Uuid,
    ) -> Result<LetterSnapshot, LetterWorkflowError> {
        if context.expires_at <= self.clock.now() {
            return Err(LetterWorkflowError::Unauthenticated);
        }
        if context.principal != Principal::User
            || !capabilities.iter().any(|value| {
                matches!(
                    value.as_str(),
                    "case:read"
                        | "letter_generate"
                        | "letter_review"
                        | "letter_approve"
                        | "sign_letter"
                )
            })
        {
            return Err(LetterWorkflowError::Denied);
        }
        self.letters.read_letter(context, letter_id).await
    }
    pub async fn review_letter(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        letter_id: Uuid,
        command: &ReviewLetterCommand,
    ) -> Result<LetterCommandResult, LetterWorkflowError> {
        self.check_letter_context(context, capabilities, "letter_review")?;
        self.letters
            .review_letter(context, letter_id, command)
            .await
    }
    pub async fn approve_letter(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        letter_id: Uuid,
        command: &ApproveLetterCommand,
    ) -> Result<LetterCommandResult, LetterWorkflowError> {
        self.check_letter_context(context, capabilities, "letter_approve")?;
        self.letters
            .approve_letter(context, letter_id, command)
            .await
    }
    pub async fn lookup_letter_workflow_command(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        command_id: Uuid,
    ) -> Result<Option<LetterCommandResult>, LetterWorkflowError> {
        if context.expires_at <= self.clock.now() || context.principal != Principal::User {
            return Err(LetterWorkflowError::Unauthenticated);
        }
        if !capabilities.iter().any(|value| {
            matches!(
                value.as_str(),
                "letter_generate" | "letter_review" | "letter_approve"
            )
        }) {
            return Err(LetterWorkflowError::Denied);
        }
        self.letters
            .lookup_letter_workflow_command(context, command_id)
            .await
    }
}
