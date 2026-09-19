//! Source-backed, three-state evidence assembly for one verified case.

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{AppServices, affirmation::ClinicalContext, session::Principal};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EvidenceExpectedRevisions {
    pub document_set_revision: String,
    pub criteria_selection_revision: String,
    pub evidence_work_revision: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssembledEvidenceState {
    Met,
    Gap,
    Void,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EvidenceInput {
    pub id: Uuid,
    #[serde(alias = "criterion_id")]
    pub criterion_id: Uuid,
    #[serde(alias = "expected_state")]
    pub expected_state: AssembledEvidenceState,
    #[serde(default, alias = "document_id")]
    pub document_id: Option<Uuid>,
    #[serde(default, alias = "page_number")]
    pub page_number: Option<u32>,
    #[serde(default)]
    pub quote: Option<String>,
    pub rationale: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AssembleEvidenceCommand {
    pub command_id: Uuid,
    pub expected_revisions: EvidenceExpectedRevisions,
    pub evidence_inputs: Vec<EvidenceInput>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EvidenceCitationSnapshot {
    pub id: Uuid,
    pub document_id: Uuid,
    pub page_number: u32,
    pub quote: String,
    pub relevance: String,
    pub document_effective_date: NaiveDate,
    pub content_sha256_text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EvidenceItemSnapshot {
    pub id: Uuid,
    pub criterion_id: Uuid,
    pub criterion_label: String,
    pub criterion_requirement: String,
    pub state: AssembledEvidenceState,
    pub rationale: String,
    pub assessed_at: DateTime<Utc>,
    pub revision: i64,
    pub citations: Vec<EvidenceCitationSnapshot>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EvidenceSnapshot {
    pub case_id: Uuid,
    pub evidence_revision: String,
    pub evidence_work_revision: String,
    pub entries: Vec<EvidenceItemSnapshot>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EvidenceCommandResult {
    pub command_id: Uuid,
    pub case_id: Uuid,
    pub evidence_revision: String,
    pub committed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum EvidenceAssemblyError {
    #[error("authentication required")]
    Unauthenticated,
    #[error("evidence access denied")]
    Denied,
    #[error("case, selection, source, or command not found")]
    NotFound,
    #[error("an upstream revision changed after it was loaded")]
    RevisionConflict,
    #[error("command identifier already has a different payload")]
    CommandConflict,
    #[error("the governing criteria are unresolved or stale")]
    CriteriaUnresolved,
    #[error("a source citation is missing or invalid")]
    CitationIncomplete,
    #[error("evidence input does not preserve the selected three-state matrix")]
    InvalidEvidence,
    #[error("evidence request is invalid")]
    Invalid,
    #[error("evidence service unavailable")]
    Unavailable,
}

fn valid_token(value: &str, kind: &str) -> bool {
    let marker = format!(":{kind}:r");
    let Some((prefix, revision)) = value.rsplit_once(&marker) else {
        return false;
    };
    !prefix.is_empty()
        && (revision == "0" || (!revision.starts_with('0') && !revision.is_empty()))
        && revision.bytes().all(|byte| byte.is_ascii_digit())
}

impl AssembleEvidenceCommand {
    pub fn is_valid(&self) -> bool {
        if self.command_id.is_nil()
            || self.evidence_inputs.is_empty()
            || !valid_token(
                &self.expected_revisions.document_set_revision,
                "documentSetRevision",
            )
            || !valid_token(
                &self.expected_revisions.criteria_selection_revision,
                "criteriaSelectionRevision",
            )
            || !valid_token(
                &self.expected_revisions.evidence_work_revision,
                "evidenceWorkRevision",
            )
        {
            return false;
        }
        let mut evidence_ids = std::collections::HashSet::new();
        let mut criterion_ids = std::collections::HashSet::new();
        self.evidence_inputs.iter().all(|input| {
            let cited = input.document_id.is_some()
                && input.page_number.is_some()
                && input
                    .quote
                    .as_ref()
                    .is_some_and(|value| !value.trim().is_empty());
            !input.id.is_nil()
                && !input.criterion_id.is_nil()
                && evidence_ids.insert(input.id)
                && criterion_ids.insert(input.criterion_id)
                && !input.rationale.trim().is_empty()
                && match input.expected_state {
                    AssembledEvidenceState::Void => {
                        !cited
                            && input.document_id.is_none()
                            && input.page_number.is_none()
                            && input.quote.is_none()
                    }
                    _ => cited,
                }
        })
    }
}

impl AppServices {
    fn check_evidence_context(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        write: bool,
    ) -> Result<(), EvidenceAssemblyError> {
        if context.expires_at <= self.clock.now() {
            return Err(EvidenceAssemblyError::Unauthenticated);
        }
        if context.principal != Principal::User {
            return Err(EvidenceAssemblyError::Denied);
        }
        capabilities
            .iter()
            .any(|capability| {
                if write {
                    capability == "evidence_assemble"
                } else {
                    matches!(capability.as_str(), "case:read" | "evidence_assemble")
                }
            })
            .then_some(())
            .ok_or(EvidenceAssemblyError::Denied)
    }

    pub async fn assemble_case_evidence(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        case_id: Uuid,
        command: &AssembleEvidenceCommand,
    ) -> Result<EvidenceCommandResult, EvidenceAssemblyError> {
        self.check_evidence_context(context, capabilities, true)?;
        if case_id.is_nil() || !command.is_valid() {
            return Err(EvidenceAssemblyError::Invalid);
        }
        self.evidence
            .assemble_case_evidence(context, case_id, command)
            .await
    }

    pub async fn read_case_evidence(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        case_id: Uuid,
    ) -> Result<EvidenceSnapshot, EvidenceAssemblyError> {
        self.check_evidence_context(context, capabilities, false)?;
        if case_id.is_nil() {
            return Err(EvidenceAssemblyError::Invalid);
        }
        self.evidence.read_case_evidence(context, case_id).await
    }

    pub async fn lookup_evidence_assembly_command(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        case_id: Uuid,
        command_id: Uuid,
    ) -> Result<Option<EvidenceCommandResult>, EvidenceAssemblyError> {
        self.check_evidence_context(context, capabilities, true)?;
        if case_id.is_nil() || command_id.is_nil() {
            return Err(EvidenceAssemblyError::Invalid);
        }
        self.evidence
            .lookup_evidence_assembly_command(context, case_id, command_id)
            .await
    }
}
