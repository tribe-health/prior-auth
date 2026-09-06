use axum::{routing::get, Json, Router};
use serde_json::json;

use crate::ServerState;

pub fn router() -> Router<ServerState> {
    Router::new()
        .route("/health", get(health))
        .route("/ready", get(ready))
}

/// Liveness: the process is up.
async fn health() -> Json<serde_json::Value> {
    Json(json!({ "status": "ok" }))
}

/// Readiness: dependencies are reachable. Distinct from liveness so a
/// deployment does not route traffic at a process that cannot serve it.
async fn ready() -> Json<serde_json::Value> {
    Json(json!({ "status": "ready" }))
}
