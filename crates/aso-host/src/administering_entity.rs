//! Verified administering-entity resolution shared by every shell.
//!
//! Callers provide only command identity, case identity, and the case-input
//! revision they observed. Entity, criteria, submission, appeal, and validity
//! values come from the authoritative resolver adapter.

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{AppServices, affirmation::ClinicalContext, session::Principal};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResolutionState {
    Resolved,
    Missing,
    Ambiguous,
    Conflicting,
    Expired,
}

impl ResolutionState {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Resolved => "resolved",
            Self::Missing => "missing",
            Self::Ambiguous => "ambiguous",
            Self::Conflicting => "conflicting",
            Self::Expired => "expired",
        }
    }

    pub const fn blocks_downstream(self) -> bool {
        !matches!(self, Self::Resolved)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdministeringEntityResolution {
    pub case_id: Uuid,
    pub entity_id: Option<Uuid>,
    pub entity_name: Option<String>,
    pub criteria_set_key: Option<String>,
    pub submission_channel_key: Option<String>,
    pub appeal_path_key: Option<String>,
    pub source_document_id: Option<Uuid>,
    pub source_document_name: Option<String>,
    pub source_document_effective_date: Option<NaiveDate>,
    pub source_document_version: Option<i32>,
    pub entity_revision: Option<i64>,
    pub plan_revision: Option<i64>,
    pub enrollment_revision: Option<i64>,
    pub rule_revision: Option<i64>,
    pub valid_from: Option<NaiveDate>,
    pub valid_to: Option<NaiveDate>,
    pub state: ResolutionState,
    pub revision: i64,
    pub case_input_revision: i64,
    pub resolved_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolveAdministeringEntityCommand {
    pub command_id: Uuid,
    pub case_id: Uuid,
    pub expected_case_input_revision: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolutionCommandReceipt {
    pub command_id: Uuid,
    pub case_id: Uuid,
    pub state: ResolutionState,
    pub resolution_revision: i64,
    pub case_input_revision: i64,
    pub committed_at: DateTime<Utc>,
    pub entity_id: Option<Uuid>,
    pub entity_name: Option<String>,
    pub criteria_set_key: Option<String>,
    pub submission_channel_key: Option<String>,
    pub appeal_path_key: Option<String>,
    pub source_document_id: Option<Uuid>,
    pub source_document_name: Option<String>,
    pub source_document_effective_date: Option<NaiveDate>,
    pub valid_from: Option<NaiveDate>,
    pub valid_to: Option<NaiveDate>,
    pub entity_revision: Option<i64>,
    pub plan_revision: Option<i64>,
    pub enrollment_revision: Option<i64>,
    pub rule_revision: Option<i64>,
    pub source_document_version: Option<i32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum ResolutionError {
    #[error("authentication required")]
    Unauthenticated,
    #[error("administering-entity access denied")]
    Denied,
    #[error("case, resolution, or command not found")]
    NotFound,
    #[error("required case inputs are incomplete")]
    InputsIncomplete,
    #[error("case inputs changed after they were loaded")]
    RevisionConflict,
    #[error("command identifier already has a different payload")]
    CommandConflict,
    #[error("administering-entity request is invalid")]
    Invalid,
    #[error("administering-entity service unavailable")]
    Unavailable,
}

impl AppServices {
    fn check_resolution_context(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        required_capability: &str,
    ) -> Result<(), ResolutionError> {
        if context.expires_at <= self.clock.now() {
            return Err(ResolutionError::Unauthenticated);
        }
        if context.principal != Principal::User {
            return Err(ResolutionError::Denied);
        }
        if !capabilities
            .iter()
            .any(|capability| capability == required_capability)
        {
            return Err(ResolutionError::Denied);
        }
        Ok(())
    }

    pub async fn authorize_administering_entity_target(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        case_id: Uuid,
    ) -> Result<(), ResolutionError> {
        self.check_resolution_context(context, capabilities, "resolve_administering_entity")?;
        if case_id.is_nil() {
            return Err(ResolutionError::Invalid);
        }
        self.cases
            .authorize_administering_entity_target(context, case_id)
            .await
    }

    pub async fn resolve_administering_entity(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        command: &ResolveAdministeringEntityCommand,
    ) -> Result<ResolutionCommandReceipt, ResolutionError> {
        self.check_resolution_context(context, capabilities, "resolve_administering_entity")?;
        if command.command_id.is_nil()
            || command.case_id.is_nil()
            || command.expected_case_input_revision <= 0
        {
            return Err(ResolutionError::Invalid);
        }
        self.cases
            .resolve_administering_entity(context, command)
            .await
    }

    pub async fn read_administering_entity(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        case_id: Uuid,
    ) -> Result<AdministeringEntityResolution, ResolutionError> {
        self.check_resolution_context(context, capabilities, "case:read")?;
        if case_id.is_nil() {
            return Err(ResolutionError::Invalid);
        }
        self.cases.read_administering_entity(context, case_id).await
    }

    pub async fn lookup_administering_entity_command(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        case_id: Uuid,
        command_id: Uuid,
    ) -> Result<Option<ResolutionCommandReceipt>, ResolutionError> {
        self.check_resolution_context(context, capabilities, "resolve_administering_entity")?;
        if case_id.is_nil() || command_id.is_nil() {
            return Err(ResolutionError::Invalid);
        }
        self.cases
            .lookup_administering_entity_command(context, case_id, command_id)
            .await
    }
}
