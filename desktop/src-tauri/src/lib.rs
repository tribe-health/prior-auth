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
use async_trait::async_trait;
use tauri::{Emitter, Manager, WindowEvent};

pub mod ipc;
pub mod native_commands;
pub mod native_session;
pub mod replica_coordinator;

#[async_trait]
pub trait NativeSessionCredentialOwner: Send + Sync {
    async fn credential(
        &self,
    ) -> Result<aso_host::session::SessionCredential, aso_host::session::SessionError>;
}

pub struct UnavailableNativeSessionCredentialOwner;

#[async_trait]
impl NativeSessionCredentialOwner for UnavailableNativeSessionCredentialOwner {
    async fn credential(
        &self,
    ) -> Result<aso_host::session::SessionCredential, aso_host::session::SessionError> {
        Err(aso_host::session::SessionError::NativeAuthenticationUnavailable)
    }
}

pub struct DesktopState {
    pub services: Arc<AppServices>,
    pub native_session: Arc<dyn NativeSessionCredentialOwner>,
    pub native_commands: Arc<dyn native_commands::NativeClinicalCommandPort>,
    pub ipc_authority: Arc<ipc::NativeIpcAuthority>,
}

pub fn configure_tauri<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
    state: DesktopState,
) -> tauri::Builder<R> {
    builder
        .manage(state)
        .manage(replica_coordinator::NativeReplicaCoordinator::default())
        .invoke_handler(tauri::generate_handler![
            ipc::current_session,
            ipc::logout,
            ipc::gate_state,
            ipc::affirm_gate,
            ipc::remove_gate,
            ipc::lookup_gate_command,
            ipc::signing_target,
            ipc::sign_letter,
            ipc::lookup_sign_letter_command,
            ipc::reassess_evidence,
            ipc::lookup_reassessment_command,
            ipc::save_annotation,
            ipc::lookup_annotation_command,
            ipc::document_source,
            ipc::claim_replica_owner,
            ipc::publish_replica_projection,
            ipc::release_replica_owner,
        ])
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Destroyed) {
                let coordinator = window.state::<replica_coordinator::NativeReplicaCoordinator>();
                if let Ok(events) = coordinator.release_window(window.label()) {
                    for event in events {
                        let _ = window
                            .app_handle()
                            .emit(replica_coordinator::NATIVE_REPLICA_EVENT, event);
                    }
                }
            }
        })
}

/// Commands mirror the HTTP routes one-for-one so the React client can target
/// either transport without a second data model.
pub mod commands {
    use super::*;
    use aso_host::affirmation::{
        ClinicalContext, GateCommandResult, GateError, GateMutation, GateSnapshot,
    };
    use aso_host::annotation::{AnnotationError, AnnotationMutation, AnnotationResult};
    use aso_host::domain::{ActorId, PracticeId};
    use aso_host::logout::LogoutResult;
    use aso_host::reassessment::{
        ReassessEvidenceMutation, ReassessEvidenceResult, ReassessmentError,
    };
    use aso_host::session::{Principal, SessionError};
    use aso_host::signing::{SignLetterMutation, SignLetterResult, SigningError, SigningTarget};
    use aso_host::source::{DocumentSource, DocumentSourceError, DocumentSourceRequest};
    use uuid::Uuid;

    /// Mirrors GET /api/session. The injected host owner supplies the credential;
    /// an IPC caller cannot substitute identity, capabilities or a token here.
    pub async fn current_session(
        state: &DesktopState,
        practice_id: Option<uuid::Uuid>,
    ) -> Result<aso_host::session::SessionSummary, aso_host::session::SessionError> {
        let credential = state.native_session.credential().await?;
        let summary = state
            .services
            .sessions
            .resolve(&credential, practice_id)
            .await?;
        if summary.expires_at <= state.services.clock.now() {
            return Err(SessionError::Unauthenticated);
        }
        if summary.principal != Principal::User {
            return Err(SessionError::PracticeDenied);
        }
        Ok(summary)
    }

    /// Mirrors GET /api/session/replica-grant. The server-owned registry and
    /// host-owned credential use the same SessionPort contract as HTTP.
    pub async fn replica_grant(
        state: &DesktopState,
        practice_id: Option<uuid::Uuid>,
    ) -> Result<aso_host::projection::ReplicaGrant, aso_host::session::SessionError> {
        let summary = current_session(state, practice_id).await?;
        Ok(aso_host::projection::ReplicaGrant::for_session(&summary))
    }

    /// Mirrors DELETE /api/session. RA17 supplies the production credential
    /// owner; the renderer cannot choose a token or session ID to revoke.
    pub async fn logout(state: &DesktopState) -> Result<LogoutResult, SessionError> {
        let credential = state.native_session.credential().await?;
        state.services.sessions.logout(&credential).await
    }

    fn gate_session_error(error: SessionError) -> GateError {
        match error {
            SessionError::Unauthenticated | SessionError::ReauthenticationRequired => {
                GateError::Unauthenticated
            }
            SessionError::PracticeDenied => GateError::Denied,
            SessionError::Unavailable => GateError::Unavailable,
            SessionError::NativeAuthenticationUnavailable => {
                GateError::NativeAuthenticationUnavailable
            }
        }
    }

    fn signing_session_error(error: SessionError) -> SigningError {
        match error {
            SessionError::Unauthenticated | SessionError::ReauthenticationRequired => {
                SigningError::Unauthenticated
            }
            SessionError::PracticeDenied => SigningError::Denied,
            SessionError::Unavailable => SigningError::Unavailable,
            SessionError::NativeAuthenticationUnavailable => {
                SigningError::NativeAuthenticationUnavailable
            }
        }
    }

    fn reassessment_session_error(error: SessionError) -> ReassessmentError {
        match error {
            SessionError::Unauthenticated | SessionError::ReauthenticationRequired => {
                ReassessmentError::Unauthenticated
            }
            SessionError::PracticeDenied => ReassessmentError::Denied,
            SessionError::Unavailable => ReassessmentError::Unavailable,
            SessionError::NativeAuthenticationUnavailable => {
                ReassessmentError::NativeAuthenticationUnavailable
            }
        }
    }

