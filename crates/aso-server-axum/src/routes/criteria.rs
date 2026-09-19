//! Browser HTTP contract for the provenance-aware criteria catalog.

use aso_host::{
    criteria_catalog::{
        CatalogCriterion, CriteriaCatalogError, CriteriaCatalogImportResult,
        CriteriaCatalogSnapshot, ImportCriteriaCatalogCommand,
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
struct CriteriaQuery {
    practice_id: Option<Uuid>,
    payer_id: Option<Uuid>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CriteriaSessionQuery {
    practice_id: Option<Uuid>,
}

pub fn router() -> Router<ServerState> {
    Router::new()
        .route("/api/criteria/catalog", get(list).post(import))
        .route("/api/criteria/catalog/commands/{command_id}", get(lookup))
        .route("/api/criteria/{criterion_id}", get(read))
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

fn require_write(capabilities: &[String]) -> Result<(), Response> {
    capabilities
        .iter()
        .any(|capability| capability == "configure")
        .then_some(())
        .ok_or_else(|| criteria_error(CriteriaCatalogError::Denied))
}

fn require_read(capabilities: &[String]) -> Result<(), Response> {
    capabilities
        .iter()
        .any(|capability| {
            matches!(
                capability.as_str(),
                "configure" | "case:read" | "criteria_select"
            )
        })
        .then_some(())
        .ok_or_else(|| criteria_error(CriteriaCatalogError::Denied))
}

pub(crate) fn criteria_error(value: CriteriaCatalogError) -> Response {
    let (status, code) = match value {
        CriteriaCatalogError::Unauthenticated => (StatusCode::UNAUTHORIZED, "session_required"),
        CriteriaCatalogError::Denied => (StatusCode::FORBIDDEN, "action_forbidden"),
        CriteriaCatalogError::NotFound => (StatusCode::NOT_FOUND, "resource_not_found"),
        CriteriaCatalogError::RevisionConflict => (StatusCode::CONFLICT, "stale_revision"),
        CriteriaCatalogError::CommandConflict => (StatusCode::CONFLICT, "command_conflict"),
        CriteriaCatalogError::OverlapConflict => (StatusCode::CONFLICT, "criteria_overlap"),
        CriteriaCatalogError::InvalidProvenance => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "criteria_provenance_invalid",
        ),
        CriteriaCatalogError::Invalid => (StatusCode::BAD_REQUEST, "invalid_request"),
        CriteriaCatalogError::Unavailable => {
            (StatusCode::SERVICE_UNAVAILABLE, "service_unavailable")
        }
    };
    error(status, code)
}

fn context_error(value: ClinicalContextError) -> Response {
    let error = match value {
        ClinicalContextError::Session(SessionError::Unauthenticated) => {
            CriteriaCatalogError::Unauthenticated
        }
        ClinicalContextError::Session(
            SessionError::ReauthenticationRequired | SessionError::PracticeDenied,
        )
        | ClinicalContextError::NonHuman => CriteriaCatalogError::Denied,
        ClinicalContextError::Session(
            SessionError::Unavailable | SessionError::NativeAuthenticationUnavailable,
        ) => CriteriaCatalogError::Unavailable,
    };
    criteria_error(error)
}

async fn import(
    State(state): State<ServerState>,
    headers: HeaderMap,
    query: Result<Query<CriteriaSessionQuery>, QueryRejection>,
    body: Result<Json<ImportCriteriaCatalogCommand>, JsonRejection>,
) -> Result<Json<CriteriaCatalogImportResult>, Response> {
    let Query(query) = query.map_err(|_| invalid())?;
    let Json(command) = body.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    require_write(&capabilities)?;
    state
        .services
        .import_criteria_catalog(&context, &capabilities, &command)
        .await
        .map(Json)
        .map_err(criteria_error)
}

async fn list(
    State(state): State<ServerState>,
    headers: HeaderMap,
    query: Result<Query<CriteriaQuery>, QueryRejection>,
) -> Result<Json<CriteriaCatalogSnapshot>, Response> {
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    require_read(&capabilities)?;
    state
        .services
        .list_criteria_catalog(&context, &capabilities, query.payer_id)
        .await
        .map(Json)
        .map_err(criteria_error)
}

async fn read(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<CriteriaSessionQuery>, QueryRejection>,
) -> Result<Json<CatalogCriterion>, Response> {
    let Path(criterion_id) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    require_read(&capabilities)?;
    state
        .services
        .read_catalog_criterion(&context, &capabilities, criterion_id)
        .await
        .map(Json)
        .map_err(criteria_error)
}

async fn lookup(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<CriteriaSessionQuery>, QueryRejection>,
) -> Result<Json<CriteriaCatalogImportResult>, Response> {
    let Path(command_id) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    require_write(&capabilities)?;
    state
        .services
        .lookup_criteria_import_command(&context, &capabilities, command_id)
        .await
        .map_err(criteria_error)?
        .map(Json)
        .ok_or_else(|| criteria_error(CriteriaCatalogError::NotFound))
}
