use super::*;
use aso_host::{
    AppServices,
    domain::*,
    ports::*,
    reassessment::{EvidenceReassessmentTarget, ReassessmentError},
    session::{
        AuthenticatedIdentity, IdentityProvider, Membership, MembershipRepository,
        SessionCredential, SessionError, SessionPort, SessionService, SessionSummary,
    },
    signing::{SigningError, SigningTarget},
};
use async_trait::async_trait;
use axum::{
    body::{Body, to_bytes},
    http::Request,
};
use chrono::{DateTime, Duration, Utc};
use serde_json::Value;
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
fn summary() -> SessionSummary {
    SessionSummary {
        identity_id: id(1),
        session_id: id(10),
        user_id: id(2),
        practice_id: id(3),
        display_name: "Synthetic Router Surgeon".into(),
        principal: Principal::User,
        capabilities: vec!["affirm_gate".into()],
        expires_at: now() + Duration::hours(1),
        authorization_revision: "synthetic:1".into(),
    }
}
fn snapshot(case_id: Uuid) -> GateSnapshot {
    GateSnapshot {
        case_id,
        affirmed: vec![],
        gate_affirmed_at: None,
        gate_affirmed_by: None,
    }
}
fn result(case_id: Uuid, command_id: Uuid) -> GateCommandResult {
    GateCommandResult {
        command_id,
        case_id,
        kind: GateAffirmationKind::Policy,
        action: GateAction::Affirm,
        gate: snapshot(case_id),
        committed_at: now(),
    }
}

struct Sessions {
    response: Mutex<Result<SessionSummary, SessionError>>,
    // Synthetic credentials only, confined to this test fixture.
    requests: Mutex<Vec<(String, Option<Uuid>)>>,
}

struct AgentIdentity;
#[async_trait]
impl IdentityProvider for AgentIdentity {
    async fn authenticate(
        &self,
        _: &SessionCredential,
    ) -> Result<AuthenticatedIdentity, SessionError> {
        Ok(AuthenticatedIdentity {
            identity_id: id(1),
            session_id: id(9),
            principal: Principal::Agent,
            expires_at: now() + Duration::hours(1),
        })
    }
}

struct AcceptingMemberships {
    calls: AtomicUsize,
}
#[async_trait]
impl MembershipRepository for AcceptingMemberships {
    async fn resolve(
        &self,
        _: &AuthenticatedIdentity,
        _: Option<Uuid>,
    ) -> Result<Membership, SessionError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        Ok(Membership {
            user_id: id(2),
            practice_id: id(3),
            display_name: "Synthetic Agent".into(),
            capabilities: vec!["affirm_gate".into()],
            authorization_revision: "synthetic:agent".into(),
        })
    }
}
#[async_trait]
impl SessionPort for Sessions {
    async fn resolve(
        &self,
        credential: &SessionCredential,
        practice: Option<Uuid>,
    ) -> Result<SessionSummary, SessionError> {
        let credential = match credential {
            SessionCredential::Cookie(value) => format!("cookie:{value}"),
            SessionCredential::NativeToken(value) => format!("native:{value}"),
        };
        self.requests.lock().unwrap().push((credential, practice));
        self.response.lock().unwrap().clone()
    }
}

