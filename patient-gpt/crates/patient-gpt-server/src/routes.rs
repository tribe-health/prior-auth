// TJ-ARCH-MOB-001 compliant
//! Route table, exactly as frozen in the scaffold contract.

use std::convert::Infallible;

use axum::extract::rejection::JsonRejection;
use axum::extract::{Path, Query, State};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures::{Stream, StreamExt};
use patient_gpt_domain::{
    AguiEvent, CaseSummary, ConversationScope, ConversationSummary, Health, PatientSummary,
    RunRequest, Session,
};
use patient_gpt_host::AppServices;
use serde::Deserialize;

use crate::ApiError;

pub fn api() -> Router<AppServices> {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/session", get(session))
        .route("/api/patients", get(list_patients))
        .route("/api/patients/{patient_id}/cases", get(list_cases))
        .route("/api/conversations", get(list_conversations))
        .route("/api/runs", post(start_run))
}

async fn health(State(services): State<AppServices>) -> Json<Health> {
    Json(services.health())
}

async fn session(State(services): State<AppServices>) -> Result<Json<Session>, ApiError> {
    Ok(Json(services.session().await?))
}

async fn list_patients(
    State(services): State<AppServices>,
) -> Result<Json<Vec<PatientSummary>>, ApiError> {
    Ok(Json(services.list_patients().await?))
}

async fn list_cases(
    State(services): State<AppServices>,
    Path(patient_id): Path<String>,
) -> Result<Json<Vec<CaseSummary>>, ApiError> {
    Ok(Json(services.list_cases(&patient_id).await?))
}

#[derive(Debug, Deserialize)]
struct ScopeQuery {
    scope: Option<String>,
}

async fn list_conversations(
    State(services): State<AppServices>,
    Query(query): Query<ScopeQuery>,
) -> Result<Json<Vec<ConversationSummary>>, ApiError> {
    let raw = query.scope.ok_or_else(|| {
        ApiError::bad_request(
            "missing_scope",
            "query parameter `scope` is required: all | patient:<id> | case:<patientId>:<caseId>",
        )
    })?;
    let scope: ConversationScope = raw
        .parse()
        .map_err(|err| ApiError::bad_request("invalid_scope", format!("{err}")))?;
    Ok(Json(services.list_conversations(&scope).await?))
}

async fn start_run(
    State(services): State<AppServices>,
    body: Result<Json<RunRequest>, JsonRejection>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, ApiError> {
    let Json(request) =
        body.map_err(|err| ApiError::bad_request("invalid_run_request", err.body_text()))?;
    let events = services.start_run(request).await?;
    Ok(Sse::new(events.map(to_sse)).keep_alive(KeepAlive::default()))
}

fn to_sse(event: AguiEvent) -> Result<Event, Infallible> {
    let data = match Event::default().json_data(&event) {
        Ok(data) => data,
        Err(err) => {
            tracing::error!("AG-UI event failed to serialize: {err}");
            Event::default()
                .json_data(AguiEvent::RunError {
                    message: "event serialization failed".to_owned(),
                    code: Some("serialization_failed".to_owned()),
                })
                .unwrap_or_default()
        }
    };
    Ok(data)
}
