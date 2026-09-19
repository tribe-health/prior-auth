//! Constrained Tauri IPC surface.
//!
//! Every clinical command accepts one closed input object. Window identity is
//! injected by Tauri, and the current access epoch is checked in the host
//! before a credential is opened. Renderer actor, identity, token, session,
//! principal, capability and window-label hints are therefore rejected by
//! deserialization or ignored because they are not command inputs.

use std::{
    collections::HashSet,
    sync::{
        Mutex, RwLock,
        atomic::{AtomicU64, Ordering},
    },
};

use aso_host::{
    affirmation::{GateCommandResult, GateError, GateMutation, GateSnapshot},
    annotation::{AnnotationError, AnnotationMutation, AnnotationResult},
    logout::LogoutResult,
    reassessment::{ReassessEvidenceMutation, ReassessEvidenceResult, ReassessmentError},
    session::{SessionError, SessionSummary},
    signing::{SignLetterMutation, SignLetterResult, SigningError, SigningTarget},
    source::{DocumentSource, DocumentSourceError},
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime, State, WebviewWindow};
use uuid::Uuid;

use crate::{
    DesktopState, commands,
    replica_coordinator::{
        NATIVE_REPLICA_EVENT, NativeGraphProjection, NativeReplicaClaim, NativeReplicaCoordinator,
        NativeReplicaCoordinatorError, NativeReplicaEvent, NativeReplicaScope,
    },
};

pub const NATIVE_SESSION_INVALIDATED_EVENT: &str = "aso://session-invalidated";

#[derive(Clone, Debug, PartialEq, Eq)]
struct NativeSessionScope {
    identity_id: Uuid,
    session_id: Uuid,
    practice_id: Uuid,
    authorization_revision: String,
    principal: String,
}

pub struct NativeIpcAuthority {
    windows: RwLock<HashSet<String>>,
    epoch: AtomicU64,
    session_scope: Mutex<Option<NativeSessionScope>>,
}

impl NativeIpcAuthority {
    pub fn new(windows: impl IntoIterator<Item = impl Into<String>>, epoch: u64) -> Self {
        Self {
            windows: RwLock::new(windows.into_iter().map(Into::into).collect()),
            epoch: AtomicU64::new(epoch),
            session_scope: Mutex::new(None),
        }
    }

    pub fn main_window(epoch: u64) -> Self {
        Self::new(["main"], epoch)
    }

    pub fn install_epoch(&self, epoch: u64) {
        self.epoch.store(epoch, Ordering::SeqCst);
    }

    pub fn current_epoch(&self) -> u64 {
        self.epoch.load(Ordering::SeqCst)
    }