#[derive(Debug, PartialEq)]
struct ObservedContext {
    identity_id: Uuid,
    actor: ActorId,
    practice: PracticeId,
    principal: Principal,
    expires_at: DateTime<Utc>,
}
impl From<&ClinicalContext> for ObservedContext {
    fn from(context: &ClinicalContext) -> Self {
        Self {
            identity_id: context.identity_id,
            actor: context.actor,
            practice: context.practice,
            principal: context.principal,
            expires_at: context.expires_at,
        }
    }
}
struct Cases {
    reads: AtomicUsize,
    commands: Mutex<Vec<(ObservedContext, GateCommand)>>,
    read_error: Mutex<Option<GateError>>,
    command_error: Mutex<Option<GateError>>,
    lookup: Mutex<Option<GateCommandResult>>,
}
#[async_trait]
impl CaseRepository for Cases {
    async fn read_verified_gate(
        &self,
        _: &ClinicalContext,
        case: Uuid,
    ) -> Result<GateSnapshot, GateError> {
        self.reads.fetch_add(1, Ordering::SeqCst);
        if let Some(error) = *self.read_error.lock().unwrap() {
            return Err(error);
        }
        Ok(snapshot(case))
    }
    async fn execute_gate_command(
        &self,
        context: &ClinicalContext,
        command: &GateCommand,
    ) -> Result<GateCommandResult, GateError> {
        self.commands
            .lock()
            .unwrap()
            .push((context.into(), command.clone()));
        if let Some(error) = *self.command_error.lock().unwrap() {
            return Err(error);
        }
        let mut response = result(command.case_id, command.command_id);
        response.kind = command.kind;
        response.action = command.action;
        Ok(response)
    }
    async fn lookup_gate_command(
        &self,
        _: &ClinicalContext,
        _: Uuid,
    ) -> Result<Option<GateCommandResult>, GateError> {
        Ok(self.lookup.lock().unwrap().clone())
    }
    async fn gate_state(&self, _: CaseId) -> Result<GateState, DomainError> {
        panic!("legacy read")
    }
    async fn record_affirmation(
        &self,
        _: CaseId,
        _: GateAffirmationKind,
        _: ActorId,
        _: DateTime<Utc>,
    ) -> Result<GateState, DomainError> {
        panic!("legacy write")
    }
}

struct Authority {
    allow: Mutex<Result<bool, GateError>>,
    calls: AtomicUsize,
}
#[async_trait]
impl AuthorityPort for Authority {
    async fn may_affirm_gate(&self, _: &ClinicalContext, _: Uuid) -> Result<bool, GateError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        *self.allow.lock().unwrap()
    }
    async fn holds(&self, _: ActorId, _: Capability) -> Result<bool, DomainError> {
        panic!("legacy authority")
    }
}
struct Unused;
impl Clock for Unused {
    fn now(&self) -> DateTime<Utc> {
        now()
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
        panic!("criteria")
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
        panic!("retrievals")
    }
    async fn sign(&self, _: LetterId, _: ActorId, _: DateTime<Utc>) -> Result<Letter, DomainError> {
        panic!("sign")
    }
}

struct PolicyTargets {
    signing_error: Mutex<Option<SigningError>>,
    reassessment_error: Mutex<Option<ReassessmentError>>,
}
#[async_trait]
impl EvidenceRepository for PolicyTargets {
    async fn read_reassessment_target(
        &self,
        _: &ClinicalContext,
        _: Uuid,
        _: Uuid,
    ) -> Result<EvidenceReassessmentTarget, ReassessmentError> {
        Err(self
            .reassessment_error
            .lock()
            .unwrap()
            .unwrap_or(ReassessmentError::Unavailable))
    }
    async fn counts(&self, _: CaseId) -> Result<EvidenceCounts, DomainError> {
        panic!("evidence counts")
    }
}
#[async_trait]
impl LetterRepository for PolicyTargets {
    async fn read_signing_target(
        &self,
        _: &ClinicalContext,
        _: LetterId,
    ) -> Result<SigningTarget, SigningError> {
        Err(self
            .signing_error
            .lock()
            .unwrap()
            .unwrap_or(SigningError::Unavailable))
    }
    async fn get(&self, _: LetterId) -> Result<Letter, DomainError> {
        panic!("letter")
    }
    async fn unresolved_non_policy_retrievals(
        &self,
        _: LetterId,
    ) -> Result<Vec<CriterionId>, DomainError> {
        panic!("retrievals")
    }
    async fn sign(&self, _: LetterId, _: ActorId, _: DateTime<Utc>) -> Result<Letter, DomainError> {
        panic!("sign")
    }
}

