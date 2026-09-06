//! Tauri desktop shell.
//!
//! The shell owns windowing and IPC. It owns no domain logic: every command
//! below is a thin call into [`aso_host::AppServices`], the same services the
//! Axum binary and the Flutter bridge consume.
//!
//! Two rules this file exists to hold:
//!   * Domain logic never migrates here to "just make the desktop work". If a
//!     rule is needed on desktop it is needed everywhere, so it belongs in the
//!     host crate.
//!   * The custom title bar is a DESKTOP concern. The same React bundle serves
//!     the browser, where the OS draws no window controls — so the title bar is
//!     conditionally rendered on the web side, never unconditionally imported.

use std::sync::Arc;

use aso_host::{domain::*, AppServices};

pub struct DesktopState {
    pub services: Arc<AppServices>,
}

/// Commands mirror the HTTP routes one-for-one so the React client can target
/// either transport without a second data model.
pub mod commands {
    use super::*;

    pub async fn gate_state(
        state: &DesktopState,
        case_id: CaseId,
    ) -> Result<GateState, DomainError> {
        state.services.cases.gate_state(case_id).await
    }

    pub async fn affirm_gate(
        state: &DesktopState,
        actor: ActorId,
        case_id: CaseId,
        kind: GateAffirmationKind,
    ) -> Result<GateState, DomainError> {
        state.services.affirm_gate(actor, case_id, kind).await
    }

    pub async fn sign_letter(
        state: &DesktopState,
        actor: ActorId,
        letter_id: LetterId,
    ) -> Result<Letter, DomainError> {
        state.services.sign_letter(actor, letter_id).await
    }
}
