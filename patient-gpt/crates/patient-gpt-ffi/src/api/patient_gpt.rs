// TJ-ARCH-MOB-001 compliant
//! Six contract operations plus `init`, mirroring the Axum routes 1:1.
//!
//! Read-only by design: nothing here writes a clinical record, and the agent
//! behind `start_run` cannot affirm, sign, submit or record an outcome.

use futures::StreamExt;
use patient_gpt_domain::{ConversationScope, RunRequest};

use crate::frb_generated::StreamSink;
use crate::host_state as state;

/// Every failure crosses as this type. `code` is `HostError::code()` for
/// service failures, or a transport code (`invalid_scope`, `not_initialized`,
/// `invalid_uar_mode`, `uar_unavailable`, `runtime_join_failed`).
#[derive(Debug, Clone)]
pub struct FfiError {
    pub code: String,
    pub message: String,
}

pub struct FfiHealth {
    pub status: String,
    pub version: String,
}

pub enum FfiRole {
    Surgeon,
    Coordinator,
    Administrator,
}

pub enum FfiPrincipalKind {
    Human,
    DelegatedAgent,
}

pub struct FfiPrincipal {
    pub id: String,
    pub display_name: String,
    pub role: FfiRole,
    pub kind: FfiPrincipalKind,
}

pub struct FfiSession {
    pub principal: FfiPrincipal,
    pub practice: String,
}

pub struct FfiPatientSummary {
    pub id: String,
    pub display_name: String,
    pub payer: String,
    pub case_ids: Vec<String>,
}

pub struct FfiCaseDue {
    pub kind: String,
    /// `YYYY-MM-DD`.
    pub date: String,
}

/// Three separate counts. `void` is reserved in Dart, hence `void_count`.
pub struct FfiCriteriaTally {
    pub met: u32,
    pub gap: u32,
    pub void_count: u32,
}

pub struct FfiCaseSummary {
    pub id: String,
    pub patient_id: String,
    pub procedure: String,
    pub payer: String,
    pub closed: bool,
    pub due: Option<FfiCaseDue>,
    pub tally: FfiCriteriaTally,
}

pub struct FfiConversationSummary {
    pub id: String,
    /// Query-string form: `all | patient:<id> | case:<patientId>:<caseId>`.
    pub scope: String,
    pub title: String,
    /// RFC 3339.
    pub updated_at: String,
}

pub struct FfiRunRequest {
    pub conversation_id: Option<String>,
    /// Query-string form, parsed strictly; never defaulted to `all`.
    pub scope: String,
    pub message: String,
}

/// AG-UI event discriminator (the `type` field on the HTTP wire).
pub enum FfiAguiEventKind {
    RunStarted,
    TextMessageStart,
    TextMessageContent,
    TextMessageEnd,
    RunFinished,
    RunError,
}

/// One AG-UI event. Which fields are set is fixed by `kind`; the Dart
/// mapping rejects a missing field instead of defaulting it.
pub struct FfiAguiEvent {
    pub kind: FfiAguiEventKind,
    pub run_id: Option<String>,
    pub thread_id: Option<String>,
    pub message_id: Option<String>,
    /// `assistant` on `TextMessageStart`.
    pub role: Option<String>,
    pub delta: Option<String>,
    pub message: Option<String>,
    pub code: Option<String>,
}

/// Called by `RustLib.init()` before any other function.
#[flutter_rust_bridge::frb(init)]
pub fn init_app() {
    flutter_rust_bridge::setup_default_user_utils();
}

/// Builds the Tokio runtime and `AppServices` once per process.
///
/// `uar_mode` is required and parsed strictly (`deterministic` or
/// `service:<url>`); there is no default. A second call with the same mode is
/// a no-op (hot restart); a different mode is rejected.
#[flutter_rust_bridge::frb(sync)]
pub fn init(uar_mode: String) -> Result<(), FfiError> {
    state::init(&uar_mode)
}

pub async fn health() -> Result<FfiHealth, FfiError> {
    let services = state::services()?;
    Ok(services.health().into())
}

pub async fn session() -> Result<FfiSession, FfiError> {
    let services = state::services()?;
    state::on_runtime(async move { services.session().await.map(Into::into) }).await
}

pub async fn list_patients() -> Result<Vec<FfiPatientSummary>, FfiError> {
    let services = state::services()?;
    state::on_runtime(async move {
        let patients = services.list_patients().await?;
        Ok(patients.into_iter().map(Into::into).collect())
    })
    .await
}

pub async fn list_cases(patient_id: String) -> Result<Vec<FfiCaseSummary>, FfiError> {
    let services = state::services()?;
    state::on_runtime(async move {
        let cases = services.list_cases(&patient_id).await?;
        Ok(cases.into_iter().map(Into::into).collect())
    })
    .await
}

pub async fn list_conversations(scope: String) -> Result<Vec<FfiConversationSummary>, FfiError> {
    let scope = parse_scope(&scope)?;
    let services = state::services()?;
    state::on_runtime(async move {
        let conversations = services.list_conversations(&scope).await?;
        Ok(conversations.into_iter().map(Into::into).collect())
    })
    .await
}

/// Streams the run's AG-UI events into `sink` and returns when the run ends.
/// A closed sink (the Dart subscription was cancelled) abandons the run.
pub async fn start_run(
    request: FfiRunRequest,
    sink: StreamSink<FfiAguiEvent>,
) -> Result<(), FfiError> {
    let run_request = RunRequest {
        conversation_id: request.conversation_id,
        scope: parse_scope(&request.scope)?,
        message: request.message,
    };
    let services = state::services()?;
    state::on_runtime(async move {
        let mut events = services.start_run(run_request).await?;
        while let Some(event) = events.next().await {
            if sink.add(event.into()).is_err() {
                break;
            }
        }
        Ok(())
    })
    .await
}

fn parse_scope(raw: &str) -> Result<ConversationScope, FfiError> {
    raw.parse().map_err(|err| FfiError {
        code: "invalid_scope".to_owned(),
        message: format!("{err}"),
    })
}
