//! Verified-context annotation commands and explicit reconciliation.

use aso_host::annotation::{
    AnnotationCommand, AnnotationError, AnnotationMutation, AnnotationResult,
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
    session::{ClinicalContextError, clinical_context, session_error},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AnnotationQuery {
    practice_id: Option<Uuid>,
}

pub fn router() -> Router<ServerState> {
    Router::new()
        .route(
            "/api/cases/{case_id}/annotations/{annotation_id}",
            post(save),
        )
        .route(
            "/api/cases/{case_id}/annotations/{annotation_id}/commands/{command_id}",
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
    (status, Json(json!({"error":code}))).into_response()
}

fn invalid() -> Response {
    error(StatusCode::BAD_REQUEST, "invalid_annotation_request")
}

fn annotation_error(value: AnnotationError) -> Response {
    let (status, code) = match value {
        AnnotationError::Unauthenticated => (StatusCode::UNAUTHORIZED, "unauthenticated"),
        AnnotationError::Denied => (StatusCode::FORBIDDEN, "annotation_denied"),
        AnnotationError::NotFound => (StatusCode::NOT_FOUND, "annotation_not_found"),
        AnnotationError::RevisionConflict => (StatusCode::CONFLICT, "revision_conflict"),
        AnnotationError::CommandConflict => (StatusCode::CONFLICT, "command_conflict"),
        AnnotationError::Invalid => (StatusCode::BAD_REQUEST, "invalid_annotation_request"),
        AnnotationError::Unavailable | AnnotationError::NativeAuthenticationUnavailable => {
            (StatusCode::SERVICE_UNAVAILABLE, "annotation_unavailable")
        }
    };
    error(status, code)
}

fn context_error(value: ClinicalContextError) -> Response {
    match value {
        ClinicalContextError::Session(error) => session_error(error),
        ClinicalContextError::NonHuman => annotation_error(AnnotationError::Denied),
    }
}

async fn save(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<(Uuid, Uuid)>, PathRejection>,
    query: Result<Query<AnnotationQuery>, QueryRejection>,
    body: Result<Json<AnnotationMutation>, JsonRejection>,
) -> Result<Json<AnnotationResult>, Response> {
    let Path((case_id, annotation_id)) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let Json(request) = body.map_err(|_| invalid())?;
    if request.annotation_id != annotation_id {
        return Err(invalid());
    }
    let (context, _) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    let command = AnnotationCommand {
        command_id: request.command_id,
        annotation_id,
        case_id,
        annotation_type_id: request.annotation_type_id,
        name: request.name,
        data: request.data,
        body: request.body,
        target_evidence_id: request.target_evidence_id,
        target_document_id: request.target_document_id,
        disposition: request.disposition,
        expected_revision: request.expected_revision,
    };
    state
        .services
        .execute_annotation(&context, &command)
        .await
        .map(Json)
        .map_err(annotation_error)
}

async fn lookup(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<(Uuid, Uuid, Uuid)>, PathRejection>,
    query: Result<Query<AnnotationQuery>, QueryRejection>,
) -> Result<Json<AnnotationResult>, Response> {
    let Path((case_id, annotation_id, command_id)) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, _) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    state
        .services
        .lookup_annotation_command(&context, case_id, annotation_id, command_id)
        .await
        .map_err(annotation_error)?
        .map(Json)
        .ok_or_else(|| annotation_error(AnnotationError::NotFound))
}
