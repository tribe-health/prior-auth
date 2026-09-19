//! Verified-context evidence reassessment and explicit command reconciliation.

use aso_host::evidence_assembly::{
    AssembleEvidenceCommand, EvidenceAssemblyError, EvidenceCommandResult, EvidenceSnapshot,
};
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
        .route("/api/cases/{case_id}/evidence", get(read_assembled))
        .route("/api/cases/{case_id}/evidence/assemble", post(assemble))
        .route(
            "/api/cases/{case_id}/evidence-commands/{command_id}",
            get(lookup_assembly),
        )
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

fn assembly_error(value: EvidenceAssemblyError) -> Response {
    let (status, code) = match value {
        EvidenceAssemblyError::Unauthenticated => (StatusCode::UNAUTHORIZED, "session_required"),
        EvidenceAssemblyError::Denied => (StatusCode::FORBIDDEN, "action_forbidden"),
        EvidenceAssemblyError::NotFound => (StatusCode::NOT_FOUND, "resource_not_found"),
        EvidenceAssemblyError::RevisionConflict => (StatusCode::CONFLICT, "stale_revision"),
        EvidenceAssemblyError::CommandConflict => (StatusCode::CONFLICT, "command_conflict"),
        EvidenceAssemblyError::CriteriaUnresolved => (StatusCode::CONFLICT, "criteria_unresolved"),
        EvidenceAssemblyError::CitationIncomplete => {
            (StatusCode::UNPROCESSABLE_ENTITY, "citation_incomplete")
        }
        EvidenceAssemblyError::InvalidEvidence => {
            (StatusCode::UNPROCESSABLE_ENTITY, "evidence_invalid")
        }
        EvidenceAssemblyError::Invalid => (StatusCode::BAD_REQUEST, "invalid_request"),
        EvidenceAssemblyError::Unavailable => {
            (StatusCode::SERVICE_UNAVAILABLE, "service_unavailable")
        }
    };
    error(status, code)
}

fn assembly_context_error(value: ClinicalContextError) -> Response {
    match value {
        ClinicalContextError::Session(aso_host::session::SessionError::Unauthenticated) => {
            assembly_error(EvidenceAssemblyError::Unauthenticated)
        }
        ClinicalContextError::Session(
            aso_host::session::SessionError::Unavailable
            | aso_host::session::SessionError::NativeAuthenticationUnavailable,
        ) => assembly_error(EvidenceAssemblyError::Unavailable),
        ClinicalContextError::Session(
            aso_host::session::SessionError::ReauthenticationRequired
            | aso_host::session::SessionError::PracticeDenied,
        )
        | ClinicalContextError::NonHuman => assembly_error(EvidenceAssemblyError::Denied),
    }
}

async fn read_assembled(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<EvidenceQuery>, QueryRejection>,
) -> Result<Json<EvidenceSnapshot>, Response> {
    let Path(case_id) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(assembly_context_error)?;
    state
        .services
        .read_case_evidence(&context, &capabilities, case_id)
        .await
        .map(Json)
        .map_err(assembly_error)
}

async fn assemble(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<EvidenceQuery>, QueryRejection>,
    body: Result<Json<AssembleEvidenceCommand>, JsonRejection>,
) -> Result<Json<EvidenceCommandResult>, Response> {
    let Path(case_id) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let Json(command) = body.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(assembly_context_error)?;
    state
        .services
        .assemble_case_evidence(&context, &capabilities, case_id, &command)
        .await
        .map(Json)
        .map_err(assembly_error)
}

async fn lookup_assembly(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<(Uuid, Uuid)>, PathRejection>,
    query: Result<Query<EvidenceQuery>, QueryRejection>,
) -> Result<Json<EvidenceCommandResult>, Response> {
    let Path((case_id, command_id)) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(assembly_context_error)?;
    state
        .services
        .lookup_evidence_assembly_command(&context, &capabilities, case_id, command_id)
        .await
        .map_err(assembly_error)?
        .map(Json)
        .ok_or_else(|| assembly_error(EvidenceAssemblyError::NotFound))
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
