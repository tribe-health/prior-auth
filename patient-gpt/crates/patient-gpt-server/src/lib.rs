// TJ-ARCH-MOB-001 compliant
//! Axum transport over `AppServices`. Each route mirrors one Tauri command
//! and one FFI function (`docs/plan/scaffold-contracts.md`); no route holds
//! behaviour of its own.

mod error;
mod routes;

use std::path::Path;

use axum::Router;
use axum::http::{HeaderValue, Method, Uri, header};
use axum::routing::any;
use patient_gpt_host::AppServices;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

pub use error::ApiError;

/// The only browser origin allowed cross-origin: the local Vite dev server.
pub const DEV_ORIGIN: &str = "http://localhost:5173";

/// API routes with tracing and the dev-origin CORS policy.
pub fn router(services: AppServices) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(HeaderValue::from_static(DEV_ORIGIN))
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::CONTENT_TYPE]);
    routes::api()
        .with_state(services)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
}

/// Serves the built web app from `dir`, falling back to `index.html` so
/// client-side routes resolve. API routes take precedence, and an unknown
/// `/api` path answers a JSON 404 instead of the HTML page, so a client never
/// parses `index.html` as an API response.
pub fn with_static_dir(router: Router, dir: &Path) -> Router {
    let index = dir.join("index.html");
    let spa = ServeDir::new(dir).fallback(ServeFile::new(index));
    router
        .route("/api", any(unknown_api_path))
        .route("/api/{*rest}", any(unknown_api_path))
        .fallback_service(spa)
}

async fn unknown_api_path(uri: Uri) -> ApiError {
    ApiError::not_found(format!("no API route at {}", uri.path()))
}
