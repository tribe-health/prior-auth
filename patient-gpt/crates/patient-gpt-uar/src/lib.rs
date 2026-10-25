// TJ-ARCH-MOB-001 compliant
//! UAR runtime adapters behind `patient_gpt_host::UarRuntimeFacade`.
//!
//! Construction goes through an explicit [`UarMode`]. There is no default
//! mode: a silently selected deterministic runtime in production would answer
//! users with canned text and look like a working agent.

mod deterministic;
mod mode;

use std::sync::Arc;

use patient_gpt_host::UarRuntimeFacade;

pub use deterministic::{DETERMINISTIC_REPLY, DeterministicUarRuntime};
pub use mode::{UarConfigError, UarMode};

/// Builds the runtime for an explicitly chosen mode.
pub fn build_runtime(mode: &UarMode) -> Result<Arc<dyn UarRuntimeFacade>, UarConfigError> {
    match mode {
        UarMode::Deterministic => Ok(Arc::new(DeterministicUarRuntime)),
        UarMode::Service { url } => Err(UarConfigError::ServiceNotImplemented { url: url.clone() }),
    }
}
