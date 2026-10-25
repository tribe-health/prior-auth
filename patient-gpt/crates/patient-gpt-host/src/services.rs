// TJ-ARCH-MOB-001 compliant
//! The single capability surface every shell consumes.

use std::sync::Arc;

use patient_gpt_domain::{
    CaseSummary, ConversationScope, ConversationSummary, Health, PatientSummary, RunRequest,
    Session,
};

use crate::HostError;
use crate::clock::now_rfc3339;
use crate::ports::{AguiStream, ClinicalReadPort, ConversationStore, UarRuntimeFacade};

const TITLE_MAX_CHARS: usize = 60;

/// Shells wire adapters into these ports and call only these methods. HTTP,
/// Tauri commands and FFI functions mirror them one to one.
#[derive(Clone)]
pub struct AppServices {
    clinical: Arc<dyn ClinicalReadPort>,
    conversations: Arc<dyn ConversationStore>,
    runtime: Arc<dyn UarRuntimeFacade>,
}

impl AppServices {
    pub fn new(
        clinical: Arc<dyn ClinicalReadPort>,
        conversations: Arc<dyn ConversationStore>,
        runtime: Arc<dyn UarRuntimeFacade>,
    ) -> Self {
        Self {
            clinical,
            conversations,
            runtime,
        }
    }

    pub fn health(&self) -> Health {
        Health {
            status: "ok".to_owned(),
            version: env!("CARGO_PKG_VERSION").to_owned(),
        }
    }

    pub async fn session(&self) -> Result<Session, HostError> {
        self.clinical.session().await
    }

    pub async fn list_patients(&self) -> Result<Vec<PatientSummary>, HostError> {
        self.clinical.list_patients().await
    }

    pub async fn list_cases(&self, patient_id: &str) -> Result<Vec<CaseSummary>, HostError> {
        self.clinical.list_cases(patient_id).await
    }

    pub async fn list_conversations(
        &self,
        scope: &ConversationScope,
    ) -> Result<Vec<ConversationSummary>, HostError> {
        self.ensure_scope_visible(scope).await?;
        self.conversations.list(scope).await
    }

    /// Records the conversation, then hands the run to the agent runtime.
    ///
    /// A new conversation is created when `conversation_id` is null. An
    /// existing conversation must already hold the requested scope; a run
    /// cannot silently move a chat between patients or cases.
    pub async fn start_run(&self, request: RunRequest) -> Result<AguiStream, HostError> {
        let message = request.message.trim();
        if message.is_empty() {
            return Err(HostError::InvalidInput("message is empty".to_owned()));
        }
        self.ensure_scope_visible(&request.scope).await?;
        let conversation = match request.conversation_id.as_deref() {
            None => ConversationSummary {
                id: uuid::Uuid::now_v7().to_string(),
                scope: request.scope.clone(),
                title: title_from(message),
                updated_at: now_rfc3339(),
            },
            Some(id) => self.existing_conversation(id, &request.scope).await?,
        };
        let thread_id = conversation.id.clone();
        self.conversations.put(conversation).await?;
        self.runtime
            .start_run(RunRequest {
                conversation_id: Some(thread_id),
                scope: request.scope,
                message: message.to_owned(),
            })
            .await
    }

    async fn existing_conversation(
        &self,
        id: &str,
        scope: &ConversationScope,
    ) -> Result<ConversationSummary, HostError> {
        let found = self
            .conversations
            .get(id)
            .await?
            .ok_or_else(|| HostError::NotFound(format!("conversation `{id}` not found")))?;
        if &found.scope != scope {
            return Err(HostError::InvalidInput(format!(
                "conversation `{id}` is scoped to `{}`, not `{scope}`",
                found.scope
            )));
        }
        Ok(ConversationSummary {
            updated_at: now_rfc3339(),
            ..found
        })
    }

    /// A patient scope must name a visible patient; a case scope must name a
    /// case that belongs to that patient.
    async fn ensure_scope_visible(&self, scope: &ConversationScope) -> Result<(), HostError> {
        let Some(patient_id) = scope.patient_id() else {
            return Ok(());
        };
        let cases = self.clinical.list_cases(patient_id).await?;
        if let ConversationScope::Case { case_id, .. } = scope
            && !cases.iter().any(|case| &case.id == case_id)
        {
            return Err(HostError::NotFound(format!(
                "case `{case_id}` not found for patient `{patient_id}`"
            )));
        }
        Ok(())
    }
}

fn title_from(message: &str) -> String {
    let mut title: String = message.chars().take(TITLE_MAX_CHARS).collect();
    if message.chars().count() > TITLE_MAX_CHARS {
        title.push('…');
    }
    title
}
