//! Tauri desktop shell.
//!
//! The shell owns windowing and IPC. It owns no domain logic: every command
//! below is a thin call into [`aso_host::AppServices`], the same services the
//! Axum binary and the Flutter bridge consume.
//!
//! Two rules this file exists to hold:
//!   * Domain logic never migrates here to "just make the desktop work". If a
//!     rule is needed on desktop it is needed everywhere, so it belongs in the
//!     host crate.
//!   * The custom title bar is a DESKTOP concern. The same React bundle serves
//!     the browser, where the OS draws no window controls — so the title bar is
//!     conditionally rendered on the web side, never unconditionally imported.

use std::sync::Arc;

use aso_host::AppServices;

pub struct DesktopState {
    pub services: Arc<AppServices>,
}

/// Commands mirror the HTTP routes one-for-one so the React client can target
/// either transport without a second data model.
pub mod commands {
    use super::*;
    use aso_host::affirmation::{GateCommandResult, GateError, GateMutation, GateSnapshot};
    use aso_host::reassessment::{
        ReassessEvidenceMutation, ReassessEvidenceResult, ReassessmentError,
    };
    use aso_host::signing::{SignLetterMutation, SignLetterResult, SigningError};
    use uuid::Uuid;

    /// Mirrors GET /api/session. Native credentials have no owner until ra-17;
    /// an IPC caller cannot substitute identity, capabilities or a token here.
    pub async fn current_session(
        _state: &DesktopState,
        _practice_id: Option<uuid::Uuid>,
    ) -> Result<aso_host::session::SessionSummary, aso_host::session::SessionError> {
        Err(aso_host::session::SessionError::NativeAuthenticationUnavailable)
    }

    /// Mirrors GET /api/session/replica-grant. The server-owned registry is
    /// shared, but no grant can be bound until ra-17 owns native credentials.
    pub async fn replica_grant(
        _state: &DesktopState,
        _practice_id: Option<uuid::Uuid>,
    ) -> Result<aso_host::projection::ReplicaGrant, aso_host::session::SessionError> {
        Err(aso_host::session::SessionError::NativeAuthenticationUnavailable)
    }

    /// Mirrors the gate routes. Native credentials have no trusted owner until
    /// ra-17, so no gate command can derive authority from IPC arguments.
    pub async fn gate_state(
        _state: &DesktopState,
        _case_id: Uuid,
        _practice_id: Option<Uuid>,
    ) -> Result<GateSnapshot, GateError> {
        Err(GateError::NativeAuthenticationUnavailable)
    }

    pub async fn affirm_gate(
        _state: &DesktopState,
        _case_id: Uuid,
        _practice_id: Option<Uuid>,
        _request: GateMutation,
    ) -> Result<GateCommandResult, GateError> {
        Err(GateError::NativeAuthenticationUnavailable)
    }

    pub async fn remove_gate(
        _state: &DesktopState,
        _case_id: Uuid,
        _practice_id: Option<Uuid>,
        _request: GateMutation,
    ) -> Result<GateCommandResult, GateError> {
        Err(GateError::NativeAuthenticationUnavailable)
    }

    pub async fn lookup_gate_command(
        _state: &DesktopState,
        _case_id: Uuid,
        _practice_id: Option<Uuid>,
        _command_id: Uuid,
    ) -> Result<Option<GateCommandResult>, GateError> {
        Err(GateError::NativeAuthenticationUnavailable)
    }

    pub async fn sign_letter(
        _state: &DesktopState,
        _letter_id: Uuid,
        _practice_id: Option<Uuid>,
        _request: SignLetterMutation,
    ) -> Result<SignLetterResult, SigningError> {
        Err(SigningError::NativeAuthenticationUnavailable)
    }

    pub async fn lookup_sign_letter_command(
        _state: &DesktopState,
        _letter_id: Uuid,
        _practice_id: Option<Uuid>,
        _command_id: Uuid,
    ) -> Result<Option<SignLetterResult>, SigningError> {
        Err(SigningError::NativeAuthenticationUnavailable)
    }

    pub async fn reassess_evidence(
        _state: &DesktopState,
        _case_id: Uuid,
        _evidence_id: Uuid,
        _practice_id: Option<Uuid>,
        _request: ReassessEvidenceMutation,
    ) -> Result<ReassessEvidenceResult, ReassessmentError> {
        Err(ReassessmentError::NativeAuthenticationUnavailable)
    }

    pub async fn lookup_reassessment_command(
        _state: &DesktopState,
        _case_id: Uuid,
        _evidence_id: Uuid,
        _practice_id: Option<Uuid>,
        _command_id: Uuid,
    ) -> Result<Option<ReassessEvidenceResult>, ReassessmentError> {
        Err(ReassessmentError::NativeAuthenticationUnavailable)
    }
}

