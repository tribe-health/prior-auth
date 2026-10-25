// TJ-ARCH-MOB-001 compliant
//! AG-UI event subset for the scaffold. `type` is the discriminator.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    Assistant,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "SCREAMING_SNAKE_CASE",
    rename_all_fields = "camelCase"
)]
pub enum AguiEvent {
    RunStarted {
        run_id: String,
        thread_id: String,
    },
    TextMessageStart {
        message_id: String,
        role: MessageRole,
    },
    TextMessageContent {
        message_id: String,
        delta: String,
    },
    TextMessageEnd {
        message_id: String,
    },
    RunFinished {
        run_id: String,
        thread_id: String,
    },
    RunError {
        message: String,
        code: Option<String>,
    },
}
