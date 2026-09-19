//! Submission packet, payer acknowledgement, and custody routes.

use aso_host::submission_workflow::{
    RecordAcknowledgementCommand, SubmissionPacketSnapshot, SubmissionReceiptView,
    SubmissionWorkflowError, SubmitPacketCommand,
};
use axum::{
    Json, Router,
    extract::{Path, Query, Request, State},
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
        .route("/api/cases/{case_id}/submission-packet", get(read_packet))
        .route("/api/cases/{case_id}/submissions", post(submit_packet))
        .route("/api/cases/{case_id}/submission-receipt", get(read_receipt))
        .route(
            "/api/cases/{case_id}/submission-acknowledgements",
            post(record_acknowledgement),
        )
        .layer(middleware::from_fn(submission_boundary))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SubmissionQuery {
    practice_id: Option<Uuid>,
}

async fn read_packet(
    State(state): State<ServerState>,
    headers: HeaderMap,
    Path(case_id): Path<Uuid>,
    Query(query): Query<SubmissionQuery>,
) -> Result<Json<SubmissionPacketSnapshot>, Response> {
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    state
        .services
        .read_submission_packet(&context, &capabilities, case_id)
        .await
        .map(Json)
        .map_err(error)
}

async fn submit_packet(
    State(state): State<ServerState>,
    headers: HeaderMap,
    Path(case_id): Path<Uuid>,
    Query(query): Query<SubmissionQuery>,
    Json(command): Json<SubmitPacketCommand>,
) -> Result<Json<SubmissionPacketSnapshot>, Response> {
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    state
        .services
        .submit_packet(&context, &capabilities, case_id, &command)
        .await
        .map(Json)
        .map_err(error)
}

async fn read_receipt(
    State(state): State<ServerState>,
    headers: HeaderMap,
    Path(case_id): Path<Uuid>,
    Query(query): Query<SubmissionQuery>,
) -> Result<Json<SubmissionReceiptView>, Response> {
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    state
        .services
        .read_submission_receipt(&context, &capabilities, case_id)
        .await
        .map(Json)
        .map_err(error)
}

async fn record_acknowledgement(
    State(state): State<ServerState>,
    headers: HeaderMap,
    Path(case_id): Path<Uuid>,
    Query(query): Query<SubmissionQuery>,
    Json(command): Json<RecordAcknowledgementCommand>,
) -> Result<Json<SubmissionReceiptView>, Response> {
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    state
        .services
        .record_submission_acknowledgement(&context, &capabilities, case_id, &command)
        .await
        .map(Json)
        .map_err(error)
}

async fn submission_boundary(request: Request, next: Next) -> Response {
    let origins = std::env::var("ASO_AGENT_ALLOWED_ORIGINS").unwrap_or_default();
    let allowed = !request.headers().contains_key(header::COOKIE)
        || *request.method() != axum::http::Method::POST
        || (request.headers().get_all(header::ORIGIN).iter().count() == 1
            && request
                .headers()
                .get(header::ORIGIN)
                .and_then(|value| value.to_str().ok())
                .is_some_and(|origin| {
                    origins
                        .split(',')
                        .any(|allowed| !allowed.trim().is_empty() && allowed.trim() == origin)
                }));
    let mut response = if allowed {
        next.run(request).await
    } else {
        error(SubmissionWorkflowError::Denied)
    };
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        axum::http::HeaderValue::from_static("no-store"),
    );
    response.headers_mut().insert(
        header::VARY,
        axum::http::HeaderValue::from_static("Cookie, Authorization, X-Session-Token, Origin"),
    );
    response
}

fn context_error(value: ClinicalContextError) -> Response {
    match value {
        ClinicalContextError::Session(error) => session_error(error),
        ClinicalContextError::NonHuman => error(SubmissionWorkflowError::Denied),
    }
}

fn error(value: SubmissionWorkflowError) -> Response {
    let (status, code) = match value {
        SubmissionWorkflowError::Unauthenticated => (StatusCode::UNAUTHORIZED, "session_required"),
        SubmissionWorkflowError::Denied => (StatusCode::FORBIDDEN, "action_forbidden"),
        SubmissionWorkflowError::NotFound => (StatusCode::NOT_FOUND, "resource_not_found"),
        SubmissionWorkflowError::RevisionConflict => (StatusCode::CONFLICT, "stale_revision"),
        SubmissionWorkflowError::CommandConflict => (StatusCode::CONFLICT, "command_conflict"),
        SubmissionWorkflowError::NotReady => (StatusCode::CONFLICT, "packet_not_ready"),
        SubmissionWorkflowError::Invalid => (StatusCode::BAD_REQUEST, "invalid_request"),
        SubmissionWorkflowError::Unavailable => {
            (StatusCode::SERVICE_UNAVAILABLE, "service_unavailable")
        }
    };
    (status, Json(json!({"error":code,"code":code}))).into_response()
}
