// TJ-ARCH-MOB-001 compliant
//! Process-wide state: one Tokio runtime and one `AppServices`.
//!
//! Flutter has no local replica (docs/plan/scaffold-contracts.md, storage
//! lanes), so conversations live in the in-memory store and are lost when the
//! process ends. The clinical port is the synthetic fixture.

use std::future::Future;
use std::sync::{Arc, OnceLock};

use patient_gpt_host::fixture::SyntheticClinicalFixture;
use patient_gpt_host::{AppServices, HostError};
use patient_gpt_storage::InMemoryConversationStore;
use patient_gpt_uar::{UarMode, build_runtime};
use tokio::runtime::Runtime;

use crate::api::patient_gpt::FfiError;

struct Core {
    mode: UarMode,
    services: AppServices,
    runtime: Runtime,
}

static CORE: OnceLock<Core> = OnceLock::new();

fn error(code: &str, message: impl Into<String>) -> FfiError {
    FfiError {
        code: code.to_owned(),
        message: message.into(),
    }
}

impl From<HostError> for FfiError {
    fn from(err: HostError) -> Self {
        error(err.code(), err.to_string())
    }
}

pub(crate) fn init(raw_mode: &str) -> Result<(), FfiError> {
    let mode: UarMode = raw_mode
        .parse()
        .map_err(|err| error("invalid_uar_mode", format!("{err}")))?;
    if let Some(existing) = CORE.get() {
        return same_mode(existing, &mode);
    }
    let agent_runtime =
        build_runtime(&mode).map_err(|err| error("uar_unavailable", format!("{err}")))?;
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .thread_name("patient-gpt-ffi")
        .enable_all()
        .build()
        .map_err(|err| {
            error(
                "runtime_failed",
                format!("cannot start Tokio runtime: {err}"),
            )
        })?;
    let services = AppServices::new(
        Arc::new(SyntheticClinicalFixture),
        Arc::new(InMemoryConversationStore::new()),
        agent_runtime,
    );
    let core = CORE.get_or_init(|| Core {
        mode: mode.clone(),
        services,
        runtime,
    });
    same_mode(core, &mode)
}

fn same_mode(core: &Core, mode: &UarMode) -> Result<(), FfiError> {
    if &core.mode == mode {
        Ok(())
    } else {
        Err(error(
            "already_initialized",
            format!("initialized with UAR mode `{}`, not `{mode}`", core.mode),
        ))
    }
}

fn core() -> Result<&'static Core, FfiError> {
    CORE.get()
        .ok_or_else(|| error("not_initialized", "init(uar_mode) has not been called"))
}

pub(crate) fn services() -> Result<AppServices, FfiError> {
    Ok(core()?.services.clone())
}

/// Runs `work` on the one Tokio runtime, whichever executor awaits it.
pub(crate) async fn on_runtime<T, F>(work: F) -> Result<T, FfiError>
where
    T: Send + 'static,
    F: Future<Output = Result<T, HostError>> + Send + 'static,
{
    core()?
        .runtime
        .spawn(work)
        .await
        .map_err(|err| error("runtime_join_failed", format!("{err}")))?
        .map_err(FfiError::from)
}