    fn advance_epoch(&self) -> Result<u64, NativeIpcError> {
        self.epoch
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |epoch| {
                epoch.checked_add(1)
            })
            .map(|previous| previous + 1)
            .map_err(|_| NativeIpcError::unavailable("native_epoch_exhausted"))
    }

    fn observe_session(&self, session: &SessionSummary) -> Result<bool, NativeIpcError> {
        let next = NativeSessionScope {
            identity_id: session.identity_id,
            session_id: session.session_id,
            practice_id: session.practice_id,
            authorization_revision: session.authorization_revision.clone(),
            principal: match session.principal {
                aso_host::session::Principal::User => "user",
                aso_host::session::Principal::Agent => "agent",
                aso_host::session::Principal::Service => "service",
            }
            .into(),
        };
        let mut current = self
            .session_scope
            .lock()
            .map_err(|_| NativeIpcError::unavailable("native_ipc_authority_unavailable"))?;
        let changed = current.as_ref().is_some_and(|current| current != &next);
        *current = Some(next);
        Ok(changed)
    }

    fn clear_session(&self) -> Result<bool, NativeIpcError> {
        Ok(self
            .session_scope
            .lock()
            .map_err(|_| NativeIpcError::unavailable("native_ipc_authority_unavailable"))?
            .take()
            .is_some())
    }

    fn authorize_window(&self, label: &str) -> Result<(), NativeIpcError> {
        let allowed = self
            .windows
            .read()
            .map_err(|_| NativeIpcError::unavailable("native_ipc_authority_unavailable"))?;
        if !allowed.contains(label) {
            return Err(NativeIpcError::forbidden("native_window_denied"));
        }
        Ok(())
    }

    fn authorize(&self, label: &str, epoch: u64) -> Result<(), NativeIpcError> {
        self.authorize_window(label)?;
        if epoch != self.current_epoch() {
            return Err(NativeIpcError::forbidden("native_epoch_stale"));
        }
        Ok(())
    }

    fn replica_scope(&self) -> Result<NativeReplicaScope, NativeIpcError> {
        let scope = self
            .session_scope
            .lock()
            .map_err(|_| NativeIpcError::unavailable("native_ipc_authority_unavailable"))?
            .clone()
            .ok_or(NativeIpcError {
                status: 401,
                code: "unauthenticated",
            })?;
        Ok(NativeReplicaScope {
            identity_id: scope.identity_id,
            session_id: scope.session_id,
            practice_id: scope.practice_id,
            authorization_revision: scope.authorization_revision,
            principal: scope.principal,
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum NativeSessionInvalidationReason {
    Logout,
    ScopeChange,
    AuthenticationFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSessionInvalidation {
    pub schema: u8,
    pub reason: NativeSessionInvalidationReason,
    pub epoch: u64,
}

fn invalidate_all<R: Runtime>(
    app: &AppHandle<R>,
    state: &DesktopState,
    reason: NativeSessionInvalidationReason,
) -> Result<(), NativeIpcError> {
    let epoch = state.ipc_authority.advance_epoch()?;
    let coordinator = app.state::<NativeReplicaCoordinator>();
    for event in coordinator
        .revoke_all()
        .map_err(replica_coordinator_error)?
    {
        app.emit(NATIVE_REPLICA_EVENT, event)
            .map_err(|_| NativeIpcError::unavailable("native_replica_event_unavailable"))?;
    }
    app.emit(
        NATIVE_SESSION_INVALIDATED_EVENT,
        NativeSessionInvalidation {
            schema: 1,
            reason,
            epoch,
        },
    )
    .map_err(|_| NativeIpcError::unavailable("native_session_event_unavailable"))
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeIpcError {
    pub status: u16,
    pub code: &'static str,
}

impl NativeIpcError {
    const fn forbidden(code: &'static str) -> Self {
        Self { status: 403, code }
    }

    const fn unavailable(code: &'static str) -> Self {
        Self { status: 503, code }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionInput {
    pub practice_id: Option<Uuid>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GateReadInput {
    pub epoch: u64,
    pub case_id: Uuid,
    pub practice_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GateMutationInput {
    pub epoch: u64,
    pub case_id: Uuid,
    pub practice_id: Option<Uuid>,
    pub request: GateMutation,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GateLookupInput {
    pub epoch: u64,
    pub case_id: Uuid,
    pub practice_id: Option<Uuid>,
    pub command_id: Uuid,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SigningTargetInput {
    pub epoch: u64,
    pub letter_id: Uuid,
    pub practice_id: Option<Uuid>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SignLetterInput {
    pub epoch: u64,
    pub letter_id: Uuid,
    pub practice_id: Option<Uuid>,
    pub request: SignLetterMutation,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SignLetterLookupInput {
    pub epoch: u64,
    pub letter_id: Uuid,
    pub practice_id: Option<Uuid>,
    pub command_id: Uuid,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReassessmentInput {
    pub epoch: u64,
    pub case_id: Uuid,
    pub evidence_id: Uuid,
    pub practice_id: Option<Uuid>,
    pub request: ReassessEvidenceMutation,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReassessmentLookupInput {
    pub epoch: u64,
    pub case_id: Uuid,
    pub evidence_id: Uuid,
    pub practice_id: Option<Uuid>,
    pub command_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnnotationInput {
    pub epoch: u64,
    pub case_id: Uuid,
    pub annotation_id: Uuid,
    pub practice_id: Option<Uuid>,
    pub request: AnnotationMutation,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnnotationLookupInput {
    pub epoch: u64,
    pub case_id: Uuid,
    pub annotation_id: Uuid,
    pub practice_id: Option<Uuid>,
    pub command_id: Uuid,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentSourceInput {
    pub epoch: u64,
    pub case_id: Uuid,
    pub document_id: Uuid,
    pub practice_id: Option<Uuid>,
    pub page_number: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeReplicaClaimInput {
    pub epoch: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeReplicaPublishInput {
    pub epoch: u64,
    pub graph_id: Uuid,
    pub claim_generation: u64,
    pub revision: u64,
    pub projection: NativeGraphProjection,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeReplicaReleaseInput {
    pub epoch: u64,
    pub graph_id: Uuid,
    pub claim_generation: u64,
}

fn session_error(error: SessionError) -> NativeIpcError {
    match error {
        SessionError::Unauthenticated => NativeIpcError {
            status: 401,
            code: "unauthenticated",
        },
        SessionError::ReauthenticationRequired => {
            NativeIpcError::forbidden("reauthentication_required")
        }
        SessionError::PracticeDenied => NativeIpcError::forbidden("practice_denied"),
        SessionError::Unavailable => NativeIpcError::unavailable("session_unavailable"),
        SessionError::NativeAuthenticationUnavailable => {
            NativeIpcError::unavailable("native_authentication_unavailable")
        }
    }
}

fn gate_error(error: GateError) -> NativeIpcError {
    match error {
        GateError::Unauthenticated => NativeIpcError {
            status: 401,
            code: "unauthenticated",
        },
        GateError::Denied => NativeIpcError::forbidden("gate_denied"),
        GateError::NotFound => NativeIpcError {
            status: 404,
            code: "gate_not_found",
        },
        GateError::CommandConflict => NativeIpcError {
            status: 409,
            code: "command_conflict",
        },
        GateError::Unavailable => NativeIpcError::unavailable("gate_unavailable"),
        GateError::NativeAuthenticationUnavailable => {
            NativeIpcError::unavailable("native_authentication_unavailable")
        }
    }
}

fn signing_error(error: SigningError) -> NativeIpcError {
    let (status, code) = match error {
        SigningError::Unauthenticated => (401, "unauthenticated"),
        SigningError::Denied => (403, "signing_denied"),
        SigningError::NotFound => (404, "letter_not_found"),
        SigningError::RevisionConflict => (409, "revision_conflict"),
        SigningError::SignatureConflict => (409, "signature_conflict"),
        SigningError::NotApproved => (409, "letter_not_approved"),
        SigningError::GateNotAffirmed => (409, "gate_not_affirmed"),
        SigningError::QaIncomplete => (409, "qa_incomplete"),
        SigningError::SourceIncomplete => (409, "source_incomplete"),
        SigningError::CommandConflict => (409, "command_conflict"),
        SigningError::Unavailable => (503, "signing_unavailable"),
        SigningError::NativeAuthenticationUnavailable => (503, "native_authentication_unavailable"),
    };
    NativeIpcError { status, code }
}

fn reassessment_error(error: ReassessmentError) -> NativeIpcError {
    let (status, code) = match error {
        ReassessmentError::Unauthenticated => (401, "unauthenticated"),
        ReassessmentError::Denied => (403, "reassessment_denied"),
        ReassessmentError::NotFound => (404, "reassessment_not_found"),
        ReassessmentError::RevisionConflict => (409, "revision_conflict"),
        ReassessmentError::CommandConflict => (409, "command_conflict"),
        ReassessmentError::Unavailable => (503, "reassessment_unavailable"),
        ReassessmentError::NativeAuthenticationUnavailable => {
            (503, "native_authentication_unavailable")
        }
    };
    NativeIpcError { status, code }
}

fn annotation_error(error: AnnotationError) -> NativeIpcError {
    let (status, code) = match error {
        AnnotationError::Unauthenticated => (401, "unauthenticated"),
        AnnotationError::Denied => (403, "annotation_denied"),
        AnnotationError::NotFound => (404, "annotation_not_found"),
        AnnotationError::RevisionConflict => (409, "revision_conflict"),
        AnnotationError::CommandConflict => (409, "command_conflict"),
        AnnotationError::Invalid => (400, "invalid_annotation_request"),
        AnnotationError::Unavailable => (503, "annotation_unavailable"),
        AnnotationError::NativeAuthenticationUnavailable => {
            (503, "native_authentication_unavailable")
        }
    };
    NativeIpcError { status, code }
}

fn document_source_error(error: DocumentSourceError) -> NativeIpcError {
    let (status, code) = match error {
        DocumentSourceError::Unauthenticated => (401, "unauthenticated"),
        DocumentSourceError::Denied => (403, "document_source_denied"),
        DocumentSourceError::NotFound => (404, "document_source_not_found"),
        DocumentSourceError::Invalid => (400, "invalid_document_source_request"),
        DocumentSourceError::TooLarge => (413, "document_source_too_large"),
        DocumentSourceError::IntegrityMismatch => (503, "document_source_integrity_failed"),
        DocumentSourceError::Unavailable => (503, "document_source_unavailable"),
        DocumentSourceError::NativeAuthenticationUnavailable => {
            (503, "native_authentication_unavailable")
        }
    };
    NativeIpcError { status, code }
}

fn replica_coordinator_error(error: NativeReplicaCoordinatorError) -> NativeIpcError {
    match error {
        NativeReplicaCoordinatorError::Unavailable => {
            NativeIpcError::unavailable("native_replica_coordinator_unavailable")
        }
        NativeReplicaCoordinatorError::ClaimNotFound => NativeIpcError {
            status: 404,
            code: "native_replica_claim_not_found",
        },
        NativeReplicaCoordinatorError::OwnerDenied => {
            NativeIpcError::forbidden("native_replica_owner_denied")
        }
        NativeReplicaCoordinatorError::RevisionConflict => NativeIpcError {
            status: 409,
            code: "native_replica_revision_conflict",
        },
        NativeReplicaCoordinatorError::InvalidProjection => NativeIpcError {
            status: 400,
            code: "native_replica_projection_invalid",
        },
        NativeReplicaCoordinatorError::ProjectionTooLarge => NativeIpcError {
            status: 413,
            code: "native_replica_projection_too_large",
        },
    }
}

fn authorize<R: Runtime>(
    window: &WebviewWindow<R>,
    state: &DesktopState,
    epoch: u64,
) -> Result<(), NativeIpcError> {
    state.ipc_authority.authorize(window.label(), epoch)
}

#[tauri::command]
pub async fn current_session<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    state: State<'_, DesktopState>,
    input: SessionInput,
) -> Result<SessionSummary, NativeIpcError> {
    state.ipc_authority.authorize_window(window.label())?;
    match commands::current_session(&state, input.practice_id).await {
        Ok(session) => {
            if state.ipc_authority.observe_session(&session)? {
                invalidate_all(&app, &state, NativeSessionInvalidationReason::ScopeChange)?;
            }
            Ok(session)
        }
        Err(error) => {
            if state.ipc_authority.clear_session()? {
                invalidate_all(
                    &app,
                    &state,
                    NativeSessionInvalidationReason::AuthenticationFailed,
                )?;
            }
            Err(session_error(error))
        }
    }
}

#[tauri::command]
pub async fn logout<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    state: State<'_, DesktopState>,
) -> Result<LogoutResult, NativeIpcError> {
    state.ipc_authority.authorize_window(window.label())?;
    state.ipc_authority.clear_session()?;
    let event = invalidate_all(&app, &state, NativeSessionInvalidationReason::Logout);
    let result = commands::logout(&state).await.map_err(session_error);
    event?;
    result
}

#[tauri::command]
pub async fn gate_state<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, DesktopState>,
    input: GateReadInput,
) -> Result<GateSnapshot, NativeIpcError> {
    authorize(&window, &state, input.epoch)?;
    commands::gate_state(&state, input.case_id, input.practice_id)
        .await
        .map_err(gate_error)
}

#[tauri::command]
pub async fn affirm_gate<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, DesktopState>,
    input: GateMutationInput,
) -> Result<GateCommandResult, NativeIpcError> {
    authorize(&window, &state, input.epoch)?;
    commands::affirm_gate(&state, input.case_id, input.practice_id, input.request)
        .await
        .map_err(gate_error)
}

#[tauri::command]
pub async fn remove_gate<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, DesktopState>,
    input: GateMutationInput,
) -> Result<GateCommandResult, NativeIpcError> {
    authorize(&window, &state, input.epoch)?;
    commands::remove_gate(&state, input.case_id, input.practice_id, input.request)
        .await
        .map_err(gate_error)
}

#[tauri::command]
pub async fn lookup_gate_command<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, DesktopState>,
    input: GateLookupInput,
) -> Result<GateCommandResult, NativeIpcError> {
    authorize(&window, &state, input.epoch)?;
    commands::lookup_gate_command(&state, input.case_id, input.practice_id, input.command_id)
        .await
        .map_err(gate_error)?
        .ok_or(NativeIpcError {
            status: 404,
            code: "gate_not_found",
        })
}

#[tauri::command]
pub async fn signing_target<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, DesktopState>,
    input: SigningTargetInput,
) -> Result<SigningTarget, NativeIpcError> {
    authorize(&window, &state, input.epoch)?;
    commands::signing_target(&state, input.letter_id, input.practice_id)
        .await
        .map_err(signing_error)
}

#[tauri::command]
pub async fn sign_letter<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, DesktopState>,
    input: SignLetterInput,
) -> Result<SignLetterResult, NativeIpcError> {
    authorize(&window, &state, input.epoch)?;
    commands::sign_letter(&state, input.letter_id, input.practice_id, input.request)
        .await
        .map_err(signing_error)
}

#[tauri::command]
pub async fn lookup_sign_letter_command<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, DesktopState>,
    input: SignLetterLookupInput,
) -> Result<SignLetterResult, NativeIpcError> {
    authorize(&window, &state, input.epoch)?;
    commands::lookup_sign_letter_command(
        &state,
        input.letter_id,
        input.practice_id,
        input.command_id,
    )
    .await
    .map_err(signing_error)?
    .ok_or(NativeIpcError {
        status: 404,
        code: "letter_not_found",
    })
}

#[tauri::command]
pub async fn reassess_evidence<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, DesktopState>,
    input: ReassessmentInput,
) -> Result<ReassessEvidenceResult, NativeIpcError> {
    authorize(&window, &state, input.epoch)?;
    commands::reassess_evidence(
        &state,
        input.case_id,
        input.evidence_id,
        input.practice_id,
        input.request,
    )
    .await
    .map_err(reassessment_error)
}

#[tauri::command]
pub async fn lookup_reassessment_command<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, DesktopState>,
    input: ReassessmentLookupInput,
) -> Result<ReassessEvidenceResult, NativeIpcError> {
    authorize(&window, &state, input.epoch)?;
    commands::lookup_reassessment_command(
        &state,
        input.case_id,
        input.evidence_id,
        input.practice_id,
        input.command_id,
    )
    .await
    .map_err(reassessment_error)?
    .ok_or(NativeIpcError {
        status: 404,
        code: "reassessment_not_found",
    })
}

#[tauri::command]
pub async fn save_annotation<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, DesktopState>,
    input: AnnotationInput,
) -> Result<AnnotationResult, NativeIpcError> {
    authorize(&window, &state, input.epoch)?;
    commands::save_annotation(
        &state,
        input.case_id,
        input.annotation_id,
        input.practice_id,
        input.request,
    )
    .await
    .map_err(annotation_error)
}

#[tauri::command]
pub async fn lookup_annotation_command<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, DesktopState>,
    input: AnnotationLookupInput,
) -> Result<AnnotationResult, NativeIpcError> {
    authorize(&window, &state, input.epoch)?;
    commands::lookup_annotation_command(
        &state,
        input.case_id,
        input.annotation_id,
        input.practice_id,
        input.command_id,
    )
    .await
    .map_err(annotation_error)?
    .ok_or(NativeIpcError {
        status: 404,
        code: "annotation_not_found",
    })
}

#[tauri::command]
pub async fn document_source<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, DesktopState>,
    input: DocumentSourceInput,
) -> Result<DocumentSource, NativeIpcError> {
    authorize(&window, &state, input.epoch)?;
    commands::document_source(
        &state,
        input.case_id,
        input.document_id,
        input.practice_id,
        input.page_number,
    )
    .await
    .map_err(document_source_error)
}

#[tauri::command]
pub fn claim_replica_owner<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, DesktopState>,
    coordinator: State<'_, NativeReplicaCoordinator>,
    input: NativeReplicaClaimInput,
) -> Result<NativeReplicaClaim, NativeIpcError> {
    authorize(&window, &state, input.epoch)?;
    let scope = state.ipc_authority.replica_scope()?;
    coordinator
        .claim(scope, window.label())
        .map_err(replica_coordinator_error)
}

#[tauri::command]
pub fn publish_replica_projection<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    state: State<'_, DesktopState>,
    coordinator: State<'_, NativeReplicaCoordinator>,
    input: NativeReplicaPublishInput,
) -> Result<(), NativeIpcError> {
    authorize(&window, &state, input.epoch)?;
    let event = coordinator
        .publish(
            window.label(),
            input.graph_id,
            input.claim_generation,
            input.revision,
            input.projection,
        )
        .map_err(replica_coordinator_error)?;
    app.emit(NATIVE_REPLICA_EVENT, event)
        .map_err(|_| NativeIpcError::unavailable("native_replica_event_unavailable"))
}

#[tauri::command]
pub fn release_replica_owner<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    state: State<'_, DesktopState>,
    coordinator: State<'_, NativeReplicaCoordinator>,
    input: NativeReplicaReleaseInput,
) -> Result<(), NativeIpcError> {
    authorize(&window, &state, input.epoch)?;
    let event: NativeReplicaEvent = coordinator
        .release(window.label(), input.graph_id, input.claim_generation)
        .map_err(replica_coordinator_error)?;
    app.emit(NATIVE_REPLICA_EVENT, event)
        .map_err(|_| NativeIpcError::unavailable("native_replica_event_unavailable"))
}