struct Fixture {
    app: Router,
    sessions: Arc<Sessions>,
    cases: Arc<Cases>,
    authority: Arc<Authority>,
    policy_targets: Arc<PolicyTargets>,
}
impl Fixture {
    fn new() -> Self {
        let sessions = Arc::new(Sessions {
            response: Mutex::new(Ok(summary())),
            requests: Mutex::new(vec![]),
        });
        let cases = Arc::new(Cases {
            reads: AtomicUsize::new(0),
            commands: Mutex::new(vec![]),
            read_error: Mutex::new(None),
            command_error: Mutex::new(None),
            lookup: Mutex::new(None),
        });
        let authority = Arc::new(Authority {
            allow: Mutex::new(Ok(true)),
            calls: AtomicUsize::new(0),
        });
        let policy_targets = Arc::new(PolicyTargets {
            signing_error: Mutex::new(None),
            reassessment_error: Mutex::new(None),
        });
        let unused = Arc::new(Unused);
        let services = Arc::new(AppServices {
            sessions: sessions.clone(),
            cases: cases.clone(),
            authority: authority.clone(),
            evidence: policy_targets.clone(),
            criteria: unused.clone(),
            letters: policy_targets.clone(),
            clock: unused,
        });
        Self {
            app: crate::api_router(ServerState { services }),
            sessions,
            cases,
            authority,
            policy_targets,
        }
    }
    async fn request(&self, method: &str, uri: &str, body: Value) -> Response {
        self.raw(
            method,
            uri,
            &body.to_string(),
            &[("Authorization", "Bearer synthetic-router-token")],
        )
        .await
    }
    async fn raw(&self, method: &str, uri: &str, body: &str, headers: &[(&str, &str)]) -> Response {
        let mut request = Request::builder()
            .method(method)
            .uri(uri)
            .header("Content-Type", "application/json");
        for (name, value) in headers {
            request = request.header(*name, *value);
        }
        let response = self
            .app
            .clone()
            .oneshot(request.body(Body::from(body.to_owned())).unwrap())
            .await
            .unwrap();
        assert_eq!(
            response.headers().get(header::CACHE_CONTROL).unwrap(),
            "no-store"
        );
        assert_eq!(
            response.headers().get(header::VARY).unwrap(),
            "Cookie, Authorization, X-Session-Token"
        );
        response
    }
    async fn policy(&self, method: &str, uri: &str) -> Response {
        self.request(
            "POST",
            "/internal/gate/authorize",
            json!({"method":method,"uri":uri}),
        )
        .await
    }
    fn no_commands(&self) {
        assert!(self.cases.commands.lock().unwrap().is_empty());
    }
}
async fn expect_error(response: Response, status: StatusCode, code: &str) {
    assert_eq!(response.status(), status);
    let body = to_bytes(response.into_body(), 4096).await.unwrap();
    assert_eq!(
        serde_json::from_slice::<Value>(&body).unwrap(),
        json!({"error":code})
    );
}
fn mutation() -> Value {
    json!({"commandId":id(5),"kind":"policy"})
}
fn gate() -> String {
    format!("/api/cases/{}/gate", id(4))
}