    fn annotation_session_error(error: SessionError) -> AnnotationError {
        match error {
            SessionError::Unauthenticated | SessionError::ReauthenticationRequired => {
                AnnotationError::Unauthenticated
            }
            SessionError::PracticeDenied => AnnotationError::Denied,
            SessionError::Unavailable => AnnotationError::Unavailable,
            SessionError::NativeAuthenticationUnavailable => {
                AnnotationError::NativeAuthenticationUnavailable
            }
        }
    }

    fn source_session_error(error: SessionError) -> DocumentSourceError {
        match error {
            SessionError::Unauthenticated | SessionError::ReauthenticationRequired => {
                DocumentSourceError::Unauthenticated
            }
            SessionError::PracticeDenied => DocumentSourceError::Denied,
            SessionError::Unavailable => DocumentSourceError::Unavailable,
            SessionError::NativeAuthenticationUnavailable => {
                DocumentSourceError::NativeAuthenticationUnavailable
            }
        }
    }

    /// Mirrors the mounted Gate routes. The renderer cannot pass a credential;
    /// the host adds its platform-keyring credential to every invocation.
    pub async fn gate_state(
        state: &DesktopState,
        case_id: Uuid,
        practice_id: Option<Uuid>,
    ) -> Result<GateSnapshot, GateError> {
        let credential = state
            .native_session
            .credential()
            .await
            .map_err(gate_session_error)?;
        state
            .native_commands
            .gate_state(&credential, case_id, practice_id)
            .await
    }

    pub async fn affirm_gate(
        state: &DesktopState,
        case_id: Uuid,
        practice_id: Option<Uuid>,
        request: GateMutation,
    ) -> Result<GateCommandResult, GateError> {
        let credential = state
            .native_session
            .credential()
            .await
            .map_err(gate_session_error)?;
        state
            .native_commands
            .affirm_gate(&credential, case_id, practice_id, &request)
            .await
    }

    pub async fn remove_gate(
        state: &DesktopState,
        case_id: Uuid,
        practice_id: Option<Uuid>,
        request: GateMutation,
    ) -> Result<GateCommandResult, GateError> {
        let credential = state
            .native_session
            .credential()
            .await
            .map_err(gate_session_error)?;
        state
            .native_commands
            .remove_gate(&credential, case_id, practice_id, &request)
            .await
    }

    pub async fn lookup_gate_command(
        state: &DesktopState,
        case_id: Uuid,
        practice_id: Option<Uuid>,
        command_id: Uuid,
    ) -> Result<Option<GateCommandResult>, GateError> {
        let credential = state
            .native_session
            .credential()
            .await
            .map_err(gate_session_error)?;
        state
            .native_commands
            .lookup_gate_command(&credential, case_id, practice_id, command_id)
            .await
    }

    pub async fn sign_letter(
        state: &DesktopState,
        letter_id: Uuid,
        practice_id: Option<Uuid>,
        request: SignLetterMutation,
    ) -> Result<SignLetterResult, SigningError> {
        let credential = state
            .native_session
            .credential()
            .await
            .map_err(signing_session_error)?;
        state
            .native_commands
            .sign_letter(&credential, letter_id, practice_id, &request)
            .await
    }

    pub async fn signing_target(
        state: &DesktopState,
        letter_id: Uuid,
        practice_id: Option<Uuid>,
    ) -> Result<SigningTarget, SigningError> {
        let credential = state
            .native_session
            .credential()
            .await
            .map_err(signing_session_error)?;
        state
            .native_commands
            .signing_target(&credential, letter_id, practice_id)
            .await
    }

    pub async fn lookup_sign_letter_command(
        state: &DesktopState,
        letter_id: Uuid,
        practice_id: Option<Uuid>,
        command_id: Uuid,
    ) -> Result<Option<SignLetterResult>, SigningError> {
        let credential = state
            .native_session
            .credential()
            .await
            .map_err(signing_session_error)?;
        state
            .native_commands
            .lookup_sign_letter_command(&credential, letter_id, practice_id, command_id)
            .await
    }

    pub async fn reassess_evidence(
        state: &DesktopState,
        case_id: Uuid,
        evidence_id: Uuid,
        practice_id: Option<Uuid>,
        request: ReassessEvidenceMutation,
    ) -> Result<ReassessEvidenceResult, ReassessmentError> {
        let credential = state
            .native_session
            .credential()
            .await
            .map_err(reassessment_session_error)?;
        state
            .native_commands
            .reassess_evidence(&credential, case_id, evidence_id, practice_id, &request)
            .await
    }

    pub async fn lookup_reassessment_command(
        state: &DesktopState,
        case_id: Uuid,
        evidence_id: Uuid,
        practice_id: Option<Uuid>,
        command_id: Uuid,
    ) -> Result<Option<ReassessEvidenceResult>, ReassessmentError> {
        let credential = state
            .native_session
            .credential()
            .await
            .map_err(reassessment_session_error)?;
        state
            .native_commands
            .lookup_reassessment_command(&credential, case_id, evidence_id, practice_id, command_id)
            .await
    }

    /// Mirrors POST /api/cases/{case_id}/annotations/{annotation_id}. RA17
    /// supplies the host-owned credential; renderer arguments never select an
    /// author, identity, or practice authority.
    pub async fn save_annotation(
        state: &DesktopState,
        case_id: Uuid,
        annotation_id: Uuid,
        practice_id: Option<Uuid>,
        request: AnnotationMutation,
    ) -> Result<AnnotationResult, AnnotationError> {
        if request.annotation_id != annotation_id {
            return Err(AnnotationError::Invalid);
        }
        let credential = state
            .native_session
            .credential()
            .await
            .map_err(annotation_session_error)?;
        state
            .native_commands
            .save_annotation(&credential, case_id, annotation_id, practice_id, &request)
            .await
    }

    /// Mirrors GET /api/cases/{case_id}/annotations/{annotation_id}/commands/{command_id}.
    pub async fn lookup_annotation_command(
        state: &DesktopState,
        case_id: Uuid,
        annotation_id: Uuid,
        practice_id: Option<Uuid>,
        command_id: Uuid,
    ) -> Result<Option<AnnotationResult>, AnnotationError> {
        let credential = state
            .native_session
            .credential()
            .await
            .map_err(annotation_session_error)?;
        state
            .native_commands
            .lookup_annotation_command(&credential, case_id, annotation_id, practice_id, command_id)
            .await
    }

