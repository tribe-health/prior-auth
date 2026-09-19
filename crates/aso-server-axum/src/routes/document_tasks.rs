//! Caller-authenticated access to host-owned durable document tasks.
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
    session::{ClinicalContextError, clinical_context, credential, session_error},
};
use aso_host::document_generation::{
    DocumentTask, DocumentTaskArtifacts, DocumentTaskEvent, GenerationError,
};
use aso_host::letter_workflow::GenerateLetterCommand;

pub fn router() -> Router<ServerState> {
    Router::new()
        .route("/api/cases/{case_id}/document-tasks", post(start))
        .route("/api/letters/{letter_id}/assembly", get(letter_artifacts))
        .route("/api/document-tasks/{task_id}", get(read))
        .route("/api/document-tasks/{task_id}/events", get(events))
        .route("/api/document-tasks/{task_id}/artifacts", get(artifacts))
        .route("/api/document-tasks/{task_id}/cancel", post(cancel))
        .route("/api/document-tasks/{task_id}/resume", post(resume))
        .layer(middleware::from_fn(task_boundary))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TaskQuery {
    practice_id: Option<Uuid>,
    #[serde(default)]
    after_sequence: i64,
}

async fn task_boundary(request: Request, next: Next) -> Response {
    let allowed_origins = std::env::var("ASO_AGENT_ALLOWED_ORIGINS").unwrap_or_default();
    let origin_allowed = valid_origin(request.method(), request.headers(), &allowed_origins);
    let mut response = if origin_allowed {
        next.run(request).await
    } else {
        error(GenerationError::Denied)
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

fn valid_origin(method: &axum::http::Method, headers: &HeaderMap, allowed_origins: &str) -> bool {
    !headers.contains_key(header::COOKIE)
        || *method != axum::http::Method::POST
        || (headers.get_all(header::ORIGIN).iter().count() == 1
            && headers
                .get(header::ORIGIN)
                .and_then(|value| value.to_str().ok())
                .is_some_and(|origin| {
                    allowed_origins
                        .split(',')
                        .any(|allowed| !allowed.trim().is_empty() && allowed.trim() == origin)
                }))
}

fn context_error(error: ClinicalContextError) -> Response {
    match error {
        ClinicalContextError::Session(error) => session_error(error),
        ClinicalContextError::NonHuman => self::error(GenerationError::Denied),
    }
}

fn error(error: GenerationError) -> Response {
    let (status, code) = match error {
        GenerationError::Denied => (StatusCode::FORBIDDEN, "action_forbidden"),
        GenerationError::Canceled => (StatusCode::CONFLICT, "task_canceled"),
        GenerationError::Stale => (StatusCode::CONFLICT, "stale_revision"),
        GenerationError::ProviderNotQualified => {
            (StatusCode::SERVICE_UNAVAILABLE, "provider_not_qualified")
        }
        GenerationError::InvalidCandidate => {
            (StatusCode::UNPROCESSABLE_ENTITY, "invalid_generation_input")
        }
        GenerationError::InvalidCitation => {
            (StatusCode::UNPROCESSABLE_ENTITY, "citation_incomplete")
        }
        GenerationError::InvalidAssembly => (StatusCode::CONFLICT, "assembly_mismatch"),
        GenerationError::Unavailable => (StatusCode::SERVICE_UNAVAILABLE, "generation_unavailable"),
    };
    (status, Json(json!({"error":code,"code":code}))).into_response()
}

async fn start(
    State(state): State<ServerState>,
    headers: HeaderMap,
    Path(case_id): Path<Uuid>,
    Query(query): Query<TaskQuery>,
    Json(command): Json<GenerateLetterCommand>,
) -> Result<Json<DocumentTask>, Response> {
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    let credential = credential(&headers).map_err(session_error)?;
    state
        .services
        .start_document_task(&context, &capabilities, credential, case_id, &command)
        .await
        .map(Json)
        .map_err(error)
}

async fn read(
    State(state): State<ServerState>,
    headers: HeaderMap,
    Path(task_id): Path<Uuid>,
    Query(query): Query<TaskQuery>,
) -> Result<Json<DocumentTask>, Response> {
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    state
        .services
        .read_document_task(&context, &capabilities, task_id)
        .await
        .map(Json)
        .map_err(error)
}

async fn events(
    State(state): State<ServerState>,
    headers: HeaderMap,
    Path(task_id): Path<Uuid>,
    Query(query): Query<TaskQuery>,
) -> Result<Json<Vec<DocumentTaskEvent>>, Response> {
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    state
        .services
        .document_task_events(&context, &capabilities, task_id, query.after_sequence)
        .await
        .map(Json)
        .map_err(error)
}

async fn artifacts(
    State(state): State<ServerState>,
    headers: HeaderMap,
    Path(task_id): Path<Uuid>,
    Query(query): Query<TaskQuery>,
) -> Result<Json<DocumentTaskArtifacts>, Response> {
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    state
        .services
        .document_task_artifacts(&context, &capabilities, task_id)
        .await
        .map(Json)
        .map_err(error)
}

async fn cancel(
    State(state): State<ServerState>,
    headers: HeaderMap,
    Path(task_id): Path<Uuid>,
    Query(query): Query<TaskQuery>,
) -> Result<Json<DocumentTask>, Response> {
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    state
        .services
        .cancel_document_task(&context, &capabilities, task_id)
        .await
        .map(Json)
        .map_err(error)
}

async fn resume(
    State(state): State<ServerState>,
    headers: HeaderMap,
    Path(task_id): Path<Uuid>,
    Query(query): Query<TaskQuery>,
) -> Result<Json<DocumentTask>, Response> {
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    let credential = credential(&headers).map_err(session_error)?;
    state
        .services
        .resume_document_task(&context, &capabilities, credential, task_id)
        .await
        .map(Json)
        .map_err(error)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{HeaderValue, Method};

    #[test]
    fn cookie_mutations_require_one_exact_configured_origin() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            HeaderValue::from_static("ory_kratos_session=synthetic"),
        );
        assert!(!valid_origin(
            &Method::POST,
            &headers,
            "http://127.0.0.1:5173"
        ));
        headers.insert(
            header::ORIGIN,
            HeaderValue::from_static("http://127.0.0.1:5173.evil.invalid"),
        );
        assert!(!valid_origin(
            &Method::POST,
            &headers,
            "http://127.0.0.1:5173"
        ));
        headers.insert(
            header::ORIGIN,
            HeaderValue::from_static("http://127.0.0.1:5173"),
        );
        assert!(valid_origin(
            &Method::POST,
            &headers,
            "http://localhost:5173, http://127.0.0.1:5173"
        ));
        assert!(!valid_origin(&Method::POST, &headers, ""));
        headers.append(
            header::ORIGIN,
            HeaderValue::from_static("http://127.0.0.1:5173"),
        );
        assert!(!valid_origin(
            &Method::POST,
            &headers,
            "http://127.0.0.1:5173"
        ));
        assert!(valid_origin(&Method::GET, &headers, ""));
        headers.remove(header::COOKIE);
        assert!(
            valid_origin(&Method::POST, &headers, ""),
            "explicit credentials remain authenticated separately"
        );
    }
}

async fn letter_artifacts(
    State(state): State<ServerState>,
    headers: HeaderMap,
    Path(letter_id): Path<Uuid>,
    Query(query): Query<TaskQuery>,
) -> Result<Json<Option<DocumentTaskArtifacts>>, Response> {
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    state
        .services
        .letter_assembly_artifacts(&context, &capabilities, letter_id)
        .await
        .map(Json)
        .map_err(error)
}
