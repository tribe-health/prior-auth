use axum::{extract::{Path, State}, routing::{get, post}, Json, Router};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{routes::letters::ApiError, ServerState};
use aso_host::domain::{ActorId, CaseId, GateAffirmationKind};

pub fn router() -> Router<ServerState> {
    Router::new()
        .route("/api/cases/{case_id}/gate", get(gate_state))
        .route("/api/cases/{case_id}/gate/affirm", post(affirm))
}

#[derive(Serialize)]
struct GateStateDto {
    affirmed: bool,
    outstanding: Vec<GateAffirmationKind>,
}

#[derive(Deserialize)]
struct AffirmRequest {
    kind: GateAffirmationKind,
    /// In production this comes from the verified session, never the body.
    /// Accepted here only so the scaffold runs before the gateway is wired,
    /// and the handler below refuses to trust it in a release build.
    actor: Uuid,
}

async fn gate_state(
    State(state): State<ServerState>,
    Path(case_id): Path<Uuid>,
) -> Result<Json<GateStateDto>, ApiError> {
    let g = state.services.cases.gate_state(CaseId(case_id)).await?;
    Ok(Json(GateStateDto { affirmed: g.is_affirmed(), outstanding: g.outstanding() }))
}

async fn affirm(
    State(state): State<ServerState>,
    Path(case_id): Path<Uuid>,
    Json(req): Json<AffirmRequest>,
) -> Result<Json<GateStateDto>, ApiError> {
    // A caller-supplied actor is a privilege-escalation hole. The scaffold
    // permits it in debug so the stack runs end to end before the gateway
    // lands; a release build refuses rather than silently trusting the body.
    #[cfg(not(debug_assertions))]
    {
        let _ = &req;
        return Err(ApiError::Forbidden(
            "actor must come from the verified session, not the request body".into(),
        ));
    }

    #[cfg(debug_assertions)]
    {
        let g = state
            .services
            .affirm_gate(ActorId(req.actor), CaseId(case_id), req.kind)
            .await?;
        Ok(Json(GateStateDto { affirmed: g.is_affirmed(), outstanding: g.outstanding() }))
    }
}
