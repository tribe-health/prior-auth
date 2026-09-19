//! Browser HTTP contract for a case's controlling criteria snapshot.

use aso_host::{
    criteria_selection::{
        CriteriaSelectionError, CriteriaSelectionResult, CriteriaSelectionSnapshot,
        SelectCriteriaCommand,
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
    routing::get,
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
struct CriteriaSelectionQuery {
    practice_id: Option<Uuid>,
}

pub fn router() -> Router<ServerState> {
    Router::new()
        .route(
            "/api/cases/{case_id}/criteria-selection",
            get(read).post(select),
        )
        .route(
            "/api/cases/{case_id}/criteria-selection/commands/{command_id}",
            get(lookup),
        )
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
    capabilities
        .iter()
        .any(|capability| capability == required)
        .then_some(())
        .ok_or_else(|| selection_error(CriteriaSelectionError::Denied))
}

fn selection_error(value: CriteriaSelectionError) -> Response {
    let (status, code) = match value {
        CriteriaSelectionError::Unauthenticated => (StatusCode::UNAUTHORIZED, "session_required"),
        CriteriaSelectionError::Denied => (StatusCode::FORBIDDEN, "action_forbidden"),
        CriteriaSelectionError::NotFound => (StatusCode::NOT_FOUND, "resource_not_found"),
        CriteriaSelectionError::RevisionConflict => (StatusCode::CONFLICT, "stale_revision"),
        CriteriaSelectionError::CommandConflict => (StatusCode::CONFLICT, "command_conflict"),
        CriteriaSelectionError::ResolutionRequired => {
            (StatusCode::CONFLICT, "criteria_selection_blocked")
        }
        CriteriaSelectionError::InvalidSelection => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "criteria_selection_invalid",
        ),
        CriteriaSelectionError::Invalid => (StatusCode::BAD_REQUEST, "invalid_request"),
        CriteriaSelectionError::Unavailable => {
            (StatusCode::SERVICE_UNAVAILABLE, "service_unavailable")
        }
    };
    error(status, code)
}

fn context_error(value: ClinicalContextError) -> Response {
    selection_error(match value {
        ClinicalContextError::Session(SessionError::Unauthenticated) => {
            CriteriaSelectionError::Unauthenticated
        }
        ClinicalContextError::Session(
            SessionError::ReauthenticationRequired | SessionError::PracticeDenied,
        )
        | ClinicalContextError::NonHuman => CriteriaSelectionError::Denied,
        ClinicalContextError::Session(
            SessionError::Unavailable | SessionError::NativeAuthenticationUnavailable,
        ) => CriteriaSelectionError::Unavailable,
    })
}

async fn read(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<CriteriaSelectionQuery>, QueryRejection>,
) -> Result<Json<CriteriaSelectionSnapshot>, Response> {
    let Path(case_id) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    require_capability(&capabilities, "case:read")?;
    state
        .services
        .read_criteria_selection(&context, &capabilities, case_id)
        .await
        .map(Json)
        .map_err(selection_error)
}

async fn select(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<CriteriaSelectionQuery>, QueryRejection>,
    body: Result<Json<SelectCriteriaCommand>, JsonRejection>,
) -> Result<Json<CriteriaSelectionResult>, Response> {
    let Path(case_id) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let Json(command) = body.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    require_capability(&capabilities, "criteria_select")?;
    state
        .services
        .select_case_criteria(&context, &capabilities, case_id, &command)
        .await
        .map(Json)
        .map_err(selection_error)
}

async fn lookup(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<(Uuid, Uuid)>, PathRejection>,
    query: Result<Query<CriteriaSelectionQuery>, QueryRejection>,
) -> Result<Json<CriteriaSelectionResult>, Response> {
    let Path((case_id, command_id)) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    require_capability(&capabilities, "criteria_select")?;
    state
        .services
        .lookup_criteria_selection_command(&context, &capabilities, case_id, command_id)
        .await
        .map_err(selection_error)?
        .map(Json)
        .ok_or_else(|| selection_error(CriteriaSelectionError::NotFound))
}
