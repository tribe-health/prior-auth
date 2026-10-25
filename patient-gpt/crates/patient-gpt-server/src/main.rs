// TJ-ARCH-MOB-001 compliant
//! Thin web-server binary: configuration, adapters, listener.
//!
//! Environment:
//! - `PATIENTGPT_UAR_MODE` (required): `deterministic` or `service:<url>`.
//!   There is no default; an unset mode fails startup.
//! - `PATIENTGPT_ADDR` (default `127.0.0.1:8787`).
//! - `PATIENTGPT_STATIC_DIR` (optional): built web app to serve with SPA fallback.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;

use patient_gpt_host::AppServices;
use patient_gpt_host::fixture::SyntheticClinicalFixture;
use patient_gpt_storage::InMemoryConversationStore;
use patient_gpt_uar::{UarMode, build_runtime};
use tracing_subscriber::EnvFilter;

const DEFAULT_ADDR: &str = "127.0.0.1:8787";

#[tokio::main]
async fn main() -> ExitCode {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            tracing::error!("{message}");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> Result<(), String> {
    let mode: UarMode = std::env::var("PATIENTGPT_UAR_MODE")
        .map_err(|_| {
            "PATIENTGPT_UAR_MODE is not set; expected `deterministic` or `service:<url>`".to_owned()
        })?
        .parse()
        .map_err(|err| format!("{err}"))?;
    let runtime = build_runtime(&mode).map_err(|err| format!("{err}"))?;
    let addr: SocketAddr = std::env::var("PATIENTGPT_ADDR")
        .unwrap_or_else(|_| DEFAULT_ADDR.to_owned())
        .parse()
        .map_err(|err| format!("PATIENTGPT_ADDR is not a socket address: {err}"))?;

    let services = AppServices::new(
        Arc::new(SyntheticClinicalFixture),
        Arc::new(InMemoryConversationStore::new()),
        runtime,
    );
    let mut app = patient_gpt_server::router(services);
    if let Ok(dir) = std::env::var("PATIENTGPT_STATIC_DIR") {
        let dir = PathBuf::from(dir);
        if !dir.join("index.html").is_file() {
            return Err(format!(
                "PATIENTGPT_STATIC_DIR {} has no index.html",
                dir.display()
            ));
        }
        tracing::info!("serving web app from {}", dir.display());
        app = patient_gpt_server::with_static_dir(app, &dir);
    }

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|err| format!("cannot bind {addr}: {err}"))?;
    tracing::info!(uar_mode = %mode, "patient-gpt-server listening on http://{addr}");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(|err| format!("server failed: {err}"))
}

async fn shutdown_signal() {
    if let Err(err) = tokio::signal::ctrl_c().await {
        tracing::error!("cannot listen for shutdown signal: {err}");
    }
}
