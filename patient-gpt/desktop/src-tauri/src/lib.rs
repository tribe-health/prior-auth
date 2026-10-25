// TJ-ARCH-MOB-001 compliant
//! PatientGPT desktop shell.
//!
//! The shell supplies transport and window capabilities only. The React UI is
//! `web/`, shared with the browser build; clinical and conversation behaviour
//! is `patient_gpt_host::AppServices`, shared with Axum and the Flutter FFI.
//!
//! Environment: `PATIENTGPT_UAR_MODE` (required) — `deterministic` or
//! `service:<url>`. There is no default.

mod commands;
mod config;
mod error;
mod window;

use std::process::ExitCode;
use std::sync::Arc;

use patient_gpt_host::AppServices;
use patient_gpt_host::UarRuntimeFacade;
use patient_gpt_host::fixture::SyntheticClinicalFixture;
use patient_gpt_storage::SurrealConversationStore;
use patient_gpt_uar::build_runtime;
use tauri::Manager;
use tracing_subscriber::EnvFilter;

/// RocksDB directory for the local conversation lane, under the app data dir.
const CONVERSATION_STORE_DIR: &str = "conversations.surrealdb";

pub fn run() -> ExitCode {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();
    let runtime = match configured_runtime() {
        Ok(runtime) => runtime,
        Err(message) => {
            tracing::error!("{message}");
            return ExitCode::FAILURE;
        }
    };
    let result = tauri::Builder::default()
        // Registered first: the embedded store locks its directory, so a
        // second process must hand off to the running one and exit.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            window::focus_main(app);
        }))
        .setup(move |app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let store_dir = data_dir.join(CONVERSATION_STORE_DIR);
            tracing::info!(path = %store_dir.display(), "conversation store (SurrealDB, local lane)");
            let services = AppServices::new(
                Arc::new(SyntheticClinicalFixture),
                Arc::new(SurrealConversationStore::new(store_dir)),
                runtime,
            );
            app.manage(services);
            window::build_main(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::health,
            commands::session,
            commands::list_patients,
            commands::list_cases,
            commands::list_conversations,
            commands::start_run,
        ])
        .run(tauri::generate_context!());
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            tracing::error!("desktop shell failed: {err}");
            ExitCode::FAILURE
        }
    }
}

fn configured_runtime() -> Result<Arc<dyn UarRuntimeFacade>, String> {
    let mode = config::uar_mode()?;
    let runtime = build_runtime(&mode).map_err(|err| format!("{err}"))?;
    tracing::info!(uar_mode = %mode, "agent runtime selected");
    Ok(runtime)
}
