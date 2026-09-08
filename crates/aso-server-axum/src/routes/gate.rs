//! Every gate request resolves raw credentials afresh. Gateway identity hints
//! and request bodies never supply actor, principal or practice authority.
use crate::{
    ServerState,
    session::{ClinicalContextError, clinical_context, session_error},
};
#[cfg(test)]
use aso_host::session::Principal;
use aso_host::{
    affirmation::*, domain::LetterId, reassessment::ReassessmentError, signing::SigningError,
};
use axum::{
    Json, Router,
    extract::{
        Path, Query, Request, State,
        rejection::{JsonRejection, PathRejection, QueryRejection},
    },
    http::{HeaderMap, StatusCode, Uri, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GateQuery {
    practice_id: Option<Uuid>,
}

pub fn router() -> Router<ServerState> {
    Router::new()
        .route("/api/cases/{case_id}/gate", get(gate_state))
        .route("/api/cases/{case_id}/gate/affirm", post(affirm))
        .route("/api/cases/{case_id}/gate/remove", post(remove))
        .route(
            "/api/cases/{case_id}/gate/commands/{command_id}",
            get(lookup),
        )
        // Read-only callback for Gate, not an IPC operation.
        .route("/internal/gate/authorize", post(authorize))
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
    error(StatusCode::BAD_REQUEST, "invalid_gate_request")
}
fn gate_error(value: GateError) -> Response {
    let (status, code) = match value {
        GateError::Unauthenticated => (StatusCode::UNAUTHORIZED, "unauthenticated"),
        GateError::Denied => (StatusCode::FORBIDDEN, "gate_denied"),
        GateError::NotFound => (StatusCode::NOT_FOUND, "gate_not_found"),
        GateError::CommandConflict => (StatusCode::CONFLICT, "command_conflict"),
        GateError::Unavailable | GateError::NativeAuthenticationUnavailable => {
            (StatusCode::SERVICE_UNAVAILABLE, "gate_unavailable")
        }
    };
    error(status, code)
}
fn context_error(value: ClinicalContextError) -> Response {
    match value {
        ClinicalContextError::Session(error) => session_error(error),
        ClinicalContextError::NonHuman => gate_error(GateError::Denied),
    }
}
fn signing_policy_error(value: SigningError) -> Response {
    let error = match value {
        SigningError::Unauthenticated => GateError::Unauthenticated,
        SigningError::Denied | SigningError::NotFound => GateError::Denied,
        SigningError::RevisionConflict
        | SigningError::SignatureConflict
        | SigningError::NotApproved
        | SigningError::GateNotAffirmed
        | SigningError::QaIncomplete
        | SigningError::SourceIncomplete
        | SigningError::CommandConflict => GateError::CommandConflict,
        SigningError::Unavailable => GateError::Unavailable,
        SigningError::NativeAuthenticationUnavailable => GateError::NativeAuthenticationUnavailable,
    };
    gate_error(error)
}
fn reassessment_policy_error(value: ReassessmentError) -> Response {
    let error = match value {
        ReassessmentError::Unauthenticated => GateError::Unauthenticated,
        ReassessmentError::Denied | ReassessmentError::NotFound => GateError::Denied,
        ReassessmentError::RevisionConflict | ReassessmentError::CommandConflict => {
            GateError::CommandConflict
        }
        ReassessmentError::Unavailable => GateError::Unavailable,
        ReassessmentError::NativeAuthenticationUnavailable => {
            GateError::NativeAuthenticationUnavailable
        }
    };
    gate_error(error)
}
async fn gate_state(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<GateQuery>, QueryRejection>,
) -> Result<Json<GateSnapshot>, Response> {
    let Path(case_id) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, _) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    state
        .services
        .read_verified_gate(&context, case_id)
        .await
        .map(Json)
        .map_err(gate_error)
}
async fn mutate(
    state: ServerState,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<GateQuery>, QueryRejection>,
    body: Result<Json<GateMutation>, JsonRejection>,
    action: GateAction,
) -> Result<Json<GateCommandResult>, Response> {
    let Path(case_id) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let Json(request) = body.map_err(|_| invalid())?;
    let (context, _) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    let command = GateCommand {
        command_id: request.command_id,
        case_id,
        kind: request.kind,
        action,
    };
    state
        .services
        .execute_gate_command(&context, &command)
        .await
        .map(Json)
        .map_err(gate_error)
}
async fn affirm(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<GateQuery>, QueryRejection>,
    body: Result<Json<GateMutation>, JsonRejection>,
) -> Result<Json<GateCommandResult>, Response> {
    mutate(state, headers, path, query, body, GateAction::Affirm).await
}
async fn remove(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<GateQuery>, QueryRejection>,
    body: Result<Json<GateMutation>, JsonRejection>,
) -> Result<Json<GateCommandResult>, Response> {
    mutate(state, headers, path, query, body, GateAction::Remove).await
}
async fn lookup(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<(Uuid, Uuid)>, PathRejection>,
    query: Result<Query<GateQuery>, QueryRejection>,
) -> Result<Json<GateCommandResult>, Response> {
    let Path((case_id, command_id)) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, _) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    state
        .services
        .read_verified_gate(&context, case_id)
        .await
        .map_err(gate_error)?;
    state
        .services
        .lookup_gate_command(&context, command_id)
        .await
        .map_err(gate_error)?
        .filter(|result| result.case_id == case_id)
        .map(Json)
        .ok_or_else(|| gate_error(GateError::NotFound))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PolicyRequest {
    method: String,
    uri: String,
}

/// Independent read-only policy for Gate; never calls the clinical command or
/// relies on its later write trigger. Only 204 authorizes forwarding.
async fn authorize(
    State(state): State<ServerState>,
    headers: HeaderMap,
    body: Result<Json<PolicyRequest>, JsonRejection>,
) -> Result<StatusCode, Response> {
    let Json(request) = body.map_err(|_| invalid())?;
    let uri: Uri = request.uri.parse().map_err(|_| invalid())?;
    if uri.scheme().is_some() || uri.authority().is_some() {
        return Err(invalid());
    }
    let parts: Vec<_> = uri.path().trim_start_matches('/').split('/').collect();
    enum PolicyTarget {
        Gate(Uuid, bool),
        Letter(LetterId),
        Evidence(Uuid, Uuid),
    }
    let target = match (request.method.as_str(), parts.as_slice()) {
        ("POST", ["api", "cases", case, "gate", "affirm" | "remove"]) => {
            PolicyTarget::Gate(Uuid::parse_str(case).map_err(|_| invalid())?, true)
        }
        ("GET", ["api", "cases", case, "gate"]) => {
            PolicyTarget::Gate(Uuid::parse_str(case).map_err(|_| invalid())?, false)
        }
        ("GET", ["api", "cases", case, "gate", "commands", command])
            if Uuid::parse_str(command).is_ok() =>
        {
            PolicyTarget::Gate(Uuid::parse_str(case).map_err(|_| invalid())?, false)
        }
        ("POST", ["api", "letters", letter, "sign"]) => {
            PolicyTarget::Letter(LetterId(Uuid::parse_str(letter).map_err(|_| invalid())?))
        }
        ("GET", ["api", "letters", letter, "sign", "commands", command])
            if Uuid::parse_str(command).is_ok() =>
        {
            PolicyTarget::Letter(LetterId(Uuid::parse_str(letter).map_err(|_| invalid())?))
        }
        ("POST", ["api", "cases", case, "evidence", evidence, "state"]) => PolicyTarget::Evidence(
            Uuid::parse_str(case).map_err(|_| invalid())?,
            Uuid::parse_str(evidence).map_err(|_| invalid())?,
        ),
        (
            "GET",
            [
                "api",
                "cases",
                case,
                "evidence",
                evidence,
                "commands",
                command,
            ],
        ) if Uuid::parse_str(command).is_ok() => PolicyTarget::Evidence(
            Uuid::parse_str(case).map_err(|_| invalid())?,
            Uuid::parse_str(evidence).map_err(|_| invalid())?,
        ),
        _ => return Err(invalid()),
    };
    let Query(query) = Query::<GateQuery>::try_from_uri(&uri).map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    match target {
        PolicyTarget::Gate(case_id, clinical) => {
            if clinical
                && !capabilities
                    .iter()
                    .any(|capability| capability == "affirm_gate")
            {
                return Err(gate_error(GateError::Denied));
            }
            state
                .services
                .read_verified_gate(&context, case_id)
                .await
                .map_err(gate_error)?;
        }
        PolicyTarget::Letter(letter_id) => {
            if !capabilities
                .iter()
                .any(|capability| capability == "sign_letter")
            {
                return Err(gate_error(GateError::Denied));
            }
            state
                .services
                .read_signing_target(&context, letter_id)
                .await
                .map_err(signing_policy_error)?;
        }
        PolicyTarget::Evidence(case_id, evidence_id) => {
            if !capabilities
                .iter()
                .any(|capability| capability == "annotate")
            {
                return Err(gate_error(GateError::Denied));
            }
            state
                .services
                .read_reassessment_target(&context, case_id, evidence_id)
                .await
                .map_err(reassessment_policy_error)?;
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests;
