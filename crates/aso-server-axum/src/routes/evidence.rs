//! Verified-context evidence reassessment and explicit command reconciliation.

use aso_host::reassessment::{
    ReassessEvidenceCommand, ReassessEvidenceMutation, ReassessEvidenceResult, ReassessmentError,
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

pub fn router() -> Router<ServerState> {
    Router::new()
        .route(
            "/api/cases/{case_id}/evidence/{evidence_id}/state",
            post(reassess),
        )
        .route(
            "/api/cases/{case_id}/evidence/{evidence_id}/commands/{command_id}",
            get(lookup),
        )
        .layer(middleware::from_fn(no_store))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EvidenceQuery {
    practice_id: Option<Uuid>,
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
    error(StatusCode::BAD_REQUEST, "invalid_reassessment_request")
}

fn reassessment_error(value: ReassessmentError) -> Response {
    let (status, code) = match value {
        ReassessmentError::Unauthenticated => (StatusCode::UNAUTHORIZED, "unauthenticated"),
        ReassessmentError::Denied => (StatusCode::FORBIDDEN, "reassessment_denied"),
        ReassessmentError::NotFound => (StatusCode::NOT_FOUND, "reassessment_not_found"),
        ReassessmentError::RevisionConflict => (StatusCode::CONFLICT, "revision_conflict"),
        ReassessmentError::CommandConflict => (StatusCode::CONFLICT, "command_conflict"),
        ReassessmentError::Unavailable | ReassessmentError::NativeAuthenticationUnavailable => {
            (StatusCode::SERVICE_UNAVAILABLE, "reassessment_unavailable")
        }
    };
    error(status, code)
}

fn context_error(value: ClinicalContextError) -> Response {
    match value {
        ClinicalContextError::Session(error) => session_error(error),
        ClinicalContextError::NonHuman => reassessment_error(ReassessmentError::Denied),
    }
}

async fn reassess(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<(Uuid, Uuid)>, PathRejection>,
    query: Result<Query<EvidenceQuery>, QueryRejection>,
    body: Result<Json<ReassessEvidenceMutation>, JsonRejection>,
) -> Result<Json<ReassessEvidenceResult>, Response> {
    let Path((case_id, evidence_id)) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let Json(request) = body.map_err(|_| invalid())?;
    let (context, _) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    let command = ReassessEvidenceCommand {
        command_id: request.command_id,
        case_id,
        evidence_id,
        state: request.state,
        expected_assessed_at: request.expected_assessed_at,
    };
    state
        .services
        .execute_reassess_evidence(&context, &command)
        .await
        .map(Json)
        .map_err(reassessment_error)
}

async fn lookup(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<(Uuid, Uuid, Uuid)>, PathRejection>,
    query: Result<Query<EvidenceQuery>, QueryRejection>,
) -> Result<Json<ReassessEvidenceResult>, Response> {
    let Path((case_id, evidence_id, command_id)) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, _) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    state
        .services
        .lookup_reassessment_command(&context, case_id, evidence_id, command_id)
        .await
        .map_err(reassessment_error)?
        .map(Json)
        .ok_or_else(|| reassessment_error(ReassessmentError::NotFound))
}

#[cfg(test)]
mod tests;
