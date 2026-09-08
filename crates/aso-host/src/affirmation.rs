//! Authoritative clinical commands. Context is supplied by a trusted host,
//! never deserialized from a request or reconstructed from a cached summary.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{AppServices, domain::*, session::Principal};

pub struct ClinicalContext {
    pub identity_id: Uuid,
    pub actor: ActorId,
    pub practice: PracticeId,
    pub principal: Principal,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GateAction {
    Affirm,
    Remove,
}

/// Transport input. Actor, principal and practice authority never come from it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GateMutation {
    pub command_id: Uuid,
    pub kind: GateAffirmationKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GateCommand {
    pub command_id: Uuid,
    pub case_id: Uuid,
    pub kind: GateAffirmationKind,
    pub action: GateAction,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GateSnapshot {
    pub case_id: Uuid,
    pub affirmed: Vec<GateAffirmationKind>,
    pub gate_affirmed_at: Option<DateTime<Utc>>,
    pub gate_affirmed_by: Option<Uuid>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GateCommandResult {
    pub command_id: Uuid,
    pub case_id: Uuid,
    pub kind: GateAffirmationKind,
    pub action: GateAction,
    pub gate: GateSnapshot,
    pub committed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum GateError {
    #[error("authentication required")]
    Unauthenticated,
    #[error("gate access denied")]
    Denied,
    #[error("gate or command not found")]
    NotFound,
    #[error("command identifier already has a different payload")]
    CommandConflict,
    #[error("gate command service unavailable")]
    Unavailable,
    #[error("native authentication unavailable")]
    NativeAuthenticationUnavailable,
}

impl AppServices {
    fn check_clinical_context(&self, context: &ClinicalContext) -> Result<(), GateError> {
        if context.expires_at <= self.clock.now() {
            return Err(GateError::Unauthenticated);
        }
        if context.principal != Principal::User {
            return Err(GateError::Denied);
        }
        Ok(())
    }

    /// A separate service check precedes the database's independent control.
    /// An uncertain response is reconciled by command ID, never automatic replay.
    pub async fn execute_gate_command(
        &self,
        context: &ClinicalContext,
        command: &GateCommand,
    ) -> Result<GateCommandResult, GateError> {
        self.check_clinical_context(context)?;
        if let Some(original) = self
            .cases
            .lookup_gate_command(context, command.command_id)
            .await?
            && (original.case_id != command.case_id
                || original.kind != command.kind
                || original.action != command.action)
        {
            return Err(GateError::CommandConflict);
        }
        if !self
            .authority
            .may_affirm_gate(context, command.case_id)
            .await?
        {
            return Err(GateError::Denied);
        }
        self.check_clinical_context(context)?;
        self.cases.execute_gate_command(context, command).await
    }

    pub async fn read_verified_gate(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
    ) -> Result<GateSnapshot, GateError> {
        self.check_clinical_context(context)?;
        self.cases.read_verified_gate(context, case_id).await
    }

    pub async fn lookup_gate_command(
        &self,
        context: &ClinicalContext,
        command_id: Uuid,
    ) -> Result<Option<GateCommandResult>, GateError> {
        self.check_clinical_context(context)?;
        self.cases.lookup_gate_command(context, command_id).await
    }
}
