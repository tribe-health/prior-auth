use axum::{extract::{Path, State}, routing::get, Json, Router};
use serde::Serialize;
use uuid::Uuid;

use crate::ServerState;
use aso_host::domain::CaseId;

pub fn router() -> Router<ServerState> {
    Router::new().route("/api/cases/{case_id}/evidence", get(evidence_counts))
}

/// The three counts the dashboard tiles read.
///
/// `void` is serialized alongside `gap` rather than folded into it — a client
/// that only knows two states cannot render this response, which is the point.
#[derive(Serialize)]
struct EvidenceCountsDto {
    met: u32,
    gap: u32,
    void: u32,
}

async fn evidence_counts(
    State(state): State<ServerState>,
    Path(case_id): Path<Uuid>,
) -> Result<Json<EvidenceCountsDto>, crate::routes::letters::ApiError> {
    let c = state.services.evidence.counts(CaseId(case_id)).await?;
    Ok(Json(EvidenceCountsDto { met: c.met, gap: c.gap, void: c.void }))
}
