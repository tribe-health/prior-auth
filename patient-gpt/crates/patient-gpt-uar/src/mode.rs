// TJ-ARCH-MOB-001 compliant
//! UAR mode selection. Unknown values are rejected loudly.

use std::fmt;
use std::str::FromStr;

/// Text form: `deterministic` or `service:<url>`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UarMode {
    /// Fixed, contract-shaped events. For local builds and demos only.
    Deterministic,
    /// A governed UAR service. Not implemented in the scaffold.
    Service { url: String },
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum UarConfigError {
    #[error("unknown UAR mode `{0}`; expected `deterministic` or `service:<url>`")]
    UnknownMode(String),
    #[error("UAR mode `service` requires a URL: `service:<url>`")]
    MissingServiceUrl,
    #[error("UAR service mode ({url}) is not implemented in this build")]
    ServiceNotImplemented { url: String },
}

impl FromStr for UarMode {
    type Err = UarConfigError;

    fn from_str(raw: &str) -> Result<Self, Self::Err> {
        match raw.split_once(':') {
            None if raw == "deterministic" => Ok(Self::Deterministic),
            None if raw == "service" => Err(UarConfigError::MissingServiceUrl),
            Some(("service", "")) => Err(UarConfigError::MissingServiceUrl),
            Some(("service", url)) => Ok(Self::Service {
                url: url.to_owned(),
            }),
            _ => Err(UarConfigError::UnknownMode(raw.to_owned())),
        }
    }
}

impl fmt::Display for UarMode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Deterministic => f.write_str("deterministic"),
            Self::Service { url } => write!(f, "service:{url}"),
        }
    }
}