    /// Mirrors GET /api/cases/{case_id}/documents/{document_id}/source through
    /// the same verified-session and shared-service contract as HTTP.
    pub async fn document_source(
        state: &DesktopState,
        case_id: Uuid,
        document_id: Uuid,
        practice_id: Option<Uuid>,
        page_number: u32,
    ) -> Result<DocumentSource, DocumentSourceError> {
        let session = current_session(state, practice_id)
            .await
            .map_err(source_session_error)?;
        state
            .services
            .open_document_source(
                &ClinicalContext {
                    identity_id: session.identity_id,
                    actor: ActorId(session.user_id),
                    practice: PracticeId(session.practice_id),
                    principal: session.principal,
                    expires_at: session.expires_at,
                },
                DocumentSourceRequest {
                    case_id,
                    document_id,
                    page_number,
                },
            )
            .await
    }
}

#[cfg(test)]
mod session_contract_tests {
    use super::*;
    use std::{
        collections::VecDeque,
        sync::{
            Mutex,
            atomic::{AtomicUsize, Ordering},
        },
    };

    use aso_host::{
        affirmation::*, annotation::*, domain::*, logout::LogoutResult, ports::*, reassessment::*,
        session::*, signing::*, source::*,
    };
    use async_trait::async_trait;
    use chrono::{DateTime, Utc};
    use serde_json::{Value, json};
    use tauri::{Listener, WebviewUrl, WebviewWindowBuilder};
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

    struct InjectedNativeCredential {
        calls: AtomicUsize,
    }

