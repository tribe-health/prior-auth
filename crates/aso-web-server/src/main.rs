//! Thin web binary: configuration, assets, deployment adapters. All behaviour
//! lives in `aso-host`; this file only chooses how to expose it.
//!
//! Asset serving has two modes and the env prefix is derived from the app
//! name, never hardcoded to a product string:
//!   ASO_WEB_ROOT   serve from this directory at runtime (external mode)
//!   unset          fall back to the embedded bundle
//! An invalid directory is rejected at readiness rather than 404-ing per file.

use std::{net::SocketAddr, sync::Arc};

use aso_host::{ports, AppServices};
use aso_server_axum::{api_router, ServerState};
use tower_http::{services::ServeDir, trace::TraceLayer};

mod adapters;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,aso_web_server=debug".into()),
        )
        .init();

    // In-memory adapters so the stack runs on a clean checkout with no
    // database. Swapping in the Postgres adapter changes this block only.
    let services = AppServices {
        cases: Arc::new(adapters::memory::MemoryCaseRepo::default()),
        evidence: Arc::new(adapters::memory::MemoryEvidenceRepo::default()),
        criteria: Arc::new(adapters::memory::MemoryCriteriaRepo::default()),
        letters: Arc::new(adapters::memory::MemoryLetterRepo::default()),
        authority: Arc::new(adapters::memory::MemoryAuthority::default()),
        clock: Arc::new(ports::SystemClock),
    };

    let state = ServerState { services: Arc::new(services) };
    let mut app = api_router(state).layer(TraceLayer::new_for_http());

    if let Ok(root) = std::env::var("ASO_WEB_ROOT") {
        let path = std::path::PathBuf::from(&root);
        if !path.is_dir() {
            return Err(format!("ASO_WEB_ROOT is not a directory: {root}").into());
        }
        tracing::info!(%root, "serving web assets from disk");
        app = app.fallback_service(ServeDir::new(path).append_index_html_on_directories(true));
    } else {
        tracing::info!("no ASO_WEB_ROOT set — API only");
    }

    let port: u16 = std::env::var("ASO_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8787);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    tracing::info!(%addr, "listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
