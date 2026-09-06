use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use serde_json::json;
use uuid::Uuid;

use crate::ServerState;
use aso_host::domain::{ActorId, DomainError, LetterId};

pub fn router() -> Router<ServerState> {
    Router::new().route("/api/letters/{letter_id}/sign", post(sign))
}

#[derive(serde::Deserialize)]
struct SignRequest {
    actor: Uuid,
}

async fn sign(
    State(state): State<ServerState>,
    Path(letter_id): Path<Uuid>,
    Json(req): Json<SignRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let letter = state
        .services
        .sign_letter(ActorId(req.actor), LetterId(letter_id))
        .await?;
    Ok(Json(json!({ "id": letter.id, "status": letter.status, "signedAt": letter.signed_at })))
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
