//! Synthetic AppServices-to-PostgreSQL case lifecycle proof.
//!
//! The Python fixture owns the disposable database, restricted login, records,
//! and cleanup. This test makes no HTTP, browser, Tauri, or Kratos claim.

use super::*;
use aso_host::{
    AppServices,
    case_management::{
        CaseError, CaseInput, CaseStatus, CreateCaseCommand, TransitionCaseCommand,
        UpdateCaseCommand,
    },
    ports::SystemClock,
    session::{Principal, UnavailableSessions},
};
use std::sync::Arc;

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("required fixture variable missing: {name}"))
}

fn fixture_id(name: &str) -> Uuid {
    Uuid::parse_str(&env(name)).unwrap_or_else(|_| panic!("invalid fixture UUID: {name}"))
}

fn context() -> ClinicalContext {
    let value: serde_json::Value =
        serde_json::from_str(&env("ASO_TEST_CASE_CONTEXT")).expect("invalid fixture context");
    let id = |key| {
        Uuid::parse_str(value[key].as_str().expect("fixture UUID missing"))
            .expect("fixture UUID invalid")
    };
    ClinicalContext {
        identity_id: id("identity_id"),
        actor: ActorId(id("actor_id")),
        practice: PracticeId(id("practice_id")),
        principal: Principal::User,
        expires_at: Utc::now() + chrono::Duration::hours(1),
    }
}

fn input() -> CaseInput {
    CaseInput {
        case_number: "SYN-WEB01-SERVICE".into(),
        patient_id: fixture_id("ASO_TEST_CASE_PATIENT_ID"),
        surgeon_id: context().actor.0,
        coordinator_id: None,
        facility_id: None,
        payer_id: fixture_id("ASO_TEST_CASE_PAYER_ID"),
        member_id: Some("SYN-MEMBER-SERVICE-001".into()),
        date_of_service: Some("2026-04-15".parse().unwrap()),
        procedure_code: Some("SYN-LUMBAR-SERVICE".into()),
        plan_key: Some("synthetic-ppo".into()),
        data: serde_json::json!({"source": "synthetic-web01-service"}),
    }
}

fn mark(name: &str) {
    println!("case_transaction_check: {name}");
}

