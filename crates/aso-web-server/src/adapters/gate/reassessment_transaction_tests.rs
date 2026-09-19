//! Focused synthetic PostgreSQL proof for reassessment reconciliation.

use super::*;
use crate::adapters::memory;
use aso_host::{
    AppServices,
    ports::SystemClock,
    reassessment::{ReassessEvidenceCommand, ReassessmentError},
    session::{Principal, UnavailableSessions},
};
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;

fn mark(name: &str) {
    println!("gate_transaction_check: reassessment_{name}");
}

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("required fixture variable missing: {name}"))
}

fn context(value: &serde_json::Value) -> ClinicalContext {
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

async fn direct_reassessment(
    pool: &sqlx::PgPool,
    context: &ClinicalContext,
    evidence_id: Uuid,
    state: EvidenceState,
) -> Result<u64, sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query("SET LOCAL ROLE aso_gate_owner")
        .execute(&mut *tx)
        .await?;
    sqlx::query("SET LOCAL search_path = pg_catalog, aso, pg_temp")
        .execute(&mut *tx)
        .await?;
    let principal = match context.principal {
        Principal::User => "user",
        Principal::Agent => "agent",
        Principal::Service => "service",
    };
    let state = match state {
        EvidenceState::Met => "met",
        EvidenceState::Gap => "gap",
        EvidenceState::Void => "void",
    };
    sqlx::query(
        "SELECT set_config('aso.kratos_identity_id',$1,true),
        set_config('aso.actor_id',$2,true),set_config('aso.practice_id',$3,true),
        set_config('aso.principal',$4,true),set_config('aso.session_expires_at',$5,true)",
    )
    .bind(context.identity_id.to_string())
    .bind(context.actor.to_string())
    .bind(context.practice.to_string())
    .bind(principal)
    .bind(context.expires_at.to_rfc3339())
    .execute(&mut *tx)
    .await?;
    let result = sqlx::query(
        "UPDATE aso.case_evidence
         SET state=$2,assessed_by=$3,assessed_at=clock_timestamp()
         WHERE id=$1",
    )
    .bind(evidence_id)
    .bind(state)
    .bind(context.actor.0)
    .execute(&mut *tx)
    .await;
    tx.rollback().await?;
    result.map(|done| done.rows_affected())
}

