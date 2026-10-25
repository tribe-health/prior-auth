// TJ-ARCH-MOB-001 compliant
//! Deterministic runtime: one fixed assistant message, no chart access.

use async_trait::async_trait;
use futures::StreamExt;
use futures::stream;
use patient_gpt_domain::{AguiEvent, MessageRole, RunRequest};
use patient_gpt_host::{AguiStream, HostError, UarRuntimeFacade};

/// Verbatim from `docs/plan/scaffold-contracts.md`.
pub const DETERMINISTIC_REPLY: &str =
    "The agent runtime is not connected in this build. No chart content was read.";

#[derive(Debug, Default, Clone, Copy)]
pub struct DeterministicUarRuntime;

#[async_trait]
impl UarRuntimeFacade for DeterministicUarRuntime {
    async fn start_run(&self, request: RunRequest) -> Result<AguiStream, HostError> {
        let thread_id = request.conversation_id.ok_or_else(|| {
            HostError::Runtime(
                "run request reached the runtime without a conversation id".to_owned(),
            )
        })?;
        let run_id = uuid::Uuid::now_v7().to_string();
        let message_id = uuid::Uuid::now_v7().to_string();
        let events = vec![
            AguiEvent::RunStarted {
                run_id: run_id.clone(),
                thread_id: thread_id.clone(),
            },
            AguiEvent::TextMessageStart {
                message_id: message_id.clone(),
                role: MessageRole::Assistant,
            },
            AguiEvent::TextMessageContent {
                message_id: message_id.clone(),
                delta: DETERMINISTIC_REPLY.to_owned(),
            },
            AguiEvent::TextMessageEnd { message_id },
            AguiEvent::RunFinished { run_id, thread_id },
        ];
        Ok(stream::iter(events).boxed())
    }
}
