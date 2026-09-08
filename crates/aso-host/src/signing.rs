//! Verified-context letter signing shared by every shell.
//! Identity and practice authority come only from [`ClinicalContext`].

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    AppServices,
    affirmation::ClinicalContext,
    domain::{LetterId, LetterStatus},
    session::Principal,
};

/// Transport input. Actor, principal, practice and signature identity are
/// resolved from the fresh verified context and authoritative repository.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SignLetterMutation {
    pub command_id: Uuid,
    pub expected_letter_version: i32,
    pub expected_qa_revision: i64,
    pub expected_signature_version: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SignLetterCommand {
    pub command_id: Uuid,
    pub letter_id: LetterId,
    pub expected_letter_version: i32,
    pub expected_qa_revision: i64,
    pub expected_signature_version: i32,
}

/// Authoritative precondition projection. The service checks it before the
/// write; the database checks the underlying rows again while locked.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SigningTarget {
    pub letter_id: LetterId,
    pub case_id: Uuid,
    pub letter_version: i32,
    pub qa_revision: i64,
    pub signature_version: Option<i32>,
    pub status: LetterStatus,
    pub approved_by_actor: bool,
    pub is_current: bool,
    pub gate_affirmed: bool,
    pub qa_complete: bool,
    pub sources_complete: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignLetterResult {
    pub command_id: Uuid,
    pub letter_id: Uuid,
    pub case_id: Uuid,
    pub letter_version: i32,
    pub qa_revision: i64,
    pub signature_id: Uuid,
    pub signature_version: i32,
    pub signed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum SigningError {
    #[error("authentication required")]
    Unauthenticated,
    #[error("letter signing denied")]
    Denied,
    #[error("letter not found")]
    NotFound,
    #[error("letter or QA revision is stale")]
    RevisionConflict,
    #[error("signature revision is stale")]
    SignatureConflict,
    #[error("letter is not the current approved revision")]
    NotApproved,
    #[error("case has not been affirmed at the surgeon gate")]
    GateNotAffirmed,
    #[error("letter QA is incomplete or has a blocking failure")]
    QaIncomplete,
    #[error("letter assertions do not have complete sources")]
    SourceIncomplete,
    #[error("command identifier already has a different payload")]
    CommandConflict,
    #[error("letter signing service unavailable")]
    Unavailable,
    #[error("native authentication unavailable")]
    NativeAuthenticationUnavailable,
}

impl AppServices {
    fn check_signing_context(&self, context: &ClinicalContext) -> Result<(), SigningError> {
        if context.expires_at <= self.clock.now() {
            return Err(SigningError::Unauthenticated);
        }
        if context.principal != Principal::User {
            return Err(SigningError::Denied);
        }
        Ok(())
    }

    fn check_signing_target(
        target: &SigningTarget,
        command: &SignLetterCommand,
    ) -> Result<(), SigningError> {
        if target.letter_id != command.letter_id
            || target.letter_version != command.expected_letter_version
            || target.qa_revision != command.expected_qa_revision
        {
            return Err(SigningError::RevisionConflict);
        }
        if target.signature_version != Some(command.expected_signature_version) {
            return Err(SigningError::SignatureConflict);
        }
        if target.status != LetterStatus::Approved
            || !target.approved_by_actor
            || !target.is_current
        {
            return Err(SigningError::NotApproved);
        }
        if !target.gate_affirmed {
            return Err(SigningError::GateNotAffirmed);
        }
        if !target.qa_complete {
            return Err(SigningError::QaIncomplete);
        }
        if !target.sources_complete {
            return Err(SigningError::SourceIncomplete);
        }
        Ok(())
    }

    /// Checks fresh human context, resource authority and every signing
    /// precondition before invoking the repository's independent transaction.
    pub async fn execute_sign_letter(
        &self,
        context: &ClinicalContext,
        command: &SignLetterCommand,
    ) -> Result<SignLetterResult, SigningError> {
        self.check_signing_context(context)?;
        if let Some(original) = self
            .letters
            .lookup_sign_letter_command(context, command.command_id)
            .await?
        {
            if original.command_id != command.command_id
                || original.letter_id != command.letter_id.0
                || original.letter_version != command.expected_letter_version
                || original.qa_revision != command.expected_qa_revision
                || original.signature_version != command.expected_signature_version
            {
                return Err(SigningError::CommandConflict);
            }
            if !self
                .authority
                .may_sign_letter(context, LetterId(original.letter_id))
                .await?
            {
                return Err(SigningError::Denied);
            }
            return Ok(original);
        }
        if !self
            .authority
            .may_sign_letter(context, command.letter_id)
            .await?
        {
            return Err(SigningError::Denied);
        }
        let target = self
            .letters
            .read_signing_target(context, command.letter_id)
            .await?;
        Self::check_signing_target(&target, command)?;
        // Authority and session can change while repository reads wait.
        self.check_signing_context(context)?;
        if !self
            .authority
            .may_sign_letter(context, command.letter_id)
            .await?
        {
            return Err(SigningError::Denied);
        }
        self.letters.execute_sign_letter(context, command).await
    }

    pub async fn lookup_sign_letter_command(
        &self,
        context: &ClinicalContext,
        letter_id: LetterId,
        command_id: Uuid,
    ) -> Result<Option<SignLetterResult>, SigningError> {
        self.check_signing_context(context)?;
        if !self.authority.may_sign_letter(context, letter_id).await? {
            return Err(SigningError::Denied);
        }
        Ok(self
            .letters
            .lookup_sign_letter_command(context, command_id)
            .await?
            .filter(|result| result.letter_id == letter_id.0))
    }

    pub async fn read_signing_target(
        &self,
        context: &ClinicalContext,
        letter_id: LetterId,
    ) -> Result<SigningTarget, SigningError> {
        self.check_signing_context(context)?;
        let target = self.letters.read_signing_target(context, letter_id).await?;
        if target.letter_id != letter_id {
            return Err(SigningError::Unavailable);
        }
        Ok(target)
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
        "2026-09-06T12:00:00Z".parse().unwrap()
    }
    fn id(value: u128) -> Uuid {
        Uuid::from_u128(value)
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
    impl EvidenceRepository for Unused {
        async fn counts(&self, _: CaseId) -> Result<EvidenceCounts, crate::domain::DomainError> {
            panic!("evidence")
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

    struct SigningPorts {
        allow: AtomicBool,
        authority_calls: AtomicUsize,
        target: Mutex<SigningTarget>,
        reads: AtomicUsize,
        writes: AtomicUsize,
        lookup: Mutex<Option<SignLetterResult>>,
        lookups: AtomicUsize,
        result: SignLetterResult,
    }
    #[async_trait]
    impl AuthorityPort for SigningPorts {
        async fn may_sign_letter(
            &self,
            _: &ClinicalContext,
            _: LetterId,
        ) -> Result<bool, SigningError> {
            self.authority_calls.fetch_add(1, Ordering::SeqCst);
            Ok(self.allow.load(Ordering::SeqCst))
        }
        async fn holds(
            &self,
            _: ActorId,
            _: crate::domain::Capability,
        ) -> Result<bool, crate::domain::DomainError> {
            panic!("legacy authority")
        }
    }
    #[async_trait]
    impl LetterRepository for SigningPorts {
        async fn read_signing_target(
            &self,
            _: &ClinicalContext,
            _: LetterId,
        ) -> Result<SigningTarget, SigningError> {
            self.reads.fetch_add(1, Ordering::SeqCst);
            Ok(*self.target.lock().unwrap())
        }
        async fn execute_sign_letter(
            &self,
            _: &ClinicalContext,
            _: &SignLetterCommand,
        ) -> Result<SignLetterResult, SigningError> {
            self.writes.fetch_add(1, Ordering::SeqCst);
            Ok(self.result.clone())
        }
        async fn lookup_sign_letter_command(
            &self,
            _: &ClinicalContext,
            _: Uuid,
        ) -> Result<Option<SignLetterResult>, SigningError> {
            self.lookups.fetch_add(1, Ordering::SeqCst);
            Ok(self.lookup.lock().unwrap().clone())
        }
        async fn get(
            &self,
            _: LetterId,
        ) -> Result<crate::domain::Letter, crate::domain::DomainError> {
            panic!("legacy get")
        }
        async fn unresolved_non_policy_retrievals(
            &self,
            _: LetterId,
        ) -> Result<Vec<CriterionId>, crate::domain::DomainError> {
            panic!("legacy retrieval")
        }
        async fn sign(
            &self,
            _: LetterId,
            _: ActorId,
            _: DateTime<Utc>,
        ) -> Result<crate::domain::Letter, crate::domain::DomainError> {
            panic!("legacy sign")
        }
    }

    fn context(principal: Principal, expires_at: DateTime<Utc>) -> ClinicalContext {
        ClinicalContext {
            identity_id: id(1),
            actor: ActorId(id(2)),
            practice: PracticeId(id(3)),
            principal,
            expires_at,
        }
    }
    fn command() -> SignLetterCommand {
        SignLetterCommand {
            command_id: id(4),
            letter_id: LetterId(id(5)),
            expected_letter_version: 7,
            expected_qa_revision: 11,
            expected_signature_version: 3,
        }
    }
    fn ready() -> SigningTarget {
        SigningTarget {
            letter_id: LetterId(id(5)),
            case_id: id(6),
            letter_version: 7,
            qa_revision: 11,
            signature_version: Some(3),
            status: LetterStatus::Approved,
            approved_by_actor: true,
            is_current: true,
            gate_affirmed: true,
            qa_complete: true,
            sources_complete: true,
        }
    }
    fn fixture() -> (AppServices, Arc<SigningPorts>) {
        let result = SignLetterResult {
            command_id: id(4),
            letter_id: id(5),
            case_id: id(6),
            letter_version: 7,
            qa_revision: 11,
            signature_id: id(7),
            signature_version: 3,
            signed_at: now(),
        };
        let signing = Arc::new(SigningPorts {
            allow: AtomicBool::new(true),
            authority_calls: AtomicUsize::new(0),
            target: Mutex::new(ready()),
            reads: AtomicUsize::new(0),
            writes: AtomicUsize::new(0),
            lookup: Mutex::new(None),
            lookups: AtomicUsize::new(0),
            result,
        });
        let unused = Arc::new(Unused);
        (
            AppServices {
                cases: unused.clone(),
                evidence: unused.clone(),
                criteria: unused,
                letters: signing.clone(),
                authority: signing.clone(),
                clock: Arc::new(FixedClock),
                sessions: Arc::new(UnavailableSessions),
            },
            signing,
        )
    }

    #[tokio::test]
    async fn verified_human_and_complete_current_revisions_are_required() {
        let (app, ports) = fixture();
        let command = command();
        assert_eq!(
            app.execute_sign_letter(
                &context(Principal::User, now() + chrono::Duration::hours(1)),
                &command
            )
            .await,
            Ok(ports.result.clone()),
        );
        assert_eq!(ports.authority_calls.load(Ordering::SeqCst), 2);
        assert_eq!(ports.reads.load(Ordering::SeqCst), 1);
        assert_eq!(ports.writes.load(Ordering::SeqCst), 1);
        assert_eq!(ports.lookups.load(Ordering::SeqCst), 1);

        for (target, error) in [
            (
                SigningTarget {
                    letter_version: 8,
                    ..ready()
                },
                SigningError::RevisionConflict,
            ),
            (
                SigningTarget {
                    qa_revision: 12,
                    ..ready()
                },
                SigningError::RevisionConflict,
            ),
            (
                SigningTarget {
                    signature_version: Some(4),
                    ..ready()
                },
                SigningError::SignatureConflict,
            ),
            (
                SigningTarget {
                    status: LetterStatus::Draft,
                    ..ready()
                },
                SigningError::NotApproved,
            ),
            (
                SigningTarget {
                    approved_by_actor: false,
                    ..ready()
                },
                SigningError::NotApproved,
            ),
            (
                SigningTarget {
                    is_current: false,
                    ..ready()
                },
                SigningError::NotApproved,
            ),
            (
                SigningTarget {
                    gate_affirmed: false,
                    ..ready()
                },
                SigningError::GateNotAffirmed,
            ),
            (
                SigningTarget {
                    qa_complete: false,
                    ..ready()
                },
                SigningError::QaIncomplete,
            ),
            (
                SigningTarget {
                    sources_complete: false,
                    ..ready()
                },
                SigningError::SourceIncomplete,
            ),
        ] {
            *ports.target.lock().unwrap() = target;
            assert_eq!(
                app.execute_sign_letter(
                    &context(Principal::User, now() + chrono::Duration::hours(1)),
                    &command
                )
                .await,
                Err(error),
            );
        }
        assert_eq!(ports.writes.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn nonhuman_expired_and_denied_contexts_never_reach_the_write() {
        let (app, ports) = fixture();
        for principal in [Principal::Agent, Principal::Service] {
            assert_eq!(
                app.execute_sign_letter(
                    &context(principal, now() + chrono::Duration::hours(1)),
                    &command()
                )
                .await,
                Err(SigningError::Denied),
            );
        }
        assert_eq!(
            app.execute_sign_letter(&context(Principal::User, now()), &command())
                .await,
            Err(SigningError::Unauthenticated),
        );
        ports.allow.store(false, Ordering::SeqCst);
        assert_eq!(
            app.execute_sign_letter(
                &context(Principal::User, now() + chrono::Duration::hours(1)),
                &command()
            )
            .await,
            Err(SigningError::Denied),
        );
        assert_eq!(ports.reads.load(Ordering::SeqCst), 0);
        assert_eq!(ports.writes.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn stored_result_reconciles_before_mutable_target_reads() {
        let (app, ports) = fixture();
        *ports.lookup.lock().unwrap() = Some(ports.result.clone());

        assert_eq!(
            app.execute_sign_letter(
                &context(Principal::User, now() + chrono::Duration::hours(1)),
                &command(),
            )
            .await,
            Ok(ports.result.clone()),
        );
        assert_eq!(ports.lookups.load(Ordering::SeqCst), 1);
        assert_eq!(ports.reads.load(Ordering::SeqCst), 0);
        assert_eq!(ports.writes.load(Ordering::SeqCst), 0);

        assert_eq!(
            app.execute_sign_letter(
                &context(Principal::User, now() + chrono::Duration::hours(1)),
                &SignLetterCommand {
                    expected_letter_version: 8,
                    ..command()
                },
            )
            .await,
            Err(SigningError::CommandConflict),
        );
        assert_eq!(ports.reads.load(Ordering::SeqCst), 0);
        assert_eq!(ports.writes.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn a_repository_receipt_for_another_command_is_refused() {
        let (app, ports) = fixture();
        *ports.lookup.lock().unwrap() = Some(SignLetterResult {
            command_id: id(99),
            ..ports.result.clone()
        });
        assert_eq!(
            app.execute_sign_letter(
                &context(Principal::User, now() + chrono::Duration::hours(1)),
                &command(),
            )
            .await,
            Err(SigningError::CommandConflict),
        );
        assert_eq!(ports.reads.load(Ordering::SeqCst), 0);
        assert_eq!(ports.writes.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn transport_mutation_rejects_caller_selected_authority() {
        let forged = serde_json::json!({
            "commandId": id(4),
            "expectedLetterVersion": 7,
            "expectedQaRevision": 11,
            "expectedSignatureVersion": 3,
            "actor": id(99),
        });
        assert!(serde_json::from_value::<SignLetterMutation>(forged).is_err());
    }
}
