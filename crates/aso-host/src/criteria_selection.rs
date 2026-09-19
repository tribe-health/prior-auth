//! Immutable criteria selection for one verified case.

use std::collections::HashSet;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    AppServices,
    affirmation::ClinicalContext,
    criteria_catalog::{CatalogCriterion, CatalogPolicy},
    session::Principal,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CriteriaSelectionExpectedRevisions {
    pub resolution_revision: String,
    pub criteria_catalog_revision: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SelectCriteriaCommand {
    pub command_id: Uuid,
    pub expected_revisions: CriteriaSelectionExpectedRevisions,
    pub criterion_ids: Vec<Uuid>,
}

pub type SelectedPolicy = CatalogPolicy;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CriteriaSelectionState {
    Current,
    Stale,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CriteriaSelectionSnapshot {
    pub case_id: Uuid,
    pub resolution_revision: String,
    pub criteria_catalog_revision: String,
    pub criteria_selection_revision: String,
    pub criteria_snapshot_id: Uuid,
    pub policy: SelectedPolicy,
    pub criteria: Vec<CatalogCriterion>,
    pub selected_by: Uuid,
    pub selected_at: DateTime<Utc>,
    pub state: CriteriaSelectionState,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CriteriaSelectionResult {
    pub command_id: Uuid,
    pub case_id: Uuid,
    pub criteria_selection_revision: String,
    pub committed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum CriteriaSelectionError {
    #[error("authentication required")]
    Unauthenticated,
    #[error("criteria selection access denied")]
    Denied,
    #[error("case, selection, criterion, policy, or command not found")]
    NotFound,
    #[error("an upstream revision changed after it was loaded")]
    RevisionConflict,
    #[error("command identifier already has a different payload")]
    CommandConflict,
    #[error("the case has no current resolved coverage path")]
    ResolutionRequired,
    #[error("the selected criteria do not form one effective policy snapshot")]
    InvalidSelection,
    #[error("criteria selection request is invalid")]
    Invalid,
    #[error("criteria selection service unavailable")]
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
        && revision.parse::<i64>().is_ok()
}

impl SelectCriteriaCommand {
    pub fn is_valid(&self) -> bool {
        let mut ids = HashSet::with_capacity(self.criterion_ids.len());
        !self.command_id.is_nil()
            && valid_token(
                &self.expected_revisions.resolution_revision,
                "resolutionRevision",
            )
            && valid_token(
                &self.expected_revisions.criteria_catalog_revision,
                "criteriaCatalogRevision",
            )
            && !self.criterion_ids.is_empty()
            && self
                .criterion_ids
                .iter()
                .all(|id| !id.is_nil() && ids.insert(*id))
    }
}

impl AppServices {
    fn check_criteria_selection_context(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        write: bool,
    ) -> Result<(), CriteriaSelectionError> {
        if context.expires_at <= self.clock.now() {
            return Err(CriteriaSelectionError::Unauthenticated);
        }
        if context.principal != Principal::User {
            return Err(CriteriaSelectionError::Denied);
        }
        let allowed = capabilities.iter().any(|value| {
            if write {
                value == "criteria_select"
            } else {
                matches!(value.as_str(), "case:read" | "criteria_select")
            }
        });
        allowed.then_some(()).ok_or(CriteriaSelectionError::Denied)
    }

    pub async fn select_case_criteria(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        case_id: Uuid,
        command: &SelectCriteriaCommand,
    ) -> Result<CriteriaSelectionResult, CriteriaSelectionError> {
        self.check_criteria_selection_context(context, capabilities, true)?;
        if case_id.is_nil() || !command.is_valid() {
            return Err(CriteriaSelectionError::Invalid);
        }
        self.criteria
            .select_case_criteria(context, case_id, command)
            .await
    }

    pub async fn read_criteria_selection(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        case_id: Uuid,
    ) -> Result<CriteriaSelectionSnapshot, CriteriaSelectionError> {
        self.check_criteria_selection_context(context, capabilities, false)?;
        if case_id.is_nil() {
            return Err(CriteriaSelectionError::Invalid);
        }
        self.criteria
            .read_criteria_selection(context, case_id)
            .await
    }

    pub async fn lookup_criteria_selection_command(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        case_id: Uuid,
        command_id: Uuid,
    ) -> Result<Option<CriteriaSelectionResult>, CriteriaSelectionError> {
        self.check_criteria_selection_context(context, capabilities, true)?;
        if case_id.is_nil() || command_id.is_nil() {
            return Err(CriteriaSelectionError::Invalid);
        }
        self.criteria
            .lookup_criteria_selection_command(context, case_id, command_id)
            .await
    }
}