    #[async_trait]
    impl NativeSessionCredentialOwner for InjectedNativeCredential {
        async fn credential(&self) -> Result<SessionCredential, SessionError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(SessionCredential::NativeToken(
                "synthetic-host-owned-token".into(),
            ))
        }
    }

    #[derive(Clone, Copy, Default)]
    enum RecordedOutcome {
        #[default]
        Mixed,
        Denied,
        Unavailable,
    }

    #[derive(Default)]
    struct RecordingNativeCommands {
        operations: Mutex<Vec<&'static str>>,
        credentials: Mutex<Vec<&'static str>>,
        outcome: RecordedOutcome,
    }

    impl RecordingNativeCommands {
        fn record(&self, operation: &'static str, credential: &SessionCredential) {
            self.operations.lock().unwrap().push(operation);
            self.credentials.lock().unwrap().push(match credential {
                SessionCredential::NativeToken(token) if token == "synthetic-host-owned-token" => {
                    "host_native_token"
                }
                SessionCredential::NativeToken(_) => "unexpected_native_token",
                SessionCredential::Cookie(_) => "unexpected_cookie",
            });
        }

        fn gate_error(&self, mixed: GateError) -> GateError {
            match self.outcome {
                RecordedOutcome::Mixed => mixed,
                RecordedOutcome::Denied => GateError::Denied,
                RecordedOutcome::Unavailable => GateError::Unavailable,
            }
        }

        fn signing_error(&self, mixed: SigningError) -> SigningError {
            match self.outcome {
                RecordedOutcome::Mixed => mixed,
                RecordedOutcome::Denied => SigningError::Denied,
                RecordedOutcome::Unavailable => SigningError::Unavailable,
            }
        }

        fn reassessment_error(&self, mixed: ReassessmentError) -> ReassessmentError {
            match self.outcome {
                RecordedOutcome::Mixed => mixed,
                RecordedOutcome::Denied => ReassessmentError::Denied,
                RecordedOutcome::Unavailable => ReassessmentError::Unavailable,
            }
        }

        fn annotation_error(&self, mixed: AnnotationError) -> AnnotationError {
            match self.outcome {
                RecordedOutcome::Mixed => mixed,
                RecordedOutcome::Denied => AnnotationError::Denied,
                RecordedOutcome::Unavailable => AnnotationError::Unavailable,
            }
        }
    }

    #[async_trait]
    impl native_commands::NativeClinicalCommandPort for RecordingNativeCommands {
        async fn gate_state(
            &self,
            credential: &SessionCredential,
            _: Uuid,
            _: Option<Uuid>,
        ) -> Result<GateSnapshot, GateError> {
            self.record("gate_state", credential);
            Err(self.gate_error(GateError::NotFound))
        }

        async fn affirm_gate(
            &self,
            credential: &SessionCredential,
            _: Uuid,
            _: Option<Uuid>,
            _: &GateMutation,
        ) -> Result<GateCommandResult, GateError> {
            self.record("affirm_gate", credential);
            Err(self.gate_error(GateError::Denied))
        }

        async fn remove_gate(
            &self,
            credential: &SessionCredential,
            _: Uuid,
            _: Option<Uuid>,
            _: &GateMutation,
        ) -> Result<GateCommandResult, GateError> {
            self.record("remove_gate", credential);
            Err(self.gate_error(GateError::Denied))
        }

        async fn lookup_gate_command(
            &self,
            credential: &SessionCredential,
            _: Uuid,
            _: Option<Uuid>,
            _: Uuid,
        ) -> Result<Option<GateCommandResult>, GateError> {
            self.record("lookup_gate_command", credential);
            match self.outcome {
                RecordedOutcome::Mixed => Ok(None),
                _ => Err(self.gate_error(GateError::NotFound)),
            }
        }

        async fn signing_target(
            &self,
            credential: &SessionCredential,
            _: Uuid,
            _: Option<Uuid>,
        ) -> Result<SigningTarget, SigningError> {
            self.record("signing_target", credential);
            Err(self.signing_error(SigningError::NotFound))
        }

        async fn sign_letter(
            &self,
            credential: &SessionCredential,
            _: Uuid,
            _: Option<Uuid>,
            _: &SignLetterMutation,
        ) -> Result<SignLetterResult, SigningError> {
            self.record("sign_letter", credential);
            Err(self.signing_error(SigningError::Denied))
        }

        async fn lookup_sign_letter_command(
            &self,
            credential: &SessionCredential,
            _: Uuid,
            _: Option<Uuid>,
            _: Uuid,
        ) -> Result<Option<SignLetterResult>, SigningError> {
            self.record("lookup_sign_letter_command", credential);
            match self.outcome {
                RecordedOutcome::Mixed => Ok(None),
                _ => Err(self.signing_error(SigningError::NotFound)),
            }
        }

        async fn reassess_evidence(
            &self,
            credential: &SessionCredential,
            _: Uuid,
            _: Uuid,
            _: Option<Uuid>,
            _: &ReassessEvidenceMutation,
        ) -> Result<ReassessEvidenceResult, ReassessmentError> {
            self.record("reassess_evidence", credential);
            Err(self.reassessment_error(ReassessmentError::Denied))
        }

        async fn lookup_reassessment_command(
            &self,
            credential: &SessionCredential,
            _: Uuid,
            _: Uuid,
            _: Option<Uuid>,
            _: Uuid,
        ) -> Result<Option<ReassessEvidenceResult>, ReassessmentError> {
            self.record("lookup_reassessment_command", credential);
            match self.outcome {
                RecordedOutcome::Mixed => Ok(None),
                _ => Err(self.reassessment_error(ReassessmentError::NotFound)),
            }
        }

        async fn save_annotation(
            &self,
            credential: &SessionCredential,
            _: Uuid,
            _: Uuid,
            _: Option<Uuid>,
            _: &AnnotationMutation,
        ) -> Result<AnnotationResult, AnnotationError> {
            self.record("save_annotation", credential);
            Err(self.annotation_error(AnnotationError::Denied))
        }

        async fn lookup_annotation_command(
            &self,
            credential: &SessionCredential,
            _: Uuid,
            _: Uuid,
            _: Option<Uuid>,
            _: Uuid,
        ) -> Result<Option<AnnotationResult>, AnnotationError> {
            self.record("lookup_annotation_command", credential);
            match self.outcome {
                RecordedOutcome::Mixed => Ok(None),
                _ => Err(self.annotation_error(AnnotationError::NotFound)),
            }
        }
    }

    struct ParitySessions {
        summary: SessionSummary,
        resolved: Mutex<Vec<Option<Uuid>>>,
        logout_results: Mutex<VecDeque<LogoutResult>>,
        credential_observations: Mutex<Vec<&'static str>>,
    }

    struct SequencedSessions {
        responses: Mutex<VecDeque<Result<SessionSummary, SessionError>>>,
    }

    #[async_trait]
    impl SessionPort for SequencedSessions {
        async fn resolve(
            &self,
            _: &SessionCredential,
            _: Option<Uuid>,
        ) -> Result<SessionSummary, SessionError> {
            self.responses.lock().unwrap().pop_front().unwrap()
        }

        async fn logout(&self, _: &SessionCredential) -> Result<LogoutResult, SessionError> {
            Ok(LogoutResult::DeniedPending)
        }
    }

    impl ParitySessions {
        fn observe_credential(&self, credential: &SessionCredential) {
            let observed = match credential {
                SessionCredential::NativeToken(token) if token == "synthetic-host-owned-token" => {
                    "host_native_token"
                }
                SessionCredential::NativeToken(_) => "unexpected_native_token",
                SessionCredential::Cookie(_) => "unexpected_cookie",
            };
            self.credential_observations.lock().unwrap().push(observed);
        }
    }

    #[async_trait]
    impl SessionPort for ParitySessions {
        async fn resolve(
            &self,
            credential: &SessionCredential,
            practice: Option<Uuid>,
        ) -> Result<SessionSummary, SessionError> {
            self.observe_credential(credential);
            self.resolved.lock().unwrap().push(practice);
            Ok(self.summary.clone())
        }

        async fn logout(
            &self,
            credential: &SessionCredential,
        ) -> Result<LogoutResult, SessionError> {
            self.observe_credential(credential);
            Ok(self.logout_results.lock().unwrap().pop_front().unwrap())
        }
    }

    struct FixedClock(DateTime<Utc>);

    impl Clock for FixedClock {
        fn now(&self) -> DateTime<Utc> {
            self.0
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

    struct AcceptingSourceCalls {
        source: DocumentSource,
        calls: AtomicUsize,
    }

    #[async_trait]
    impl EvidenceRepository for AcceptingSourceCalls {
        async fn open_document_source(
            &self,
            _: &ClinicalContext,
            _: DocumentSourceRequest,
        ) -> Result<DocumentSource, DocumentSourceError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(self.source.clone())
        }

        async fn counts(&self, _: CaseId) -> Result<EvidenceCounts, DomainError> {
            panic!("legacy counts")
        }
    }

    #[async_trait]
    impl AuthorityPort for AcceptingSourceCalls {
        async fn holds(&self, _: ActorId, _: Capability) -> Result<bool, DomainError> {
            panic!("source read does not use a clinical capability")
        }
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
            native_session: Arc::new(UnavailableNativeSessionCredentialOwner),
            native_commands: Arc::new(native_commands::UnavailableNativeClinicalCommands),
            ipc_authority: Arc::new(ipc::NativeIpcAuthority::main_window(0)),
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
            native_session: Arc::new(UnavailableNativeSessionCredentialOwner),
            native_commands: Arc::new(native_commands::UnavailableNativeClinicalCommands),
            ipc_authority: Arc::new(ipc::NativeIpcAuthority::main_window(0)),
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
                commands::signing_target(&state, letter_id, selection).await,
                Err(SigningError::NativeAuthenticationUnavailable),
            );
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
            native_session: Arc::new(UnavailableNativeSessionCredentialOwner),
            native_commands: Arc::new(native_commands::UnavailableNativeClinicalCommands),
            ipc_authority: Arc::new(ipc::NativeIpcAuthority::main_window(0)),
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
    async fn injected_session_commands_match_the_shared_http_operation_contract() {
        let observed_at: DateTime<Utc> = "2026-09-10T12:00:00Z".parse().unwrap();
        let practice_id = Uuid::new_v4();
        let summary = SessionSummary {
            identity_id: Uuid::new_v4(),
            session_id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            practice_id,
            display_name: "Synthetic native surgeon".into(),
            principal: Principal::User,
            capabilities: vec!["affirm_gate".into()],
            expires_at: observed_at + chrono::Duration::hours(1),
            authorization_revision: "desktop-parity:1".into(),
        };
        let sessions = Arc::new(ParitySessions {
            summary: summary.clone(),
            resolved: Mutex::new(Vec::new()),
            logout_results: Mutex::new(
                [LogoutResult::DeniedPending, LogoutResult::Confirmed].into(),
            ),
            credential_observations: Mutex::new(Vec::new()),
        });
        let credentials = Arc::new(InjectedNativeCredential {
            calls: AtomicUsize::new(0),
        });
        let unused = Arc::new(UnexpectedDomainCalls);
        let state = DesktopState {
            services: Arc::new(AppServices {
                cases: unused.clone(),
                evidence: unused.clone(),
                criteria: unused.clone(),
                letters: unused.clone(),
                authority: unused,
                clock: Arc::new(FixedClock(observed_at)),
                sessions: sessions.clone(),
            }),
            native_session: credentials.clone(),
            native_commands: Arc::new(native_commands::UnavailableNativeClinicalCommands),
            ipc_authority: Arc::new(ipc::NativeIpcAuthority::main_window(0)),
        };

        assert_eq!(
            commands::current_session(&state, Some(practice_id)).await,
            Ok(summary.clone())
        );
        assert_eq!(
            commands::replica_grant(&state, Some(practice_id)).await,
            Ok(aso_host::projection::ReplicaGrant::for_session(&summary))
        );
        assert_eq!(
            commands::logout(&state).await,
            Ok(LogoutResult::DeniedPending)
        );
        assert_eq!(commands::logout(&state).await, Ok(LogoutResult::Confirmed));
        assert_eq!(
            *sessions.resolved.lock().unwrap(),
            [Some(practice_id), Some(practice_id)]
        );
        assert_eq!(
            *sessions.credential_observations.lock().unwrap(),
            ["host_native_token"; 4]
        );
        assert_eq!(credentials.calls.load(Ordering::SeqCst), 4);
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
            native_session: Arc::new(UnavailableNativeSessionCredentialOwner),
            native_commands: Arc::new(native_commands::UnavailableNativeClinicalCommands),
            ipc_authority: Arc::new(ipc::NativeIpcAuthority::main_window(0)),
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
            assert_eq!(
                commands::logout(&state).await,
                Err(SessionError::NativeAuthenticationUnavailable),
            );
            assert_eq!(sessions.calls.load(Ordering::SeqCst), 1);
        }
    }

    #[tokio::test]
    async fn document_source_uses_the_host_session_and_shared_service() {
        let practice_id = Uuid::new_v4();
        let case_id = Uuid::new_v4();
        let document_id = Uuid::new_v4();
        let bytes = b"synthetic source".to_vec();
        let expected = DocumentSource {
            case_id,
            document_id,
            name: "Synthetic MRI".into(),
            effective_date: "2026-03-14".parse().unwrap(),
            page_count: 4,
            page_number: 2,
            media_type: "application/pdf".into(),
            content_sha256: vec![
                57, 99, 27, 181, 229, 220, 147, 38, 178, 63, 140, 0, 191, 67, 68, 10, 132, 206,
                113, 19, 21, 198, 183, 153, 222, 85, 76, 86, 170, 4, 209, 51,
            ],
            bytes,
        };
        let source = Arc::new(AcceptingSourceCalls {
            source: expected.clone(),
            calls: AtomicUsize::new(0),
        });
        let now = Utc::now();
        let sessions = Arc::new(AuthorityBearingSession {
            summary: SessionSummary {
                identity_id: Uuid::new_v4(),
                session_id: Uuid::new_v4(),
                user_id: Uuid::new_v4(),
                practice_id,
                display_name: "Synthetic surgeon".into(),
                principal: Principal::User,
                capabilities: vec![],
                expires_at: now + chrono::Duration::hours(1),
                authorization_revision: "desktop-source-test".into(),
            },
            calls: AtomicUsize::new(0),
        });
        let credentials = Arc::new(InjectedNativeCredential {
            calls: AtomicUsize::new(0),
        });
        let unused = Arc::new(UnexpectedDomainCalls);
        let state = DesktopState {
            services: Arc::new(AppServices {
                cases: unused.clone(),
                evidence: source.clone(),
                criteria: unused.clone(),
                letters: unused.clone(),
                authority: source.clone(),
                clock: Arc::new(FixedClock(now)),
                sessions: sessions.clone(),
            }),
            native_session: credentials.clone(),
            native_commands: Arc::new(native_commands::UnavailableNativeClinicalCommands),
            ipc_authority: Arc::new(ipc::NativeIpcAuthority::main_window(0)),
        };
        assert_eq!(
            commands::document_source(&state, case_id, document_id, Some(practice_id), 2).await,
            Ok(expected.clone())
        );
        assert_eq!(source.calls.load(Ordering::SeqCst), 1);
        assert_eq!(sessions.calls.load(Ordering::SeqCst), 1);
        assert_eq!(credentials.calls.load(Ordering::SeqCst), 1);

        let app = configure_tauri(tauri::test::mock_builder(), state)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let webview = WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
            .build()
            .unwrap();
        let input = json!({
            "epoch": 0,
            "caseId": case_id,
            "documentId": document_id,
            "practiceId": practice_id,
            "pageNumber": 2,
        });
        let response = invoke_mock_ipc(&webview, "document_source", input.clone()).unwrap();
        assert_eq!(response["documentId"], document_id.to_string());
        assert_eq!(response["effectiveDate"], "2026-03-14");
        assert_eq!(response["pageCount"], 4);
        assert_eq!(response["bytes"], json!(expected.bytes));
        assert_eq!(source.calls.load(Ordering::SeqCst), 2);
        assert_eq!(sessions.calls.load(Ordering::SeqCst), 2);
        assert_eq!(credentials.calls.load(Ordering::SeqCst), 2);

        let mut stale = input;
        stale["epoch"] = json!(1);
        assert_eq!(
            invoke_mock_ipc(&webview, "document_source", stale),
            Err(json!({"status":403,"code":"native_epoch_stale"}))
        );
        assert_eq!(source.calls.load(Ordering::SeqCst), 2);
    }

    fn invoke_mock_ipc(
        webview: &tauri::WebviewWindow<tauri::test::MockRuntime>,
        command: &str,
        input: Value,
    ) -> Result<Value, Value> {
        tauri::test::get_ipc_response(
            webview,
            tauri::webview::InvokeRequest {
                cmd: command.into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body: tauri::ipc::InvokeBody::Json(json!({"input": input})),
                headers: Default::default(),
                invoke_key: tauri::test::INVOKE_KEY.into(),
            },
        )
        .map(|body| body.deserialize::<Value>().unwrap())
    }

    fn ipc_fixture_for_outcome(
        epoch: u64,
        outcome: RecordedOutcome,
        native_session: Arc<dyn NativeSessionCredentialOwner>,
    ) -> (
        tauri::App<tauri::test::MockRuntime>,
        Arc<RecordingNativeCommands>,
    ) {
        let unused = Arc::new(UnexpectedDomainCalls);
        let recorder = Arc::new(RecordingNativeCommands {
            outcome,
            ..Default::default()
        });
        let state = DesktopState {
            services: Arc::new(AppServices {
                cases: unused.clone(),
                evidence: unused.clone(),
                criteria: unused.clone(),
                letters: unused.clone(),
                authority: unused.clone(),
                clock: unused,
                sessions: Arc::new(UnavailableSessions),
            }),
            native_session,
            native_commands: recorder.clone(),
            ipc_authority: Arc::new(ipc::NativeIpcAuthority::new(["main", "secondary"], epoch)),
        };
        let app = configure_tauri(tauri::test::mock_builder(), state)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        (app, recorder)
    }

    fn ipc_fixture(
        epoch: u64,
    ) -> (
        tauri::App<tauri::test::MockRuntime>,
        Arc<RecordingNativeCommands>,
    ) {
        ipc_fixture_for_outcome(
            epoch,
            RecordedOutcome::Mixed,
            Arc::new(InjectedNativeCredential {
                calls: AtomicUsize::new(0),
            }),
        )
    }

    fn clinical_ipc_calls(epoch: u64, practice_id: Uuid) -> Vec<(&'static str, Value)> {
        let case_id = Uuid::from_u128(1);
        let resource_id = Uuid::from_u128(2);
        let command_id = Uuid::from_u128(4);
        let mutation = json!({"commandId":command_id,"kind":"policy"});
        vec![
            (
                "gate_state",
                json!({"epoch":epoch,"caseId":case_id,"practiceId":practice_id}),
            ),
            (
                "affirm_gate",
                json!({"epoch":epoch,"caseId":case_id,"practiceId":practice_id,"request":mutation}),
            ),
            (
                "remove_gate",
                json!({"epoch":epoch,"caseId":case_id,"practiceId":practice_id,"request":mutation}),
            ),
            (
                "lookup_gate_command",
                json!({"epoch":epoch,"caseId":case_id,"practiceId":practice_id,"commandId":command_id}),
            ),
            (
                "signing_target",
                json!({"epoch":epoch,"letterId":resource_id,"practiceId":practice_id}),
            ),
            (
                "sign_letter",
                json!({"epoch":epoch,"letterId":resource_id,"practiceId":practice_id,"request":{"commandId":command_id,"expectedLetterVersion":2,"expectedQaRevision":3,"expectedSignatureVersion":1}}),
            ),
            (
                "lookup_sign_letter_command",
                json!({"epoch":epoch,"letterId":resource_id,"practiceId":practice_id,"commandId":command_id}),
            ),
            (
                "reassess_evidence",
                json!({"epoch":epoch,"caseId":case_id,"evidenceId":resource_id,"practiceId":practice_id,"request":{"commandId":command_id,"state":"gap","expectedAssessedAt":"2026-09-16T12:00:00Z"}}),
            ),
            (
                "lookup_reassessment_command",
                json!({"epoch":epoch,"caseId":case_id,"evidenceId":resource_id,"practiceId":practice_id,"commandId":command_id}),
            ),
            (
                "save_annotation",
                json!({"epoch":epoch,"caseId":case_id,"annotationId":resource_id,"practiceId":practice_id,"request":{"commandId":command_id,"annotationId":resource_id,"annotationTypeId":Uuid::from_u128(5),"name":"Clinical judgment","data":{"assertion":"Synthetic opinion."},"body":"Synthetic opinion.","targetEvidenceId":resource_id,"targetDocumentId":null,"disposition":"held","expectedRevision":0}}),
            ),
            (
                "lookup_annotation_command",
                json!({"epoch":epoch,"caseId":case_id,"annotationId":resource_id,"practiceId":practice_id,"commandId":command_id}),
            ),
        ]
    }

    #[test]
    fn constrained_tauri_ipc_invokes_the_complete_host_credential_inventory() {
        let epoch = 7;
        let (app, recorder) = ipc_fixture(epoch);
        let webview = WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
            .build()
            .unwrap();
        let practice_id = Uuid::from_u128(3);
        for (command, input) in clinical_ipc_calls(epoch, practice_id) {
            let _ = invoke_mock_ipc(&webview, command, input);
        }

        assert_eq!(
            *recorder.operations.lock().unwrap(),
            [
                "gate_state",
                "affirm_gate",
                "remove_gate",
                "lookup_gate_command",
                "signing_target",
                "sign_letter",
                "lookup_sign_letter_command",
                "reassess_evidence",
                "lookup_reassessment_command",
                "save_annotation",
                "lookup_annotation_command",
            ]
        );
        assert_eq!(
            *recorder.credentials.lock().unwrap(),
            ["host_native_token"; 11]
        );
    }

    #[test]
    fn every_tauri_command_preserves_policy_provider_and_uncertain_outcomes() {
        let epoch = 7;
        let foreign_practice = Uuid::from_u128(99);
        let policy_codes = [
            "gate_denied",
            "gate_denied",
            "gate_denied",
            "gate_denied",
            "signing_denied",
            "signing_denied",
            "signing_denied",
            "reassessment_denied",
            "reassessment_denied",
            "annotation_denied",
            "annotation_denied",
        ];
        let unavailable_codes = [
            "gate_unavailable",
            "gate_unavailable",
            "gate_unavailable",
            "gate_unavailable",
            "signing_unavailable",
            "signing_unavailable",
            "signing_unavailable",
            "reassessment_unavailable",
            "reassessment_unavailable",
            "annotation_unavailable",
            "annotation_unavailable",
        ];

        for (outcome, expected_status, expected_codes) in [
            (RecordedOutcome::Denied, 403, policy_codes),
            (RecordedOutcome::Unavailable, 503, unavailable_codes),
        ] {
            let (app, recorder) = ipc_fixture_for_outcome(
                epoch,
                outcome,
                Arc::new(InjectedNativeCredential {
                    calls: AtomicUsize::new(0),
                }),
            );
            let webview = WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
                .build()
                .unwrap();
            for ((command, input), code) in clinical_ipc_calls(epoch, foreign_practice)
                .into_iter()
                .zip(expected_codes)
            {
                assert_eq!(
                    invoke_mock_ipc(&webview, command, input),
                    Err(json!({"status":expected_status,"code":code})),
                    "{command} must preserve its refusal class"
                );
            }
            assert_eq!(recorder.operations.lock().unwrap().len(), 11);
        }

        let (app, recorder) = ipc_fixture_for_outcome(
            epoch,
            RecordedOutcome::Mixed,
            Arc::new(UnavailableNativeSessionCredentialOwner),
        );
        let webview = WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
            .build()
            .unwrap();
        for (command, input) in clinical_ipc_calls(epoch, foreign_practice) {
            assert_eq!(
                invoke_mock_ipc(&webview, command, input),
                Err(json!({
                    "status":503,
                    "code":"native_authentication_unavailable"
                })),
                "{command} must distinguish host credential failure"
            );
        }
        assert!(recorder.operations.lock().unwrap().is_empty());
    }

    #[test]
    fn host_scope_logout_and_authentication_events_reach_two_windows_and_advance_epoch() {
        let expires_at: DateTime<Utc> = "2099-09-16T12:00:00Z".parse().unwrap();
        let first = SessionSummary {
            identity_id: Uuid::from_u128(10),
            session_id: Uuid::from_u128(11),
            user_id: Uuid::from_u128(12),
            practice_id: Uuid::from_u128(13),
            display_name: "Synthetic native surgeon A".into(),
            principal: Principal::User,
            capabilities: vec!["affirm_gate".into()],
            expires_at,
            authorization_revision: "native:1".into(),
        };
        let second = SessionSummary {
            identity_id: Uuid::from_u128(20),
            session_id: Uuid::from_u128(21),
            user_id: Uuid::from_u128(22),
            practice_id: Uuid::from_u128(23),
            display_name: "Synthetic native surgeon B".into(),
            principal: Principal::User,
            capabilities: vec!["sign_letter".into()],
            expires_at,
            authorization_revision: "native:2".into(),
        };
        let sessions = Arc::new(SequencedSessions {
            responses: Mutex::new(
                [
                    Ok(first.clone()),
                    Ok(second.clone()),
                    Err(SessionError::NativeAuthenticationUnavailable),
                ]
                .into(),
            ),
        });
        let observed_at: DateTime<Utc> = "2026-09-16T12:00:00Z".parse().unwrap();
        let unused = Arc::new(UnexpectedDomainCalls);
        let state = DesktopState {
            services: Arc::new(AppServices {
                cases: unused.clone(),
                evidence: unused.clone(),
                criteria: unused.clone(),
                letters: unused.clone(),
                authority: unused.clone(),
                clock: Arc::new(FixedClock(observed_at)),
                sessions,
            }),
            native_session: Arc::new(InjectedNativeCredential {
                calls: AtomicUsize::new(0),
            }),
            native_commands: Arc::new(native_commands::UnavailableNativeClinicalCommands),
            ipc_authority: Arc::new(ipc::NativeIpcAuthority::new(["main", "secondary"], 0)),
        };
        let app = configure_tauri(tauri::test::mock_builder(), state)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let main = WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
            .build()
            .unwrap();
        let secondary = WebviewWindowBuilder::new(&app, "secondary", WebviewUrl::default())
            .build()
            .unwrap();
        let main_events = Arc::new(Mutex::new(Vec::<String>::new()));
        let secondary_events = Arc::new(Mutex::new(Vec::<String>::new()));
        {
            let events = Arc::clone(&main_events);
            main.listen(ipc::NATIVE_SESSION_INVALIDATED_EVENT, move |event| {
                events.lock().unwrap().push(event.payload().to_owned());
            });
        }
        {
            let events = Arc::clone(&secondary_events);
            secondary.listen(ipc::NATIVE_SESSION_INVALIDATED_EVENT, move |event| {
                events.lock().unwrap().push(event.payload().to_owned());
            });
        }

        assert_eq!(
            invoke_mock_ipc(
                &main,
                "current_session",
                json!({"practiceId":first.practice_id})
            ),
            Ok(serde_json::to_value(&first).unwrap())
        );
        assert!(main_events.lock().unwrap().is_empty());

        assert_eq!(
            invoke_mock_ipc(
                &secondary,
                "current_session",
                json!({"practiceId":second.practice_id})
            ),
            Ok(serde_json::to_value(&second).unwrap())
        );
        assert_eq!(
            invoke_mock_ipc(
                &main,
                "current_session",
                json!({"practiceId":second.practice_id})
            ),
            Err(json!({
                "status":503,
                "code":"native_authentication_unavailable"
            }))
        );
        assert_eq!(
            invoke_mock_ipc(&secondary, "logout", Value::Null),
            Ok(json!("denied_pending"))
        );

        let expected = [
            json!({"schema":1,"reason":"scope-change","epoch":1}),
            json!({"schema":1,"reason":"authentication-failed","epoch":2}),
            json!({"schema":1,"reason":"logout","epoch":3}),
        ];
        for events in [&main_events, &secondary_events] {
            let events = events.lock().unwrap();
            let payloads = events
                .iter()
                .map(|payload| serde_json::from_str::<Value>(payload).unwrap())
                .collect::<Vec<_>>();
            assert_eq!(payloads, expected);
            assert!(!events.join("").to_ascii_lowercase().contains("token"));
            assert!(!events.join("").to_ascii_lowercase().contains("identity"));
        }
        assert_eq!(
            invoke_mock_ipc(
                &main,
                "gate_state",
                json!({
                    "epoch":0,
                    "caseId":Uuid::from_u128(1),
                    "practiceId":first.practice_id
                })
            ),
            Err(json!({"status":403,"code":"native_epoch_stale"}))
        );
    }

    #[test]
    fn native_replica_ipc_elects_one_window_and_relays_the_committed_graph() {
        let observed_at: DateTime<Utc> = "2026-09-16T12:00:00Z".parse().unwrap();
        let summary = SessionSummary {
            identity_id: Uuid::from_u128(30),
            session_id: Uuid::from_u128(31),
            user_id: Uuid::from_u128(32),
            practice_id: Uuid::from_u128(33),
            display_name: "Synthetic native surgeon".into(),
            principal: Principal::User,
            capabilities: vec![],
            expires_at: observed_at + chrono::Duration::hours(1),
            authorization_revision: "native-replica:1".into(),
        };
        let sessions = Arc::new(ParitySessions {
            summary: summary.clone(),
            resolved: Mutex::new(Vec::new()),
            logout_results: Mutex::new([LogoutResult::DeniedPending].into()),
            credential_observations: Mutex::new(Vec::new()),
        });
        let unused = Arc::new(UnexpectedDomainCalls);
        let state = DesktopState {
            services: Arc::new(AppServices {
                cases: unused.clone(),
                evidence: unused.clone(),
                criteria: unused.clone(),
                letters: unused.clone(),
                authority: unused.clone(),
                clock: Arc::new(FixedClock(observed_at)),
                sessions,
            }),
            native_session: Arc::new(InjectedNativeCredential {
                calls: AtomicUsize::new(0),
            }),
            native_commands: Arc::new(native_commands::UnavailableNativeClinicalCommands),
            ipc_authority: Arc::new(ipc::NativeIpcAuthority::new(["main", "secondary"], 0)),
        };
        let app = configure_tauri(tauri::test::mock_builder(), state)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let main = WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
            .build()
            .unwrap();
        let secondary = WebviewWindowBuilder::new(&app, "secondary", WebviewUrl::default())
            .build()
            .unwrap();
        let rogue = WebviewWindowBuilder::new(&app, "rogue", WebviewUrl::default())
            .build()
            .unwrap();
        let main_events = Arc::new(Mutex::new(Vec::<String>::new()));
        let secondary_events = Arc::new(Mutex::new(Vec::<String>::new()));
        {
            let events = Arc::clone(&main_events);
            main.listen(replica_coordinator::NATIVE_REPLICA_EVENT, move |event| {
                events.lock().unwrap().push(event.payload().to_owned());
            });
        }
        {
            let events = Arc::clone(&secondary_events);
            secondary.listen(replica_coordinator::NATIVE_REPLICA_EVENT, move |event| {
                events.lock().unwrap().push(event.payload().to_owned());
            });
        }

        assert_eq!(
            invoke_mock_ipc(
                &main,
                "current_session",
                json!({"practiceId":summary.practice_id})
            ),
            Ok(serde_json::to_value(&summary).unwrap())
        );
        let owner = invoke_mock_ipc(&main, "claim_replica_owner", json!({"epoch":0})).unwrap();
        let follower =
            invoke_mock_ipc(&secondary, "claim_replica_owner", json!({"epoch":0})).unwrap();
        assert_eq!(owner["role"], "owner");
        assert_eq!(follower["role"], "follower");
        assert_eq!(owner["graphId"], follower["graphId"]);
        assert_eq!(owner["claimGeneration"], follower["claimGeneration"]);

        let projection = json!({
            "entities":{"Case":{"case-1":{"id":"case-1","name":"Synthetic case"}}},
            "entityStates":{},
            "syncMetadata":{},
            "lists":{"cases":{"ids":["case-1"]}}
        });
        assert_eq!(
            invoke_mock_ipc(
                &main,
                "publish_replica_projection",
                json!({
                    "epoch":0,
                    "graphId":owner["graphId"],
                    "claimGeneration":owner["claimGeneration"],
                    "revision":1,
                    "projection":projection
                })
            ),
            Ok(Value::Null)
        );
        let refreshed =
            invoke_mock_ipc(&secondary, "claim_replica_owner", json!({"epoch":0})).unwrap();
        assert_eq!(refreshed["revision"], 1);
        assert_eq!(refreshed["projection"], projection);
        assert_eq!(main_events.lock().unwrap().len(), 1);
        assert_eq!(secondary_events.lock().unwrap().len(), 1);
        for events in [&main_events, &secondary_events] {
            let payload = events.lock().unwrap().join("");
            assert!(!payload.to_ascii_lowercase().contains("token"));
            assert!(!payload.to_ascii_lowercase().contains("identity"));
        }
        assert_eq!(
            invoke_mock_ipc(
                &secondary,
                "publish_replica_projection",
                json!({
                    "epoch":0,
                    "graphId":owner["graphId"],
                    "claimGeneration":owner["claimGeneration"],
                    "revision":2,
                    "projection":projection
                })
            ),
            Err(json!({"status":403,"code":"native_replica_owner_denied"}))
        );
        assert_eq!(
            invoke_mock_ipc(&rogue, "claim_replica_owner", json!({"epoch":0})),
            Err(json!({"status":403,"code":"native_window_denied"}))
        );
        assert_eq!(
            invoke_mock_ipc(&main, "claim_replica_owner", json!({"epoch":1})),
            Err(json!({"status":403,"code":"native_epoch_stale"}))
        );
    }

    #[test]
    fn tauri_ipc_rejects_stale_epoch_unauthorized_window_and_actor_hint() {
        let (app, recorder) = ipc_fixture(9);
        let main = WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
            .build()
            .unwrap();
        let rogue = WebviewWindowBuilder::new(&app, "rogue", WebviewUrl::default())
            .build()
            .unwrap();
        let case_id = Uuid::from_u128(1);
        let practice_id = Uuid::from_u128(3);

        assert_eq!(
            invoke_mock_ipc(
                &main,
                "gate_state",
                json!({
                    "epoch":8,"caseId":case_id,"practiceId":practice_id
                })
            ),
            Err(json!({"status":403,"code":"native_epoch_stale"}))
        );
        assert_eq!(
            invoke_mock_ipc(
                &rogue,
                "gate_state",
                json!({
                    "epoch":9,"caseId":case_id,"practiceId":practice_id
                })
            ),
            Err(json!({"status":403,"code":"native_window_denied"}))
        );
        assert!(
            invoke_mock_ipc(
                &main,
                "gate_state",
                json!({
                    "epoch":9,
                    "caseId":case_id,
                    "practiceId":practice_id,
                    "actorId":Uuid::from_u128(99)
                })
            )
            .is_err()
        );
        assert!(recorder.operations.lock().unwrap().is_empty());
    }
}
