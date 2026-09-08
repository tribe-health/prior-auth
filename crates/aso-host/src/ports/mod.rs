//! Outbound ports. The core depends on these traits; adapters implement them.
//!
//! Nothing here names a database, an HTTP client, or a shell. A Postgres
//! adapter and an in-memory test adapter are interchangeable from the core's
//! point of view, which is what makes the core testable without a container.

use crate::domain::*;
use async_trait::async_trait;

#[async_trait]
pub trait CaseRepository: Send + Sync {
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
