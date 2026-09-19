//! Synthetic AppServices-to-PostgreSQL administering-entity resolver proof.

use super::*;
use aso_host::{
    AppServices,
    administering_entity::{ResolutionError, ResolutionState, ResolveAdministeringEntityCommand},
    case_management::{CaseInput, UpdateCaseCommand},
    ports::SystemClock,
    session::{Principal, SessionCredential, SessionError, SessionPort, SessionSummary},
};
use async_trait::async_trait;
use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use std::{collections::BTreeMap, sync::Arc};
use tower::ServiceExt;

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("required fixture variable missing: {name}"))
}

fn context() -> ClinicalContext {
    let value: serde_json::Value =
        serde_json::from_str(&env("ASO_TEST_RESOLUTION_CONTEXT")).expect("invalid context");
    let id = |key| Uuid::parse_str(value[key].as_str().expect("fixture UUID missing")).unwrap();
    ClinicalContext {
        identity_id: id("identity_id"),
        actor: ActorId(id("actor_id")),
        practice: PracticeId(id("practice_id")),
        principal: Principal::User,
        expires_at: Utc::now() + chrono::Duration::hours(1),
    }
}

fn mark(name: &str) {
    println!("resolution_transaction_check: {name}");
}

struct FixtureSessions(ClinicalContext);

#[async_trait]
impl SessionPort for FixtureSessions {
    async fn resolve(
        &self,
        _: &SessionCredential,
        practice: Option<Uuid>,
    ) -> Result<SessionSummary, SessionError> {
        if practice.is_some_and(|value| value != self.0.practice.0) {
            return Err(SessionError::PracticeDenied);
        }
        Ok(SessionSummary {
            identity_id: self.0.identity_id,
            session_id: Uuid::from_u128(901),
            user_id: self.0.actor.0,
            practice_id: self.0.practice.0,
            display_name: "Synthetic Resolver".into(),
            principal: Principal::User,
            capabilities: vec![
                "case:read".into(),
                "case_write".into(),
                "resolve_administering_entity".into(),
            ],
            expires_at: self.0.expires_at,
            authorization_revision: "synthetic:web03-http".into(),
        })
    }
}

