//! Verified-context evidence reassessment shared by every shell.
//! Identity, practice and clinical authority come only from [`ClinicalContext`].

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{AppServices, affirmation::ClinicalContext, domain::EvidenceState, session::Principal};

/// Transport input. The current assessment timestamp is the optimistic
/// concurrency boundary observed in the authorized replica.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReassessEvidenceMutation {
    pub command_id: Uuid,
    pub state: EvidenceState,
    pub expected_assessed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ReassessEvidenceCommand {
    pub command_id: Uuid,
    pub case_id: Uuid,
    pub evidence_id: Uuid,
    pub state: EvidenceState,
    pub expected_assessed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceReassessmentTarget {
    pub case_id: Uuid,
    pub evidence_id: Uuid,
    pub state: EvidenceState,
    pub assessed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReassessEvidenceResult {
    pub command_id: Uuid,
    pub case_id: Uuid,
    pub evidence_id: Uuid,
    pub previous_state: EvidenceState,
    pub state: EvidenceState,
    pub expected_assessed_at: DateTime<Utc>,
    pub assessed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum ReassessmentError {
    #[error("authentication required")]
    Unauthenticated,
    #[error("evidence reassessment denied")]
    Denied,
    #[error("evidence assessment or command not found")]
    NotFound,
    #[error("evidence assessment changed after it was reviewed")]
    RevisionConflict,
    #[error("command identifier already has a different payload")]
    CommandConflict,
    #[error("evidence reassessment service unavailable")]
    Unavailable,
    #[error("native authentication unavailable")]
    NativeAuthenticationUnavailable,
}

impl AppServices {
    fn check_reassessment_context(
        &self,
        context: &ClinicalContext,
    ) -> Result<(), ReassessmentError> {
        if context.expires_at <= self.clock.now() {
            return Err(ReassessmentError::Unauthenticated);
        }
        if context.principal != Principal::User {
            return Err(ReassessmentError::Denied);
        }
        Ok(())
    }

    fn command_matches_result(
        command: &ReassessEvidenceCommand,
        result: &ReassessEvidenceResult,
    ) -> bool {
        result.command_id == command.command_id
            && result.case_id == command.case_id
            && result.evidence_id == command.evidence_id
            && result.previous_state != result.state
            && result.state == command.state
            && result.expected_assessed_at == command.expected_assessed_at
    }

    /// Reconciles a stored result before reading mutable target state. This is
    /// what makes a lost response recoverable without replaying a clinical act.
    pub async fn execute_reassess_evidence(
        &self,
        context: &ClinicalContext,
        command: &ReassessEvidenceCommand,
    ) -> Result<ReassessEvidenceResult, ReassessmentError> {
        self.check_reassessment_context(context)?;
        if let Some(original) = self
            .evidence
            .lookup_reassessment_command(context, command.command_id)
            .await?
        {
            if !Self::command_matches_result(command, &original) {
                return Err(ReassessmentError::CommandConflict);
            }
            if !self
                .authority
                .may_reassess_evidence(context, original.case_id, original.evidence_id)
                .await?
            {
                return Err(ReassessmentError::Denied);
            }
            return Ok(original);
        }

        if !self
            .authority
            .may_reassess_evidence(context, command.case_id, command.evidence_id)
            .await?
        {
            return Err(ReassessmentError::Denied);
        }
        let target = self
            .evidence
            .read_reassessment_target(context, command.case_id, command.evidence_id)
            .await?;
        if target.case_id != command.case_id || target.evidence_id != command.evidence_id {
            return Err(ReassessmentError::Unavailable);
        }
        if target.assessed_at != command.expected_assessed_at {
            return Err(ReassessmentError::RevisionConflict);
        }
        self.check_reassessment_context(context)?;
        if !self
            .authority
            .may_reassess_evidence(context, command.case_id, command.evidence_id)
            .await?
        {
            return Err(ReassessmentError::Denied);
        }
        self.evidence.execute_reassessment(context, command).await
    }

    pub async fn read_reassessment_target(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        evidence_id: Uuid,
    ) -> Result<EvidenceReassessmentTarget, ReassessmentError> {
        self.check_reassessment_context(context)?;
        let target = self
            .evidence
            .read_reassessment_target(context, case_id, evidence_id)
            .await?;
        if target.case_id != case_id || target.evidence_id != evidence_id {
            return Err(ReassessmentError::Unavailable);
        }
        Ok(target)
    }

    pub async fn lookup_reassessment_command(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        evidence_id: Uuid,
        command_id: Uuid,
    ) -> Result<Option<ReassessEvidenceResult>, ReassessmentError> {
        self.check_reassessment_context(context)?;
        if !self
            .authority
            .may_reassess_evidence(context, case_id, evidence_id)
            .await?
        {
            return Err(ReassessmentError::Denied);
        }
        Ok(self
            .evidence
            .lookup_reassessment_command(context, command_id)
            .await?
            .filter(|result| result.case_id == case_id && result.evidence_id == evidence_id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        domain::{ActorId, CaseId, CriterionId, GateAffirmationKind, GateState, PracticeId},
        ports::{
            AuthorityPort, CaseRepository, Clock, CriteriaRepository, Criterion, EvidenceCounts,
            EvidenceRepository, LetterRepository,
        },
        session::UnavailableSessions,
    };
    use async_trait::async_trait;
    use std::sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    };

    fn now() -> DateTime<Utc> {
        "2026-09-07T01:00:00Z".parse().unwrap()
    }
    fn id(value: u128) -> Uuid {
        Uuid::from_u128(value)
    }
    fn context(principal: Principal) -> ClinicalContext {
        ClinicalContext {
            identity_id: id(1),
            actor: ActorId(id(2)),
            practice: PracticeId(id(3)),
            principal,
            expires_at: now() + chrono::Duration::hours(1),
        }
    }
    fn command() -> ReassessEvidenceCommand {
        ReassessEvidenceCommand {
            command_id: id(4),
            case_id: id(5),
            evidence_id: id(6),
            state: EvidenceState::Gap,
            expected_assessed_at: now(),
        }
    }
    fn result() -> ReassessEvidenceResult {
        ReassessEvidenceResult {
            command_id: id(4),
            case_id: id(5),
            evidence_id: id(6),
            previous_state: EvidenceState::Void,
            state: EvidenceState::Gap,
            expected_assessed_at: now(),
            assessed_at: now() + chrono::Duration::minutes(1),
        }
    }

    struct FixedClock;
    impl Clock for FixedClock {
        fn now(&self) -> DateTime<Utc> {
            now()
        }
    }

    struct Unused;
    #[async_trait]
    impl CaseRepository for Unused {
        async fn gate_state(&self, _: CaseId) -> Result<GateState, crate::domain::DomainError> {
            panic!("case read")
        }
        async fn record_affirmation(
            &self,
            _: CaseId,
            _: GateAffirmationKind,
            _: ActorId,
            _: DateTime<Utc>,
        ) -> Result<GateState, crate::domain::DomainError> {
            panic!("case write")
        }
    }
    #[async_trait]
    impl CriteriaRepository for Unused {
        async fn get(&self, _: CriterionId) -> Result<Criterion, crate::domain::DomainError> {
            panic!("criterion")
        }
        async fn live_for_payer(
            &self,
            _: &str,
        ) -> Result<Vec<Criterion>, crate::domain::DomainError> {
            panic!("payer")
        }
    }
    #[async_trait]
    impl LetterRepository for Unused {
        async fn get(
            &self,
            _: crate::domain::LetterId,
        ) -> Result<crate::domain::Letter, crate::domain::DomainError> {
            panic!("letter")
        }
        async fn unresolved_non_policy_retrievals(
            &self,
            _: crate::domain::LetterId,
        ) -> Result<Vec<CriterionId>, crate::domain::DomainError> {
            panic!("retrieval")
        }
        async fn sign(
            &self,
            _: crate::domain::LetterId,
            _: ActorId,
            _: DateTime<Utc>,
        ) -> Result<crate::domain::Letter, crate::domain::DomainError> {
            panic!("sign")
        }
    }

    struct ReassessmentPorts {
        allowed: AtomicBool,
        target: Mutex<EvidenceReassessmentTarget>,
        stored: Mutex<Option<ReassessEvidenceResult>>,
        reads: AtomicUsize,
        writes: AtomicUsize,
        lookups: AtomicUsize,
        authority: AtomicUsize,
    }
    #[async_trait]
    impl EvidenceRepository for ReassessmentPorts {
        async fn read_reassessment_target(
            &self,
            _: &ClinicalContext,
            _: Uuid,
            _: Uuid,
        ) -> Result<EvidenceReassessmentTarget, ReassessmentError> {
            self.reads.fetch_add(1, Ordering::SeqCst);
            Ok(*self.target.lock().unwrap())
        }
        async fn execute_reassessment(
            &self,
            _: &ClinicalContext,
            _: &ReassessEvidenceCommand,
        ) -> Result<ReassessEvidenceResult, ReassessmentError> {
            self.writes.fetch_add(1, Ordering::SeqCst);
            Ok(result())
        }
        async fn lookup_reassessment_command(
            &self,
            _: &ClinicalContext,
            _: Uuid,
        ) -> Result<Option<ReassessEvidenceResult>, ReassessmentError> {
            self.lookups.fetch_add(1, Ordering::SeqCst);
            Ok(self.stored.lock().unwrap().clone())
        }
        async fn counts(&self, _: CaseId) -> Result<EvidenceCounts, crate::domain::DomainError> {
            panic!("counts")
        }
    }
    #[async_trait]
    impl AuthorityPort for ReassessmentPorts {
        async fn may_reassess_evidence(
            &self,
            _: &ClinicalContext,
            case_id: Uuid,
            evidence_id: Uuid,
        ) -> Result<bool, ReassessmentError> {
            self.authority.fetch_add(1, Ordering::SeqCst);
            Ok(self.allowed.load(Ordering::SeqCst) && case_id == id(5) && evidence_id == id(6))
        }
        async fn holds(
            &self,
            _: ActorId,
            _: crate::domain::Capability,
        ) -> Result<bool, crate::domain::DomainError> {
            panic!("legacy authority")
        }
    }

    fn fixture() -> (AppServices, Arc<ReassessmentPorts>) {
        let ports = Arc::new(ReassessmentPorts {
            allowed: AtomicBool::new(true),
            target: Mutex::new(EvidenceReassessmentTarget {
                case_id: id(5),
                evidence_id: id(6),
                state: EvidenceState::Void,
                assessed_at: now(),
            }),
            stored: Mutex::new(None),
            reads: AtomicUsize::new(0),
            writes: AtomicUsize::new(0),
            lookups: AtomicUsize::new(0),
            authority: AtomicUsize::new(0),
        });
        let unused = Arc::new(Unused);
        (
            AppServices {
                cases: unused.clone(),
                evidence: ports.clone(),
                criteria: unused.clone(),
                letters: unused,
                authority: ports.clone(),
                clock: Arc::new(FixedClock),
                sessions: Arc::new(UnavailableSessions),
            },
            ports,
        )
    }

    #[tokio::test]
    async fn new_command_checks_revision_and_authority_before_write() {
        let (app, ports) = fixture();
        assert_eq!(
            app.execute_reassess_evidence(&context(Principal::User), &command())
                .await,
            Ok(result()),
        );
        assert_eq!(ports.lookups.load(Ordering::SeqCst), 1);
        assert_eq!(ports.authority.load(Ordering::SeqCst), 2);
        assert_eq!(ports.reads.load(Ordering::SeqCst), 1);
        assert_eq!(ports.writes.load(Ordering::SeqCst), 1);

        ports.target.lock().unwrap().assessed_at = now() + chrono::Duration::seconds(1);
        assert_eq!(
            app.execute_reassess_evidence(&context(Principal::User), &command())
                .await,
            Err(ReassessmentError::RevisionConflict),
        );
        assert_eq!(ports.writes.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn stored_result_resolves_without_repeating_the_clinical_write() {
        let (app, ports) = fixture();
        *ports.stored.lock().unwrap() = Some(result());
        assert_eq!(
            app.execute_reassess_evidence(&context(Principal::User), &command())
                .await,
            Ok(result()),
        );
        assert_eq!(ports.reads.load(Ordering::SeqCst), 0);
        assert_eq!(ports.writes.load(Ordering::SeqCst), 0);

        assert_eq!(
            app.execute_reassess_evidence(
                &context(Principal::User),
                &ReassessEvidenceCommand {
                    state: EvidenceState::Met,
                    ..command()
                },
            )
            .await,
            Err(ReassessmentError::CommandConflict),
        );
        assert_eq!(ports.reads.load(Ordering::SeqCst), 0);
        assert_eq!(ports.writes.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn nonhuman_and_denied_contexts_never_reach_the_write() {
        let (app, ports) = fixture();
        assert_eq!(
            app.execute_reassess_evidence(&context(Principal::Agent), &command())
                .await,
            Err(ReassessmentError::Denied),
        );
        ports.allowed.store(false, Ordering::SeqCst);
        assert_eq!(
            app.execute_reassess_evidence(&context(Principal::User), &command())
                .await,
            Err(ReassessmentError::Denied),
        );
        assert_eq!(ports.reads.load(Ordering::SeqCst), 0);
        assert_eq!(ports.writes.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn transport_mutation_rejects_caller_selected_authority() {
        let forged = serde_json::json!({
            "commandId": id(4),
            "state": "gap",
            "expectedAssessedAt": now(),
            "actor": id(99),
        });
        assert!(serde_json::from_value::<ReassessEvidenceMutation>(forged).is_err());
    }
}