#[cfg(test)]
mod session_contract_tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use aso_host::{affirmation::*, domain::*, ports::*, reassessment::*, session::*, signing::*};
    use async_trait::async_trait;
    use chrono::{DateTime, Utc};
    use uuid::Uuid;

    struct AuthorityBearingSession {
        summary: SessionSummary,
        calls: AtomicUsize,
    }

    #[async_trait]
    impl SessionPort for AuthorityBearingSession {
        async fn resolve(
            &self,
            _: &SessionCredential,
            _: Option<Uuid>,
        ) -> Result<SessionSummary, SessionError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(self.summary.clone())
        }
    }

    struct UnexpectedDomainCalls;

    #[async_trait]
    impl CaseRepository for UnexpectedDomainCalls {
        async fn gate_state(&self, _: CaseId) -> Result<GateState, DomainError> {
            panic!("session refusal must not read a case")
        }

        async fn record_affirmation(
            &self,
            _: CaseId,
            _: GateAffirmationKind,
            _: ActorId,
            _: DateTime<Utc>,
        ) -> Result<GateState, DomainError> {
            panic!("session refusal must not affirm a gate")
        }
    }

    #[async_trait]
    impl EvidenceRepository for UnexpectedDomainCalls {
        async fn counts(&self, _: CaseId) -> Result<EvidenceCounts, DomainError> {
            panic!("session refusal must not read evidence")
        }
    }

    #[async_trait]
    impl CriteriaRepository for UnexpectedDomainCalls {
        async fn get(&self, _: CriterionId) -> Result<Criterion, DomainError> {
            panic!("session refusal must not read a criterion")
        }

        async fn live_for_payer(&self, _: &str) -> Result<Vec<Criterion>, DomainError> {
            panic!("session refusal must not read payer criteria")
        }
    }

    #[async_trait]
    impl LetterRepository for UnexpectedDomainCalls {
        async fn get(&self, _: LetterId) -> Result<Letter, DomainError> {
            panic!("session refusal must not read a letter")
        }

        async fn unresolved_non_policy_retrievals(
            &self,
            _: LetterId,
        ) -> Result<Vec<CriterionId>, DomainError> {
            panic!("session refusal must not read letter retrievals")
        }

        async fn sign(
            &self,
            _: LetterId,
            _: ActorId,
            _: DateTime<Utc>,
        ) -> Result<Letter, DomainError> {
            panic!("session refusal must not sign a letter")
        }
    }

    #[async_trait]
    impl AuthorityPort for UnexpectedDomainCalls {
        async fn holds(&self, _: ActorId, _: Capability) -> Result<bool, DomainError> {
            panic!("session refusal must not resolve clinical authority")
        }
    }

    impl Clock for UnexpectedDomainCalls {
        fn now(&self) -> DateTime<Utc> {
            panic!("session refusal must not consult the domain clock")
        }
    }

    struct AcceptingGateCalls {
        result: GateCommandResult,
        calls: AtomicUsize,
    }

    struct AcceptingSigningCalls {
        target: SigningTarget,
        result: SignLetterResult,
        calls: AtomicUsize,
    }

    struct AcceptingReassessmentCalls {
        target: EvidenceReassessmentTarget,
        result: ReassessEvidenceResult,
        calls: AtomicUsize,
    }

    #[async_trait]
    impl EvidenceRepository for AcceptingReassessmentCalls {
        async fn read_reassessment_target(
            &self,
            _: &ClinicalContext,
            _: Uuid,
            _: Uuid,
        ) -> Result<EvidenceReassessmentTarget, ReassessmentError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(self.target)
        }

        async fn execute_reassessment(
            &self,
            _: &ClinicalContext,
            _: &ReassessEvidenceCommand,
        ) -> Result<ReassessEvidenceResult, ReassessmentError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(self.result.clone())
        }

        async fn lookup_reassessment_command(
            &self,
            _: &ClinicalContext,
            _: Uuid,
        ) -> Result<Option<ReassessEvidenceResult>, ReassessmentError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(None)
        }

        async fn counts(&self, _: CaseId) -> Result<EvidenceCounts, DomainError> {
            panic!("legacy counts")
        }
    }

    #[async_trait]
    impl AuthorityPort for AcceptingReassessmentCalls {
        async fn may_reassess_evidence(
            &self,
            _: &ClinicalContext,
            _: Uuid,
            _: Uuid,
        ) -> Result<bool, ReassessmentError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(true)
        }

        async fn holds(&self, _: ActorId, _: Capability) -> Result<bool, DomainError> {
            panic!("legacy authority")
        }
    }

    #[async_trait]
    impl LetterRepository for AcceptingSigningCalls {
        async fn read_signing_target(
            &self,
            _: &ClinicalContext,
            _: LetterId,
        ) -> Result<SigningTarget, SigningError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(self.target)
        }

        async fn execute_sign_letter(
            &self,
            _: &ClinicalContext,
            _: &SignLetterCommand,
        ) -> Result<SignLetterResult, SigningError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(self.result.clone())
        }

        async fn get(&self, _: LetterId) -> Result<Letter, DomainError> {
            panic!("legacy get")
        }
        async fn unresolved_non_policy_retrievals(
            &self,
            _: LetterId,
        ) -> Result<Vec<CriterionId>, DomainError> {
            panic!("legacy retrieval")
        }
        async fn sign(
            &self,
            _: LetterId,
            _: ActorId,
            _: DateTime<Utc>,
        ) -> Result<Letter, DomainError> {
            panic!("legacy sign")
        }
    }

    #[async_trait]
    impl AuthorityPort for AcceptingSigningCalls {
        async fn may_sign_letter(
            &self,
            _: &ClinicalContext,
            _: LetterId,
        ) -> Result<bool, SigningError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(true)
        }

        async fn holds(&self, _: ActorId, _: Capability) -> Result<bool, DomainError> {
            panic!("legacy authority")
        }
    }

    #[async_trait]
    impl CaseRepository for AcceptingGateCalls {
        async fn execute_gate_command(
            &self,
            _: &ClinicalContext,
            _: &GateCommand,
        ) -> Result<GateCommandResult, GateError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(self.result.clone())
        }

        async fn read_verified_gate(
            &self,
            _: &ClinicalContext,
            _: Uuid,
        ) -> Result<GateSnapshot, GateError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(self.result.gate.clone())
        }

        async fn lookup_gate_command(
            &self,
            _: &ClinicalContext,
            _: Uuid,
        ) -> Result<Option<GateCommandResult>, GateError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(Some(self.result.clone()))
        }

        async fn gate_state(&self, _: CaseId) -> Result<GateState, DomainError> {
            panic!("native gate refusal must not read legacy gate state")
        }

        async fn record_affirmation(
            &self,
            _: CaseId,
            _: GateAffirmationKind,
            _: ActorId,
            _: DateTime<Utc>,
        ) -> Result<GateState, DomainError> {
            panic!("native gate refusal must not record a legacy affirmation")
        }
    }

    #[async_trait]
    impl AuthorityPort for AcceptingGateCalls {
        async fn may_affirm_gate(&self, _: &ClinicalContext, _: Uuid) -> Result<bool, GateError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(true)
        }

        async fn holds(&self, _: ActorId, _: Capability) -> Result<bool, DomainError> {
            panic!("native gate refusal must not resolve actor-selected authority")
        }
    }

    #[tokio::test]
    async fn gate_commands_refuse_even_when_injected_ports_accept() {
        let practice_id = Uuid::new_v4();
        let case_id = Uuid::new_v4();
        let command_id = Uuid::new_v4();
        let sessions = Arc::new(AuthorityBearingSession {
            summary: SessionSummary {
                identity_id: Uuid::new_v4(),
                session_id: Uuid::new_v4(),
                user_id: Uuid::new_v4(),
                practice_id,
                display_name: "Synthetic surgeon".into(),
                principal: Principal::User,
                capabilities: vec!["affirm_gate".into()],
                expires_at: Utc::now() + chrono::Duration::hours(1),
                authorization_revision: "desktop-gate-test".into(),
            },
            calls: AtomicUsize::new(0),
        });
        let gates = Arc::new(AcceptingGateCalls {
            result: GateCommandResult {
                command_id,
                case_id,
                kind: GateAffirmationKind::Policy,
                action: GateAction::Affirm,
                gate: GateSnapshot {
                    case_id,
                    affirmed: vec![GateAffirmationKind::Policy],
                    gate_affirmed_at: None,
                    gate_affirmed_by: None,
                },
                committed_at: Utc::now(),
            },
            calls: AtomicUsize::new(0),
        });
        let unused = Arc::new(UnexpectedDomainCalls);
        let state = DesktopState {
            services: Arc::new(AppServices {
                cases: gates.clone(),
                evidence: unused.clone(),
                criteria: unused.clone(),
                letters: unused.clone(),
                authority: gates.clone(),
                clock: unused,
                sessions: sessions.clone(),
            }),
        };
        let context = ClinicalContext {
            identity_id: sessions.summary.identity_id,
            actor: ActorId(sessions.summary.user_id),
            practice: PracticeId(practice_id),
            principal: Principal::User,
            expires_at: sessions.summary.expires_at,
        };
        let command = GateCommand {
            command_id,
            case_id,
            kind: GateAffirmationKind::Policy,
            action: GateAction::Affirm,
        };

        // Positive controls prove the injected ports would accept access.
        assert_eq!(
            sessions
                .resolve(
                    &SessionCredential::NativeToken("synthetic-gate-token".into()),
                    Some(practice_id),
                )
                .await,
            Ok(sessions.summary.clone()),
        );
        assert_eq!(gates.may_affirm_gate(&context, case_id).await, Ok(true));
        assert_eq!(
            gates.execute_gate_command(&context, &command).await,
            Ok(gates.result.clone())
        );
        assert_eq!(
            gates.read_verified_gate(&context, case_id).await,
            Ok(gates.result.gate.clone())
        );
        assert_eq!(
            gates.lookup_gate_command(&context, command_id).await,
            Ok(Some(gates.result.clone()))
        );
        assert_eq!(gates.calls.load(Ordering::SeqCst), 4);
        assert_eq!(sessions.calls.load(Ordering::SeqCst), 1);

        for selection in [None, Some(practice_id)] {
            assert_eq!(
                commands::gate_state(&state, case_id, selection).await,
                Err(GateError::NativeAuthenticationUnavailable),
            );
            assert_eq!(
                commands::lookup_gate_command(&state, case_id, selection, command_id).await,
                Err(GateError::NativeAuthenticationUnavailable),
            );
            for kind in GateAffirmationKind::ALL {
                assert_eq!(
                    commands::affirm_gate(
                        &state,
                        case_id,
                        selection,
                        GateMutation { command_id, kind },
                    )
                    .await,
                    Err(GateError::NativeAuthenticationUnavailable),
                );
                assert_eq!(
                    commands::remove_gate(
                        &state,
                        case_id,
                        selection,
                        GateMutation { command_id, kind },
                    )
                    .await,
                    Err(GateError::NativeAuthenticationUnavailable),
                );
            }
            assert_eq!(gates.calls.load(Ordering::SeqCst), 4);
            assert_eq!(sessions.calls.load(Ordering::SeqCst), 1);
        }
    }

    #[tokio::test]
    async fn signing_refuses_even_when_injected_ports_accept() {
        let practice_id = Uuid::new_v4();
        let letter_id = Uuid::new_v4();
        let case_id = Uuid::new_v4();
        let command_id = Uuid::new_v4();
        let actor_id = Uuid::new_v4();
        let signature_id = Uuid::new_v4();
        let signing = Arc::new(AcceptingSigningCalls {
            target: SigningTarget {
                letter_id: LetterId(letter_id),
                case_id,
                letter_version: 2,
                qa_revision: 7,
                signature_version: Some(3),
                status: LetterStatus::Approved,
                approved_by_actor: true,
                is_current: true,
                gate_affirmed: true,
                qa_complete: true,
                sources_complete: true,
            },
            result: SignLetterResult {
                command_id,
                letter_id,
                case_id,
                letter_version: 2,
                qa_revision: 7,
                signature_id,
                signature_version: 3,
                signed_at: Utc::now(),
            },
            calls: AtomicUsize::new(0),
        });
        let unused = Arc::new(UnexpectedDomainCalls);
        let state = DesktopState {
            services: Arc::new(AppServices {
                cases: unused.clone(),
                evidence: unused.clone(),
                criteria: unused.clone(),
                letters: signing.clone(),
                authority: signing.clone(),
                clock: unused.clone(),
                sessions: Arc::new(UnavailableSessions),
            }),
        };
        let context = ClinicalContext {
            identity_id: Uuid::new_v4(),
            actor: ActorId(actor_id),
            practice: PracticeId(practice_id),
            principal: Principal::User,
            expires_at: Utc::now() + chrono::Duration::hours(1),
        };
        let command = SignLetterCommand {
            command_id,
            letter_id: LetterId(letter_id),
            expected_letter_version: 2,
            expected_qa_revision: 7,
            expected_signature_version: 3,
        };
        assert_eq!(
            signing.may_sign_letter(&context, LetterId(letter_id)).await,
            Ok(true)
        );
        assert_eq!(
            signing
                .read_signing_target(&context, LetterId(letter_id))
                .await,
            Ok(signing.target)
        );
        assert_eq!(
            signing.execute_sign_letter(&context, &command).await,
            Ok(signing.result.clone())
        );
        assert_eq!(signing.calls.load(Ordering::SeqCst), 3);

        let request = SignLetterMutation {
            command_id,
            expected_letter_version: 2,
            expected_qa_revision: 7,
            expected_signature_version: 3,
        };
        for selection in [None, Some(practice_id)] {
            assert_eq!(
                commands::sign_letter(&state, letter_id, selection, request).await,
                Err(SigningError::NativeAuthenticationUnavailable),
            );
            assert_eq!(
                commands::lookup_sign_letter_command(&state, letter_id, selection, command_id,)
                    .await,
                Err(SigningError::NativeAuthenticationUnavailable),
            );
            assert_eq!(signing.calls.load(Ordering::SeqCst), 3);
        }
    }

    #[tokio::test]
    async fn reassessment_refuses_even_when_injected_ports_accept() {
        let practice_id = Uuid::new_v4();
        let case_id = Uuid::new_v4();
        let evidence_id = Uuid::new_v4();
        let command_id = Uuid::new_v4();
        let expected_assessed_at = Utc::now() - chrono::Duration::minutes(1);
        let reassessment = Arc::new(AcceptingReassessmentCalls {
            target: EvidenceReassessmentTarget {
                case_id,
                evidence_id,
                state: EvidenceState::Void,
                assessed_at: expected_assessed_at,
            },
            result: ReassessEvidenceResult {
                command_id,
                case_id,
                evidence_id,
                previous_state: EvidenceState::Void,
                state: EvidenceState::Gap,
                expected_assessed_at,
                assessed_at: Utc::now(),
            },
            calls: AtomicUsize::new(0),
        });
        let unused = Arc::new(UnexpectedDomainCalls);
        let state = DesktopState {
            services: Arc::new(AppServices {
                cases: unused.clone(),
                evidence: reassessment.clone(),
                criteria: unused.clone(),
                letters: unused.clone(),
                authority: reassessment.clone(),
                clock: unused,
                sessions: Arc::new(UnavailableSessions),
            }),
        };
        let request = ReassessEvidenceMutation {
            command_id,
            state: EvidenceState::Gap,
            expected_assessed_at,
        };
        for selection in [None, Some(practice_id)] {
            assert_eq!(
                commands::reassess_evidence(&state, case_id, evidence_id, selection, request,)
                    .await,
                Err(ReassessmentError::NativeAuthenticationUnavailable),
            );
            assert_eq!(
                commands::lookup_reassessment_command(
                    &state,
                    case_id,
                    evidence_id,
                    selection,
                    command_id,
                )
                .await,
                Err(ReassessmentError::NativeAuthenticationUnavailable),
            );
            assert_eq!(reassessment.calls.load(Ordering::SeqCst), 0);
        }
    }

    #[tokio::test]
    async fn current_session_refuses_even_when_injected_port_can_return_authority() {
        let practice_id = Uuid::new_v4();
        let sessions = Arc::new(AuthorityBearingSession {
            summary: SessionSummary {
                identity_id: Uuid::new_v4(),
                session_id: Uuid::new_v4(),
                user_id: Uuid::new_v4(),
                practice_id,
                display_name: "Synthetic surgeon".into(),
                principal: Principal::User,
                capabilities: vec!["affirm_gate".into(), "sign_letter".into()],
                expires_at: Utc::now(),
                authorization_revision: "desktop-test".into(),
            },
            calls: AtomicUsize::new(0),
        });
        let unused = Arc::new(UnexpectedDomainCalls);
        let state = DesktopState {
            services: Arc::new(AppServices {
                cases: unused.clone(),
                evidence: unused.clone(),
                criteria: unused.clone(),
                letters: unused.clone(),
                authority: unused.clone(),
                clock: unused,
                sessions: sessions.clone(),
            }),
        };

        // The refusal must come from the wrapper, even with an accepting port.
        let control = state
            .services
            .sessions
            .resolve(
                &SessionCredential::NativeToken("synthetic-test-token".into()),
                Some(practice_id),
            )
            .await;
        assert_eq!(control, Ok(sessions.summary.clone()));
        assert_eq!(sessions.calls.load(Ordering::SeqCst), 1);

        for selection in [None, Some(practice_id)] {
            assert_eq!(
                commands::current_session(&state, selection).await,
                Err(SessionError::NativeAuthenticationUnavailable),
                "practice selection {selection:?} must not activate native authentication",
            );
            assert_eq!(
                commands::replica_grant(&state, selection).await,
                Err(SessionError::NativeAuthenticationUnavailable),
                "practice selection {selection:?} must not activate a replica grant",
            );
            assert_eq!(sessions.calls.load(Ordering::SeqCst), 1);
        }
    }
}
