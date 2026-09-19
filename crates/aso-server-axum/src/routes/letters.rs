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
    letter_workflow::{
        ApproveLetterCommand, ConfirmResponseModeCommand, DeterminationResponseModeResult,
        DeterminationSnapshot, GenerateLetterCommand, LetterCommandResult, LetterSnapshot,
        LetterWorkflowError, RecordDeterminationCommand, ReviewLetterCommand,
    },
    signing::{
        SignLetterCommand, SignLetterMutation, SignLetterResult, SigningError, SigningTarget,
    },
};

pub fn router() -> Router<ServerState> {
    Router::new()
        .route("/api/cases/{case_id}/letters", post(generate))
        .route(
            "/api/cases/{case_id}/determinations/latest",
            get(read_latest_determination),
        )
        .route(
            "/api/cases/{case_id}/determinations",
            post(record_determination),
        )
        .route(
            "/api/cases/{case_id}/determinations/response-mode",
            post(confirm_response_mode),
        )
        .route(
            "/api/cases/{case_id}/letter-commands/{command_id}",
            get(lookup_workflow),
        )
        .route("/api/letters/{letter_id}", get(read_letter))
        .route("/api/letters/{letter_id}/qa", post(review_letter))
        .route("/api/letters/{letter_id}/approve", post(approve_letter))
        .route("/api/letters/{letter_id}/sign", post(sign))
        .route("/api/letters/{letter_id}/signing-target", get(read_target))
        .route(
            "/api/letters/{letter_id}/sign/commands/{command_id}",
            get(lookup),
        )
        .layer(middleware::from_fn(no_store))
}

async fn confirm_response_mode(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<SignQuery>, QueryRejection>,
    body: Result<Json<ConfirmResponseModeCommand>, JsonRejection>,
) -> Result<Json<DeterminationResponseModeResult>, Response> {
    let Path(case_id) = path.map_err(|_| invalid_signing_request())?;
    let Query(query) = query.map_err(|_| invalid_signing_request())?;
    let Json(command) = body.map_err(|_| invalid_signing_request())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(workflow_context_error)?;
    state
        .services
        .confirm_response_mode(&context, &capabilities, case_id, &command)
        .await
        .map(Json)
        .map_err(workflow_error)
}

async fn record_determination(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<SignQuery>, QueryRejection>,
    body: Result<Json<RecordDeterminationCommand>, JsonRejection>,
) -> Result<Json<DeterminationSnapshot>, Response> {
    let Path(case_id) = path.map_err(|_| invalid_signing_request())?;
    let Query(query) = query.map_err(|_| invalid_signing_request())?;
    let Json(command) = body.map_err(|_| invalid_signing_request())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(workflow_context_error)?;
    state
        .services
        .record_determination(&context, &capabilities, case_id, &command)
        .await
        .map(Json)
        .map_err(workflow_error)
}

async fn read_latest_determination(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<SignQuery>, QueryRejection>,
) -> Result<Json<DeterminationSnapshot>, Response> {
    let Path(case_id) = path.map_err(|_| invalid_signing_request())?;
    let Query(query) = query.map_err(|_| invalid_signing_request())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(workflow_context_error)?;
    state
        .services
        .read_latest_determination(&context, &capabilities, case_id)
        .await
        .map(Json)
        .map_err(workflow_error)
}

