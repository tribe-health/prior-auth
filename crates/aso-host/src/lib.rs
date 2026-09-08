//! Host-neutral application core for the Prior Authorization Workbench.
//!
//! Every surface — Axum web, Tauri desktop, Flutter mobile — consumes the same
//! [`AppServices`]. This crate names no shell: no Axum, no Tauri, no FFI. That
//! constraint is what lets one core serve three surfaces, and it is checked by
//! `scripts/audit.sh`.
//!
//! The domain types below carry the clinical invariants from
//! `docs/design/schema/schema.sql`. Where the database enforces a rule with a
//! trigger, the type system mirrors it, so a violation is a compile error on
//! the way to being a runtime refusal.

pub mod affirmation;
pub mod domain;
pub mod ports;
pub mod projection;
pub mod reassessment;
pub mod session;
pub mod signing;

use std::sync::Arc;

/// The single capability surface every shell consumes.
///
/// Shells wire adapters into the ports; they never reach past this struct into
/// a repository or a provider directly.
#[derive(Clone)]
pub struct AppServices {
    pub cases: Arc<dyn ports::CaseRepository>,
    pub evidence: Arc<dyn ports::EvidenceRepository>,
    pub criteria: Arc<dyn ports::CriteriaRepository>,
    pub letters: Arc<dyn ports::LetterRepository>,
    pub authority: Arc<dyn ports::AuthorityPort>,
    pub clock: Arc<dyn ports::Clock>,
    pub sessions: Arc<dyn session::SessionPort>,
}

impl AppServices {
    /// Affirm one of the four surgeon-gate confirmations.
    ///
    /// The capability check happens here AND in the database. That is not
    /// redundancy for its own sake: a service role can bypass row-level
    /// security, so the database trigger is the floor, and this check is what
    /// gives the caller a typed error instead of a constraint violation.
    pub async fn affirm_gate(
        &self,
        actor: domain::ActorId,
        case_id: domain::CaseId,
        kind: domain::GateAffirmationKind,
    ) -> Result<domain::GateState, domain::DomainError> {
        if !self
            .authority
            .holds(actor, domain::Capability::AffirmGate)
            .await?
        {
            return Err(domain::DomainError::CapabilityDenied {
                capability: domain::Capability::AffirmGate,
                actor,
            });
        }
        self.cases
            .record_affirmation(case_id, kind, actor, self.clock.now())
            .await
    }
}
