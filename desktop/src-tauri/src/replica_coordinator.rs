//! Host-owned election and committed graph relay for Tauri renderers.
//!
//! PGlite still runs in the elected renderer worker. The Rust host owns the
//! cross-window claim so two webviews cannot each become the database/sync
//! writer. Followers receive only the canonical committed graph projection;
//! renderer-local patches, selection and filter state never cross this seam.

use std::{
    collections::HashMap,
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

pub const NATIVE_REPLICA_EVENT: &str = "aso://replica-coordination";
const MAX_PROJECTION_BYTES: usize = 16 * 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct NativeReplicaScope {
    pub identity_id: Uuid,
    pub session_id: Uuid,
    pub practice_id: Uuid,
    pub authorization_revision: String,
    pub principal: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeGraphProjection {
    pub entities: Value,
    pub entity_states: Value,
    pub sync_metadata: Value,
    pub lists: Value,
}

impl NativeGraphProjection {
    fn validate(&self) -> Result<(), NativeReplicaCoordinatorError> {
        if !self.entities.is_object()
            || !self.entity_states.is_object()
            || !self.sync_metadata.is_object()
            || !self.lists.is_object()
        {
            return Err(NativeReplicaCoordinatorError::InvalidProjection);
        }
        let bytes = serde_json::to_vec(self)
            .map_err(|_| NativeReplicaCoordinatorError::InvalidProjection)?;
        if bytes.len() > MAX_PROJECTION_BYTES {
            return Err(NativeReplicaCoordinatorError::ProjectionTooLarge);
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NativeReplicaRole {
    Owner,
    Follower,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeReplicaClaim {
    pub role: NativeReplicaRole,
    pub graph_id: Uuid,
    pub claim_generation: u64,
    pub revision: u64,
    pub projection: Option<NativeGraphProjection>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum NativeReplicaEvent {
    Projection {
        schema: u8,
        graph_id: Uuid,
        claim_generation: u64,
        revision: u64,
        projection: NativeGraphProjection,
    },
    OwnerReleased {
        schema: u8,
        graph_id: Uuid,
        claim_generation: u64,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativeReplicaCoordinatorError {
    Unavailable,
    ClaimNotFound,
    OwnerDenied,
    RevisionConflict,
    InvalidProjection,
    ProjectionTooLarge,
}

struct NativeReplicaEntry {
    graph_id: Uuid,
    owner_window: String,
    claim_generation: u64,
    revision: u64,
    projection: Option<NativeGraphProjection>,
}

#[derive(Default)]
struct NativeReplicaState {
    entries: HashMap<NativeReplicaScope, NativeReplicaEntry>,
}

#[derive(Default)]
pub struct NativeReplicaCoordinator {
    state: Mutex<NativeReplicaState>,
    next_claim_generation: AtomicU64,
}

impl NativeReplicaCoordinator {
    pub fn claim(
        &self,
        scope: NativeReplicaScope,
        window_label: &str,
    ) -> Result<NativeReplicaClaim, NativeReplicaCoordinatorError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| NativeReplicaCoordinatorError::Unavailable)?;
        if let Some(entry) = state.entries.get(&scope) {
            return Ok(NativeReplicaClaim {
                role: if entry.owner_window == window_label {
                    NativeReplicaRole::Owner
                } else {
                    NativeReplicaRole::Follower
                },
                graph_id: entry.graph_id,
                claim_generation: entry.claim_generation,
                revision: entry.revision,
                projection: entry.projection.clone(),
            });
        }

        let claim_generation = self
            .next_claim_generation
            .fetch_add(1, Ordering::SeqCst)
            .checked_add(1)
            .ok_or(NativeReplicaCoordinatorError::Unavailable)?;
        let entry = NativeReplicaEntry {
            graph_id: Uuid::new_v4(),
            owner_window: window_label.to_owned(),
            claim_generation,
            revision: 0,
            projection: None,
        };
        let claim = NativeReplicaClaim {
            role: NativeReplicaRole::Owner,
            graph_id: entry.graph_id,
            claim_generation,
            revision: 0,
            projection: None,
        };
        state.entries.insert(scope, entry);
        Ok(claim)
    }

    pub fn publish(
        &self,
        window_label: &str,
        graph_id: Uuid,
        claim_generation: u64,
        revision: u64,
        projection: NativeGraphProjection,
    ) -> Result<NativeReplicaEvent, NativeReplicaCoordinatorError> {
        projection.validate()?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| NativeReplicaCoordinatorError::Unavailable)?;
        let entry = state
            .entries
            .values_mut()
            .find(|entry| entry.graph_id == graph_id)
            .ok_or(NativeReplicaCoordinatorError::ClaimNotFound)?;
        if entry.owner_window != window_label || entry.claim_generation != claim_generation {
            return Err(NativeReplicaCoordinatorError::OwnerDenied);
        }
        if revision != entry.revision.saturating_add(1) {
            return Err(NativeReplicaCoordinatorError::RevisionConflict);
        }
        entry.revision = revision;
        entry.projection = Some(projection.clone());
        Ok(NativeReplicaEvent::Projection {
            schema: 1,
            graph_id,
            claim_generation,
            revision,
            projection,
        })
    }

    pub fn release(
        &self,
        window_label: &str,
        graph_id: Uuid,
        claim_generation: u64,
    ) -> Result<NativeReplicaEvent, NativeReplicaCoordinatorError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| NativeReplicaCoordinatorError::Unavailable)?;
        let (scope, owner_window, actual_generation) = state
            .entries
            .iter()
            .find_map(|(scope, entry)| {
                (entry.graph_id == graph_id).then_some((
                    scope.clone(),
                    entry.owner_window.clone(),
                    entry.claim_generation,
                ))
            })
            .ok_or(NativeReplicaCoordinatorError::ClaimNotFound)?;
        if owner_window != window_label || actual_generation != claim_generation {
            return Err(NativeReplicaCoordinatorError::OwnerDenied);
        }
        state.entries.remove(&scope);
        Ok(NativeReplicaEvent::OwnerReleased {
            schema: 1,
            graph_id,
            claim_generation,
        })
    }

    pub fn release_window(
        &self,
        window_label: &str,
    ) -> Result<Vec<NativeReplicaEvent>, NativeReplicaCoordinatorError> {
        self.remove_where(|entry| entry.owner_window == window_label)
    }

    pub fn revoke_all(&self) -> Result<Vec<NativeReplicaEvent>, NativeReplicaCoordinatorError> {
        self.remove_where(|_| true)
    }

    fn remove_where(
        &self,
        predicate: impl Fn(&NativeReplicaEntry) -> bool,
    ) -> Result<Vec<NativeReplicaEvent>, NativeReplicaCoordinatorError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| NativeReplicaCoordinatorError::Unavailable)?;
        let removed = state
            .entries
            .iter()
            .filter_map(|(scope, entry)| predicate(entry).then_some(scope.clone()))
            .collect::<Vec<_>>();
        let mut events = Vec::with_capacity(removed.len());
        for scope in removed {
            if let Some(entry) = state.entries.remove(&scope) {
                events.push(NativeReplicaEvent::OwnerReleased {
                    schema: 1,
                    graph_id: entry.graph_id,
                    claim_generation: entry.claim_generation,
                });
            }
        }
        Ok(events)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scope() -> NativeReplicaScope {
        NativeReplicaScope {
            identity_id: Uuid::from_u128(1),
            session_id: Uuid::from_u128(2),
            practice_id: Uuid::from_u128(3),
            authorization_revision: "membership:1".into(),
            principal: "user".into(),
        }
    }

    fn projection(case_name: &str) -> NativeGraphProjection {
        NativeGraphProjection {
            entities: serde_json::json!({"Case":{"case-1":{"name":case_name}}}),
            entity_states: serde_json::json!({}),
            sync_metadata: serde_json::json!({"Case:case-1":{"synced":true}}),
            lists: serde_json::json!({"replica:cases":{"ids":["case-1"]}}),
        }
    }

    #[test]
    fn native_replica_elects_one_owner_and_relays_one_canonical_projection() {
        let coordinator = NativeReplicaCoordinator::default();
        let owner = coordinator.claim(scope(), "main").unwrap();
        let follower = coordinator.claim(scope(), "secondary").unwrap();
        assert_eq!(owner.role, NativeReplicaRole::Owner);
        assert_eq!(follower.role, NativeReplicaRole::Follower);
        assert_eq!(owner.graph_id, follower.graph_id);
        assert_eq!(owner.claim_generation, follower.claim_generation);

        let expected = projection("Synthetic case");
        coordinator
            .publish(
                "main",
                owner.graph_id,
                owner.claim_generation,
                1,
                expected.clone(),
            )
            .unwrap();
        let refreshed = coordinator.claim(scope(), "secondary").unwrap();
        assert_eq!(refreshed.revision, 1);
        assert_eq!(refreshed.projection, Some(expected.clone()));
        assert_eq!(
            coordinator.publish(
                "secondary",
                owner.graph_id,
                owner.claim_generation,
                2,
                expected,
            ),
            Err(NativeReplicaCoordinatorError::OwnerDenied)
        );
    }

    #[test]
    fn native_replica_release_fences_the_old_claim_before_re_election() {
        let coordinator = NativeReplicaCoordinator::default();
        let first = coordinator.claim(scope(), "main").unwrap();
        coordinator
            .release("main", first.graph_id, first.claim_generation)
            .unwrap();
        let second = coordinator.claim(scope(), "secondary").unwrap();
        assert_eq!(second.role, NativeReplicaRole::Owner);
        assert_ne!(second.graph_id, first.graph_id);
        assert!(second.claim_generation > first.claim_generation);
        assert_eq!(
            coordinator.publish(
                "main",
                first.graph_id,
                first.claim_generation,
                1,
                projection("stale"),
            ),
            Err(NativeReplicaCoordinatorError::ClaimNotFound)
        );
    }
}
