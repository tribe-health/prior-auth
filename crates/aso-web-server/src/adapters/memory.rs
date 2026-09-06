//! In-memory adapters.
//!
//! Deliberately faithful to the invariants rather than permissive: the
//! authority stub grants a surgeon exactly the capabilities a surgeon holds,
//! so a test that accidentally proves an administrator can sign a letter fails
//! here rather than passing against a stub that says yes to everything.

use std::{collections::HashMap, sync::Mutex};

use aso_host::{
    domain::*,
    ports::{
        AuthorityPort, CaseRepository, Criterion, CriteriaRepository, EvidenceCounts,
        EvidenceRepository, LetterRepository,
    },
};
use async_trait::async_trait;

#[derive(Default)]
pub struct MemoryCaseRepo {
    gates: Mutex<HashMap<CaseId, Vec<GateAffirmationKind>>>,
}

#[async_trait]
impl CaseRepository for MemoryCaseRepo {
    async fn gate_state(&self, case_id: CaseId) -> Result<GateState, DomainError> {
        let g = self.gates.lock().unwrap();
        Ok(GateState { affirmed: g.get(&case_id).cloned().unwrap_or_default() })
    }

    async fn record_affirmation(
        &self,
        case_id: CaseId,
        kind: GateAffirmationKind,
        _actor: ActorId,
        _at: chrono::DateTime<chrono::Utc>,
    ) -> Result<GateState, DomainError> {
        let mut g = self.gates.lock().unwrap();
        let e = g.entry(case_id).or_default();
        if !e.contains(&kind) {
            e.push(kind);
        }
        Ok(GateState { affirmed: e.clone() })
    }
}

#[derive(Default)]
pub struct MemoryEvidenceRepo;

#[async_trait]
impl EvidenceRepository for MemoryEvidenceRepo {
    async fn counts(&self, _case_id: CaseId) -> Result<EvidenceCounts, DomainError> {
        // Shaped like the Kaminski case in the prototype: more voids than gaps,
        // which is the usual real distribution and the reason the distinction
        // earns its own state.
        Ok(EvidenceCounts { met: 7, gap: 1, void: 2 })
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
        Ok(self.signed.lock().unwrap().get(&id).cloned().unwrap_or(Letter {
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

/// Capability stub. Any actor is treated as a surgeon EXCEPT the nil UUID,
/// which stands in for an administrator — so the clinical boundary is
/// exercised by the test suite rather than assumed.
#[derive(Default)]
pub struct MemoryAuthority;

#[async_trait]
impl AuthorityPort for MemoryAuthority {
    async fn holds(&self, actor: ActorId, capability: Capability) -> Result<bool, DomainError> {
        let is_admin = actor.0.is_nil();
        Ok(match capability {
            Capability::Configure | Capability::ViewAudit => is_admin,
            c if c.is_clinical() => !is_admin,
            _ => true,
        })
    }
}
