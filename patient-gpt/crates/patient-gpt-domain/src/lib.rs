// TJ-ARCH-MOB-001 compliant
//! Shell-independent PatientGPT contract types.
//!
//! These are the DTOs frozen in `docs/plan/scaffold-contracts.md`. Axum, Tauri
//! and the Flutter FFI all serialize exactly these shapes; a change here is a
//! change to every surface.

pub mod agui;
pub mod clinical;
pub mod content_block;
pub mod conversation;
pub mod principal;

pub use agui::{AguiEvent, MessageRole};
pub use clinical::{CaseDue, CaseSummary, Citation, CriteriaTally, EvidenceState, PatientSummary};
pub use content_block::{ContentBlock, ToolStatus};
pub use conversation::{ConversationScope, ConversationSummary, RunRequest, ScopeParseError};
pub use principal::{Health, Principal, PrincipalKind, Role, Session};
