use super::*;
use aso_host::{
    AppServices,
    affirmation::ClinicalContext,
    domain::*,
    ports::*,
    reassessment::{EvidenceReassessmentTarget, ReassessEvidenceCommand},
    session::{Principal, SessionCredential, SessionError, SessionPort, SessionSummary},
};
use async_trait::async_trait;
use axum::{
    body::{Body, to_bytes},
    http::Request,
};
use chrono::{DateTime, Duration, Utc};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicUsize, Ordering},
};
use tower::ServiceExt;

fn now() -> DateTime<Utc> {
    "2026-09-07T01:00:00Z".parse().unwrap()
}
fn id(value: u128) -> Uuid {
    Uuid::from_u128(value)
}

struct Sessions {
    principal: Mutex<Principal>,
    capabilities: Mutex<Vec<String>>,
    calls: AtomicUsize,
}
#[async_trait]
impl SessionPort for Sessions {
    async fn resolve(
        &self,
        _: &SessionCredential,
        _: Option<Uuid>,
    ) -> Result<SessionSummary, SessionError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        Ok(SessionSummary {
            identity_id: id(1),
            session_id: id(10),
            user_id: id(2),
            practice_id: id(3),
            display_name: "Synthetic Surgeon".into(),
            principal: *self.principal.lock().unwrap(),
            capabilities: self.capabilities.lock().unwrap().clone(),
            expires_at: now() + Duration::hours(1),
            authorization_revision: "synthetic:reassessment".into(),
        })
    }
}

struct FixedClock;
impl Clock for FixedClock {
    fn now(&self) -> DateTime<Utc> {
        now()
    }
}

struct Unused;
#[async_trait]
impl CaseRepository for Unused {
    async fn gate_state(&self, _: CaseId) -> Result<GateState, DomainError> {
        panic!("case")
    }
    async fn record_affirmation(
        &self,
        _: CaseId,
        _: GateAffirmationKind,
        _: ActorId,
        _: DateTime<Utc>,
    ) -> Result<GateState, DomainError> {
        panic!("gate")
    }
}
#[async_trait]
impl CriteriaRepository for Unused {
    async fn get(&self, _: CriterionId) -> Result<Criterion, DomainError> {
        panic!("criterion")
    }
    async fn live_for_payer(&self, _: &str) -> Result<Vec<Criterion>, DomainError> {
        panic!("payer")
    }
}
#[async_trait]
impl LetterRepository for Unused {
    async fn get(&self, _: LetterId) -> Result<Letter, DomainError> {
        panic!("letter")
    }
    async fn unresolved_non_policy_retrievals(
        &self,
        _: LetterId,
    ) -> Result<Vec<CriterionId>, DomainError> {
        panic!("retrieval")
    }
    async fn sign(&self, _: LetterId, _: ActorId, _: DateTime<Utc>) -> Result<Letter, DomainError> {
        panic!("sign")
    }
}

struct EvidencePorts {
    target: Mutex<EvidenceReassessmentTarget>,
    stored: Mutex<Option<ReassessEvidenceResult>>,
    writes: AtomicUsize,
    reads: AtomicUsize,
    authority: AtomicUsize,
}
#[async_trait]
impl EvidenceRepository for EvidencePorts {
    async fn read_reassessment_target(
        &self,
        _: &ClinicalContext,
        _: Uuid,
        _: Uuid,
    ) -> Result<EvidenceReassessmentTarget, ReassessmentError> {
        self.reads.fetch_add(1, Ordering::SeqCst);
        Ok(*self.target.lock().unwrap())
    }
    async fn execute_reassessment(
        &self,
        _: &ClinicalContext,
        command: &ReassessEvidenceCommand,
    ) -> Result<ReassessEvidenceResult, ReassessmentError> {
        self.writes.fetch_add(1, Ordering::SeqCst);
        let previous_state = self.target.lock().unwrap().state;
        let result = ReassessEvidenceResult {
            command_id: command.command_id,
            case_id: command.case_id,
            evidence_id: command.evidence_id,
            previous_state,
            state: command.state,
            expected_assessed_at: command.expected_assessed_at,
            assessed_at: now() + Duration::minutes(1),
        };
        *self.stored.lock().unwrap() = Some(result.clone());
        Ok(result)
    }
    async fn lookup_reassessment_command(
        &self,
        _: &ClinicalContext,
        _: Uuid,
    ) -> Result<Option<ReassessEvidenceResult>, ReassessmentError> {
        Ok(self.stored.lock().unwrap().clone())
    }
    async fn counts(&self, _: CaseId) -> Result<EvidenceCounts, DomainError> {
        panic!("counts")
    }
}
#[async_trait]
impl AuthorityPort for EvidencePorts {
    async fn may_reassess_evidence(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        evidence_id: Uuid,
    ) -> Result<bool, ReassessmentError> {
        self.authority.fetch_add(1, Ordering::SeqCst);
        Ok(context.actor == ActorId(id(2))
            && context.practice == PracticeId(id(3))
            && case_id == id(5)
            && evidence_id == id(6))
    }
    async fn holds(&self, _: ActorId, _: Capability) -> Result<bool, DomainError> {
        panic!("legacy authority")
    }
}

