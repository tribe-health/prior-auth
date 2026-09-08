//! Explicitly unavailable ports for capabilities that have no mounted route.
//!
//! This adapter carries no application state and cannot authorize or persist a
//! clinical operation. It keeps an unmounted legacy port honest until its
//! authoritative PostgreSQL implementation is scheduled.

use aso_host::{
    domain::{CriterionId, DomainError},
    ports::{CriteriaRepository, Criterion},
};
use async_trait::async_trait;

pub struct UnavailableCriteriaRepository;

#[async_trait]
impl CriteriaRepository for UnavailableCriteriaRepository {
    async fn get(&self, _: CriterionId) -> Result<Criterion, DomainError> {
        Err(DomainError::Storage(
            "authoritative criteria repository unavailable".into(),
        ))
    }

    async fn live_for_payer(&self, _: &str) -> Result<Vec<Criterion>, DomainError> {
        Err(DomainError::Storage(
            "authoritative criteria repository unavailable".into(),
        ))
    }
}
