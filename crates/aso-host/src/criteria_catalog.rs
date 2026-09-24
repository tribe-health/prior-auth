//! Verified criteria-catalog commands shared by every shell.
//!
//! Published and obtained criteria enter through processed policy documents.
//! A command carries no actor identity; verified identity, practice, and
//! capability come from [`ClinicalContext`].

use std::collections::HashSet;

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{AppServices, affirmation::ClinicalContext, domain::EvidenceGrade, session::Principal};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CriteriaCatalogExpectedRevisions {
    pub criteria_catalog_revision: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct CriteriaPolicyInput {
    pub id: Uuid,
    pub payer_id: Uuid,
    pub policy_type_key: String,
    pub name: String,
    pub policy_number: String,
    pub version: String,
    pub effective_from: NaiveDate,
    pub effective_to: Option<NaiveDate>,
    pub document_id: Uuid,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct CriteriaCatalogInput {
    pub id: Uuid,
    pub ordinal: u32,
    pub label: String,
    pub requirement: String,
    pub evidence_grade: EvidenceGrade,
    pub document_id: Uuid,
    pub source_page_number: u32,
    pub valid_from: NaiveDate,
    pub valid_to: Option<NaiveDate>,
    pub payer_id: Uuid,
    pub policy_id: Uuid,
    pub section: String,
    pub content_sha256: String,
    pub last_confirmed_at: DateTime<Utc>,
    #[serde(default)]
    pub procedure_family: Option<String>,
    #[serde(default = "default_mandatory")]
    pub is_mandatory: bool,
    #[serde(default)]
    pub supersedes_criterion_id: Option<Uuid>,
}

const fn default_mandatory() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportCriteriaCatalogCommand {
    pub command_id: Uuid,
    pub expected_revisions: CriteriaCatalogExpectedRevisions,
    pub criteria: Vec<CriteriaCatalogInput>,
    pub policy: CriteriaPolicyInput,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CriteriaCatalogAction {
    Import,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CriteriaCatalogImportResult {
    pub command_id: Uuid,
    pub action: CriteriaCatalogAction,
    pub criteria_catalog_revision: String,
    pub criterion_ids: Vec<Uuid>,
    pub committed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogCriterion {
    pub id: Uuid,
    pub payer_id: Uuid,
    pub practice_id: Option<Uuid>,
    pub evidence_grade: EvidenceGrade,
    pub policy_id: Option<Uuid>,
    pub section: Option<String>,
    pub ordinal: u32,
    pub document_id: Option<Uuid>,
    pub source_page_number: Option<u32>,
    pub label: String,
    pub requirement: String,
    pub content_sha256: String,
    pub procedure_family: Option<String>,
    pub is_mandatory: bool,
    pub valid_from: NaiveDate,
    pub valid_to: Option<NaiveDate>,
    pub superseded_by: Option<Uuid>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogPolicy {
    pub id: Uuid,
    pub payer_id: Uuid,
    pub name: String,
    pub policy_number: String,
    pub version: String,
    pub effective_from: NaiveDate,
    pub effective_to: Option<NaiveDate>,
    pub source_document_id: Uuid,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CriteriaCatalogSnapshot {
    pub criteria_catalog_revision: String,
    pub criteria: Vec<CatalogCriterion>,
    #[serde(default)]
    pub policies: Vec<CatalogPolicy>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum CriteriaCatalogError {
    #[error("authentication required")]
    Unauthenticated,
    #[error("criteria catalog access denied")]
    Denied,
    #[error("criterion, policy, source document, page, or command not found")]
    NotFound,
    #[error("criteria catalog changed after it was loaded")]
    RevisionConflict,
    #[error("command identifier already has a different payload")]
    CommandConflict,
    #[error("criterion effective ranges overlap")]
    OverlapConflict,
    #[error("criteria provenance is invalid")]
    InvalidProvenance,
    #[error("criteria catalog request is invalid")]
    Invalid,
    #[error("criteria catalog service unavailable")]
    Unavailable,
}

impl ImportCriteriaCatalogCommand {
    pub fn is_valid(&self) -> bool {
        if self.command_id.is_nil()
            || !valid_revision_token(&self.expected_revisions.criteria_catalog_revision)
            || self.policy.id.is_nil()
            || self.policy.payer_id.is_nil()
            || self.policy.document_id.is_nil()
            || self.policy.policy_type_key.trim().is_empty()
            || self.policy.name.trim().is_empty()
            || self.policy.policy_number.trim().is_empty()
            || self.policy.version.trim().is_empty()
            || self
                .policy
                .effective_to
                .is_some_and(|end| end <= self.policy.effective_from)
            || self.criteria.is_empty()
        {
            return false;
        }

        let mut ids = HashSet::with_capacity(self.criteria.len());
        self.criteria.iter().all(|criterion| {
            let mut expected = [0_u8; 32];
            let hash_valid = decode_sha256(&criterion.content_sha256)
                .map(|digest| {
                    expected.copy_from_slice(&digest);
                    expected == Sha256::digest(criterion.requirement.as_bytes()).as_slice()
                })
                .unwrap_or(false);
            !criterion.id.is_nil()
                && ids.insert(criterion.id)
                && criterion.ordinal > 0
                && !criterion.label.trim().is_empty()
                && !criterion.requirement.trim().is_empty()
                && matches!(
                    criterion.evidence_grade,
                    EvidenceGrade::Published | EvidenceGrade::ObtainedByRequest
                )
                && criterion.document_id == self.policy.document_id
                && criterion.source_page_number > 0
                && criterion.payer_id == self.policy.payer_id
                && criterion.policy_id == self.policy.id
                && !criterion.section.trim().is_empty()
                && criterion.valid_from >= self.policy.effective_from
                && self
                    .policy
                    .effective_to
                    .is_none_or(|end| criterion.valid_to.is_some_and(|value| value <= end))
                && criterion
                    .valid_to
                    .is_none_or(|end| end > criterion.valid_from)
                && criterion
                    .procedure_family
                    .as_ref()
                    .is_none_or(|value| !value.trim().is_empty())
                && criterion
                    .supersedes_criterion_id
                    .is_none_or(|id| !id.is_nil() && id != criterion.id)
                && hash_valid
        })
    }
}

fn decode_sha256(value: &str) -> Option<Vec<u8>> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    value
        .as_bytes()
        .as_chunks::<2>()
        .0
        .iter()
        .map(|pair| {
            std::str::from_utf8(pair)
                .ok()
                .and_then(|pair| u8::from_str_radix(pair, 16).ok())
        })
        .collect()
}

fn valid_revision_token(value: &str) -> bool {
    let Some(revision) = value.strip_prefix("catalog:criteriaCatalogRevision:r") else {
        return false;
    };
    (revision == "0" || (!revision.starts_with('0') && !revision.is_empty()))
        && revision.bytes().all(|byte| byte.is_ascii_digit())
        && revision.parse::<i64>().is_ok()
}

impl AppServices {
    fn check_criteria_context(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        write: bool,
    ) -> Result<(), CriteriaCatalogError> {
        if context.expires_at <= self.clock.now() {
            return Err(CriteriaCatalogError::Unauthenticated);
        }
        if context.principal != Principal::User {
            return Err(CriteriaCatalogError::Denied);
        }
        let allowed = if write {
            capabilities.iter().any(|value| value == "configure")
        } else {
            capabilities.iter().any(|value| {
                matches!(
                    value.as_str(),
                    "configure" | "case:read" | "criteria_select"
                )
            })
        };
        if !allowed {
            return Err(CriteriaCatalogError::Denied);
        }
        Ok(())
    }

    pub async fn import_criteria_catalog(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        command: &ImportCriteriaCatalogCommand,
    ) -> Result<CriteriaCatalogImportResult, CriteriaCatalogError> {
        self.check_criteria_context(context, capabilities, true)?;
        if !command.is_valid() {
            return Err(CriteriaCatalogError::Invalid);
        }
        self.criteria.import_catalog(context, command).await
    }

    pub async fn list_criteria_catalog(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        payer_id: Option<Uuid>,
    ) -> Result<CriteriaCatalogSnapshot, CriteriaCatalogError> {
        self.check_criteria_context(context, capabilities, false)?;
        if payer_id.is_some_and(|id| id.is_nil()) {
            return Err(CriteriaCatalogError::Invalid);
        }
        self.criteria.list_catalog(context, payer_id).await
    }

    pub async fn read_catalog_criterion(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        criterion_id: Uuid,
    ) -> Result<CatalogCriterion, CriteriaCatalogError> {
        self.check_criteria_context(context, capabilities, false)?;
        if criterion_id.is_nil() {
            return Err(CriteriaCatalogError::Invalid);
        }
        self.criteria
            .read_catalog_criterion(context, criterion_id)
            .await
    }

    pub async fn lookup_criteria_import_command(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        command_id: Uuid,
    ) -> Result<Option<CriteriaCatalogImportResult>, CriteriaCatalogError> {
        self.check_criteria_context(context, capabilities, true)?;
        if command_id.is_nil() {
            return Err(CriteriaCatalogError::Invalid);
        }
        self.criteria
            .lookup_import_command(context, command_id)
            .await
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    use async_trait::async_trait;
    use chrono::{DateTime, NaiveDate, Utc};

    use super::*;
    use crate::{
        domain::{
            ActorId, Capability, CaseId, CriterionId, DomainError, GateAffirmationKind, GateState,
            Letter, LetterId, PracticeId,
        },
        ports::{
            AuthorityPort, CaseRepository, Clock, CriteriaRepository, Criterion, EvidenceCounts,
            EvidenceRepository, LetterRepository,
        },
        session::UnavailableSessions,
    };

    struct FixedClock;

    impl Clock for FixedClock {
        fn now(&self) -> DateTime<Utc> {
            "2026-09-18T12:00:00Z".parse().unwrap()
        }
    }

    struct Unused;

    #[async_trait]
    impl CaseRepository for Unused {
        async fn gate_state(&self, _: CaseId) -> Result<GateState, DomainError> {
            panic!("case repository must not be called")
        }

        async fn record_affirmation(
            &self,
            _: CaseId,
            _: GateAffirmationKind,
            _: ActorId,
            _: DateTime<Utc>,
        ) -> Result<GateState, DomainError> {
            panic!("case repository must not be called")
        }
    }

    #[async_trait]
    impl EvidenceRepository for Unused {
        async fn counts(&self, _: CaseId) -> Result<EvidenceCounts, DomainError> {
            panic!("evidence repository must not be called")
        }
    }

    #[async_trait]
    impl LetterRepository for Unused {
        async fn get(&self, _: LetterId) -> Result<Letter, DomainError> {
            panic!("letter repository must not be called")
        }

        async fn unresolved_non_policy_retrievals(
            &self,
            _: LetterId,
        ) -> Result<Vec<CriterionId>, DomainError> {
            panic!("letter repository must not be called")
        }

        async fn sign(
            &self,
            _: LetterId,
            _: ActorId,
            _: DateTime<Utc>,
        ) -> Result<Letter, DomainError> {
            panic!("letter repository must not be called")
        }
    }

    #[async_trait]
    impl AuthorityPort for Unused {
        async fn holds(&self, _: ActorId, _: Capability) -> Result<bool, DomainError> {
            panic!("authority repository must not be called")
        }
    }

    struct CountingCriteriaRepository {
        import_calls: AtomicUsize,
    }

    #[async_trait]
    impl CriteriaRepository for CountingCriteriaRepository {
        async fn import_catalog(
            &self,
            _: &ClinicalContext,
            _: &ImportCriteriaCatalogCommand,
        ) -> Result<CriteriaCatalogImportResult, CriteriaCatalogError> {
            self.import_calls.fetch_add(1, Ordering::SeqCst);
            Err(CriteriaCatalogError::Unavailable)
        }

        async fn get(&self, _: CriterionId) -> Result<Criterion, DomainError> {
            panic!("legacy criterion read must not be called")
        }

        async fn live_for_payer(&self, _: &str) -> Result<Vec<Criterion>, DomainError> {
            panic!("legacy criteria read must not be called")
        }
    }

    fn command(revision: &str) -> ImportCriteriaCatalogCommand {
        let requirement = "Synthetic sourced criterion.";
        let policy_id = Uuid::from_u128(11);
        let payer_id = Uuid::from_u128(12);
        let document_id = Uuid::from_u128(13);
        ImportCriteriaCatalogCommand {
            command_id: Uuid::from_u128(10),
            expected_revisions: CriteriaCatalogExpectedRevisions {
                criteria_catalog_revision: revision.into(),
            },
            criteria: vec![CriteriaCatalogInput {
                id: Uuid::from_u128(14),
                ordinal: 1,
                label: "Synthetic criterion".into(),
                requirement: requirement.into(),
                evidence_grade: EvidenceGrade::Published,
                document_id,
                source_page_number: 1,
                valid_from: NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
                valid_to: None,
                payer_id,
                policy_id,
                section: "3.2".into(),
                content_sha256: Sha256::digest(requirement.as_bytes())
                    .iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect(),
                last_confirmed_at: "2026-01-01T12:00:00Z".parse().unwrap(),
                procedure_family: None,
                is_mandatory: true,
                supersedes_criterion_id: None,
            }],
            policy: CriteriaPolicyInput {
                id: policy_id,
                payer_id,
                policy_type_key: "medical-policy".into(),
                name: "Synthetic policy".into(),
                policy_number: "SYN-WEB06".into(),
                version: "2026.1".into(),
                effective_from: NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
                effective_to: None,
                document_id,
            },
        }
    }

    #[tokio::test]
    async fn invalid_revision_namespaces_never_reach_the_repository() {
        let criteria = Arc::new(CountingCriteriaRepository {
            import_calls: AtomicUsize::new(0),
        });
        let services = AppServices {
            cases: Arc::new(Unused),
            evidence: Arc::new(Unused),
            criteria: criteria.clone(),
            letters: Arc::new(Unused),
            authority: Arc::new(Unused),
            clock: Arc::new(FixedClock),
            sessions: Arc::new(UnavailableSessions),
        };
        let context = ClinicalContext {
            identity_id: Uuid::from_u128(1),
            actor: ActorId(Uuid::from_u128(2)),
            practice: PracticeId(Uuid::from_u128(3)),
            principal: Principal::User,
            expires_at: "2026-09-18T13:00:00Z".parse().unwrap(),
        };
        let capabilities = vec!["configure".into()];

        for revision in [
            "attacker:criteriaCatalogRevision:r0",
            "catalog:criteriaCatalogRevision:r",
            "catalog:criteriaCatalogRevision:r+1",
            "catalog:criteriaCatalogRevision:r 1",
            "catalog:criteriaCatalogRevision:r1 ",
            "catalog:criteriaCatalogRevision:r1x",
            "catalog:criteriaCatalogRevision:r01",
            "catalog:criteriaCatalogRevision:r00",
            "catalog:criteriaCatalogRevision:r9223372036854775808",
            "catalog:criteriaCatalogRevision:r18446744073709551616",
        ] {
            assert_eq!(
                services
                    .import_criteria_catalog(&context, &capabilities, &command(revision))
                    .await,
                Err(CriteriaCatalogError::Invalid)
            );
            assert_eq!(criteria.import_calls.load(Ordering::SeqCst), 0);
        }
    }
}
