//! Verified browser HTTP contracts for case intake and lifecycle commands.

use aso_host::{
    case_management::{
        CaseCommandResult, CaseError, CaseInput, CaseRecord, CaseStatus, CreateCaseCommand,
        TransitionCaseCommand, UpdateCaseCommand,
    },
    session::SessionError,
};
use axum::{
    Json, Router,
    extract::{
        Path, Query, Request, State,
        rejection::{JsonRejection, PathRejection, QueryRejection},
    },
    http::{HeaderMap, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::{
    ServerState,
    session::{ClinicalContextError, clinical_context},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CaseQuery {
    practice_id: Option<Uuid>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateCaseMutation {
    command_id: Uuid,
    case_id: Uuid,
    input: CaseInput,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateCaseMutation {
    command_id: Uuid,
    expected_revision: i64,
    input: CaseInput,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TransitionCaseMutation {
    command_id: Uuid,
    expected_status_revision: i64,
    target_status: CaseStatus,
}

pub fn router() -> Router<ServerState> {
    Router::new()
        .route("/api/cases", get(list).post(create))
        .route("/api/cases/{case_id}", get(read).patch(update))
        .route("/api/cases/{case_id}/status", post(transition))
        .route("/api/case-commands/{command_id}", get(lookup_create))
        .route("/api/cases/{case_id}/commands/{command_id}", get(lookup))
        .layer(middleware::from_fn(no_store))
}

async fn no_store(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    response.headers_mut().insert(
        header::VARY,
        "Cookie, Authorization, X-Session-Token".parse().unwrap(),
    );
    response
}

fn error(status: StatusCode, code: &str) -> Response {
    (status, Json(json!({"error": code}))).into_response()
}

fn invalid() -> Response {
    error(StatusCode::BAD_REQUEST, "invalid_request")
}

fn require_capability(capabilities: &[String], required: &str) -> Result<(), Response> {
    if capabilities.iter().any(|capability| capability == required) {
        Ok(())
    } else {
        Err(case_error(CaseError::Denied))
    }
}

pub(crate) fn case_error(value: CaseError) -> Response {
    let (status, code) = match value {
        CaseError::Unauthenticated => (StatusCode::UNAUTHORIZED, "session_required"),
        CaseError::Denied => (StatusCode::FORBIDDEN, "action_forbidden"),
        CaseError::NotFound => (StatusCode::NOT_FOUND, "resource_not_found"),
        CaseError::RevisionConflict => (StatusCode::CONFLICT, "stale_revision"),
        CaseError::InvalidTransition => (StatusCode::CONFLICT, "invalid_transition"),
        CaseError::CommandConflict => (StatusCode::CONFLICT, "command_conflict"),
        CaseError::Invalid => (StatusCode::BAD_REQUEST, "invalid_request"),
        CaseError::Unavailable => (StatusCode::SERVICE_UNAVAILABLE, "service_unavailable"),
    };
    error(status, code)
}

pub(crate) fn case_context_error(value: ClinicalContextError) -> Response {
    let error = match value {
        ClinicalContextError::Session(SessionError::Unauthenticated) => CaseError::Unauthenticated,
        ClinicalContextError::Session(
            SessionError::ReauthenticationRequired | SessionError::PracticeDenied,
        )
        | ClinicalContextError::NonHuman => CaseError::Denied,
        ClinicalContextError::Session(
            SessionError::Unavailable | SessionError::NativeAuthenticationUnavailable,
        ) => CaseError::Unavailable,
    };
    case_error(error)
}

async fn create(
    State(state): State<ServerState>,
    headers: HeaderMap,
    query: Result<Query<CaseQuery>, QueryRejection>,
    body: Result<Json<CreateCaseMutation>, JsonRejection>,
) -> Result<Json<CaseCommandResult>, Response> {
    let Query(query) = query.map_err(|_| invalid())?;
    let Json(request) = body.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(case_context_error)?;
    require_capability(&capabilities, "case_write")?;
    state
        .services
        .create_case(
            &context,
            &capabilities,
            &CreateCaseCommand {
                command_id: request.command_id,
                case_id: request.case_id,
                input: request.input,
            },
        )
        .await
        .map(Json)
        .map_err(case_error)
}

async fn list(
    State(state): State<ServerState>,
    headers: HeaderMap,
    query: Result<Query<CaseQuery>, QueryRejection>,
) -> Result<Json<Vec<CaseRecord>>, Response> {
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(case_context_error)?;
    require_capability(&capabilities, "case:read")?;
    state
        .services
        .list_cases(&context, &capabilities)
        .await
        .map(Json)
        .map_err(case_error)
}

async fn read(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<CaseQuery>, QueryRejection>,
) -> Result<Json<CaseRecord>, Response> {
    let Path(case_id) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(case_context_error)?;
    require_capability(&capabilities, "case:read")?;
    state
        .services
        .read_case(&context, &capabilities, case_id)
        .await
        .map(Json)
        .map_err(case_error)
}

async fn update(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<CaseQuery>, QueryRejection>,
    body: Result<Json<UpdateCaseMutation>, JsonRejection>,
) -> Result<Json<CaseCommandResult>, Response> {
    let Path(case_id) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let Json(request) = body.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(case_context_error)?;
    require_capability(&capabilities, "case_write")?;
    state
        .services
        .update_case(
            &context,
            &capabilities,
            &UpdateCaseCommand {
                command_id: request.command_id,
                case_id,
                expected_revision: request.expected_revision,
                input: request.input,
            },
        )
        .await
        .map(Json)
        .map_err(case_error)
}

async fn transition(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<CaseQuery>, QueryRejection>,
    body: Result<Json<TransitionCaseMutation>, JsonRejection>,
) -> Result<Json<CaseCommandResult>, Response> {
    let Path(case_id) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let Json(request) = body.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(case_context_error)?;
    require_capability(&capabilities, "case_write")?;
    state
        .services
        .transition_case(
            &context,
            &capabilities,
            &TransitionCaseCommand {
                command_id: request.command_id,
                case_id,
                expected_status_revision: request.expected_status_revision,
                target_status: request.target_status,
            },
        )
        .await
        .map(Json)
        .map_err(case_error)
}

async fn lookup_create(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<CaseQuery>, QueryRejection>,
) -> Result<Json<CaseCommandResult>, Response> {
    let Path(command_id) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(case_context_error)?;
    require_capability(&capabilities, "case_write")?;
    state
        .services
        .lookup_create_case_command(&context, &capabilities, command_id)
        .await
        .map_err(case_error)?
        .map(Json)
        .ok_or_else(|| case_error(CaseError::NotFound))
}

async fn lookup(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<(Uuid, Uuid)>, PathRejection>,
    query: Result<Query<CaseQuery>, QueryRejection>,
) -> Result<Json<CaseCommandResult>, Response> {
    let Path((case_id, command_id)) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(case_context_error)?;
    require_capability(&capabilities, "case_write")?;
    state
        .services
        .lookup_case_command(&context, &capabilities, case_id, command_id)
        .await
        .map_err(case_error)?
        .map(Json)
        .ok_or_else(|| case_error(CaseError::NotFound))
}

#[cfg(test)]
mod tests;
