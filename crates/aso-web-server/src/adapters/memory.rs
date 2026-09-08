//! In-memory fixtures compiled only for focused adapter tests.

use std::{collections::HashMap, sync::Mutex};

use aso_host::{
    domain::*,
    ports::{
        CriteriaRepository, Criterion, EvidenceCounts, EvidenceRepository, LetterRepository,
    },
};
use async_trait::async_trait;

#[derive(Default)]
pub struct MemoryEvidenceRepo;

#[async_trait]
impl EvidenceRepository for MemoryEvidenceRepo {
    async fn counts(&self, _case_id: CaseId) -> Result<EvidenceCounts, DomainError> {
        // Shaped like the Kaminski case in the prototype: more voids than gaps,
        // which is the usual real distribution and the reason the distinction
        // earns its own state.
        Ok(EvidenceCounts {
            met: 7,
            gap: 1,
            void: 2,
        })
    }
}

#[derive(Default)]
pub struct MemoryCriteriaRepo;

#[async_trait]
impl CriteriaRepository for MemoryCriteriaRepo {
    async fn get(&self, _id: CriterionId) -> Result<Criterion, DomainError> {
        Err(DomainError::NotFound)
    }
    async fn live_for_payer(&self, _payer: &str) -> Result<Vec<Criterion>, DomainError> {
        Ok(vec![])
    }
}

#[derive(Default)]
pub struct MemoryLetterRepo {
    signed: Mutex<HashMap<LetterId, Letter>>,
}

#[async_trait]
impl LetterRepository for MemoryLetterRepo {
    async fn get(&self, id: LetterId) -> Result<Letter, DomainError> {
        Ok(self
            .signed
            .lock()
            .unwrap()
            .get(&id)
            .cloned()
            .unwrap_or(Letter {
                id,
                case_id: CaseId(uuid::Uuid::nil()),
                version: 1,
                status: LetterStatus::Draft,
                signed_at: None,
            }))
    }

    async fn unresolved_non_policy_retrievals(
        &self,
        _id: LetterId,
    ) -> Result<Vec<CriterionId>, DomainError> {
        Ok(vec![])
    }

    async fn sign(
        &self,
        id: LetterId,
        _actor: ActorId,
        at: chrono::DateTime<chrono::Utc>,
    ) -> Result<Letter, DomainError> {
        let letter = Letter {
            id,
            case_id: CaseId(uuid::Uuid::nil()),
            version: 1,
            status: LetterStatus::Signed,
            signed_at: Some(at),
        };
        self.signed.lock().unwrap().insert(id, letter.clone());
        Ok(letter)
    }
}