#[tokio::test]
#[ignore = "requires the disposable PostgreSQL fixture"]
async fn reassessment_gate_transaction_lifecycle() {
    let contexts: serde_json::Value =
        serde_json::from_str(&env("ASO_TEST_GATE_CONTEXTS")).expect("fixture contexts invalid");
    let surgeon = context(&contexts["A"]);
    let admin = context(&contexts["admin"]);
    let foreign = context(&contexts["foreign"]);
    let agent = ClinicalContext {
        identity_id: surgeon.identity_id,
        actor: surgeon.actor,
        practice: surgeon.practice,
        principal: Principal::Agent,
        expires_at: surgeon.expires_at,
    };
    let case_id = Uuid::parse_str(&env("ASO_TEST_GATE_CASE_ID")).expect("case UUID invalid");

    let repository = Arc::new(
        PgGateRepository::connect(&env("ASO_TEST_DATABASE_URL"))
            .await
            .expect("restricted repository connection failed"),
    );
    let observer = PgPoolOptions::new()
        .max_connections(2)
        .after_connect(|connection, _| {
            Box::pin(async move {
                sqlx::query("SET search_path = aso, public")
                    .execute(connection)
                    .await?;
                Ok(())
            })
        })
        .connect(&env("ASO_TEST_ADMIN_DATABASE_URL"))
        .await
        .expect("observer connection failed");
    let app = AppServices {
        cases: repository.clone(),
        evidence: repository.clone(),
        criteria: Arc::new(memory::MemoryCriteriaRepo),
        letters: Arc::new(memory::MemoryLetterRepo::default()),
        authority: repository.clone(),
        clock: Arc::new(SystemClock),
        sessions: Arc::new(UnavailableSessions),
    };

    let policy_type: Uuid = sqlx::query_scalar(
        "INSERT INTO aso.policy_types (name,key) VALUES ('Synthetic reassessment','synthetic-reassessment') RETURNING id",
    )
    .fetch_one(&observer)
    .await
    .expect("policy type setup failed");
    let policy: Uuid = sqlx::query_scalar(
        "INSERT INTO aso.policies
          (policy_type_id,payer_id,name,policy_number,version,effective_from)
         SELECT $1,c.payer_id,'Synthetic reassessment policy','SYN-RA03','1',DATE '2026-01-01'
         FROM aso.cases c WHERE c.id=$2 RETURNING id",
    )
    .bind(policy_type)
    .bind(case_id)
    .fetch_one(&observer)
    .await
    .expect("policy setup failed");
    let criterion: Uuid = sqlx::query_scalar(
        "INSERT INTO aso.policy_criteria
          (policy_id,section,ordinal,label,requirement)
         VALUES ($1,'1',1,'Synthetic criterion','Synthetic requirement') RETURNING id",
    )
    .bind(policy)
    .fetch_one(&observer)
    .await
    .expect("criterion setup failed");
    let evidence_id: Uuid = sqlx::query_scalar(
        "INSERT INTO aso.case_evidence
          (case_id,policy_criterion_id,state,rationale,assessed_by,assessed_at)
         VALUES ($1,$2,'void','Synthetic initial assessment',$3,clock_timestamp()) RETURNING id",
    )
    .bind(case_id)
    .bind(criterion)
    .bind(surgeon.actor.0)
    .fetch_one(&observer)
    .await
    .expect("evidence setup failed");

    let target = app
        .read_reassessment_target(&surgeon, case_id, evidence_id)
        .await
        .expect("target read failed");
    assert_eq!(target.state, EvidenceState::Void);
    let command = ReassessEvidenceCommand {
        command_id: Uuid::new_v4(),
        case_id,
        evidence_id,
        state: EvidenceState::Gap,
        expected_assessed_at: target.assessed_at,
    };

    for caller in [&admin, &agent, &foreign] {
        assert_eq!(
            app.execute_reassess_evidence(caller, &command).await,
            Err(ReassessmentError::Denied)
        );
        assert_eq!(
            repository.execute_reassessment(caller, &command).await,
            Err(ReassessmentError::Denied)
        );
        let error = direct_reassessment(&observer, caller, evidence_id, EvidenceState::Gap)
            .await
            .expect_err("independent reassessment trigger accepted a denied caller");
        assert_eq!(
            error
                .as_database_error()
                .and_then(|database| database.code())
                .as_deref(),
            Some("42501")
        );
    }
    assert_eq!(
        direct_reassessment(&observer, &surgeon, evidence_id, EvidenceState::Gap)
            .await
            .expect("authorized reassessment trigger control failed"),
        1
    );
    let denied_counts: (String, i64, i64) = sqlx::query_as(
        "SELECT state,
          (SELECT count(*) FROM aso.audit_events
           WHERE entity_id=$1 AND action='evidence.reassess'),
          (SELECT count(*) FROM aso.evidence_reassessment_commands
           WHERE evidence_id=$1)
         FROM aso.case_evidence WHERE id=$1",
    )
    .bind(evidence_id)
    .fetch_one(&observer)
    .await
    .expect("reassessment refusal observation failed");
    assert_eq!(denied_counts, ("void".into(), 0, 0));
    mark("service_function_and_trigger_independently_refuse_admin_agent_and_foreign_scope");

    sqlx::query(
        "ALTER TABLE aso.evidence_reassessment_commands
         ADD CONSTRAINT ra03_reject_reassessment_receipt CHECK (false) NOT VALID",
    )
    .execute(&observer)
    .await
    .expect("reassessment receipt failure injection failed");
    assert_eq!(
        app.execute_reassess_evidence(&surgeon, &command).await,
        Err(ReassessmentError::Unavailable)
    );
    let rollback: (String, String, Uuid, DateTime<Utc>, i64, i64) = sqlx::query_as(
        "SELECT state,rationale,assessed_by,assessed_at,
          (SELECT count(*) FROM aso.audit_events
           WHERE entity_id=$1 AND action='evidence.reassess'),
          (SELECT count(*) FROM aso.evidence_reassessment_commands
           WHERE command_id=$2)
         FROM aso.case_evidence WHERE id=$1",
    )
    .bind(evidence_id)
    .bind(command.command_id)
    .fetch_one(&observer)
    .await
    .expect("reassessment rollback observation failed");
    assert_eq!(
        rollback,
        (
            "void".into(),
            "Synthetic initial assessment".into(),
            surgeon.actor.0,
            target.assessed_at,
            0,
            0,
        )
    );
    assert_eq!(
        app.lookup_reassessment_command(&surgeon, case_id, evidence_id, command.command_id,)
            .await,
        Ok(None)
    );
    sqlx::query(
        "ALTER TABLE aso.evidence_reassessment_commands
         DROP CONSTRAINT ra03_reject_reassessment_receipt",
    )
    .execute(&observer)
    .await
    .expect("reassessment receipt failure cleanup failed");
    mark("receipt_failure_rolls_back_state_attribution_audit_and_command");

    let first = app
        .execute_reassess_evidence(&surgeon, &command)
        .await
        .expect("reassessment failed");
    assert_eq!(first.previous_state, EvidenceState::Void);
    assert_eq!(first.state, EvidenceState::Gap);
    mark("authorized_reassessment_preserves_void_to_gap_distinction");

    assert_eq!(
        app.execute_reassess_evidence(&surgeon, &command).await,
        Ok(first.clone())
    );
    assert_eq!(
        app.lookup_reassessment_command(&surgeon, case_id, evidence_id, command.command_id)
            .await,
        Ok(Some(first.clone()))
    );
    let counts: (i64, i64, String, Uuid) = sqlx::query_as(
        "SELECT
          (SELECT count(*) FROM aso.evidence_reassessment_commands WHERE evidence_id=$1),
          (SELECT count(*) FROM aso.audit_events WHERE entity_id=$1 AND action='evidence.reassess'),
          (SELECT state FROM aso.case_evidence WHERE id=$1),
          (SELECT assessed_by FROM aso.case_evidence WHERE id=$1)",
    )
    .bind(evidence_id)
    .fetch_one(&observer)
    .await
    .expect("reassessment counts failed");
    assert_eq!(counts, (1, 1, "gap".into(), surgeon.actor.0));
    mark("lost_response_repeat_and_lookup_return_one_persisted_effect");

    let changed = ReassessEvidenceCommand {
        state: EvidenceState::Met,
        ..command
    };
    assert_eq!(
        app.execute_reassess_evidence(&surgeon, &changed).await,
        Err(ReassessmentError::CommandConflict)
    );
    assert_eq!(
        repository.execute_reassessment(&surgeon, &changed).await,
        Err(ReassessmentError::CommandConflict)
    );
    mark("changed_payload_conflicts_before_a_second_effect");

    let stale = ReassessEvidenceCommand {
        command_id: Uuid::new_v4(),
        state: EvidenceState::Met,
        ..command
    };
    assert_eq!(
        app.execute_reassess_evidence(&surgeon, &stale).await,
        Err(ReassessmentError::RevisionConflict)
    );
    assert_eq!(
        repository.execute_reassessment(&surgeon, &stale).await,
        Err(ReassessmentError::RevisionConflict)
    );
    mark("stale_assessment_revision_is_refused_by_service_and_database");

    let gap_target = app
        .read_reassessment_target(&surgeon, case_id, evidence_id)
        .await
        .expect("gap target read failed");
    let to_met = ReassessEvidenceCommand {
        command_id: Uuid::new_v4(),
        case_id,
        evidence_id,
        state: EvidenceState::Met,
        expected_assessed_at: gap_target.assessed_at,
    };
    let met = app
        .execute_reassess_evidence(&surgeon, &to_met)
        .await
        .expect("gap to met reassessment failed");
    assert_eq!(met.previous_state, EvidenceState::Gap);
    assert_eq!(met.state, EvidenceState::Met);

    let met_target = app
        .read_reassessment_target(&surgeon, case_id, evidence_id)
        .await
        .expect("met target read failed");
    let to_void = ReassessEvidenceCommand {
        command_id: Uuid::new_v4(),
        case_id,
        evidence_id,
        state: EvidenceState::Void,
        expected_assessed_at: met_target.assessed_at,
    };
    let void = app
        .execute_reassess_evidence(&surgeon, &to_void)
        .await
        .expect("met to void reassessment failed");
    assert_eq!(void.previous_state, EvidenceState::Met);
    assert_eq!(void.state, EvidenceState::Void);
    let final_counts: (String, Uuid, i64, i64) = sqlx::query_as(
        "SELECT state,assessed_by,
          (SELECT count(*) FROM aso.audit_events
           WHERE entity_id=$1 AND action='evidence.reassess'),
          (SELECT count(*) FROM aso.evidence_reassessment_commands
           WHERE evidence_id=$1)
         FROM aso.case_evidence WHERE id=$1",
    )
    .bind(evidence_id)
    .fetch_one(&observer)
    .await
    .expect("three-state reassessment observation failed");
    assert_eq!(final_counts, ("void".into(), surgeon.actor.0, 3, 3));
    mark("allowed_transitions_retain_met_gap_void_with_one_audit_and_receipt_each");

    observer.close().await;
}
