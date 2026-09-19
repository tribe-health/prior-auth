//! HTTP surface: an AG-UI run endpoint for the channel, a plain REST
//! endpoint for the host command, and read-only catalog and health routes.

use std::sync::Arc;

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::json;

use crate::contract::AssembleRequest;
use crate::packages::Catalog;
use crate::service::{self, AssembleError};
use crate::task_host::TaskHost;

#[derive(Clone)]
pub struct AgentState {
    pub catalog: Arc<Catalog>,
    pub task_host: TaskHost,
    pub assembly_token: Arc<str>,
    pub public_url: Arc<str>,
    pub web_public_url: Option<Arc<str>>,
    pub allowed_origins: Arc<Vec<String>>,
    pub mcp_app_html: Option<Arc<str>>,
}

pub fn router(state: AgentState) -> Router {
    let mcp = crate::mcp::service(state.clone());
    Router::new()
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
        .route("/v1/kinds", get(kinds))
        .route("/v1/packages", get(packages))
        .route("/v1/assemble", post(assemble))
        .route("/agent/run", post(crate::agui::run))
        .route("/agent/cancel", post(crate::agui::cancel))
        .route("/.well-known/agent-card.json", get(crate::a2a::card))
        .route("/a2a", post(crate::a2a::handle))
        .nest_service("/mcp", mcp)
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            origin_boundary,
        ))
        .with_state(state)
}

async fn healthz() -> &'static str {
    "ok"
}

async fn readyz(State(s): State<AgentState>) -> Response {
    let ready = !s.catalog.kinds.is_empty();
    let body = json!({ "ready": ready, "packages": s.catalog.packages.len(), "kinds": s.catalog.kinds.len() });
    let status = if ready {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    (status, Json(body)).into_response()
}

async fn kinds(State(s): State<AgentState>) -> Json<serde_json::Value> {
    let list: Vec<serde_json::Value> = s
        .catalog
        .kinds
        .iter()
        .map(|k| {
            let digest = s.catalog.package_for(k).map(|p| p.digest());
            json!({
                "key": k.key, "version": k.version, "class": k.class,
                "templatePackage": k.template_package, "packageDigest": digest,
                "root": k.root, "qaChecks": k.qa_checks, "outputs": k.outputs,
                "citationPolicy": k.citation_policy(),
                "leavesPractice": k.class.leaves_practice(),
                "finalizeCapability": k.class.finalize_capability(),
            })
        })
        .collect();
    Json(json!({ "kinds": list }))
}

async fn packages(State(s): State<AgentState>) -> Json<serde_json::Value> {
    let list: Vec<serde_json::Value> = s
        .catalog
        .packages
        .values()
        .map(|p| json!({ "name": p.name, "digest": p.digest(), "files": p.files.len() }))
        .collect();
    Json(json!({ "packages": list }))
}

fn error_response(e: &AssembleError) -> Response {
    let status = match e {
        AssembleError::UnknownKind(_) | AssembleError::PackageNotLoaded(..) => {
            StatusCode::NOT_FOUND
        }
        AssembleError::PackageDigestMismatch { .. } => StatusCode::CONFLICT,
        AssembleError::Refused(_) | AssembleError::Template(_) => StatusCode::UNPROCESSABLE_ENTITY,
    };
    (
        status,
        Json(json!({ "error": e.to_string(), "code": e.code() })),
    )
        .into_response()
}

async fn assemble(
    State(s): State<AgentState>,
    headers: HeaderMap,
    Json(req): Json<AssembleRequest>,
) -> Response {
    if headers.get("authorization").and_then(|v| v.to_str().ok())
        != Some(&format!("Bearer {}", s.assembly_token))
    {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match service::run(&s.catalog, &req) {
        Ok(resp) => (StatusCode::OK, Json(resp)).into_response(),
        Err(e) => error_response(&e),
    }
}

/// Browsers cannot use an ambient session cookie from an unapproved origin.
async fn origin_boundary(
    State(state): State<AgentState>,
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> Response {
    if let Some(origin) = request.headers().get("origin") {
        if !origin
            .to_str()
            .is_ok_and(|value| state.allowed_origins.iter().any(|allowed| allowed == value))
        {
            return StatusCode::FORBIDDEN.into_response();
        }
    } else if request.method() != axum::http::Method::GET
        && request.headers().contains_key("cookie")
        && !request.headers().contains_key("x-session-token")
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    let mut response = next.run(request).await;
    response.headers_mut().insert(
        "cache-control",
        axum::http::HeaderValue::from_static("no-store"),
    );
    response
}
