use super::*;

use std::sync::{
    Arc, Mutex,
    atomic::{AtomicUsize, Ordering},
};

use aso_host::{
    AppServices,
    affirmation::ClinicalContext,
    domain::*,
    ports::*,
    session::{Principal, SessionCredential, SessionError, SessionPort, SessionSummary},
    source::{DocumentSource, DocumentSourceError, DocumentSourceRequest},
};
use async_trait::async_trait;
use axum::{body::to_bytes, http::Request};
use chrono::{DateTime, Duration, Utc};
use sha2::{Digest, Sha256};
use tower::ServiceExt;

fn id(value: u128) -> Uuid {
    Uuid::from_u128(value)
}

fn now() -> DateTime<Utc> {
    "2026-09-15T22:00:00Z".parse().unwrap()
}

struct Sessions {
    principal: Mutex<Principal>,
}

#[async_trait]
impl SessionPort for Sessions {
    async fn resolve(
        &self,
        _: &SessionCredential,
        _: Option<Uuid>,
    ) -> Result<SessionSummary, SessionError> {
        Ok(SessionSummary {
            identity_id: id(1),
            session_id: id(2),
            user_id: id(3),
            practice_id: id(4),
            display_name: "Synthetic reviewer".into(),
            principal: *self.principal.lock().unwrap(),
            capabilities: vec![],
            expires_at: now() + Duration::hours(1),
            authorization_revision: "source-test".into(),
        })
    }
}

struct FixedClock;
impl Clock for FixedClock {
    fn now(&self) -> DateTime<Utc> {
        now()
    }
}

struct SourceRepo {
    calls: AtomicUsize,
    result: Mutex<Result<Vec<u8>, DocumentSourceError>>,
}

#[async_trait]
impl EvidenceRepository for SourceRepo {
    async fn open_document_source(
        &self,
        _: &ClinicalContext,
        request: DocumentSourceRequest,
    ) -> Result<DocumentSource, DocumentSourceError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        let bytes = self.result.lock().unwrap().clone()?;
        Ok(DocumentSource {
            case_id: request.case_id,
            document_id: request.document_id,
            name: "Synthetic MRI".into(),
            effective_date: "2026-03-14".parse().unwrap(),
            page_count: 4,
            page_number: request.page_number,
            media_type: "application/pdf".into(),
            content_sha256: Sha256::digest(&bytes).to_vec(),
            bytes,
        })
    }

    async fn counts(&self, _: CaseId) -> Result<EvidenceCounts, DomainError> {
        panic!("unused")
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
    async fn sign(&self, _: LetterId, _: ActorId, _: DateTime<Utc>) -> Result<Letter, DomainError> {
        panic!("unused")
    }
}

#[async_trait]
impl AuthorityPort for Unused {
    async fn holds(&self, _: ActorId, _: Capability) -> Result<bool, DomainError> {
        panic!("unused")
    }
}

struct Fixture {
    app: Router,
    sessions: Arc<Sessions>,
    sources: Arc<SourceRepo>,
}

impl Fixture {
    fn new(result: Result<Vec<u8>, DocumentSourceError>) -> Self {
        let sessions = Arc::new(Sessions {
            principal: Mutex::new(Principal::User),
        });
        let sources = Arc::new(SourceRepo {
            calls: AtomicUsize::new(0),
            result: Mutex::new(result),
        });
        let unused = Arc::new(Unused);
        let services = Arc::new(AppServices {
            cases: unused.clone(),
            evidence: sources.clone(),
            criteria: unused.clone(),
            letters: unused.clone(),
            authority: unused.clone(),
            clock: Arc::new(FixedClock),
            sessions: sessions.clone(),
        });
        Self {
            app: crate::api_router(ServerState { services }),
            sessions,
            sources,
        }
    }

    async fn request(&self, page: u32) -> Response {
        self.app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!(
                        "/api/cases/{}/documents/{}/source?page={page}",
                        id(5),
                        id(6)
                    ))
                    .header("authorization", "Bearer synthetic-source-token")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap()
    }
}

#[tokio::test]
async fn authorized_source_returns_bounded_private_body_and_provenance_headers() {
    let bytes = b"%PDF synthetic authorized source".to_vec();
    let fixture = Fixture::new(Ok(bytes.clone()));
    let response = fixture.request(2).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
    assert_eq!(response.headers()[header::PRAGMA], "no-cache");
    assert_eq!(response.headers()[header::CONTENT_TYPE], "application/pdf");
    assert_eq!(response.headers()[header::ACCEPT_RANGES], "none");
    assert_eq!(response.headers()["x-aso-source-page"], "2");
    assert_eq!(
        response.headers()["x-aso-source-effective-date"],
        "2026-03-14"
    );
    assert!(response.headers().get(header::LOCATION).is_none());
    assert!(
        response
            .headers()
            .values()
            .all(|value| !value.as_bytes().windows(11).any(|v| v == b"storage_uri"))
    );
    assert_eq!(to_bytes(response.into_body(), 1024).await.unwrap(), bytes);
    assert_eq!(fixture.sources.calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn forbidden_source_and_nonhuman_session_release_no_bytes() {
    let fixture = Fixture::new(Err(DocumentSourceError::Denied));
    let response = fixture.request(1).await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
    let body = to_bytes(response.into_body(), 1024).await.unwrap();
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&body).unwrap()["error"],
        "document_source_denied"
    );

    *fixture.sessions.principal.lock().unwrap() = Principal::Agent;
    let calls = fixture.sources.calls.load(Ordering::SeqCst);
    let response = fixture.request(1).await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert_eq!(fixture.sources.calls.load(Ordering::SeqCst), calls);
}

#[tokio::test]
async fn invalid_page_is_rejected_without_source_delivery() {
    let fixture = Fixture::new(Ok(vec![1]));
    let response = fixture.request(0).await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(fixture.sources.calls.load(Ordering::SeqCst), 0);
}
