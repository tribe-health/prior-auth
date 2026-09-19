use super::*;
use aso_host::{
    AppServices,
    administering_entity::{
        AdministeringEntityResolution, ResolutionCommandReceipt, ResolutionError, ResolutionState,
        ResolveAdministeringEntityCommand,
    },
    affirmation::ClinicalContext,
    case_management::{CaseAction, CreateCaseCommand, TransitionCaseCommand, UpdateCaseCommand},
    domain::*,
    ports::*,
    session::{Principal, SessionCredential, SessionPort, SessionSummary},
};
use async_trait::async_trait;
use axum::{
    body::{Body, to_bytes},
    http::Request,
};
use chrono::{DateTime, Duration, Utc};
use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
};
use tower::ServiceExt;

fn id(value: u128) -> Uuid {
    Uuid::from_u128(value)
}

fn now() -> DateTime<Utc> {
    "2026-09-16T12:00:00Z".parse().unwrap()
}

fn input() -> CaseInput {
    CaseInput {
        case_number: "SYN-HTTP-001".into(),
        patient_id: id(10),
        surgeon_id: id(11),
        coordinator_id: Some(id(12)),
        facility_id: None,
        payer_id: id(13),
        member_id: Some("SYN-MEMBER-001".into()),
        date_of_service: Some("2026-04-15".parse().unwrap()),
        procedure_code: Some("SYN-LUMBAR-001".into()),
        plan_key: Some("synthetic-ppo".into()),
        data: serde_json::json!({}),
    }
}

fn record(case_id: Uuid, input: &CaseInput) -> CaseRecord {
    CaseRecord {
        id: case_id,
        practice_id: id(3),
        patient_id: input.patient_id,
        surgeon_id: input.surgeon_id,
        coordinator_id: input.coordinator_id,
        facility_id: input.facility_id,
        payer_id: input.payer_id,
        case_number: input.case_number.clone(),
        status: CaseStatus::Intake,
        member_id: input.member_id.clone(),
        date_of_service: input.date_of_service,
        procedure_code: input.procedure_code.clone(),
        plan_key: input.plan_key.clone(),
        data: input.data.clone(),
        gate_affirmed_at: None,
        gate_affirmed_by: None,
        revision: 1,
        case_input_revision: 1,
        status_revision: 0,
        document_set_revision: 0,
        created_at: now(),
        updated_at: None,
    }
}

struct Sessions {
    principal: Mutex<Principal>,
    capabilities: Mutex<Vec<String>>,
}

#[async_trait]
impl SessionPort for Sessions {
    async fn resolve(
        &self,
        _: &SessionCredential,
        practice: Option<Uuid>,
    ) -> Result<SessionSummary, SessionError> {
        if practice.is_some_and(|practice| practice != id(3)) {
            return Err(SessionError::PracticeDenied);
        }
        Ok(SessionSummary {
            identity_id: id(1),
            session_id: id(9),
            user_id: id(2),
            practice_id: id(3),
            display_name: "Synthetic Coordinator".into(),
            principal: *self.principal.lock().unwrap(),
            capabilities: self.capabilities.lock().unwrap().clone(),
            expires_at: now() + Duration::hours(1),
            authorization_revision: "synthetic:case-http".into(),
        })
    }
}

struct FixedClock;
impl Clock for FixedClock {
    fn now(&self) -> DateTime<Utc> {
        now()
    }
}

#[derive(Default)]
struct CaseState {
    case: Option<CaseRecord>,
    commands: HashMap<Uuid, (serde_json::Value, CaseCommandResult)>,
    resolution: Option<AdministeringEntityResolution>,
    resolution_commands: HashMap<Uuid, ResolutionCommandReceipt>,
}

#[derive(Default)]
struct Cases {
    state: Mutex<CaseState>,
    next_error: Mutex<Option<CaseError>>,
    next_resolution_error: Mutex<Option<ResolutionError>>,
    reads: AtomicUsize,
    writes: AtomicUsize,
}