async fn response_json(response: axum::response::Response) -> serde_json::Value {
    let bytes = to_bytes(response.into_body(), 64 * 1024).await.unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

#[tokio::test]
#[ignore = "requires scripts/test-web03-resolution-service.py disposable PostgreSQL fixture"]
async fn administering_entity_resolution_service_lifecycle() {
    let repository = Arc::new(
        PgGateRepository::connect(&env("ASO_TEST_RESOLUTION_DATABASE_URL"))
            .await
            .expect("restricted resolver repository connection failed"),
    );
    let actor = context();
    let app = Arc::new(AppServices {
        cases: repository.clone(),
        evidence: repository.clone(),
        criteria: Arc::new(crate::adapters::unavailable::UnavailableCriteriaRepository),
        letters: repository.clone(),
        authority: repository,
        clock: Arc::new(SystemClock),
        sessions: Arc::new(FixtureSessions(context())),
    });
    let resolve_capabilities = vec!["resolve_administering_entity".into()];
    let read_capabilities = vec!["case:read".into()];
    let cases: BTreeMap<String, Uuid> =
        serde_json::from_str(&env("ASO_TEST_RESOLUTION_CASES")).expect("invalid resolver cases");
    let expected = [
        ("valid", ResolutionState::Resolved),
        ("missing", ResolutionState::Missing),
        ("ambiguous", ResolutionState::Ambiguous),
        ("conflicting", ResolutionState::Conflicting),
        ("expired", ResolutionState::Expired),
    ];

    app.authorize_administering_entity_target(&actor, &resolve_capabilities, cases["valid"])
        .await
        .expect("resolver-only target authorization failed");
    assert_eq!(
        app.authorize_administering_entity_target(&actor, &["case_write".into()], cases["valid"],)
            .await,
        Err(ResolutionError::Denied)
    );

    let mut valid_command = None;
    let mut http_command = None;
    for (label, state) in expected {
        let command = ResolveAdministeringEntityCommand {
            command_id: Uuid::new_v4(),
            case_id: cases[label],
            expected_case_input_revision: 1,
        };
        let receipt = app
            .resolve_administering_entity(&actor, &resolve_capabilities, &command)
            .await
            .unwrap_or_else(|error| panic!("{label} resolution failed: {error:?}"));
        assert_eq!(receipt.state, state);
        assert_eq!(receipt.resolution_revision, 1);
        let resolution = app
            .read_administering_entity(&actor, &read_capabilities, command.case_id)
            .await
            .expect("resolution read failed");
        assert_eq!(resolution.state, state);
        assert_eq!(
            resolution.state.blocks_downstream(),
            state != ResolutionState::Resolved
        );
        if state == ResolutionState::Resolved {
            assert_eq!(
                receipt.entity_name.as_deref(),
                Some("Synthetic Utilization Services")
            );
            assert_eq!(receipt.entity_revision, Some(1));
            assert_eq!(receipt.plan_revision, Some(1));
            assert_eq!(receipt.enrollment_revision, Some(1));
            assert_eq!(receipt.rule_revision, Some(1));
            assert_eq!(receipt.source_document_version, Some(1));
            assert_eq!(
                receipt.source_document_name.as_deref(),
                Some("Synthetic delegation source")
            );
            assert_eq!(
                receipt.source_document_effective_date,
                Some("2026-01-01".parse().unwrap())
            );
            assert_eq!(receipt.valid_from, Some("2026-02-01".parse().unwrap()));
            assert_eq!(receipt.valid_to, Some("2026-12-31".parse().unwrap()));
            assert_eq!(
                resolution.criteria_set_key.as_deref(),
                Some("synthetic-lumbar-fusion-2026")
            );
            assert_eq!(
                resolution.submission_channel_key.as_deref(),
                Some("manual_synthetic")
            );
            assert_eq!(
                resolution.appeal_path_key.as_deref(),
                Some("synthetic-standard-appeal")
            );
            assert_eq!(
                resolution.source_document_name.as_deref(),
                Some("Synthetic delegation source")
            );
            assert_eq!(resolution.source_document_version, Some(1));
            assert_eq!(resolution.entity_revision, Some(1));
            assert_eq!(resolution.plan_revision, Some(1));
            assert_eq!(resolution.enrollment_revision, Some(1));
            assert_eq!(resolution.rule_revision, Some(1));
            assert_eq!(
                resolution.source_document_effective_date,
                Some("2026-01-01".parse().unwrap())
            );
            assert_eq!(resolution.valid_from, Some("2026-02-01".parse().unwrap()));
            assert_eq!(resolution.valid_to, Some("2026-12-31".parse().unwrap()));
            valid_command = Some((command, receipt));
        } else {
            assert!(resolution.entity_id.is_none());
            if state == ResolutionState::Expired {
                http_command = Some(command);
            }
        }
    }
    mark("resolved_and_all_named_parked_states");

    let (command, receipt) = valid_command.expect("valid command missing");
    assert_eq!(
        app.resolve_administering_entity(&actor, &resolve_capabilities, &command)
            .await
            .expect("exact retry failed"),
        receipt
    );
    assert_eq!(
        app.lookup_administering_entity_command(
            &actor,
            &resolve_capabilities,
            command.case_id,
            command.command_id,
        )
        .await
        .expect("command lookup failed"),
        Some(receipt)
    );
    let mut changed = command.clone();
    changed.case_id = cases["missing"];
    assert_eq!(
        app.resolve_administering_entity(&actor, &resolve_capabilities, &changed)
            .await,
        Err(ResolutionError::CommandConflict)
    );
    mark("retry_lookup_and_command_conflict");

    let current = app
        .read_case(&actor, &read_capabilities, command.case_id)
        .await
        .expect("case read failed");
    let update = UpdateCaseCommand {
        command_id: Uuid::new_v4(),
        case_id: command.case_id,
        expected_revision: current.revision,
        input: CaseInput {
            case_number: current.case_number,
            patient_id: current.patient_id,
            surgeon_id: current.surgeon_id,
            coordinator_id: current.coordinator_id,
            facility_id: current.facility_id,
            payer_id: current.payer_id,
            member_id: Some("SYN-MEMBER-INVALIDATED".into()),
            date_of_service: current.date_of_service,
            procedure_code: current.procedure_code,
            plan_key: current.plan_key,
            data: current.data,
        },
    };
    app.update_case(&actor, &["case_write".into()], &update)
        .await
        .expect("controlling input update failed");
    assert_eq!(
        app.read_administering_entity(&actor, &read_capabilities, command.case_id)
            .await,
        Err(ResolutionError::NotFound)
    );
    let stale = ResolveAdministeringEntityCommand {
        command_id: Uuid::new_v4(),
        ..command.clone()
    };
    assert_eq!(
        app.resolve_administering_entity(&actor, &resolve_capabilities, &stale)
            .await,
        Err(ResolutionError::RevisionConflict)
    );
    let refreshed = ResolveAdministeringEntityCommand {
        command_id: Uuid::new_v4(),
        expected_case_input_revision: 2,
        ..command
    };
    let refreshed_receipt = app
        .resolve_administering_entity(&actor, &resolve_capabilities, &refreshed)
        .await
        .expect("refreshed resolution failed");
    assert_eq!(refreshed_receipt.resolution_revision, 3);
    assert_eq!(refreshed_receipt.state, ResolutionState::Missing);
    mark("input_change_invalidates_and_advances_revision");

    let http_command = http_command.expect("HTTP retry command missing");
    let router = aso_server_axum::api_router(aso_server_axum::ServerState {
        services: app.clone(),
    });
    let practice = actor.practice.0;
    let resource = format!(
        "/api/cases/{}/administering-entity?practiceId={practice}",
        http_command.case_id
    );
    let post = router
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(&resource)
                .header("content-type", "application/json")
                .header("authorization", "Bearer synthetic-web03")
                .body(Body::from(
                    serde_json::json!({
                        "commandId": http_command.command_id,
                        "expectedCaseInputRevision": http_command.expected_case_input_revision,
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(post.status(), StatusCode::OK);
    let post = response_json(post).await;
    assert_eq!(post["state"], "expired");

    let get = router
        .clone()
        .oneshot(
            Request::builder()
                .uri(&resource)
                .header("authorization", "Bearer synthetic-web03")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(get.status(), StatusCode::OK);
    assert_eq!(response_json(get).await["state"], "expired");

    let lookup = router
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/cases/{}/administering-entity/commands/{}?practiceId={practice}",
                    http_command.case_id, http_command.command_id,
                ))
                .header("authorization", "Bearer synthetic-web03")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(lookup.status(), StatusCode::OK);
    assert_eq!(response_json(lookup).await, post);

    let foreign = router
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/cases/{}/administering-entity?practiceId={}",
                    http_command.case_id,
                    Uuid::from_u128(999),
                ))
                .header("authorization", "Bearer synthetic-web03")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(foreign.status(), StatusCode::FORBIDDEN);
    assert_eq!(response_json(foreign).await["error"], "action_forbidden");
    mark("mounted_http_reload_lookup_and_tenant_refusal");
}
