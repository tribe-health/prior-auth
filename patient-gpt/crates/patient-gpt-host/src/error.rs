// TJ-ARCH-MOB-001 compliant
//! One error type for every port and service, so each shell maps it to its own
//! transport (HTTP status, Tauri error string, Dart exception) the same way.

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum HostError {
    #[error("{0}")]
    InvalidInput(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    NotImplemented(String),
    #[error("storage failed: {0}")]
    Storage(String),
    #[error("agent runtime failed: {0}")]
    Runtime(String),
}

impl HostError {
    /// Stable machine-readable code for transports.
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidInput(_) => "invalid_input",
            Self::NotFound(_) => "not_found",
            Self::NotImplemented(_) => "not_implemented",
            Self::Storage(_) => "storage_failed",
            Self::Runtime(_) => "runtime_failed",
        }
    }
}