struct Fixture {
    app: Router,
    sessions: Arc<Sessions>,
    evidence: Arc<EvidencePorts>,
}
impl Fixture {
    fn new() -> Self {
        let sessions = Arc::new(Sessions {
            principal: Mutex::new(Principal::User),
            capabilities: Mutex::new(vec!["annotate".into()]),
            calls: AtomicUsize::new(0),
        });
        let evidence = Arc::new(EvidencePorts {
            target: Mutex::new(EvidenceReassessmentTarget {
                case_id: id(5),
                evidence_id: id(6),
                state: EvidenceState::Void,
                assessed_at: now(),
            }),
            stored: Mutex::new(None),
            writes: AtomicUsize::new(0),
            reads: AtomicUsize::new(0),
            authority: AtomicUsize::new(0),
        });
        let unused = Arc::new(Unused);
        let services = Arc::new(AppServices {
            cases: unused.clone(),
            evidence: evidence.clone(),
            criteria: unused.clone(),
            letters: unused,
            authority: evidence.clone(),
            clock: Arc::new(FixedClock),
            sessions: sessions.clone(),
        });
        Self {
            app: crate::api_router(ServerState { services }),
            sessions,
            evidence,
        }
    }

    async fn request(&self, method: &str, uri: &str, body: &str) -> Response {
        self.app
            .clone()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(uri)
                    .header("content-type", "application/json")
                    .header("authorization", "Bearer synthetic-reassessment-token")
                    .body(Body::from(body.to_owned()))
                    .unwrap(),
            )
            .await
            .unwrap()
    }
}

fn mutation(state: &str) -> serde_json::Value {
    serde_json::json!({
        "commandId": id(4),
        "state": state,
        "expectedAssessedAt": now(),
    })
}

async fn body(response: Response) -> serde_json::Value {
    let bytes = to_bytes(response.into_body(), 4096).await.unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

#[tokio::test]
async fn lost_response_is_reconciled_without_a_second_clinical_effect() {
    let fixture = Fixture::new();
    let uri = format!("/api/cases/{}/evidence/{}/state", id(5), id(6));
    let first = fixture
        .request("POST", &uri, &mutation("gap").to_string())
        .await;
    assert_eq!(first.status(), StatusCode::OK);
    let first = body(first).await;

    let repeat = fixture
        .request("POST", &uri, &mutation("gap").to_string())
        .await;
    assert_eq!(repeat.status(), StatusCode::OK);
    assert_eq!(body(repeat).await, first);
    assert_eq!(fixture.evidence.writes.load(Ordering::SeqCst), 1);

    let lookup = fixture
        .request(
            "GET",
            &format!("/api/cases/{}/evidence/{}/commands/{}", id(5), id(6), id(4)),
            "",
        )
        .await;
    assert_eq!(lookup.status(), StatusCode::OK);
    assert_eq!(body(lookup).await, first);
}

#[tokio::test]
async fn changed_payload_conflicts_and_caller_selected_identity_is_rejected() {
    let fixture = Fixture::new();
    let uri = format!("/api/cases/{}/evidence/{}/state", id(5), id(6));
    assert_eq!(
        fixture
            .request("POST", &uri, &mutation("gap").to_string())
            .await
            .status(),
        StatusCode::OK
    );
    let changed = fixture
        .request("POST", &uri, &mutation("met").to_string())
        .await;
    assert_eq!(changed.status(), StatusCode::CONFLICT);
    assert_eq!(body(changed).await["error"], "command_conflict");
    assert_eq!(fixture.evidence.writes.load(Ordering::SeqCst), 1);

    let forged = serde_json::json!({
        "commandId": id(8), "state": "met", "expectedAssessedAt": now(),
        "actor": id(99),
    });
    let response = fixture.request("POST", &uri, &forged.to_string()).await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn agent_is_refused_before_reassessment_ports() {
    let fixture = Fixture::new();
    *fixture.sessions.principal.lock().unwrap() = Principal::Agent;
    let response = fixture
        .request(
            "POST",
            &format!("/api/cases/{}/evidence/{}/state", id(5), id(6)),
            &mutation("gap").to_string(),
        )
        .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert_eq!(fixture.evidence.reads.load(Ordering::SeqCst), 0);
    assert_eq!(fixture.evidence.writes.load(Ordering::SeqCst), 0);
    assert_eq!(fixture.evidence.authority.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn gate_policy_requires_annotate_and_preserves_target_integrity_without_writing() {
    let fixture = Fixture::new();
    let policy = serde_json::json!({
        "method": "POST",
        "uri": format!("/api/cases/{}/evidence/{}/state", id(5), id(6)),
    });
    let response = fixture
        .request("POST", "/internal/gate/authorize", &policy.to_string())
        .await;
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert_eq!(fixture.evidence.writes.load(Ordering::SeqCst), 0);

    fixture.sessions.capabilities.lock().unwrap().clear();
    let response = fixture
        .request("POST", "/internal/gate/authorize", &policy.to_string())
        .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    fixture
        .sessions
        .capabilities
        .lock()
        .unwrap()
        .push("annotate".into());
    fixture.evidence.target.lock().unwrap().evidence_id = id(9);
    let response = fixture
        .request("POST", "/internal/gate/authorize", &policy.to_string())
        .await;
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(fixture.evidence.writes.load(Ordering::SeqCst), 0);
}