impl Cases {
    fn fail(&self) -> Result<(), CaseError> {
        match self.next_error.lock().unwrap().take() {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }

    fn fail_resolution(&self) -> Result<(), ResolutionError> {
        match self.next_resolution_error.lock().unwrap().take() {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }

    fn prior(
        state: &CaseState,
        command_id: Uuid,
        payload: &serde_json::Value,
    ) -> Result<Option<CaseCommandResult>, CaseError> {
        match state.commands.get(&command_id) {
            Some((original, result)) if original == payload => Ok(Some(result.clone())),
            Some(_) => Err(CaseError::CommandConflict),
            None => Ok(None),
        }
    }
}

#[async_trait]
impl CaseRepository for Cases {
    async fn authorize_administering_entity_target(
        &self,
        _: &ClinicalContext,
        case_id: Uuid,
    ) -> Result<(), ResolutionError> {
        self.reads.fetch_add(1, Ordering::SeqCst);
        self.state
            .lock()
            .unwrap()
            .case
            .as_ref()
            .filter(|case| case.id == case_id)
            .map(|_| ())
            .ok_or(ResolutionError::NotFound)
    }

    async fn resolve_administering_entity(
        &self,
        _: &ClinicalContext,
        command: &ResolveAdministeringEntityCommand,
    ) -> Result<ResolutionCommandReceipt, ResolutionError> {
        self.fail_resolution()?;
        let mut state = self.state.lock().unwrap();
        let case = state
            .case
            .as_ref()
            .filter(|case| case.id == command.case_id)
            .ok_or(ResolutionError::NotFound)?;
        if case.case_input_revision != command.expected_case_input_revision {
            return Err(ResolutionError::RevisionConflict);
        }
        if let Some(receipt) = state.resolution_commands.get(&command.command_id) {
            return Ok(receipt.clone());
        }
        let receipt = ResolutionCommandReceipt {
            command_id: command.command_id,
            case_id: command.case_id,
            state: ResolutionState::Resolved,
            resolution_revision: 1,
            case_input_revision: case.case_input_revision,
            committed_at: now(),
            entity_id: Some(id(40)),
            entity_name: Some("Synthetic Utilization Partner".into()),
            criteria_set_key: Some("synthetic-lumbar-fusion-2026".into()),
            submission_channel_key: Some("manual_synthetic".into()),
            appeal_path_key: Some("synthetic-standard-appeal".into()),
            source_document_id: Some(id(41)),
            source_document_name: Some("Synthetic delegation source".into()),
            source_document_effective_date: Some("2026-01-01".parse().unwrap()),
            valid_from: Some("2026-01-01".parse().unwrap()),
            valid_to: None,
            entity_revision: Some(1),
            plan_revision: Some(1),
            enrollment_revision: Some(1),
            rule_revision: Some(1),
            source_document_version: Some(1),
        };
        state.resolution = Some(AdministeringEntityResolution {
            case_id: command.case_id,
            entity_id: Some(id(40)),
            entity_name: Some("Synthetic Utilization Partner".into()),
            criteria_set_key: Some("synthetic-lumbar-fusion-2026".into()),
            submission_channel_key: Some("manual_synthetic".into()),
            appeal_path_key: Some("synthetic-standard-appeal".into()),
            source_document_id: Some(id(41)),
            source_document_name: Some("Synthetic delegation source".into()),
            source_document_effective_date: Some("2026-01-01".parse().unwrap()),
            source_document_version: Some(1),
            entity_revision: Some(1),
            plan_revision: Some(1),
            enrollment_revision: Some(1),
            rule_revision: Some(1),
            valid_from: Some("2026-01-01".parse().unwrap()),
            valid_to: None,
            state: ResolutionState::Resolved,
            revision: 1,
            case_input_revision: case.case_input_revision,
            resolved_at: now(),
        });
        state
            .resolution_commands
            .insert(command.command_id, receipt.clone());
        self.writes.fetch_add(1, Ordering::SeqCst);
        Ok(receipt)
    }

    async fn read_administering_entity(
        &self,
        _: &ClinicalContext,
        case_id: Uuid,
    ) -> Result<AdministeringEntityResolution, ResolutionError> {
        self.fail_resolution()?;
        self.reads.fetch_add(1, Ordering::SeqCst);
        self.state
            .lock()
            .unwrap()
            .resolution
            .clone()
            .filter(|resolution| resolution.case_id == case_id)
            .ok_or(ResolutionError::NotFound)
    }

    async fn lookup_administering_entity_command(
        &self,
        _: &ClinicalContext,
        case_id: Uuid,
        command_id: Uuid,
    ) -> Result<Option<ResolutionCommandReceipt>, ResolutionError> {
        self.fail_resolution()?;
        Ok(self
            .state
            .lock()
            .unwrap()
            .resolution_commands
            .get(&command_id)
            .filter(|receipt| receipt.case_id == case_id)
            .cloned())
    }

    async fn create_case(
        &self,
        _: &ClinicalContext,
        command: &CreateCaseCommand,
    ) -> Result<CaseCommandResult, CaseError> {
        self.fail()?;
        let payload = serde_json::to_value(command).unwrap();
        let mut state = self.state.lock().unwrap();
        if let Some(result) = Self::prior(&state, command.command_id, &payload)? {
            return Ok(result);
        }
        let created = record(command.case_id, &command.input);
        let result = CaseCommandResult {
            command_id: command.command_id,
            action: CaseAction::Create,
            case_id: command.case_id,
            committed_at: now(),
        };
        state.case = Some(created);
        state
            .commands
            .insert(command.command_id, (payload, result.clone()));
        self.writes.fetch_add(1, Ordering::SeqCst);
        Ok(result)
    }

    async fn update_case(
        &self,
        _: &ClinicalContext,
        command: &UpdateCaseCommand,
    ) -> Result<CaseCommandResult, CaseError> {
        self.fail()?;
        let payload = serde_json::to_value(command).unwrap();
        let mut state = self.state.lock().unwrap();
        if let Some(result) = Self::prior(&state, command.command_id, &payload)? {
            return Ok(result);
        }
        let current = state.case.as_ref().ok_or(CaseError::NotFound)?;
        if current.revision != command.expected_revision {
            return Err(CaseError::RevisionConflict);
        }
        let mut updated = record(command.case_id, &command.input);
        updated.status = current.status;
        updated.revision = current.revision + 1;
        updated.case_input_revision = current.case_input_revision + 1;
        updated.status_revision = current.status_revision;
        let result = CaseCommandResult {
            command_id: command.command_id,
            action: CaseAction::Update,
            case_id: command.case_id,
            committed_at: now(),
        };
        state.case = Some(updated);
        state
            .commands
            .insert(command.command_id, (payload, result.clone()));
        self.writes.fetch_add(1, Ordering::SeqCst);
        Ok(result)
    }

    async fn transition_case(
        &self,
        _: &ClinicalContext,
        command: &TransitionCaseCommand,
    ) -> Result<CaseCommandResult, CaseError> {
        self.fail()?;
        let payload = serde_json::to_value(command).unwrap();
        let mut state = self.state.lock().unwrap();
        if let Some(result) = Self::prior(&state, command.command_id, &payload)? {
            return Ok(result);
        }
        let current = state.case.as_ref().ok_or(CaseError::NotFound)?;
        if current.status_revision != command.expected_status_revision {
            return Err(CaseError::RevisionConflict);
        }
        if (current.status, command.target_status) != (CaseStatus::Intake, CaseStatus::Evidence) {
            return Err(CaseError::InvalidTransition);
        }
        let mut updated = current.clone();
        updated.status = command.target_status;
        updated.revision += 1;
        updated.status_revision += 1;
        let result = CaseCommandResult {
            command_id: command.command_id,
            action: CaseAction::Transition,
            case_id: command.case_id,
            committed_at: now(),
        };
        state.case = Some(updated);
        state
            .commands
            .insert(command.command_id, (payload, result.clone()));
        self.writes.fetch_add(1, Ordering::SeqCst);
        Ok(result)
    }

    async fn read_case(&self, _: &ClinicalContext, case_id: Uuid) -> Result<CaseRecord, CaseError> {
        self.fail()?;
        self.reads.fetch_add(1, Ordering::SeqCst);
        self.state
            .lock()
            .unwrap()
            .case
            .clone()
            .filter(|case| case.id == case_id)
            .ok_or(CaseError::NotFound)
    }

    async fn authorize_case_write_target(
        &self,
        _: &ClinicalContext,
        case_id: Uuid,
    ) -> Result<(), CaseError> {
        self.fail()?;
        self.reads.fetch_add(1, Ordering::SeqCst);
        self.state
            .lock()
            .unwrap()
            .case
            .as_ref()
            .filter(|case| case.id == case_id)
            .map(|_| ())
            .ok_or(CaseError::NotFound)
    }

    async fn list_cases(&self, _: &ClinicalContext) -> Result<Vec<CaseRecord>, CaseError> {
        self.fail()?;
        self.reads.fetch_add(1, Ordering::SeqCst);
        Ok(self
            .state
            .lock()
            .unwrap()
            .case
            .clone()
            .into_iter()
            .collect())
    }

    async fn lookup_create_case_command(
        &self,
        _: &ClinicalContext,
        command_id: Uuid,
    ) -> Result<Option<CaseCommandResult>, CaseError> {
        self.fail()?;
        Ok(self
            .state
            .lock()
            .unwrap()
            .commands
            .get(&command_id)
            .map(|(_, result)| result.clone())
            .filter(|result| result.action == CaseAction::Create))
    }

    async fn lookup_case_command(
        &self,
        _: &ClinicalContext,
        case_id: Uuid,
        command_id: Uuid,
    ) -> Result<Option<CaseCommandResult>, CaseError> {
        self.fail()?;
        Ok(self
            .state
            .lock()
            .unwrap()
            .commands
            .get(&command_id)
            .map(|(_, result)| result.clone())
            .filter(|result| result.case_id == case_id))
    }

    async fn gate_state(&self, _: CaseId) -> Result<GateState, DomainError> {
        panic!("gate")
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

struct Unused;
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
        panic!("criteria")
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
#[async_trait]
impl AuthorityPort for Unused {
    async fn holds(&self, _: ActorId, _: Capability) -> Result<bool, DomainError> {
        panic!("authority")
    }
}

struct Fixture {
    app: Router,
    cases: Arc<Cases>,
    sessions: Arc<Sessions>,
}

impl Fixture {
    fn new() -> Self {
        let cases = Arc::new(Cases::default());
        let sessions = Arc::new(Sessions {
            principal: Mutex::new(Principal::User),
            capabilities: Mutex::new(vec![
                "case:read".into(),
                "case_write".into(),
                "resolve_administering_entity".into(),
            ]),
        });
        let unused = Arc::new(Unused);
        let services = Arc::new(AppServices {
            cases: cases.clone(),
            evidence: unused.clone(),
            criteria: unused.clone(),
            letters: unused.clone(),
            authority: unused,
            clock: Arc::new(FixedClock),
            sessions: sessions.clone(),
        });
        Self {
            app: crate::api_router(ServerState { services }),
            cases,
            sessions,
        }
    }

    async fn request(&self, method: &str, uri: &str, body: serde_json::Value) -> Response {
        self.app
            .clone()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(uri)
                    .header("content-type", "application/json")
                    .header("authorization", "Bearer synthetic-case-token")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap()
    }
}

async fn body(response: Response) -> serde_json::Value {
    let bytes = to_bytes(response.into_body(), 64 * 1024).await.unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

fn assert_safe_command_receipt(value: &serde_json::Value, case_id: Uuid) {
    let object = value
        .as_object()
        .expect("command receipt must be an object");
    let mut keys = object.keys().map(String::as_str).collect::<Vec<_>>();
    keys.sort_unstable();
    assert_eq!(keys, ["action", "caseId", "commandId", "committedAt"]);
    assert_eq!(value["caseId"], case_id.to_string());
}

fn assert_safe_resolution_receipt(value: &serde_json::Value, case_id: Uuid) {
    let object = value
        .as_object()
        .expect("resolution receipt must be an object");
    let mut keys = object.keys().map(String::as_str).collect::<Vec<_>>();
    keys.sort_unstable();
    assert_eq!(
        keys,
        [
            "appealPathKey",
            "caseId",
            "caseInputRevision",
            "commandId",
            "committedAt",
            "criteriaSetKey",
            "enrollmentRevision",
            "entityId",
            "entityName",
            "entityRevision",
            "planRevision",
            "resolutionRevision",
            "ruleRevision",
            "sourceDocumentEffectiveDate",
            "sourceDocumentId",
            "sourceDocumentName",
            "sourceDocumentVersion",
            "state",
            "submissionChannelKey",
            "validFrom",
            "validTo",
        ]
    );
    assert_eq!(value["caseId"], case_id.to_string());
    assert_eq!(value["entityName"], "Synthetic Utilization Partner");
    assert_eq!(value["sourceDocumentName"], "Synthetic delegation source");
    assert_eq!(value["sourceDocumentVersion"], 1);
}

#[tokio::test]
async fn administering_entity_http_contract_resolves_reloads_and_reconciles() {
    let fixture = Fixture::new();
    assert_eq!(
        fixture
            .request("POST", "/api/cases", create_body())
            .await
            .status(),
        StatusCode::OK
    );
    let resolved = fixture
        .request(
            "POST",
            &format!("/api/cases/{}/administering-entity", id(21)),
            serde_json::json!({
                "commandId": id(42),
                "expectedCaseInputRevision": 1,
            }),
        )
        .await;
    assert_eq!(resolved.status(), StatusCode::OK);
    assert_eq!(resolved.headers()[header::CACHE_CONTROL], "no-store");
    let receipt = body(resolved).await;
    assert_safe_resolution_receipt(&receipt, id(21));
    assert_eq!(receipt["state"], "resolved");

    let reloaded = fixture
        .request(
            "GET",
            &format!("/api/cases/{}/administering-entity", id(21)),
            serde_json::Value::Null,
        )
        .await;
    assert_eq!(reloaded.status(), StatusCode::OK);
    let resolution = body(reloaded).await;
    assert_eq!(resolution["state"], "resolved");
    assert_eq!(resolution["criteriaSetKey"], "synthetic-lumbar-fusion-2026");
    assert_eq!(resolution["entityRevision"], 1);
    assert_eq!(resolution["planRevision"], 1);
    assert_eq!(resolution["enrollmentRevision"], 1);
    assert_eq!(resolution["ruleRevision"], 1);
    assert_eq!(resolution["sourceDocumentVersion"], 1);

    let lookup = fixture
        .request(
            "GET",
            &format!(
                "/api/cases/{}/administering-entity/commands/{}",
                id(21),
                id(42)
            ),
            serde_json::Value::Null,
        )
        .await;
    assert_eq!(lookup.status(), StatusCode::OK);
    assert_eq!(body(lookup).await, receipt);
}

#[tokio::test]
async fn administering_entity_http_refuses_untrusted_selection() {
    let fixture = Fixture::new();
    assert_eq!(
        fixture
            .request("POST", "/api/cases", create_body())
            .await
            .status(),
        StatusCode::OK
    );
    let writes = fixture.cases.writes.load(Ordering::SeqCst);

    let response = fixture
        .request(
            "POST",
            &format!("/api/cases/{}/administering-entity", id(21)),
            serde_json::json!({
                "commandId": id(43),
                "expectedCaseInputRevision": 1,
                "entityId": id(99),
                "criteriaSetKey": "caller-selected-criteria",
                "submissionChannelKey": "caller-selected-channel",
                "appealPathKey": "caller-selected-appeal",
            }),
        )
        .await;

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(body(response).await["error"], "invalid_request");
    assert_eq!(fixture.cases.writes.load(Ordering::SeqCst), writes);
}

#[tokio::test]
async fn administering_entity_http_refuses_scope_capability_and_typed_failures() {
    let fixture = Fixture::new();
    assert_eq!(
        fixture
            .request("POST", "/api/cases", create_body())
            .await
            .status(),
        StatusCode::OK
    );
    let reads = fixture.cases.reads.load(Ordering::SeqCst);
    let foreign = fixture
        .request(
            "GET",
            &format!(
                "/api/cases/{}/administering-entity?practiceId={}",
                id(21),
                id(99)
            ),
            serde_json::Value::Null,
        )
        .await;
    assert_eq!(foreign.status(), StatusCode::FORBIDDEN);
    assert_eq!(body(foreign).await["error"], "action_forbidden");
    assert_eq!(fixture.cases.reads.load(Ordering::SeqCst), reads);

    *fixture.sessions.capabilities.lock().unwrap() = vec!["case:read".into()];
    let refused = fixture
        .request(
            "POST",
            &format!("/api/cases/{}/administering-entity", id(21)),
            serde_json::json!({
                "commandId": id(43),
                "expectedCaseInputRevision": 1,
            }),
        )
        .await;
    assert_eq!(refused.status(), StatusCode::FORBIDDEN);
    assert_eq!(body(refused).await["error"], "action_forbidden");

    *fixture.sessions.capabilities.lock().unwrap() = vec![
        "case:read".into(),
        "case_write".into(),
        "resolve_administering_entity".into(),
    ];
    for (source, status, code) in [
        (
            ResolutionError::InputsIncomplete,
            StatusCode::UNPROCESSABLE_ENTITY,
            "case_inputs_incomplete",
        ),
        (
            ResolutionError::RevisionConflict,
            StatusCode::CONFLICT,
            "stale_revision",
        ),
        (
            ResolutionError::CommandConflict,
            StatusCode::CONFLICT,
            "command_conflict",
        ),
        (
            ResolutionError::Unavailable,
            StatusCode::SERVICE_UNAVAILABLE,
            "service_unavailable",
        ),
    ] {
        *fixture.cases.next_resolution_error.lock().unwrap() = Some(source);
        let response = fixture
            .request(
                "POST",
                &format!("/api/cases/{}/administering-entity", id(21)),
                serde_json::json!({
                    "commandId": Uuid::new_v4(),
                    "expectedCaseInputRevision": 1,
                }),
            )
            .await;
        assert_eq!(response.status(), status);
        assert_eq!(body(response).await["error"], code);
    }
}

fn create_body() -> serde_json::Value {
    serde_json::json!({
        "commandId": id(20),
        "caseId": id(21),
        "input": input(),
    })
}

#[tokio::test]
async fn case_detail_http_requires_verified_practice_and_read_capability() {
    let fixture = Fixture::new();
    assert_eq!(
        fixture
            .request("POST", "/api/cases", create_body())
            .await
            .status(),
        StatusCode::OK
    );

    let authorized = fixture
        .request(
            "GET",
            &format!("/api/cases/{}?practiceId={}", id(21), id(3)),
            serde_json::Value::Null,
        )
        .await;
    assert_eq!(authorized.status(), StatusCode::OK);
    assert_eq!(authorized.headers()[header::CACHE_CONTROL], "no-store");
    let detail = body(authorized).await;
    assert_eq!(detail["memberId"], "SYN-MEMBER-001");
    assert_eq!(detail["procedureCode"], "SYN-LUMBAR-001");
    assert_eq!(detail["planKey"], "synthetic-ppo");

    *fixture.sessions.capabilities.lock().unwrap() = vec!["case_write".into()];
    let reads = fixture.cases.reads.load(Ordering::SeqCst);
    let missing_capability = fixture
        .request(
            "GET",
            &format!("/api/cases/{}?practiceId={}", id(21), id(3)),
            serde_json::Value::Null,
        )
        .await;
    assert_eq!(missing_capability.status(), StatusCode::FORBIDDEN);
    assert_eq!(body(missing_capability).await["error"], "action_forbidden");
    assert_eq!(fixture.cases.reads.load(Ordering::SeqCst), reads);

    *fixture.sessions.capabilities.lock().unwrap() = vec!["case:read".into()];
    let foreign_practice = fixture
        .request(
            "GET",
            &format!("/api/cases/{}?practiceId={}", id(21), id(99)),
            serde_json::Value::Null,
        )
        .await;
    assert_eq!(foreign_practice.status(), StatusCode::FORBIDDEN);
    assert_eq!(body(foreign_practice).await["error"], "action_forbidden");
    assert_eq!(fixture.cases.reads.load(Ordering::SeqCst), reads);

    *fixture.cases.next_error.lock().unwrap() = Some(CaseError::Denied);
    let refused_target = fixture
        .request(
            "GET",
            &format!("/api/cases/{}?practiceId={}", id(21), id(3)),
            serde_json::Value::Null,
        )
        .await;
    assert_eq!(refused_target.status(), StatusCode::FORBIDDEN);
    assert_eq!(body(refused_target).await["error"], "action_forbidden");
}

#[tokio::test]
async fn browser_contract_runs_case_lifecycle_and_reconciles_lost_responses() {
    let fixture = Fixture::new();
    let created = fixture.request("POST", "/api/cases", create_body()).await;
    assert_eq!(created.status(), StatusCode::OK);
    assert_eq!(created.headers()[header::CACHE_CONTROL], "no-store");
    let created = body(created).await;
    assert_safe_command_receipt(&created, id(21));

    let repeat = fixture.request("POST", "/api/cases", create_body()).await;
    assert_eq!(repeat.status(), StatusCode::OK);
    assert_eq!(body(repeat).await, created);
    assert_eq!(fixture.cases.writes.load(Ordering::SeqCst), 1);

    let lookup = fixture
        .request(
            "GET",
            &format!("/api/case-commands/{}", id(20)),
            serde_json::Value::Null,
        )
        .await;
    assert_eq!(lookup.status(), StatusCode::OK);
    assert_eq!(body(lookup).await, created);

    let detail = fixture
        .request(
            "GET",
            &format!("/api/cases/{}", id(21)),
            serde_json::Value::Null,
        )
        .await;
    assert_eq!(detail.status(), StatusCode::OK);
    assert_eq!(body(detail).await["caseNumber"], "SYN-HTTP-001");
    assert_eq!(
        fixture
            .request("GET", "/api/cases", serde_json::Value::Null)
            .await
            .status(),
        StatusCode::OK
    );

    let mut revised = input();
    revised.member_id = Some("SYN-MEMBER-002".into());
    let updated = fixture
        .request(
            "PATCH",
            &format!("/api/cases/{}", id(21)),
            serde_json::json!({
                "commandId": id(22), "expectedRevision": 1, "input": revised,
            }),
        )
        .await;
    assert_eq!(updated.status(), StatusCode::OK);
    assert_safe_command_receipt(&body(updated).await, id(21));

    let transitioned = fixture
        .request(
            "POST",
            &format!("/api/cases/{}/status", id(21)),
            serde_json::json!({
                "commandId": id(23),
                "expectedStatusRevision": 0,
                "targetStatus": "evidence",
            }),
        )
        .await;
    assert_eq!(transitioned.status(), StatusCode::OK);
    assert_safe_command_receipt(&body(transitioned).await, id(21));
    let transition_lookup = fixture
        .request(
            "GET",
            &format!("/api/cases/{}/commands/{}", id(21), id(23)),
            serde_json::Value::Null,
        )
        .await;
    assert_eq!(transition_lookup.status(), StatusCode::OK);
    let transition_lookup = body(transition_lookup).await;
    assert_safe_command_receipt(&transition_lookup, id(21));
    assert_eq!(transition_lookup["commandId"], id(23).to_string());
}

#[tokio::test]
async fn write_only_case_commands_return_receipts_without_protected_case_data() {
    let fixture = Fixture::new();
    *fixture.sessions.capabilities.lock().unwrap() = vec!["case_write".into()];

    let created = body(fixture.request("POST", "/api/cases", create_body()).await).await;
    assert_safe_command_receipt(&created, id(21));

    let transitioned = fixture
        .request(
            "POST",
            &format!("/api/cases/{}/status", id(21)),
            serde_json::json!({
                "commandId": id(23),
                "expectedStatusRevision": 0,
                "targetStatus": "evidence",
            }),
        )
        .await;
    assert_eq!(transitioned.status(), StatusCode::OK);
    assert_safe_command_receipt(&body(transitioned).await, id(21));

    let lookup = fixture
        .request(
            "GET",
            &format!("/api/cases/{}/commands/{}", id(21), id(23)),
            serde_json::Value::Null,
        )
        .await;
    assert_eq!(lookup.status(), StatusCode::OK);
    assert_safe_command_receipt(&body(lookup).await, id(21));
}

#[tokio::test]
async fn changed_payload_stale_revision_and_invalid_transition_are_stable_conflicts() {
    let fixture = Fixture::new();
    assert_eq!(
        fixture
            .request("POST", "/api/cases", create_body())
            .await
            .status(),
        StatusCode::OK
    );
    let mut changed = create_body();
    changed["input"]["caseNumber"] = "SYN-CHANGED".into();
    let conflict = fixture.request("POST", "/api/cases", changed).await;
    assert_eq!(conflict.status(), StatusCode::CONFLICT);
    assert_eq!(body(conflict).await["error"], "command_conflict");

    let stale = fixture
        .request(
            "PATCH",
            &format!("/api/cases/{}", id(21)),
            serde_json::json!({
                "commandId": id(30), "expectedRevision": 9, "input": input(),
            }),
        )
        .await;
    assert_eq!(stale.status(), StatusCode::CONFLICT);
    assert_eq!(body(stale).await["error"], "stale_revision");

    let invalid = fixture
        .request(
            "POST",
            &format!("/api/cases/{}/status", id(21)),
            serde_json::json!({
                "commandId": id(31),
                "expectedStatusRevision": 0,
                "targetStatus": "ready",
            }),
        )
        .await;
    assert_eq!(invalid.status(), StatusCode::CONFLICT);
    assert_eq!(body(invalid).await["error"], "invalid_transition");
    assert_eq!(fixture.cases.writes.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn malformed_authority_and_repository_errors_use_the_frozen_codes() {
    let fixture = Fixture::new();
    let anonymous = fixture
        .app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/cases")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(anonymous.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(body(anonymous).await["error"], "session_required");

    let foreign_practice = fixture
        .request(
            "GET",
            &format!("/api/cases?practiceId={}", id(99)),
            serde_json::Value::Null,
        )
        .await;
    assert_eq!(foreign_practice.status(), StatusCode::FORBIDDEN);
    assert_eq!(body(foreign_practice).await["error"], "action_forbidden");
    assert_eq!(fixture.cases.reads.load(Ordering::SeqCst), 0);

    let forged = serde_json::json!({
        "commandId": id(20), "caseId": id(21), "input": input(),
        "practiceId": id(99),
    });
    let response = fixture.request("POST", "/api/cases", forged).await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(body(response).await["error"], "invalid_request");
    assert_eq!(fixture.cases.writes.load(Ordering::SeqCst), 0);

    *fixture.sessions.principal.lock().unwrap() = Principal::Agent;
    let response = fixture
        .request("GET", "/api/cases", serde_json::Value::Null)
        .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert_eq!(body(response).await["error"], "action_forbidden");
    assert_eq!(fixture.cases.reads.load(Ordering::SeqCst), 0);
    *fixture.sessions.principal.lock().unwrap() = Principal::User;

    for (source, status, code) in [
        (
            CaseError::Unauthenticated,
            StatusCode::UNAUTHORIZED,
            "session_required",
        ),
        (CaseError::Denied, StatusCode::FORBIDDEN, "action_forbidden"),
        (
            CaseError::NotFound,
            StatusCode::NOT_FOUND,
            "resource_not_found",
        ),
        (
            CaseError::RevisionConflict,
            StatusCode::CONFLICT,
            "stale_revision",
        ),
        (
            CaseError::InvalidTransition,
            StatusCode::CONFLICT,
            "invalid_transition",
        ),
        (
            CaseError::CommandConflict,
            StatusCode::CONFLICT,
            "command_conflict",
        ),
        (
            CaseError::Invalid,
            StatusCode::BAD_REQUEST,
            "invalid_request",
        ),
        (
            CaseError::Unavailable,
            StatusCode::SERVICE_UNAVAILABLE,
            "service_unavailable",
        ),
    ] {
        *fixture.cases.next_error.lock().unwrap() = Some(source);
        let response = fixture
            .request(
                "GET",
                &format!("/api/cases/{}", id(21)),
                serde_json::Value::Null,
            )
            .await;
        assert_eq!(response.status(), status);
        assert_eq!(body(response).await["error"], code);
    }
}

#[tokio::test]
async fn gate_policy_requires_case_capabilities_and_never_mutates() {
    let fixture = Fixture::new();
    assert_eq!(
        fixture
            .request("POST", "/api/cases", create_body())
            .await
            .status(),
        StatusCode::OK
    );
    let unresolved_writes = fixture.cases.writes.load(Ordering::SeqCst);
    let unresolved_read = fixture
        .request(
            "POST",
            "/internal/gate/authorize",
            serde_json::json!({
                "method": "GET",
                "uri": format!("/api/cases/{}/administering-entity", id(21)),
            }),
        )
        .await;
    assert_eq!(unresolved_read.status(), StatusCode::NO_CONTENT);
    assert_eq!(
        fixture.cases.writes.load(Ordering::SeqCst),
        unresolved_writes
    );
    assert_eq!(
        fixture
            .request(
                "POST",
                &format!("/api/cases/{}/administering-entity", id(21)),
                serde_json::json!({
                    "commandId": id(42),
                    "expectedCaseInputRevision": 1,
                }),
            )
            .await
            .status(),
        StatusCode::OK
    );
    let writes = fixture.cases.writes.load(Ordering::SeqCst);

    *fixture.sessions.capabilities.lock().unwrap() = vec!["resolve_administering_entity".into()];
    for (method, uri) in [
        (
            "POST",
            format!("/api/cases/{}/administering-entity", id(21)),
        ),
        (
            "GET",
            format!(
                "/api/cases/{}/administering-entity/commands/{}",
                id(21),
                id(42)
            ),
        ),
    ] {
        let response = fixture
            .request(
                "POST",
                "/internal/gate/authorize",
                serde_json::json!({"method": method, "uri": uri}),
            )
            .await;
        assert_eq!(response.status(), StatusCode::NO_CONTENT, "{method} {uri}");
    }
    assert_eq!(fixture.cases.writes.load(Ordering::SeqCst), writes);
    *fixture.sessions.capabilities.lock().unwrap() = vec![
        "case:read".into(),
        "case_write".into(),
        "resolve_administering_entity".into(),
    ];

    for (method, uri) in [
        ("GET", "/api/cases".to_owned()),
        ("POST", "/api/cases".to_owned()),
        ("GET", format!("/api/cases/{}", id(21))),
        ("PATCH", format!("/api/cases/{}", id(21))),
        ("POST", format!("/api/cases/{}/status", id(21))),
        ("GET", format!("/api/case-commands/{}", id(20))),
        ("GET", format!("/api/cases/{}/commands/{}", id(21), id(20))),
        ("GET", format!("/api/cases/{}/administering-entity", id(21))),
        (
            "POST",
            format!("/api/cases/{}/administering-entity", id(21)),
        ),
        (
            "GET",
            format!(
                "/api/cases/{}/administering-entity/commands/{}",
                id(21),
                id(42)
            ),
        ),
    ] {
        let response = fixture
            .request(
                "POST",
                "/internal/gate/authorize",
                serde_json::json!({"method": method, "uri": uri}),
            )
            .await;
        assert_eq!(response.status(), StatusCode::NO_CONTENT, "{method} {uri}");
    }
    assert_eq!(fixture.cases.writes.load(Ordering::SeqCst), writes);

    *fixture.sessions.capabilities.lock().unwrap() = vec!["case_write".into()];
    let write_only = fixture
        .request(
            "POST",
            "/internal/gate/authorize",
            serde_json::json!({
                "method": "PATCH",
                "uri": format!("/api/cases/{}", id(21)),
            }),
        )
        .await;
    assert_eq!(write_only.status(), StatusCode::NO_CONTENT);
    let read_without_capability = fixture
        .request(
            "POST",
            "/internal/gate/authorize",
            serde_json::json!({
                "method": "GET",
                "uri": format!("/api/cases/{}", id(21)),
            }),
        )
        .await;
    assert_eq!(read_without_capability.status(), StatusCode::FORBIDDEN);
    assert_eq!(
        body(read_without_capability).await["error"],
        "action_forbidden"
    );
    assert_eq!(fixture.cases.writes.load(Ordering::SeqCst), writes);
    *fixture.sessions.capabilities.lock().unwrap() = vec!["case:read".into(), "case_write".into()];

    *fixture.cases.next_error.lock().unwrap() = Some(CaseError::Denied);
    let foreign_case = fixture
        .request(
            "POST",
            "/internal/gate/authorize",
            serde_json::json!({
                "method": "GET",
                "uri": format!("/api/cases/{}", id(21)),
            }),
        )
        .await;
    assert_eq!(foreign_case.status(), StatusCode::FORBIDDEN);
    assert_eq!(body(foreign_case).await["error"], "action_forbidden");
    assert_eq!(fixture.cases.writes.load(Ordering::SeqCst), writes);

    fixture.sessions.capabilities.lock().unwrap().clear();
    let reads = fixture.cases.reads.load(Ordering::SeqCst);
    for (method, body_value) in [("GET", serde_json::Value::Null), ("POST", create_body())] {
        let response = fixture.request(method, "/api/cases", body_value).await;
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert_eq!(body(response).await["error"], "action_forbidden");
    }
    assert_eq!(fixture.cases.reads.load(Ordering::SeqCst), reads);
    assert_eq!(fixture.cases.writes.load(Ordering::SeqCst), writes);

    for (method, uri) in [("GET", "/api/cases"), ("POST", "/api/cases")] {
        let response = fixture
            .request(
                "POST",
                "/internal/gate/authorize",
                serde_json::json!({"method": method, "uri": uri}),
            )
            .await;
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert_eq!(body(response).await["error"], "action_forbidden");
    }
    assert_eq!(fixture.cases.writes.load(Ordering::SeqCst), writes);
}
