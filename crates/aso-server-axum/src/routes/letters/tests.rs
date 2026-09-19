use super::*;
use aso_host::{
    AppServices,
    affirmation::ClinicalContext,
    domain::*,
    ports::*,
    session::{Principal, SessionCredential, SessionError, SessionPort, SessionSummary},
    signing::{SignLetterCommand, SignLetterResult, SigningTarget},
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
    "2026-09-06T12:00:00Z".parse().unwrap()
}
fn id(value: u128) -> Uuid {
    Uuid::from_u128(value)
}

struct Sessions {
    principal: Mutex<Principal>,
    capabilities: Mutex<Vec<String>>,
    requests: Mutex<Vec<Option<Uuid>>>,
}
#[async_trait]
impl SessionPort for Sessions {
    async fn resolve(
        &self,
        _: &SessionCredential,
        practice: Option<Uuid>,
    ) -> Result<SessionSummary, SessionError> {
        self.requests.lock().unwrap().push(practice);
        Ok(SessionSummary {
            identity_id: id(1),
            session_id: id(10),
            user_id: id(2),
            practice_id: id(3),
            display_name: "Synthetic Surgeon".into(),
            principal: *self.principal.lock().unwrap(),
            capabilities: self.capabilities.lock().unwrap().clone(),
            expires_at: now() + Duration::hours(1),
            authorization_revision: "synthetic:signing".into(),
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
        panic!("affirm")
    }
}
#[async_trait]
impl EvidenceRepository for Unused {
    async fn counts(&self, _: CaseId) -> Result<EvidenceCounts, DomainError> {
        panic!("evidence")
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

struct SigningPorts {
    target: Mutex<SigningTarget>,
    commands: Mutex<Vec<(Uuid, ActorId, PracticeId, SignLetterCommand)>>,
    receipt: Mutex<Option<SignLetterResult>>,
    authority_calls: AtomicUsize,
}
#[async_trait]
impl AuthorityPort for SigningPorts {
    async fn may_sign_letter(
        &self,
        context: &ClinicalContext,
        letter: LetterId,
    ) -> Result<bool, SigningError> {
        self.authority_calls.fetch_add(1, Ordering::SeqCst);
        Ok(context.actor == ActorId(id(2))
            && context.practice == PracticeId(id(3))
            && letter == LetterId(id(5)))
    }
    async fn holds(&self, _: ActorId, _: Capability) -> Result<bool, DomainError> {
        panic!("legacy")
    }
}
#[async_trait]
impl LetterRepository for SigningPorts {
    async fn read_signing_target(
        &self,
        _: &ClinicalContext,
        _: LetterId,
    ) -> Result<SigningTarget, SigningError> {
        Ok(*self.target.lock().unwrap())
    }
    async fn execute_sign_letter(
        &self,
        context: &ClinicalContext,
        command: &SignLetterCommand,
    ) -> Result<SignLetterResult, SigningError> {
        self.commands.lock().unwrap().push((
            context.identity_id,
            context.actor,
            context.practice,
            *command,
        ));
        let result = SignLetterResult {
            command_id: command.command_id,
            letter_id: command.letter_id.0,
            case_id: id(6),
            letter_version: command.expected_letter_version,
            qa_revision: command.expected_qa_revision,
            signature_id: id(7),
            signature_version: command.expected_signature_version,
            signed_at: now(),
        };
        *self.receipt.lock().unwrap() = Some(result.clone());
        Ok(result)
    }
    async fn lookup_sign_letter_command(
        &self,
        _: &ClinicalContext,
        command_id: Uuid,
    ) -> Result<Option<SignLetterResult>, SigningError> {
        Ok(self
            .receipt
            .lock()
            .unwrap()
            .clone()
            .filter(|result| result.command_id == command_id))
    }
    async fn get(&self, _: LetterId) -> Result<Letter, DomainError> {
        panic!("legacy get")
    }
    async fn unresolved_non_policy_retrievals(
        &self,
        _: LetterId,
    ) -> Result<Vec<CriterionId>, DomainError> {
        panic!("legacy retrieval")
    }
    async fn sign(&self, _: LetterId, _: ActorId, _: DateTime<Utc>) -> Result<Letter, DomainError> {
        panic!("legacy sign")
    }
}

struct Fixture {
    app: Router,
    sessions: Arc<Sessions>,
    signing: Arc<SigningPorts>,
}
impl Fixture {
    fn new() -> Self {
        let sessions = Arc::new(Sessions {
            principal: Mutex::new(Principal::User),
            capabilities: Mutex::new(vec!["sign_letter".into()]),
            requests: Mutex::new(vec![]),
        });
        let signing = Arc::new(SigningPorts {
            target: Mutex::new(SigningTarget {
                letter_id: LetterId(id(5)),
                case_id: id(6),
                letter_version: 7,
                qa_revision: 11,
                signature_version: Some(3),
                status: LetterStatus::Approved,
                approved_by_actor: true,
                is_current: true,
                gate_affirmed: true,
                qa_complete: true,
                sources_complete: true,
            }),
            commands: Mutex::new(vec![]),
            receipt: Mutex::new(None),
            authority_calls: AtomicUsize::new(0),
        });
        let unused = Arc::new(Unused);
        let services = Arc::new(AppServices {
            cases: unused.clone(),
            evidence: unused.clone(),
            criteria: unused,
            letters: signing.clone(),
            authority: signing.clone(),
            clock: Arc::new(FixedClock),
            sessions: sessions.clone(),
        });
        Self {
            app: crate::api_router(ServerState { services }),
            sessions,
            signing,
        }
    }

    async fn request(&self, uri: &str, body: serde_json::Value) -> Response {
        self.raw("POST", uri, &body.to_string()).await
    }
    async fn raw(&self, method: &str, uri: &str, body: &str) -> Response {
        self.app
            .clone()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(uri)
                    .header("content-type", "application/json")
                    .header("authorization", "Bearer synthetic-signing-token")
                    .body(Body::from(body.to_owned()))
                    .unwrap(),
            )
            .await
            .unwrap()
    }
}

fn mutation() -> serde_json::Value {
    serde_json::json!({
        "commandId": id(4), "expectedLetterVersion": 7,
        "expectedQaRevision": 11, "expectedSignatureVersion": 3,
    })
}

async fn error_code(response: Response) -> String {
    let bytes = to_bytes(response.into_body(), 4096).await.unwrap();
    serde_json::from_slice::<serde_json::Value>(&bytes).unwrap()["error"]
        .as_str()
        .unwrap()
        .to_owned()
}

#[tokio::test]
async fn request_body_actor_is_rejected_before_session_or_service_access() {
    let fixture = Fixture::new();
    let mut body = mutation();
    body["actor"] = serde_json::json!(id(99));
    let response = fixture
        .request(&format!("/api/letters/{}/sign", id(5)), body)
        .await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(error_code(response).await, "invalid_signing_request");
    assert!(fixture.sessions.requests.lock().unwrap().is_empty());
    assert!(fixture.signing.commands.lock().unwrap().is_empty());
}

#[tokio::test]
async fn verified_session_context_drives_signing_and_stale_revisions_conflict() {
    let fixture = Fixture::new();
    let uri = format!("/api/letters/{}/sign?practiceId={}", id(5), id(3));
    let response = fixture.request(&uri, mutation()).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
    let commands = fixture.signing.commands.lock().unwrap();
    assert_eq!(commands.len(), 1);
    assert_eq!(
        (commands[0].0, commands[0].1, commands[0].2),
        (id(1), ActorId(id(2)), PracticeId(id(3)))
    );
    drop(commands);
    assert_eq!(
        *fixture.sessions.requests.lock().unwrap(),
        vec![Some(id(3))]
    );

    fixture.signing.target.lock().unwrap().letter_version = 8;
    let mut stale = mutation();
    stale["commandId"] = serde_json::json!(id(9));
    let response = fixture.request(&uri, stale).await;
    assert_eq!(response.status(), StatusCode::CONFLICT);
    assert_eq!(error_code(response).await, "revision_conflict");
    assert_eq!(fixture.signing.commands.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn signing_target_returns_only_the_fresh_authoritative_projection() {
    let fixture = Fixture::new();
    let response = fixture
        .raw("GET", &format!("/api/letters/{}/signing-target", id(5)), "")
        .await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
    let body = to_bytes(response.into_body(), 4096).await.unwrap();
    let target: SigningTarget = serde_json::from_slice(&body).unwrap();
    assert_eq!(target, *fixture.signing.target.lock().unwrap());
    assert_eq!(*fixture.sessions.requests.lock().unwrap(), vec![None]);
    assert!(fixture.signing.commands.lock().unwrap().is_empty());
}

#[tokio::test]
async fn lost_signing_response_is_reconciled_by_repeat_and_lookup() {
    let fixture = Fixture::new();
    let uri = format!("/api/letters/{}/sign", id(5));
    let first = fixture.request(&uri, mutation()).await;
    assert_eq!(first.status(), StatusCode::OK);
    let first = to_bytes(first.into_body(), 4096).await.unwrap();

    let repeat = fixture.request(&uri, mutation()).await;
    assert_eq!(repeat.status(), StatusCode::OK);
    assert_eq!(to_bytes(repeat.into_body(), 4096).await.unwrap(), first);
    assert_eq!(fixture.signing.commands.lock().unwrap().len(), 1);

    let lookup = fixture
        .raw(
            "GET",
            &format!("/api/letters/{}/sign/commands/{}", id(5), id(4)),
            "",
        )
        .await;
    assert_eq!(lookup.status(), StatusCode::OK);
    assert_eq!(to_bytes(lookup.into_body(), 4096).await.unwrap(), first);
    assert_eq!(fixture.signing.commands.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn agent_is_refused_before_signing_ports_even_with_sign_capability() {
    let fixture = Fixture::new();
    *fixture.sessions.principal.lock().unwrap() = Principal::Agent;
    let response = fixture
        .request(&format!("/api/letters/{}/sign", id(5)), mutation())
        .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert_eq!(error_code(response).await, "signing_denied");
    assert_eq!(fixture.signing.authority_calls.load(Ordering::SeqCst), 0);
    assert!(fixture.signing.commands.lock().unwrap().is_empty());
}

#[tokio::test]
async fn gate_policy_requires_sign_capability_and_preserves_target_integrity_without_signing() {
    let fixture = Fixture::new();
    let policy = serde_json::json!({
        "method":"POST", "uri":format!("/api/letters/{}/sign?practiceId={}", id(5), id(3)),
    });
    let response = fixture
        .raw("POST", "/internal/gate/authorize", &policy.to_string())
        .await;
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert!(fixture.signing.commands.lock().unwrap().is_empty());

    fixture.sessions.capabilities.lock().unwrap().clear();
    let response = fixture
        .raw("POST", "/internal/gate/authorize", &policy.to_string())
        .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert!(fixture.signing.commands.lock().unwrap().is_empty());

    fixture
        .sessions
        .capabilities
        .lock()
        .unwrap()
        .push("sign_letter".into());
    fixture.signing.target.lock().unwrap().letter_id = LetterId(id(8));
    let response = fixture
        .raw("POST", "/internal/gate/authorize", &policy.to_string())
        .await;
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(error_code(response).await, "gate_unavailable");
    assert!(fixture.signing.commands.lock().unwrap().is_empty());
}