async fn read_target(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<SignQuery>, QueryRejection>,
) -> Result<Json<SigningTarget>, Response> {
    let Path(letter_id) = path.map_err(|_| invalid_signing_request())?;
    let Query(query) = query.map_err(|_| invalid_signing_request())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    if !capabilities
        .iter()
        .any(|capability| capability == "sign_letter")
    {
        return Err(signing_error(SigningError::Denied));
    }
    state
        .services
        .read_signing_target(&context, LetterId(letter_id))
        .await
        .map(Json)
        .map_err(signing_error)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SignQuery {
    practice_id: Option<Uuid>,
}

fn workflow_error(value: LetterWorkflowError) -> Response {
    let (status, code) = match value {
        LetterWorkflowError::Unauthenticated => (StatusCode::UNAUTHORIZED, "session_required"),
        LetterWorkflowError::Denied => (StatusCode::FORBIDDEN, "action_forbidden"),
        LetterWorkflowError::NotFound => (StatusCode::NOT_FOUND, "resource_not_found"),
        LetterWorkflowError::RevisionConflict => (StatusCode::CONFLICT, "stale_revision"),
        LetterWorkflowError::CommandConflict => (StatusCode::CONFLICT, "command_conflict"),
        LetterWorkflowError::GateIncomplete => (StatusCode::CONFLICT, "gate_stale"),
        LetterWorkflowError::EvidenceIncomplete => {
            (StatusCode::CONFLICT, "evidence_work_incomplete")
        }
        LetterWorkflowError::QaIncomplete => (StatusCode::CONFLICT, "qa_incomplete"),
        LetterWorkflowError::CitationIncomplete => {
            (StatusCode::UNPROCESSABLE_ENTITY, "citation_incomplete")
        }
        LetterWorkflowError::Invalid => (StatusCode::BAD_REQUEST, "invalid_request"),
        LetterWorkflowError::Unavailable => {
            (StatusCode::SERVICE_UNAVAILABLE, "service_unavailable")
        }
    };
    (status, Json(json!({"error":code}))).into_response()
}

fn workflow_context_error(value: ClinicalContextError) -> Response {
    match value {
        ClinicalContextError::Session(aso_host::session::SessionError::Unauthenticated) => {
            workflow_error(LetterWorkflowError::Unauthenticated)
        }
        ClinicalContextError::Session(
            aso_host::session::SessionError::Unavailable
            | aso_host::session::SessionError::NativeAuthenticationUnavailable,
        ) => workflow_error(LetterWorkflowError::Unavailable),
        ClinicalContextError::Session(
            aso_host::session::SessionError::ReauthenticationRequired
            | aso_host::session::SessionError::PracticeDenied,
        )
        | ClinicalContextError::NonHuman => workflow_error(LetterWorkflowError::Denied),
    }
}

async fn generate(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<SignQuery>, QueryRejection>,
    body: Result<Json<GenerateLetterCommand>, JsonRejection>,
) -> Result<Json<LetterCommandResult>, Response> {
    let Path(case_id) = path.map_err(|_| invalid_signing_request())?;
    let Query(query) = query.map_err(|_| invalid_signing_request())?;
    let Json(command) = body.map_err(|_| invalid_signing_request())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(workflow_context_error)?;
    state
        .services
        .generate_letter(&context, &capabilities, case_id, &command)
        .await
        .map(Json)
        .map_err(workflow_error)
}

async fn read_letter(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<SignQuery>, QueryRejection>,
) -> Result<Json<LetterSnapshot>, Response> {
    let Path(letter_id) = path.map_err(|_| invalid_signing_request())?;
    let Query(query) = query.map_err(|_| invalid_signing_request())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(workflow_context_error)?;
    state
        .services
        .read_letter(&context, &capabilities, letter_id)
        .await
        .map(Json)
        .map_err(workflow_error)
}

async fn review_letter(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<SignQuery>, QueryRejection>,
    body: Result<Json<ReviewLetterCommand>, JsonRejection>,
) -> Result<Json<LetterCommandResult>, Response> {
    let Path(letter_id) = path.map_err(|_| invalid_signing_request())?;
    let Query(query) = query.map_err(|_| invalid_signing_request())?;
    let Json(command) = body.map_err(|_| invalid_signing_request())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(workflow_context_error)?;
    state
        .services
        .review_letter(&context, &capabilities, letter_id, &command)
        .await
        .map(Json)
        .map_err(workflow_error)
}

async fn approve_letter(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<SignQuery>, QueryRejection>,
    body: Result<Json<ApproveLetterCommand>, JsonRejection>,
) -> Result<Json<LetterCommandResult>, Response> {
    let Path(letter_id) = path.map_err(|_| invalid_signing_request())?;
    let Query(query) = query.map_err(|_| invalid_signing_request())?;
    let Json(command) = body.map_err(|_| invalid_signing_request())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(workflow_context_error)?;
    state
        .services
        .approve_letter(&context, &capabilities, letter_id, &command)
        .await
        .map(Json)
        .map_err(workflow_error)
}

async fn lookup_workflow(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<(Uuid, Uuid)>, PathRejection>,
    query: Result<Query<SignQuery>, QueryRejection>,
) -> Result<Json<LetterCommandResult>, Response> {
    let Path((case_id, command_id)) = path.map_err(|_| invalid_signing_request())?;
    let Query(query) = query.map_err(|_| invalid_signing_request())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(workflow_context_error)?;
    let result = state
        .services
        .lookup_letter_workflow_command(&context, &capabilities, command_id)
        .await
        .map_err(workflow_error)?
        .ok_or_else(|| workflow_error(LetterWorkflowError::NotFound))?;
    if result.case_id != case_id {
        return Err(workflow_error(LetterWorkflowError::NotFound));
    }
    Ok(Json(result))
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
