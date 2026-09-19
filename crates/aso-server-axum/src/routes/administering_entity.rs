//! Browser HTTP contract for authoritative administering-entity resolution.

use aso_host::{
    administering_entity::{
        AdministeringEntityResolution, ResolutionCommandReceipt, ResolutionError,
        ResolveAdministeringEntityCommand,
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
struct ResolutionQuery {
    practice_id: Option<Uuid>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ResolveMutation {
    command_id: Uuid,
    expected_case_input_revision: i64,
}

pub fn router() -> Router<ServerState> {
    Router::new()
        .route(
            "/api/cases/{case_id}/administering-entity",
            get(read).post(resolve),
        )
        .route(
            "/api/cases/{case_id}/administering-entity/commands/{command_id}",
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
        .ok_or_else(|| resolution_error(ResolutionError::Denied))
}

pub(crate) fn resolution_error(value: ResolutionError) -> Response {
    let (status, code) = match value {
        ResolutionError::Unauthenticated => (StatusCode::UNAUTHORIZED, "session_required"),
        ResolutionError::Denied => (StatusCode::FORBIDDEN, "action_forbidden"),
        ResolutionError::NotFound => (StatusCode::NOT_FOUND, "resource_not_found"),
        ResolutionError::InputsIncomplete => {
            (StatusCode::UNPROCESSABLE_ENTITY, "case_inputs_incomplete")
        }
        ResolutionError::RevisionConflict => (StatusCode::CONFLICT, "stale_revision"),
        ResolutionError::CommandConflict => (StatusCode::CONFLICT, "command_conflict"),
        ResolutionError::Invalid => (StatusCode::BAD_REQUEST, "invalid_request"),
        ResolutionError::Unavailable => (StatusCode::SERVICE_UNAVAILABLE, "service_unavailable"),
    };
    error(status, code)
}

fn context_error(value: ClinicalContextError) -> Response {
    let error = match value {
        ClinicalContextError::Session(SessionError::Unauthenticated) => {
            ResolutionError::Unauthenticated
        }
        ClinicalContextError::Session(
            SessionError::ReauthenticationRequired | SessionError::PracticeDenied,
        )
        | ClinicalContextError::NonHuman => ResolutionError::Denied,
        ClinicalContextError::Session(
            SessionError::Unavailable | SessionError::NativeAuthenticationUnavailable,
        ) => ResolutionError::Unavailable,
    };
    resolution_error(error)
}

async fn read(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<ResolutionQuery>, QueryRejection>,
) -> Result<Json<AdministeringEntityResolution>, Response> {
    let Path(case_id) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    require_capability(&capabilities, "case:read")?;
    state
        .services
        .read_administering_entity(&context, &capabilities, case_id)
        .await
        .map(Json)
        .map_err(resolution_error)
}

async fn resolve(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<ResolutionQuery>, QueryRejection>,
    body: Result<Json<ResolveMutation>, JsonRejection>,
) -> Result<Json<ResolutionCommandReceipt>, Response> {
    let Path(case_id) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let Json(request) = body.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    require_capability(&capabilities, "resolve_administering_entity")?;
    state
        .services
        .resolve_administering_entity(
            &context,
            &capabilities,
            &ResolveAdministeringEntityCommand {
                command_id: request.command_id,
                case_id,
                expected_case_input_revision: request.expected_case_input_revision,
            },
        )
        .await
        .map(Json)
        .map_err(resolution_error)
}

async fn lookup(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<(Uuid, Uuid)>, PathRejection>,
    query: Result<Query<ResolutionQuery>, QueryRejection>,
) -> Result<Json<ResolutionCommandReceipt>, Response> {
    let Path((case_id, command_id)) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    require_capability(&capabilities, "resolve_administering_entity")?;
    state
        .services
        .lookup_administering_entity_command(&context, &capabilities, case_id, command_id)
        .await
        .map_err(resolution_error)?
        .map(Json)
        .ok_or_else(|| resolution_error(ResolutionError::NotFound))
}
