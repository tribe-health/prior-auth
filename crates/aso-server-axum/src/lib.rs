//! Reusable Axum router over [`aso_host::AppServices`].
//!
//! The eight-step request sequence this layer owes every request:
//!
//!   1. validate request shape and size
//!   2. resolve a verified session by SERVER-SIDE validation
//!   3. derive tenant, actor, and allowed persona from it
//!   4. authorize the action and resource against policy
//!   5. submit an idempotent command with bounded budgets
//!   6. stream typed events with correlation and resume IDs
//!   7. propagate disconnect or explicit cancel
//!   8. persist an immutable, redacted outcome
//!
//! Never accept a caller-selected tenant, role, or raw tool permission — those
//! arrive from the verified session or not at all.

pub mod routes;
pub mod session;

use aso_host::AppServices;
use axum::Router;
use std::sync::Arc;

#[derive(Clone)]
pub struct ServerState {
    pub services: Arc<AppServices>,
}

/// Build the API router. Static asset serving is the binary's job, not this
/// crate's, so the same router serves the desktop shell unchanged.
pub fn api_router(state: ServerState) -> Router {
    Router::new()
        .merge(routes::health::router())
        .merge(session::router())
        .merge(routes::annotations::router())
        .merge(routes::administering_entity::router())
        .merge(routes::cases::router())
        .merge(routes::criteria::router())
        .merge(routes::criteria_selection::router())
        .merge(routes::documents::router())
        .merge(routes::document_tasks::router())
        .merge(routes::evidence::router())
        .merge(routes::gate::router())
        .merge(routes::letters::router())
        .merge(routes::sources::router())
        .merge(routes::submissions::router())
        .with_state(state)
}
