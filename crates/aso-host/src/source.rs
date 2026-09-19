//! Authorized, bounded document-source delivery shared by every shell.
//!
//! A projected document record identifies a source. It never grants access to
//! the source bytes. Every open operation carries fresh verified context and
//! the repository must audit the completed read before returning bytes.

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{AppServices, affirmation::ClinicalContext, session::Principal};

/// The largest source body a shell may receive from one operation.
pub const MAX_DOCUMENT_SOURCE_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentSourceRequest {
    pub case_id: Uuid,
    pub document_id: Uuid,
    pub page_number: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSource {
    pub case_id: Uuid,
    pub document_id: Uuid,
    pub name: String,
    pub effective_date: NaiveDate,
    pub page_count: u32,
    pub page_number: u32,
    pub media_type: String,
    pub content_sha256: Vec<u8>,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum DocumentSourceError {
    #[error("authentication required")]
    Unauthenticated,
    #[error("document source access denied")]
    Denied,
    #[error("document source not found")]
    NotFound,
    #[error("document source request is invalid")]
    Invalid,
    #[error("document source exceeds the delivery limit")]
    TooLarge,
    #[error("document source integrity check failed")]
    IntegrityMismatch,
    #[error("document source service unavailable")]
    Unavailable,
    #[error("native authentication unavailable")]
    NativeAuthenticationUnavailable,
}

impl AppServices {
    pub async fn open_document_source(
        &self,
        context: &ClinicalContext,
        request: DocumentSourceRequest,
    ) -> Result<DocumentSource, DocumentSourceError> {
        if context.expires_at <= self.clock.now() {
            return Err(DocumentSourceError::Unauthenticated);
        }
        if context.principal != Principal::User {
            return Err(DocumentSourceError::Denied);
        }
        if request.page_number == 0 {
            return Err(DocumentSourceError::Invalid);
        }

        let source = self.evidence.open_document_source(context, request).await?;
        if source.case_id != request.case_id
            || source.document_id != request.document_id
            || source.page_number != request.page_number
            || source.page_count == 0
            || source.page_number > source.page_count
        {
            return Err(DocumentSourceError::Unavailable);
        }
        if source.bytes.len() > MAX_DOCUMENT_SOURCE_BYTES {
            return Err(DocumentSourceError::TooLarge);
        }
        if source.content_sha256.len() != 32
            || Sha256::digest(&source.bytes).as_slice() != source.content_sha256
        {
            return Err(DocumentSourceError::IntegrityMismatch);
        }
        Ok(source)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    use async_trait::async_trait;
    use chrono::{DateTime, Duration, Utc};

    use crate::{
        domain::*,
        ports::*,
        session::{Principal, SessionError, SessionPort},
    };

    use super::*;

    fn id(value: u128) -> Uuid {
        Uuid::from_u128(value)
    }

    fn now() -> DateTime<Utc> {
        "2026-09-15T22:00:00Z".parse().unwrap()
    }

    struct FixedClock;
    impl Clock for FixedClock {
        fn now(&self) -> DateTime<Utc> {
            now()
        }
    }

    struct SourceRepo {
        calls: AtomicUsize,
        bytes: Vec<u8>,
    }

    #[async_trait]
    impl EvidenceRepository for SourceRepo {
        async fn open_document_source(
            &self,
            _: &ClinicalContext,
            request: DocumentSourceRequest,
        ) -> Result<DocumentSource, DocumentSourceError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(DocumentSource {
                case_id: request.case_id,
                document_id: request.document_id,
                name: "Synthetic MRI".into(),
                effective_date: "2026-03-14".parse().unwrap(),
                page_count: 4,
                page_number: request.page_number,
                media_type: "application/pdf".into(),
                content_sha256: Sha256::digest(&self.bytes).to_vec(),
                bytes: self.bytes.clone(),
            })
        }

        async fn counts(&self, _: CaseId) -> Result<EvidenceCounts, DomainError> {
            panic!("source read must not use legacy counts")
        }
    }

    struct Unused;

    #[async_trait]
    impl CaseRepository for Unused {
        async fn gate_state(&self, _: CaseId) -> Result<GateState, DomainError> {
            panic!("unused")
        }
        async fn record_affirmation(
            &self,
            _: CaseId,
            _: GateAffirmationKind,
            _: ActorId,
            _: DateTime<Utc>,
        ) -> Result<GateState, DomainError> {
            panic!("unused")
        }
    }

    #[async_trait]
    impl CriteriaRepository for Unused {
        async fn get(&self, _: CriterionId) -> Result<Criterion, DomainError> {
            panic!("unused")
        }
        async fn live_for_payer(&self, _: &str) -> Result<Vec<Criterion>, DomainError> {
            panic!("unused")
        }
    }

    #[async_trait]
    impl LetterRepository for Unused {
        async fn get(&self, _: LetterId) -> Result<Letter, DomainError> {
            panic!("unused")
        }
        async fn unresolved_non_policy_retrievals(
            &self,
            _: LetterId,
        ) -> Result<Vec<CriterionId>, DomainError> {
            panic!("unused")
        }
        async fn sign(
            &self,
            _: LetterId,
            _: ActorId,
            _: DateTime<Utc>,
        ) -> Result<Letter, DomainError> {
            panic!("unused")
        }
    }

    #[async_trait]
    impl AuthorityPort for Unused {
        async fn holds(&self, _: ActorId, _: Capability) -> Result<bool, DomainError> {
            panic!("unused")
        }
    }

    #[async_trait]
    impl SessionPort for Unused {
        async fn resolve(
            &self,
            _: &crate::session::SessionCredential,
            _: Option<Uuid>,
        ) -> Result<crate::session::SessionSummary, SessionError> {
            panic!("unused")
        }
    }

    fn services(repo: Arc<SourceRepo>) -> AppServices {
        let unused = Arc::new(Unused);
        AppServices {
            cases: unused.clone(),
            evidence: repo,
            criteria: unused.clone(),
            letters: unused.clone(),
            authority: unused.clone(),
            clock: Arc::new(FixedClock),
            sessions: unused,
        }
    }

    fn context(principal: Principal, expires_at: DateTime<Utc>) -> ClinicalContext {
        ClinicalContext {
            identity_id: id(1),
            actor: ActorId(id(2)),
            practice: PracticeId(id(3)),
            principal,
            expires_at,
        }
    }

    #[tokio::test]
    async fn valid_human_context_returns_integrity_checked_bounded_bytes() {
        let repo = Arc::new(SourceRepo {
            calls: AtomicUsize::new(0),
            bytes: b"%PDF synthetic source".to_vec(),
        });
        let request = DocumentSourceRequest {
            case_id: id(4),
            document_id: id(5),
            page_number: 2,
        };
        let source = services(repo.clone())
            .open_document_source(
                &context(Principal::User, now() + Duration::hours(1)),
                request,
            )
            .await
            .unwrap();
        assert_eq!(source.bytes, b"%PDF synthetic source");
        assert_eq!(source.page_number, 2);
        assert_eq!(repo.calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn expired_agent_and_invalid_page_are_refused_before_repository_access() {
        let repo = Arc::new(SourceRepo {
            calls: AtomicUsize::new(0),
            bytes: vec![1],
        });
        let services = services(repo.clone());
        let request = DocumentSourceRequest {
            case_id: id(4),
            document_id: id(5),
            page_number: 1,
        };
        assert_eq!(
            services
                .open_document_source(
                    &context(Principal::User, now() - Duration::seconds(1)),
                    request,
                )
                .await,
            Err(DocumentSourceError::Unauthenticated),
        );
        assert_eq!(
            services
                .open_document_source(
                    &context(Principal::Agent, now() + Duration::hours(1)),
                    request,
                )
                .await,
            Err(DocumentSourceError::Denied),
        );
        assert_eq!(
            services
                .open_document_source(
                    &context(Principal::User, now() + Duration::hours(1)),
                    DocumentSourceRequest {
                        page_number: 0,
                        ..request
                    },
                )
                .await,
            Err(DocumentSourceError::Invalid),
        );
        assert_eq!(repo.calls.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn repository_integrity_mismatch_is_not_delivered() {
        struct CorruptRepo;
        #[async_trait]
        impl EvidenceRepository for CorruptRepo {
            async fn open_document_source(
                &self,
                _: &ClinicalContext,
                request: DocumentSourceRequest,
            ) -> Result<DocumentSource, DocumentSourceError> {
                Ok(DocumentSource {
                    case_id: request.case_id,
                    document_id: request.document_id,
                    name: "Synthetic MRI".into(),
                    effective_date: "2026-03-14".parse().unwrap(),
                    page_count: 1,
                    page_number: 1,
                    media_type: "application/pdf".into(),
                    content_sha256: vec![0; 32],
                    bytes: b"changed".to_vec(),
                })
            }
            async fn counts(&self, _: CaseId) -> Result<EvidenceCounts, DomainError> {
                panic!("unused")
            }
        }

        let unused = Arc::new(Unused);
        let services = AppServices {
            cases: unused.clone(),
            evidence: Arc::new(CorruptRepo),
            criteria: unused.clone(),
            letters: unused.clone(),
            authority: unused.clone(),
            clock: Arc::new(FixedClock),
            sessions: unused,
        };
        assert_eq!(
            services
                .open_document_source(
                    &context(Principal::User, now() + Duration::hours(1)),
                    DocumentSourceRequest {
                        case_id: id(4),
                        document_id: id(5),
                        page_number: 1,
                    },
                )
                .await,
            Err(DocumentSourceError::IntegrityMismatch),
        );
    }
}
