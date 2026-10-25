// TJ-ARCH-MOB-001 compliant
//! Tauri commands, one per Axum route in `patient-gpt-server/src/routes.rs`,
//! with the same DTOs and error codes. Each calls `AppServices` and nothing
//! else; no command implements behaviour of its own.

use futures::StreamExt;
use patient_gpt_domain::{
    AguiEvent, CaseSummary, ConversationScope, ConversationSummary, Health, PatientSummary,
    RunRequest, Session,
};
use patient_gpt_host::AppServices;
use serde_json::Value;
use tauri::State;
use tauri::ipc::Channel;

use crate::error::CommandError;

/// `GET /api/health`
#[tauri::command]
pub fn health(services: State<'_, AppServices>) -> Health {
    tracing::info!(command = "health", "desktop command");
    services.health()
}

/// `GET /api/session`
#[tauri::command]
pub async fn session(services: State<'_, AppServices>) -> Result<Session, CommandError> {
    tracing::info!(command = "session", "desktop command");
    Ok(services.session().await?)
}

/// `GET /api/patients`
#[tauri::command]
pub async fn list_patients(
    services: State<'_, AppServices>,
) -> Result<Vec<PatientSummary>, CommandError> {
    tracing::info!(command = "list_patients", "desktop command");
    Ok(services.list_patients().await?)
}

/// `GET /api/patients/{patient_id}/cases`
#[tauri::command]
pub async fn list_cases(
    services: State<'_, AppServices>,
    patient_id: String,
) -> Result<Vec<CaseSummary>, CommandError> {
    tracing::info!(command = "list_cases", "desktop command");
    Ok(services.list_cases(&patient_id).await?)
}

/// `GET /api/conversations?scope=<scope>`. The webview sends the tagged
/// object form; a missing or malformed scope gets the route's codes.
#[tauri::command]
pub async fn list_conversations(
    services: State<'_, AppServices>,
    scope: Option<Value>,
) -> Result<Vec<ConversationSummary>, CommandError> {
    tracing::info!(command = "list_conversations", "desktop command");
    let raw = scope.ok_or_else(|| {
        CommandError::bad_request(
            "missing_scope",
            "argument `scope` is required: { kind: all | patient | case }",
        )
    })?;
    let scope: ConversationScope = serde_json::from_value(raw)
        .map_err(|err| CommandError::bad_request("invalid_scope", err.to_string()))?;
    Ok(services.list_conversations(&scope).await?)
}

/// `POST /api/runs`. Events go to `on_event` instead of an SSE body; the
/// command resolves when the run's stream ends.
#[tauri::command]
pub async fn start_run(
    services: State<'_, AppServices>,
    request: Option<Value>,
    on_event: Channel<AguiEvent>,
) -> Result<(), CommandError> {
    tracing::info!(command = "start_run", "desktop command");
    let raw = request.ok_or_else(|| {
        CommandError::bad_request("invalid_run_request", "argument `request` is required")
    })?;
    let request: RunRequest = serde_json::from_value(raw)
        .map_err(|err| CommandError::bad_request("invalid_run_request", err.to_string()))?;
    let mut events = services.start_run(request).await?;
    while let Some(event) = events.next().await {
        on_event
            .send(event)
            .map_err(|err| CommandError::event_delivery(&err))?;
    }
    Ok(())
}
