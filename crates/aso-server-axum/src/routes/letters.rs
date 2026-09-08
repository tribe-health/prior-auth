use axum::{
    Json, Router,
    extract::Request,
    extract::{
        Path, Query, State,
        rejection::{JsonRejection, PathRejection, QueryRejection},
    },
    http::{HeaderMap, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde_json::json;
use uuid::Uuid;

use crate::{
    ServerState,
    session::{ClinicalContextError, clinical_context, session_error},
};
use aso_host::{
    domain::{DomainError, LetterId},
    signing::{SignLetterCommand, SignLetterMutation, SignLetterResult, SigningError},
};

pub fn router() -> Router<ServerState> {
    Router::new()
        .route("/api/letters/{letter_id}/sign", post(sign))
        .route(
            "/api/letters/{letter_id}/sign/commands/{command_id}",
            get(lookup),
        )
        .layer(middleware::from_fn(no_store))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SignQuery {
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

fn signing_error(value: SigningError) -> Response {
    let (status, code) = match value {
        SigningError::Unauthenticated => (StatusCode::UNAUTHORIZED, "unauthenticated"),
        SigningError::Denied => (StatusCode::FORBIDDEN, "signing_denied"),
        SigningError::NotFound => (StatusCode::NOT_FOUND, "letter_not_found"),
        SigningError::RevisionConflict => (StatusCode::CONFLICT, "revision_conflict"),
        SigningError::SignatureConflict => (StatusCode::CONFLICT, "signature_conflict"),
        SigningError::NotApproved => (StatusCode::CONFLICT, "letter_not_approved"),
        SigningError::GateNotAffirmed => (StatusCode::CONFLICT, "gate_not_affirmed"),
        SigningError::QaIncomplete => (StatusCode::CONFLICT, "qa_incomplete"),
        SigningError::SourceIncomplete => (StatusCode::CONFLICT, "sources_incomplete"),
        SigningError::CommandConflict => (StatusCode::CONFLICT, "command_conflict"),
        SigningError::Unavailable | SigningError::NativeAuthenticationUnavailable => {
            (StatusCode::SERVICE_UNAVAILABLE, "signing_unavailable")
        }
    };
    (status, Json(json!({"error":code}))).into_response()
}

fn context_error(value: ClinicalContextError) -> Response {
    match value {
        ClinicalContextError::Session(error) => session_error(error),
        ClinicalContextError::NonHuman => signing_error(SigningError::Denied),
    }
}

fn invalid_signing_request() -> Response {
    (
        StatusCode::BAD_REQUEST,
        Json(json!({"error":"invalid_signing_request"})),
    )
        .into_response()
}

async fn sign(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<SignQuery>, QueryRejection>,
    body: Result<Json<SignLetterMutation>, JsonRejection>,
) -> Result<Json<SignLetterResult>, Response> {
    let Path(letter_id) = path.map_err(|_| invalid_signing_request())?;
    let Query(query) = query.map_err(|_| invalid_signing_request())?;
    let Json(request) = body.map_err(|_| invalid_signing_request())?;
    if request.expected_letter_version <= 0
        || request.expected_qa_revision < 0
        || request.expected_signature_version <= 0
    {
        return Err(invalid_signing_request());
    }
    let (context, _) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    let command = SignLetterCommand {
        command_id: request.command_id,
        letter_id: LetterId(letter_id),
        expected_letter_version: request.expected_letter_version,
        expected_qa_revision: request.expected_qa_revision,
        expected_signature_version: request.expected_signature_version,
    };
    state
        .services
        .execute_sign_letter(&context, &command)
        .await
        .map(Json)
        .map_err(signing_error)
}

async fn lookup(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<(Uuid, Uuid)>, PathRejection>,
    query: Result<Query<SignQuery>, QueryRejection>,
) -> Result<Json<SignLetterResult>, Response> {
    let Path((letter_id, command_id)) = path.map_err(|_| invalid_signing_request())?;
    let Query(query) = query.map_err(|_| invalid_signing_request())?;
    let (context, _) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    state
        .services
        .lookup_sign_letter_command(&context, LetterId(letter_id), command_id)
        .await
        .map_err(signing_error)?
        .map(Json)
        .ok_or_else(|| signing_error(SigningError::NotFound))
}

/// API error envelope.
///
/// A refused clinical act returns 403 with the reason intact — a coordinator
/// seeing "the surgeon has not affirmed this case" can act on it, where a bare
/// 500 teaches them nothing.
pub enum ApiError {
    Forbidden(String),
    Conflict(String),
    NotFound,
    Internal(String),
}

impl From<DomainError> for ApiError {
    fn from(e: DomainError) -> Self {
        match e {
            DomainError::CapabilityDenied { .. } | DomainError::NotCitableAsPolicy { .. } => {
                Self::Forbidden(e.to_string())
            }
            DomainError::GateNotAffirmed { .. } | DomainError::UnattributedCriteria { .. } => {
                Self::Conflict(e.to_string())
            }
            DomainError::NotFound => Self::NotFound,
            DomainError::Storage(m) => Self::Internal(m),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (code, msg) = match self {
            Self::Forbidden(m) => (StatusCode::FORBIDDEN, m),
            Self::Conflict(m) => (StatusCode::CONFLICT, m),
            Self::NotFound => (StatusCode::NOT_FOUND, "not found".into()),
            Self::Internal(m) => (StatusCode::INTERNAL_SERVER_ERROR, m),
        };
        (code, Json(json!({ "error": msg }))).into_response()
    }
}

#[cfg(test)]
mod tests;
