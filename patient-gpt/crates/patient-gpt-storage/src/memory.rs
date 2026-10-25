// TJ-ARCH-MOB-001 compliant
//! Process-local store. Used by the server until Postgres via Forge exists;
//! contents are lost on restart.

use std::sync::RwLock;

use async_trait::async_trait;
use patient_gpt_domain::{ConversationScope, ConversationSummary};
use patient_gpt_host::{ConversationStore, HostError};

#[derive(Debug, Default)]
pub struct InMemoryConversationStore {
    conversations: RwLock<Vec<ConversationSummary>>,
}

impl InMemoryConversationStore {
    pub fn new() -> Self {
        Self::default()
    }
}

fn poisoned() -> HostError {
    HostError::Storage("in-memory conversation store lock poisoned".to_owned())
}

#[async_trait]
impl ConversationStore for InMemoryConversationStore {
    async fn list(&self, scope: &ConversationScope) -> Result<Vec<ConversationSummary>, HostError> {
        let guard = self.conversations.read().map_err(|_| poisoned())?;
        let mut matching: Vec<ConversationSummary> = guard
            .iter()
            .filter(|c| &c.scope == scope)
            .cloned()
            .collect();
        // RFC 3339 UTC strings of equal width sort chronologically.
        matching.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(matching)
    }

    async fn get(&self, id: &str) -> Result<Option<ConversationSummary>, HostError> {
        let guard = self.conversations.read().map_err(|_| poisoned())?;
        Ok(guard.iter().find(|c| c.id == id).cloned())
    }

    async fn put(&self, conversation: ConversationSummary) -> Result<(), HostError> {
        let mut guard = self.conversations.write().map_err(|_| poisoned())?;
        let kept: Vec<ConversationSummary> = guard
            .drain(..)
            .filter(|c| c.id != conversation.id)
            .collect();
        *guard = kept
            .into_iter()
            .chain(std::iter::once(conversation))
            .collect();
        Ok(())
    }
}
