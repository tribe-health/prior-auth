// TJ-ARCH-MOB-001 compliant
//! Maps `HostError` and request-shape errors to HTTP.

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use patient_gpt_host::HostError;
use serde::Serialize;

#[derive(Debug, Serialize)]
struct ErrorBody {
    code: &'static str,
    message: String,
}

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    code: &'static str,
    message: String,
}

impl ApiError {
    pub fn bad_request(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            code,
            message: message.into(),
        }
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            code: "not_found",
            message: message.into(),
        }
    }
}

impl From<HostError> for ApiError {
    fn from(err: HostError) -> Self {
        let status = match err {
            HostError::InvalidInput(_) => StatusCode::BAD_REQUEST,
            HostError::NotFound(_) => StatusCode::NOT_FOUND,
            HostError::NotImplemented(_) => StatusCode::NOT_IMPLEMENTED,
            HostError::Storage(_) | HostError::Runtime(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
        if status.is_server_error() {
            tracing::error!(code = err.code(), "request failed: {err}");
        }
        Self {
            status,
            code: err.code(),
            message: err.to_string(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = ErrorBody {
            code: self.code,
            message: self.message,
        };
        (self.status, Json(body)).into_response()
    }
}
