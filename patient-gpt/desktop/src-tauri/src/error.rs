// TJ-ARCH-MOB-001 compliant
//! Command errors. The serialized shape is the HTTP error body
//! (`{ code, message }`) and the codes are the same ones the Axum routes use.

use patient_gpt_host::HostError;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct CommandError {
    code: &'static str,
    message: String,
}

impl CommandError {
    /// Request-shape errors, mirroring `ApiError::bad_request` in the server.
    pub fn bad_request(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    /// Desktop-only: the webview stopped accepting stream events.
    pub fn event_delivery(err: &tauri::Error) -> Self {
        tracing::error!(
            code = "event_delivery_failed",
            "AG-UI event delivery failed: {err}"
        );
        Self {
            code: "event_delivery_failed",
            message: format!("AG-UI event delivery failed: {err}"),
        }
    }
}

impl From<HostError> for CommandError {
    fn from(err: HostError) -> Self {
        if matches!(err, HostError::Storage(_) | HostError::Runtime(_)) {
            tracing::error!(code = err.code(), "command failed: {err}");
        }
        Self {
            code: err.code(),
            message: err.to_string(),
        }
    }
}
