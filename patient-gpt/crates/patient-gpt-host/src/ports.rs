// TJ-ARCH-MOB-001 compliant
//! Ports the host depends on. Adapters implement them in other crates; the
//! host never names a database driver, a shell, or an agent kernel.

use async_trait::async_trait;
use futures::stream::BoxStream;
use patient_gpt_domain::{
    AguiEvent, CaseSummary, ConversationScope, ConversationSummary, PatientSummary, RunRequest,
    Session,
};

use crate::HostError;

/// The event stream of one agent run.
pub type AguiStream = BoxStream<'static, AguiEvent>;

/// Read-only view of the ASO clinical record for the signed-in principal.
///
/// Clinical records are never written through this port. The session lives
/// here because every clinical read is made on behalf of that principal.
#[async_trait]
pub trait ClinicalReadPort: Send + Sync {
    async fn session(&self) -> Result<Session, HostError>;
    async fn list_patients(&self) -> Result<Vec<PatientSummary>, HostError>;
    /// `NotFound` when the patient is not visible to the principal.
    async fn list_cases(&self, patient_id: &str) -> Result<Vec<CaseSummary>, HostError>;
}

/// Conversation records (local lane). Intent-level only: no query language
/// crosses this boundary.
#[async_trait]
pub trait ConversationStore: Send + Sync {
    /// Conversations whose scope equals `scope` exactly, newest first.
    async fn list(&self, scope: &ConversationScope) -> Result<Vec<ConversationSummary>, HostError>;
    async fn get(&self, id: &str) -> Result<Option<ConversationSummary>, HostError>;
    /// Inserts or replaces the conversation with the same id.
    async fn put(&self, conversation: ConversationSummary) -> Result<(), HostError>;
}

/// The one way into agent execution. UAR owns the loop and tool governance;
/// the host never runs a competing loop. An agent behind this port cannot
/// affirm, sign, submit or record outcomes: those are host commands.
#[async_trait]
pub trait UarRuntimeFacade: Send + Sync {
    /// `request.conversation_id` is always set by the host before this call.
    async fn start_run(&self, request: RunRequest) -> Result<AguiStream, HostError>;
}