#[tokio::test]
async fn each_command_resolves_fresh_context_and_ignores_identity_headers() {
    let fixture = Fixture::new();
    let selected = id(30);
    for (index, operation) in ["affirm", "remove"].into_iter().enumerate() {
        let mut current = summary();
        current.identity_id = id(100 + index as u128);
        current.user_id = id(200 + index as u128);
        current.practice_id = selected;
        *fixture.sessions.response.lock().unwrap() = Ok(current.clone());
        let uri = format!("{}/{operation}?practiceId={selected}", gate());
        let response = fixture
            .raw(
                "POST",
                &uri,
                &mutation().to_string(),
                &[
                    ("Authorization", "Bearer synthetic-router-token"),
                    ("X-User-Id", "forged-user"),
                    ("X-Practice-Id", "forged-practice"),
                    ("X-Flint-User-Id", "forged-identity"),
                    ("X-Flint-Principal-Type", "Agent"),
                    ("X-Role", "administrator"),
                ],
            )
            .await;
        assert_eq!(response.status(), StatusCode::OK);
        let commands = fixture.cases.commands.lock().unwrap();
        assert_eq!(
            commands[index].0,
            ObservedContext {
                identity_id: current.identity_id,
                actor: ActorId(current.user_id),
                practice: PracticeId(selected),
                principal: Principal::User,
                expires_at: current.expires_at
            }
        );
        assert_eq!(commands[index].1.command_id, id(5));
        assert_eq!(commands[index].1.case_id, id(4));
        assert_eq!(commands[index].1.kind, GateAffirmationKind::Policy);
        assert_eq!(
            commands[index].1.action,
            if index == 0 {
                GateAction::Affirm
            } else {
                GateAction::Remove
            }
        );
    }
    assert_eq!(
        *fixture.sessions.requests.lock().unwrap(),
        vec![
            ("native:synthetic-router-token".into(), Some(selected)),
            ("native:synthetic-router-token".into(), Some(selected)),
        ]
    );
    assert_eq!(fixture.authority.calls.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn expiry_and_nonhuman_principals_are_denied_with_accepting_downstream_ports() {
    for (principal, expired, status, code) in [
        (
            Principal::User,
            true,
            StatusCode::UNAUTHORIZED,
            "unauthenticated",
        ),
        (
            Principal::Agent,
            false,
            StatusCode::FORBIDDEN,
            "gate_denied",
        ),
        (
            Principal::Service,
            false,
            StatusCode::FORBIDDEN,
            "gate_denied",
        ),
    ] {
        let fixture = Fixture::new();
        let mut session = summary();
        session.principal = principal;
        if expired {
            session.expires_at = now();
        }
        *fixture.sessions.response.lock().unwrap() = Ok(session);
        for operation in ["affirm", "remove"] {
            expect_error(
                fixture
                    .request("POST", &format!("{}/{operation}", gate()), mutation())
                    .await,
                status,
                code,
            )
            .await;
            expect_error(
                fixture
                    .policy("POST", &format!("{}/{operation}", gate()))
                    .await,
                status,
                code,
            )
            .await;
        }
        expect_error(
            fixture.request("GET", &gate(), Value::Null).await,
            status,
            code,
        )
        .await;
        expect_error(fixture.policy("GET", &gate()).await, status, code).await;
        fixture.no_commands();
        assert_eq!(fixture.cases.reads.load(Ordering::SeqCst), 0);
        assert_eq!(fixture.authority.calls.load(Ordering::SeqCst), 0);
    }
}

#[tokio::test]
async fn policy_checks_fresh_capability_without_calling_service_authority_or_commands() {
    let fixture = Fixture::new();
    // The callback must allow an authorized human even when AppServices authority would deny.
    *fixture.authority.allow.lock().unwrap() = Ok(false);
    assert_eq!(
        fixture
            .policy("POST", &format!("{}/affirm", gate()))
            .await
            .status(),
        StatusCode::NO_CONTENT
    );
    let mut admin = summary();
    admin.capabilities = vec!["configure".into(), "view_audit".into()];
    *fixture.sessions.response.lock().unwrap() = Ok(admin);
    for operation in ["affirm", "remove"] {
        expect_error(
            fixture
                .policy("POST", &format!("{}/{operation}", gate()))
                .await,
            StatusCode::FORBIDDEN,
            "gate_denied",
        )
        .await;
    }
    assert_eq!(
        fixture.policy("GET", &gate()).await.status(),
        StatusCode::NO_CONTENT
    );
    assert_eq!(fixture.sessions.requests.lock().unwrap().len(), 4);
    assert_eq!(fixture.cases.reads.load(Ordering::SeqCst), 2);
    assert_eq!(fixture.authority.calls.load(Ordering::SeqCst), 0);
    fixture.no_commands();
}

#[tokio::test]
async fn service_authority_denies_after_independent_policy_allows() {
    let fixture = Fixture::new();
    *fixture.authority.allow.lock().unwrap() = Ok(false);
    assert_eq!(
        fixture
            .policy("POST", &format!("{}/affirm", gate()))
            .await
            .status(),
        StatusCode::NO_CONTENT
    );
    expect_error(
        fixture
            .request("POST", &format!("{}/affirm", gate()), mutation())
            .await,
        StatusCode::FORBIDDEN,
        "gate_denied",
    )
    .await;
    assert_eq!(fixture.authority.calls.load(Ordering::SeqCst), 1);
    fixture.no_commands();
}

#[tokio::test]
async fn policy_propagates_case_scope_denial_and_backend_unavailability() {
    let fixture = Fixture::new();
    for (error, status, code) in [
        (GateError::Denied, StatusCode::FORBIDDEN, "gate_denied"),
        (GateError::NotFound, StatusCode::NOT_FOUND, "gate_not_found"),
        (
            GateError::Unavailable,
            StatusCode::SERVICE_UNAVAILABLE,
            "gate_unavailable",
        ),
    ] {
        *fixture.cases.read_error.lock().unwrap() = Some(error);
        expect_error(
            fixture.policy("POST", &format!("{}/affirm", gate())).await,
            status,
            code,
        )
        .await;
    }
    assert_eq!(fixture.authority.calls.load(Ordering::SeqCst), 0);
    fixture.no_commands();
}

#[tokio::test]
async fn letter_policy_preserves_target_read_outages() {
    let fixture = Fixture::new();
    let mut session = summary();
    session.capabilities = vec!["sign_letter".into()];
    *fixture.sessions.response.lock().unwrap() = Ok(session);
    let uri = format!("/api/letters/{}/sign", id(6));

    for (backend_error, status, code) in [
        (SigningError::Denied, StatusCode::FORBIDDEN, "gate_denied"),
        (SigningError::NotFound, StatusCode::FORBIDDEN, "gate_denied"),
        (
            SigningError::Unavailable,
            StatusCode::SERVICE_UNAVAILABLE,
            "gate_unavailable",
        ),
        (
            SigningError::NativeAuthenticationUnavailable,
            StatusCode::SERVICE_UNAVAILABLE,
            "gate_unavailable",
        ),
    ] {
        *fixture.policy_targets.signing_error.lock().unwrap() = Some(backend_error);
        expect_error(fixture.policy("POST", &uri).await, status, code).await;
    }
    fixture.no_commands();
}

#[tokio::test]
async fn evidence_policy_preserves_target_read_outages() {
    let fixture = Fixture::new();
    let mut session = summary();
    session.capabilities = vec!["annotate".into()];
    *fixture.sessions.response.lock().unwrap() = Ok(session);
    let uri = format!("/api/cases/{}/evidence/{}/state", id(6), id(7));

    for (backend_error, status, code) in [
        (
            ReassessmentError::Denied,
            StatusCode::FORBIDDEN,
            "gate_denied",
        ),
        (
            ReassessmentError::NotFound,
            StatusCode::FORBIDDEN,
            "gate_denied",
        ),
        (
            ReassessmentError::Unavailable,
            StatusCode::SERVICE_UNAVAILABLE,
            "gate_unavailable",
        ),
        (
            ReassessmentError::NativeAuthenticationUnavailable,
            StatusCode::SERVICE_UNAVAILABLE,
            "gate_unavailable",
        ),
    ] {
        *fixture.policy_targets.reassessment_error.lock().unwrap() = Some(backend_error);
        expect_error(fixture.policy("POST", &uri).await, status, code).await;
    }
    fixture.no_commands();
}

#[tokio::test]
async fn mutation_requires_command_id_and_kind_and_rejects_injected_actor() {
    let fixture = Fixture::new();
    for body in [
        json!({"kind":"policy"}),
        json!({"commandId":id(5)}),
        json!({"commandId":id(5),"kind":"policy","actor":id(90)}),
        json!({"commandId":id(5),"kind":"policy","principal":"user"}),
        json!({"commandId":id(5),"kind":"policy","practiceId":id(3)}),
        json!({"commandId":id(5),"kind":"unknown"}),
    ] {
        expect_error(
            fixture
                .request("POST", &format!("{}/affirm", gate()), body)
                .await,
            StatusCode::BAD_REQUEST,
            "invalid_gate_request",
        )
        .await;
    }
    assert!(fixture.sessions.requests.lock().unwrap().is_empty());
    fixture.no_commands();
}

#[tokio::test]
async fn malformed_path_query_and_json_are_sanitized_and_never_cached() {
    let fixture = Fixture::new();
    for uri in [
        "/api/cases/not-a-uuid/gate/affirm".into(),
        format!("{}/affirm?practiceId=not-a-uuid", gate()),
        format!("{}/affirm?role=surgeon", gate()),
        format!(
            "{}/affirm?practiceId={}&practiceId={}",
            gate(),
            id(3),
            id(30)
        ),
    ] {
        expect_error(
            fixture.request("POST", &uri, mutation()).await,
            StatusCode::BAD_REQUEST,
            "invalid_gate_request",
        )
        .await;
    }
    expect_error(
        fixture
            .raw(
                "POST",
                &format!("{}/affirm", gate()),
                "{invalid",
                &[("Authorization", "Bearer synthetic-router-token")],
            )
            .await,
        StatusCode::BAD_REQUEST,
        "invalid_gate_request",
    )
    .await;
    expect_error(
        fixture
            .request(
                "GET",
                &format!("{}/commands/not-a-uuid", gate()),
                Value::Null,
            )
            .await,
        StatusCode::BAD_REQUEST,
        "invalid_gate_request",
    )
    .await;
    for uri in [
        format!("https://untrusted.invalid{}/affirm", gate()),
        format!("{}/affirm?practiceId=bad", gate()),
        "/api/cases/bad/gate/affirm".into(),
        format!("{}/commands/bad", gate()),
    ] {
        expect_error(
            fixture.policy("POST", &uri).await,
            StatusCode::BAD_REQUEST,
            "invalid_gate_request",
        )
        .await;
    }
    expect_error(
        fixture
            .request(
                "POST",
                "/internal/gate/authorize",
                json!({"method":"POST","uri":format!("{}/affirm",gate()),"actor":id(2)}),
            )
            .await,
        StatusCode::BAD_REQUEST,
        "invalid_gate_request",
    )
    .await;
    assert!(fixture.sessions.requests.lock().unwrap().is_empty());
    fixture.no_commands();
}

#[tokio::test]
async fn raw_credentials_accept_each_single_source_and_reject_ambiguity() {
    let fixture = Fixture::new();
    for headers in [
        vec![("Authorization", "Bearer synthetic-router-token")],
        vec![("X-Session-Token", "synthetic-router-token")],
        vec![("Cookie", "ory_kratos_session=synthetic-router-cookie")],
    ] {
        assert_eq!(
            fixture.raw("GET", &gate(), "null", &headers).await.status(),
            StatusCode::OK
        );
    }
    assert_eq!(fixture.sessions.requests.lock().unwrap().len(), 3);
    for headers in [
        vec![],
        vec![
            ("Cookie", "ory_kratos_session=synthetic-router-cookie"),
            ("Authorization", "Bearer synthetic-router-token"),
        ],
        vec![(
            "Cookie",
            "ory_kratos_session=first; ory_kratos_session=second",
        )],
        vec![
            ("X-Session-Token", "synthetic-router-token"),
            ("Authorization", "Bearer synthetic-router-token"),
        ],
        vec![
            ("Authorization", "Bearer first"),
            ("Authorization", "Bearer second"),
        ],
    ] {
        expect_error(
            fixture
                .raw(
                    "POST",
                    &format!("{}/affirm", gate()),
                    &mutation().to_string(),
                    &headers,
                )
                .await,
            StatusCode::UNAUTHORIZED,
            "unauthenticated",
        )
        .await;
        expect_error(
            fixture
                .raw(
                    "POST",
                    "/internal/gate/authorize",
                    &json!({"method":"POST","uri":format!("{}/affirm",gate())}).to_string(),
                    &headers,
                )
                .await,
            StatusCode::UNAUTHORIZED,
            "unauthenticated",
        )
        .await;
    }
    assert_eq!(fixture.sessions.requests.lock().unwrap().len(), 3);
    fixture.no_commands();
}

#[tokio::test]
async fn session_and_command_failures_have_only_sanitized_error_codes() {
    let fixture = Fixture::new();
    for (error, status, code) in [
        (
            SessionError::Unauthenticated,
            StatusCode::UNAUTHORIZED,
            "unauthenticated",
        ),
        (
            SessionError::ReauthenticationRequired,
            StatusCode::FORBIDDEN,
            "reauthentication_required",
        ),
        (
            SessionError::PracticeDenied,
            StatusCode::FORBIDDEN,
            "practice_denied",
        ),
        (
            SessionError::Unavailable,
            StatusCode::SERVICE_UNAVAILABLE,
            "session_unavailable",
        ),
        (
            SessionError::NativeAuthenticationUnavailable,
            StatusCode::SERVICE_UNAVAILABLE,
            "session_unavailable",
        ),
    ] {
        *fixture.sessions.response.lock().unwrap() = Err(error);
        expect_error(
            fixture
                .request("POST", &format!("{}/affirm", gate()), mutation())
                .await,
            status,
            code,
        )
        .await;
        expect_error(
            fixture.policy("POST", &format!("{}/affirm", gate())).await,
            status,
            code,
        )
        .await;
    }
    fixture.no_commands();
    *fixture.sessions.response.lock().unwrap() = Ok(summary());
    for (error, status, code) in [
        (
            GateError::Unauthenticated,
            StatusCode::UNAUTHORIZED,
            "unauthenticated",
        ),
        (GateError::Denied, StatusCode::FORBIDDEN, "gate_denied"),
        (GateError::NotFound, StatusCode::NOT_FOUND, "gate_not_found"),
        (
            GateError::CommandConflict,
            StatusCode::CONFLICT,
            "command_conflict",
        ),
        (
            GateError::Unavailable,
            StatusCode::SERVICE_UNAVAILABLE,
            "gate_unavailable",
        ),
        (
            GateError::NativeAuthenticationUnavailable,
            StatusCode::SERVICE_UNAVAILABLE,
            "gate_unavailable",
        ),
    ] {
        *fixture.cases.command_error.lock().unwrap() = Some(error);
        expect_error(
            fixture
                .request("POST", &format!("{}/affirm", gate()), mutation())
                .await,
            status,
            code,
        )
        .await;
    }
}

#[tokio::test]
async fn lookup_does_not_return_a_command_from_a_different_case() {
    let fixture = Fixture::new();
    *fixture.cases.lookup.lock().unwrap() = Some(result(id(40), id(5)));
    let uri = format!("{}/commands/{}", gate(), id(5));
    expect_error(
        fixture.request("GET", &uri, Value::Null).await,
        StatusCode::NOT_FOUND,
        "gate_not_found",
    )
    .await;
    *fixture.cases.lookup.lock().unwrap() = Some(result(id(4), id(5)));
    let response = fixture.request("GET", &uri, Value::Null).await;
    assert_eq!(response.status(), StatusCode::OK);
    let bytes = to_bytes(response.into_body(), 4096).await.unwrap();
    assert_eq!(
        serde_json::from_slice::<GateCommandResult>(&bytes).unwrap(),
        result(id(4), id(5))
    );
    assert_eq!(fixture.sessions.requests.lock().unwrap().len(), 2);
    assert_eq!(fixture.cases.reads.load(Ordering::SeqCst), 2);
    fixture.no_commands();
}

#[tokio::test]
async fn trusted_session_service_refuses_agent_before_membership_resolution() {
    let memberships = Arc::new(AcceptingMemberships {
        calls: AtomicUsize::new(0),
    });
    let service = SessionService {
        identities: Arc::new(AgentIdentity),
        memberships: memberships.clone(),
        clock: Arc::new(Unused),
    };
    assert_eq!(
        service
            .resolve(
                &SessionCredential::NativeToken("synthetic-agent-credential".into()),
                Some(id(3)),
            )
            .await,
        Err(SessionError::PracticeDenied),
    );
    assert_eq!(memberships.calls.load(Ordering::SeqCst), 0);
}