#[tokio::test]
#[ignore = "requires scripts/test-web01-case-migration.py disposable PostgreSQL fixture"]
async fn case_command_service_lifecycle() {
    let repository = Arc::new(
        PgGateRepository::connect(&env("ASO_TEST_CASE_DATABASE_URL"))
            .await
            .expect("restricted case repository connection failed"),
    );
    let app = AppServices {
        cases: repository.clone(),
        evidence: repository.clone(),
        criteria: Arc::new(crate::adapters::unavailable::UnavailableCriteriaRepository),
        letters: repository.clone(),
        authority: repository,
        clock: Arc::new(SystemClock),
        sessions: Arc::new(UnavailableSessions),
    };
    let actor = context();
    let read_capabilities = vec!["case:read".into()];
    let write_capabilities = vec!["case_write".into()];
    let case_id = fixture_id("ASO_TEST_CASE_ID");
    let create = CreateCaseCommand {
        command_id: Uuid::new_v4(),
        case_id,
        input: input(),
    };

    let created = app
        .create_case(&actor, &write_capabilities, &create)
        .await
        .expect("case create failed");
    assert_eq!(created.case_id, case_id);
    let created_record = app
        .read_case(&actor, &read_capabilities, case_id)
        .await
        .expect("created case read failed");
    assert_eq!(created_record.status, CaseStatus::Intake);
    assert_eq!(
        (
            created_record.revision,
            created_record.case_input_revision,
            created_record.status_revision
        ),
        (1, 1, 0)
    );
    assert_eq!(
        app.create_case(&actor, &write_capabilities, &create)
            .await
            .expect("exact create retry failed"),
        created
    );
    assert_eq!(
        app.lookup_create_case_command(&actor, &write_capabilities, create.command_id)
            .await
            .expect("create lookup failed"),
        Some(created.clone())
    );
    let mut changed = create.clone();
    changed.input.case_number = "SYN-WEB01-CONFLICT".into();
    assert_eq!(
        app.create_case(&actor, &write_capabilities, &changed).await,
        Err(CaseError::CommandConflict)
    );
    mark("create_retry_lookup_and_payload_conflict");

    assert_eq!(
        app.read_case(&actor, &read_capabilities, case_id)
            .await
            .unwrap(),
        created_record
    );
    assert!(
        app.list_cases(&actor, &read_capabilities)
            .await
            .unwrap()
            .iter()
            .any(|record| record.id == case_id)
    );
    mark("tenant_scoped_detail_and_list");

    let mut revised = input();
    revised.member_id = Some("SYN-MEMBER-SERVICE-002".into());
    let update = UpdateCaseCommand {
        command_id: Uuid::new_v4(),
        case_id,
        expected_revision: 1,
        input: revised,
    };
    let updated = app
        .update_case(&actor, &write_capabilities, &update)
        .await
        .expect("update failed");
    let updated_record = app
        .read_case(&actor, &read_capabilities, case_id)
        .await
        .expect("updated case read failed");
    assert_eq!(
        updated_record.member_id.as_deref(),
        Some("SYN-MEMBER-SERVICE-002")
    );
    assert_eq!(
        (
            updated_record.revision,
            updated_record.case_input_revision,
            updated_record.status_revision
        ),
        (2, 2, 0)
    );
    assert_eq!(
        app.update_case(&actor, &write_capabilities, &update)
            .await
            .unwrap(),
        updated
    );
    let mut stale = update.clone();
    stale.command_id = Uuid::new_v4();
    assert_eq!(
        app.update_case(&actor, &write_capabilities, &stale).await,
        Err(CaseError::RevisionConflict)
    );
    mark("update_retry_and_stale_revision_refusal");

    let transition = TransitionCaseCommand {
        command_id: Uuid::new_v4(),
        case_id,
        expected_status_revision: 0,
        target_status: CaseStatus::Evidence,
    };
    let transitioned = app
        .transition_case(&actor, &write_capabilities, &transition)
        .await
        .expect("transition failed");
    let transitioned_record = app
        .read_case(&actor, &read_capabilities, case_id)
        .await
        .expect("transitioned case read failed");
    assert_eq!(
        (
            transitioned_record.status,
            transitioned_record.revision,
            transitioned_record.case_input_revision,
            transitioned_record.status_revision,
        ),
        (CaseStatus::Evidence, 3, 2, 1)
    );
    assert_eq!(
        app.lookup_case_command(&actor, &write_capabilities, case_id, transition.command_id,)
            .await
            .expect("transition lookup failed"),
        Some(transitioned)
    );
    let invalid = TransitionCaseCommand {
        command_id: Uuid::new_v4(),
        case_id,
        expected_status_revision: 1,
        target_status: CaseStatus::AwaitingGate,
    };
    assert_eq!(
        app.transition_case(&actor, &write_capabilities, &invalid)
            .await,
        Err(CaseError::InvalidTransition)
    );
    mark("transition_lookup_and_invalid_transition_refusal");

    assert_eq!(
        app.read_case(
            &actor,
            &read_capabilities,
            fixture_id("ASO_TEST_FOREIGN_CASE_ID"),
        )
        .await,
        Err(CaseError::Denied)
    );
    let mut agent = context();
    agent.principal = Principal::Agent;
    assert_eq!(
        app.list_cases(&agent, &read_capabilities).await,
        Err(CaseError::Denied)
    );
    let mut expired = context();
    expired.expires_at = Utc::now() - chrono::Duration::seconds(1);
    assert_eq!(
        app.read_case(&expired, &read_capabilities, case_id).await,
        Err(CaseError::Unauthenticated)
    );
    mark("service_and_database_context_refusals");
}

#[tokio::test]
#[ignore = "requires scripts/test-web01-case-migration.py write-only PostgreSQL fixture"]
async fn case_write_target_authorization_without_read_capability() {
    let repository = Arc::new(
        PgGateRepository::connect(&env("ASO_TEST_CASE_DATABASE_URL"))
            .await
            .expect("restricted case repository connection failed"),
    );
    let app = AppServices {
        cases: repository.clone(),
        evidence: repository.clone(),
        criteria: Arc::new(crate::adapters::unavailable::UnavailableCriteriaRepository),
        letters: repository.clone(),
        authority: repository,
        clock: Arc::new(SystemClock),
        sessions: Arc::new(UnavailableSessions),
    };
    let actor = context();
    let case_id = fixture_id("ASO_TEST_CASE_ID");
    let write_only_case_id = fixture_id("ASO_TEST_WRITE_ONLY_CASE_ID");
    let write_only_command_id = fixture_id("ASO_TEST_WRITE_ONLY_COMMAND_ID");

    assert_eq!(
        app.authorize_case_write_target(&actor, &["case_write".into()], case_id)
            .await,
        Ok(())
    );
    assert_eq!(
        app.read_case(&actor, &["case:read".into()], case_id).await,
        Err(CaseError::Denied)
    );
    let receipt = app
        .lookup_case_command(
            &actor,
            &["case_write".into()],
            write_only_case_id,
            write_only_command_id,
        )
        .await
        .expect("write-only command lookup failed")
        .expect("write-only command receipt missing");
    let receipt = serde_json::to_value(receipt).expect("command receipt serialization failed");
    let mut keys = receipt
        .as_object()
        .expect("command receipt must be an object")
        .keys()
        .map(String::as_str)
        .collect::<Vec<_>>();
    keys.sort_unstable();
    assert_eq!(keys, ["action", "caseId", "commandId", "committedAt"]);
    assert_eq!(receipt["caseId"], write_only_case_id.to_string());
    mark("write_only_target_and_safe_receipt");
}
