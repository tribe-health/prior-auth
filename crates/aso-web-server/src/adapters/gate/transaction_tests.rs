//! Synthetic disposable-database acceptance checks. The fixture owns creation,
//! credentials and cleanup; this test makes no HTTP or Kratos coverage claim.

use super::*;
use crate::adapters::memory;
use aso_host::{
    AppServices,
    ports::SystemClock,
    session::{Principal, UnavailableSessions},
};
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

macro_rules! audited_sql {
    ($($arg:tt)*) => {
        sqlx::AssertSqlSafe(format!($($arg)*))
    };
}

fn mark(name: &str) {
    println!("gate_transaction_check: {name}");
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

fn command(case_id: Uuid, kind: GateAffirmationKind, action: GateAction) -> GateCommand {
    GateCommand {
        command_id: Uuid::new_v4(),
        case_id,
        kind,
        action,
    }
}

fn services(cases: Arc<dyn CaseRepository>, authority: Arc<dyn AuthorityPort>) -> AppServices {
    AppServices {
        cases,
        authority,
        clock: Arc::new(SystemClock),
        sessions: Arc::new(UnavailableSessions),
        evidence: Arc::new(memory::MemoryEvidenceRepo),
        criteria: Arc::new(memory::MemoryCriteriaRepo),
        letters: Arc::new(memory::MemoryLetterRepo::default()),
    }
}

fn denied_sql<T>(result: Result<T, sqlx::Error>) {
    let error = match result {
        Ok(_) => panic!("forbidden SQL succeeded"),
        Err(error) => error,
    };
    assert_eq!(
        error.as_database_error().and_then(|e| e.code()).as_deref(),
        Some("42501")
    );
}

async fn counts(pool: &PgPool, case_id: Uuid) -> (i64, i64, i64) {
    sqlx::query_as(
        "SELECT
        (SELECT count(*) FROM aso.gate_affirmations WHERE case_id=$1),
        (SELECT count(*) FROM aso.audit_events WHERE case_id=$1 AND action LIKE 'gate.%'),
        (SELECT count(*) FROM aso.gate_commands WHERE case_id=$1)",
    )
    .bind(case_id)
    .fetch_one(pool)
    .await
    .expect("fixture counts failed")
}

async fn trigger_transaction(
    observer: &PgPool,
    caller: &ClinicalContext,
    disable_authority: bool,
) -> Transaction<'static, Postgres> {
    let mut tx = observer
        .begin()
        .await
        .expect("trigger probe transaction failed");
    if disable_authority {
        sqlx::query(
            "ALTER TABLE aso.gate_affirmations DISABLE TRIGGER gate_affirmations_authority",
        )
        .execute(&mut *tx)
        .await
        .expect("authority mutation setup failed");
    }
    // Only the disposable observer can assume this role. Direct table DML here
    // bypasses apply_gate_command and proves the trigger has its own control.
    sqlx::query("SET LOCAL ROLE aso_gate_owner")
        .execute(&mut *tx)
        .await
        .expect("trigger probe owner setup failed");
    let principal = match caller.principal {
        Principal::User => "user",
        Principal::Agent => "agent",
        Principal::Service => "service",
    };
    sqlx::query(
        "SELECT set_config('aso.kratos_identity_id',$1,true),
        set_config('aso.actor_id',$2,true), set_config('aso.practice_id',$3,true),
        set_config('aso.principal',$4,true), set_config('aso.session_expires_at',$5,true)",
    )
    .bind(caller.identity_id.to_string())
    .bind(caller.actor.to_string())
    .bind(caller.practice.to_string())
    .bind(principal)
    .bind(caller.expires_at.to_rfc3339())
    .execute(&mut *tx)
    .await
    .expect("trigger probe context setup failed");
    tx
}

struct TestAuthority(bool);

#[async_trait]
impl AuthorityPort for TestAuthority {
    async fn holds(&self, _: ActorId, _: Capability) -> Result<bool, DomainError> {
        Ok(self.0)
    }
    async fn may_affirm_gate(&self, _: &ClinicalContext, _: Uuid) -> Result<bool, GateError> {
        Ok(self.0)
    }
}

struct AcceptingRepository(AtomicUsize);

#[async_trait]
impl CaseRepository for AcceptingRepository {
    async fn gate_state(&self, _: CaseId) -> Result<GateState, DomainError> {
        Err(DomainError::Storage("unused test method".into()))
    }
    async fn record_affirmation(
        &self,
        _: CaseId,
        _: GateAffirmationKind,
        _: ActorId,
        _: DateTime<Utc>,
    ) -> Result<GateState, DomainError> {
        Err(DomainError::Storage("unused test method".into()))
    }
    async fn execute_gate_command(
        &self,
        _: &ClinicalContext,
        command: &GateCommand,
    ) -> Result<GateCommandResult, GateError> {
        self.0.fetch_add(1, Ordering::SeqCst);
        Ok(GateCommandResult {
            command_id: command.command_id,
            case_id: command.case_id,
            kind: command.kind,
            action: command.action,
            committed_at: Utc::now(),
            gate: GateSnapshot {
                case_id: command.case_id,
                affirmed: vec![],
                gate_affirmed_at: None,
                gate_affirmed_by: None,
            },
        })
    }
    async fn lookup_gate_command(
        &self,
        _: &ClinicalContext,
        _: Uuid,
    ) -> Result<Option<GateCommandResult>, GateError> {
        Ok(None)
    }
}

#[tokio::test]
#[ignore = "requires scripts/test-gate-transaction.py disposable PostgreSQL fixture"]
async fn gate_transaction_lifecycle() {
    let contexts: serde_json::Value =
        serde_json::from_str(&env("ASO_TEST_GATE_CONTEXTS")).expect("invalid fixture contexts");
    let a = context(&contexts["A"]);
    let b = context(&contexts["B"]);
    let admin = context(&contexts["admin"]);
    let foreign = context(&contexts["foreign"]);
    let case_id = Uuid::parse_str(&env("ASO_TEST_GATE_CASE_ID")).expect("invalid fixture case");
    let foreign_case =
        Uuid::parse_str(&env("ASO_TEST_FOREIGN_CASE_ID")).expect("invalid foreign case");
    let admin_url = env("ASO_TEST_ADMIN_DATABASE_URL");
    let observer = PgPoolOptions::new()
        .max_connections(2)
        .connect(&admin_url)
        .await
        .unwrap_or_else(|_| panic!("fixture observer connection failed"));
    assert!(matches!(
        PgGateRepository::connect(&admin_url).await,
        Err(GateError::Unavailable)
    ));
    mark("runtime_refuses_privileged_login");
    let repository = Arc::new(
        PgGateRepository::connect(&env("ASO_TEST_DATABASE_URL"))
            .await
            .expect("restricted repository connection failed"),
    );
    // This grant is visible across connections; cleanup precedes assertions.
    // PostgreSQL18 role-membership docs distinguish INHERIT from SET access.
    let quoted_login: String = sqlx::query_scalar("SELECT quote_ident(session_user)")
        .fetch_one(&repository.pool)
        .await
        .expect("runtime role lookup failed");
    let owner = env("ASO_TEST_OWNER_ROLE");
    assert!(
        !owner.is_empty()
            && owner.len() <= 63
            && owner
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_'),
        "invalid synthetic owner role identifier"
    );
    // The role and table belong only to this fixture; no shared role is granted.
    sqlx::raw_sql(audited_sql!(
        "BEGIN;
        CREATE ROLE {owner} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
        CREATE TABLE aso.{owner}(id integer);
        GRANT USAGE,CREATE ON SCHEMA aso TO {owner};
        ALTER TABLE aso.{owner} OWNER TO {owner};
        REVOKE CREATE ON SCHEMA aso FROM {owner};
        GRANT {owner} TO {quoted_login} WITH INHERIT FALSE, SET TRUE;
        COMMIT;"
    ))
    .execute(&observer)
    .await
    .expect("owner membership control setup failed");
    let role_refused = PgGateRepository::connect(&env("ASO_TEST_DATABASE_URL")).await;
    sqlx::raw_sql(audited_sql!("BEGIN; REVOKE {owner} FROM {quoted_login};
        DROP TABLE aso.{owner}; REVOKE USAGE ON SCHEMA aso FROM {owner}; DROP ROLE {owner}; COMMIT;"))
        .execute(&observer).await.expect("owner membership control cleanup failed");
    assert!(matches!(role_refused, Err(GateError::Unavailable)));
    mark("runtime_refuses_noninherited_owner_membership");
    let app = services(repository.clone(), repository.clone());
    let first_command = command(case_id, GateAffirmationKind::Policy, GateAction::Affirm);

    // A permissive repository makes this an independent service authority check.
    let accepting = Arc::new(AcceptingRepository(AtomicUsize::new(0)));
    let service_denied = services(accepting.clone(), Arc::new(TestAuthority(false)));
    assert_eq!(
        service_denied
            .execute_gate_command(&a, &first_command)
            .await,
        Err(GateError::Denied)
    );
    assert_eq!(accepting.0.load(Ordering::SeqCst), 0);
    let service_allowed = services(accepting.clone(), Arc::new(TestAuthority(true)));
    service_allowed
        .execute_gate_command(&a, &first_command)
        .await
        .expect("service positive control failed");
    assert_eq!(accepting.0.load(Ordering::SeqCst), 1);
    let mut agent = context(&contexts["A"]);
    agent.principal = Principal::Agent;
    assert_eq!(
        service_allowed
            .execute_gate_command(&agent, &first_command)
            .await,
        Err(GateError::Denied)
    );
    let mut expired = context(&contexts["A"]);
    expired.expires_at = Utc::now() - chrono::Duration::minutes(1);
    assert_eq!(
        service_allowed
            .execute_gate_command(&expired, &first_command)
            .await,
        Err(GateError::Unauthenticated)
    );
    assert_eq!(accepting.0.load(Ordering::SeqCst), 1);
    mark("service_authority_and_principal_independent");

    // Resolve real actor/case authority while the write port accepts anything.
    // No command function or affirmation trigger can rescue a missing service check.
    let authority_accepting = Arc::new(AcceptingRepository(AtomicUsize::new(0)));
    let real_authority_service = services(authority_accepting.clone(), repository.clone());
    let before_service_controls = counts(&observer, case_id).await;
    for (index, action) in [GateAction::Affirm, GateAction::Remove]
        .into_iter()
        .enumerate()
    {
        let control = command(case_id, GateAffirmationKind::Policy, action);
        real_authority_service
            .execute_gate_command(&a, &control)
            .await
            .expect("real authority surgeon service control failed");
        assert_eq!(authority_accepting.0.load(Ordering::SeqCst), index + 1);
        for caller in [&admin, &foreign, &agent] {
            assert_eq!(
                real_authority_service
                    .execute_gate_command(caller, &control)
                    .await,
                Err(GateError::Denied)
            );
        }
        assert_eq!(authority_accepting.0.load(Ordering::SeqCst), index + 1);
    }
    assert_eq!(counts(&observer, case_id).await, before_service_controls);
    mark("real_service_authority_refuses_admin_foreign_and_agent_without_write_trigger");

    let baseline = counts(&observer, case_id).await;
    let first = app
        .execute_gate_command(&a, &first_command)
        .await
        .expect("authorized command failed");
    assert_eq!(first.gate.affirmed, vec![GateAffirmationKind::Policy]);
    assert_eq!(first.gate.gate_affirmed_at, None);
    let after_first = counts(&observer, case_id).await;
    assert_eq!(
        after_first,
        (baseline.0 + 1, baseline.1 + 1, baseline.2 + 1)
    );
    assert_eq!(
        app.execute_gate_command(&a, &first_command)
            .await
            .expect("replay failed"),
        first
    );
    assert_eq!(
        app.lookup_gate_command(&a, first_command.command_id)
            .await
            .expect("lookup failed"),
        Some(first.clone())
    );
    assert_eq!(counts(&observer, case_id).await, after_first);
    assert_eq!(
        app.lookup_gate_command(&b, first_command.command_id)
            .await
            .expect("isolated lookup failed"),
        None
    );
    mark("authorized_atomic_command_and_stable_replay");
    for changed in [
        GateCommand {
            kind: GateAffirmationKind::Plan,
            ..first_command.clone()
        },
        GateCommand {
            action: GateAction::Remove,
            ..first_command.clone()
        },
    ] {
        assert_eq!(
            app.execute_gate_command(&a, &changed).await,
            Err(GateError::CommandConflict)
        );
    }
    let other_case = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO aso.cases(id,practice_id,patient_id,surgeon_id,payer_id,case_number)
        SELECT $2,practice_id,patient_id,surgeon_id,payer_id,$3 FROM aso.cases WHERE id=$1",
    )
    .bind(case_id)
    .bind(other_case)
    .bind(format!("SYNTHETIC-{other_case}"))
    .execute(&observer)
    .await
    .expect("second case setup failed");
    let changed_case = app
        .execute_gate_command(
            &a,
            &GateCommand {
                case_id: other_case,
                ..first_command.clone()
            },
        )
        .await;
    assert_eq!(changed_case, Err(GateError::CommandConflict));
    assert_eq!(counts(&observer, other_case).await, (0, 0, 0));
    sqlx::query("DELETE FROM aso.cases WHERE id=$1")
        .bind(other_case)
        .execute(&observer)
        .await
        .expect("second case cleanup failed");
    let changed_missing = GateCommand {
        case_id: other_case,
        ..first_command.clone()
    };
    assert_eq!(
        app.execute_gate_command(&a, &changed_missing).await,
        Err(GateError::CommandConflict)
    );
    assert_eq!(
        repository.execute_gate_command(&a, &changed_missing).await,
        Err(GateError::CommandConflict)
    );
    let changed_foreign = GateCommand {
        case_id: foreign_case,
        ..first_command.clone()
    };
    assert_eq!(
        app.execute_gate_command(&a, &changed_foreign).await,
        Err(GateError::CommandConflict)
    );
    assert_eq!(
        repository.execute_gate_command(&a, &changed_foreign).await,
        Err(GateError::CommandConflict)
    );
    assert_eq!(counts(&observer, case_id).await, after_first);
    mark("changed_payload_conflicts_without_writes");
    mark("out_of_scope_and_missing_changed_payload_conflict_before_target_authority");

    for kind in [
        GateAffirmationKind::Section,
        GateAffirmationKind::Pathway,
        GateAffirmationKind::Plan,
    ] {
        app.execute_gate_command(&a, &command(case_id, kind, GateAction::Affirm))
            .await
            .expect("affirmation failed");
    }
    let complete = app
        .read_verified_gate(&a, case_id)
        .await
        .expect("gate read failed");
    assert_eq!(complete.affirmed.len(), 4);
    assert!(complete.gate_affirmed_at.is_some());
    assert_eq!(complete.gate_affirmed_by, Some(a.actor.0));
    let removed = app
        .execute_gate_command(
            &b,
            &command(case_id, GateAffirmationKind::Plan, GateAction::Remove),
        )
        .await
        .expect("second surgeon removal failed");
    assert_eq!(removed.gate.affirmed.len(), 3);
    assert_eq!(removed.gate.gate_affirmed_at, None);
    assert_eq!(removed.gate.gate_affirmed_by, None);
    assert_eq!(
        app.lookup_gate_command(&a, first_command.command_id)
            .await
            .expect("original lookup failed"),
        Some(first.clone())
    );
    mark("derived_summary_and_original_result_survive_later_removal");

    let before_denials = counts(&observer, case_id).await;
    for caller in [&admin, &agent, &expired, &foreign] {
        assert_eq!(
            repository
                .execute_gate_command(
                    caller,
                    &command(case_id, GateAffirmationKind::Plan, GateAction::Affirm)
                )
                .await,
            Err(GateError::Denied)
        );
        assert_eq!(
            repository
                .execute_gate_command(
                    caller,
                    &command(case_id, GateAffirmationKind::Policy, GateAction::Remove)
                )
                .await,
            Err(GateError::Denied)
        );
    }
    assert_eq!(
        repository
            .execute_gate_command(
                &a,
                &command(foreign_case, GateAffirmationKind::Plan, GateAction::Affirm)
            )
            .await,
        Err(GateError::Denied)
    );
    assert_eq!(
        repository.read_verified_gate(&a, foreign_case).await,
        Err(GateError::Denied)
    );
    assert_eq!(counts(&observer, case_id).await, before_denials);
    mark("database_independently_refuses_admin_agent_expiry_and_foreign_scope");

    let direct_insert = "INSERT INTO aso.gate_affirmations(case_id,kind,affirmed_by,affirmed_at)
        VALUES ($1,'plan',$2,clock_timestamp())";
    let direct_delete = "DELETE FROM aso.gate_affirmations WHERE case_id=$1 AND kind='policy'";
    for caller in [&admin, &agent, &expired, &foreign] {
        let mut tx = trigger_transaction(&observer, caller, false).await;
        let inserted = sqlx::query(direct_insert)
            .bind(case_id)
            .bind(caller.actor.0)
            .execute(&mut *tx)
            .await;
        tx.rollback()
            .await
            .expect("trigger insert probe rollback failed");
        denied_sql(inserted);
        let mut tx = trigger_transaction(&observer, caller, false).await;
        let deleted = sqlx::query(direct_delete)
            .bind(case_id)
            .execute(&mut *tx)
            .await;
        tx.rollback()
            .await
            .expect("trigger delete probe rollback failed");
        denied_sql(deleted);
    }
    // The exact statements and grants permit a verified surgeon, so blanket
    // permission refusal cannot make the negative assertions pass by accident.
    let mut tx = trigger_transaction(&observer, &a, false).await;
    let inserted = sqlx::query(direct_insert)
        .bind(case_id)
        .bind(a.actor.0)
        .execute(&mut *tx)
        .await;
    tx.rollback()
        .await
        .expect("trigger positive insert rollback failed");
    assert_eq!(
        inserted
            .expect("trigger positive insert control failed")
            .rows_affected(),
        1
    );
    let mut tx = trigger_transaction(&observer, &a, false).await;
    let deleted = sqlx::query(direct_delete)
        .bind(case_id)
        .execute(&mut *tx)
        .await;
    tx.rollback()
        .await
        .expect("trigger positive delete rollback failed");
    assert_eq!(
        deleted
            .expect("trigger positive delete control failed")
            .rows_affected(),
        1
    );
    assert_eq!(counts(&observer, case_id).await, before_denials);
    mark("authority_trigger_independently_checks_insert_and_delete");

    let mut tx = trigger_transaction(&observer, &admin, true).await;
    let unguarded = sqlx::query(direct_insert)
        .bind(case_id)
        .bind(admin.actor.0)
        .execute(&mut *tx)
        .await;
    tx.rollback()
        .await
        .expect("authority mutation rollback failed");
    assert_eq!(
        unguarded
            .expect("authority mutation positive control failed")
            .rows_affected(),
        1
    );
    let mut tx = trigger_transaction(&observer, &admin, false).await;
    let restored = sqlx::query(direct_insert)
        .bind(case_id)
        .bind(admin.actor.0)
        .execute(&mut *tx)
        .await;
    tx.rollback()
        .await
        .expect("restored authority probe rollback failed");
    denied_sql(restored);
    assert_eq!(counts(&observer, case_id).await, before_denials);
    mark("authority_trigger_mutation_control_restored");

    sqlx::query(
        "INSERT INTO aso.user_roles(user_id,role_id,practice_id)
        SELECT user_id,role_id,$2 FROM aso.user_roles WHERE user_id=$1 AND practice_id=$3",
    )
    .bind(a.actor.0)
    .bind(foreign.practice.0)
    .bind(a.practice.0)
    .execute(&observer)
    .await
    .expect("selected practice membership setup failed");
    let mut selected = context(&contexts["A"]);
    selected.practice = foreign.practice;
    let selected_result = app
        .execute_gate_command(
            &selected,
            &command(
                foreign_case,
                GateAffirmationKind::Policy,
                GateAction::Affirm,
            ),
        )
        .await;
    let selected_read = app.read_verified_gate(&selected, foreign_case).await;
    sqlx::query("DELETE FROM aso.user_roles WHERE user_id=$1 AND practice_id=$2")
        .bind(a.actor.0)
        .bind(foreign.practice.0)
        .execute(&observer)
        .await
        .expect("selected practice membership cleanup failed");
    assert_eq!(
        selected_result
            .expect("authorized selected-practice command failed")
            .case_id,
        foreign_case
    );
    assert_eq!(
        selected_read
            .expect("selected-practice read failed")
            .affirmed,
        vec![GateAffirmationKind::Policy]
    );
    assert_eq!(
        repository.read_verified_gate(&selected, foreign_case).await,
        Err(GateError::Denied)
    );
    mark("selected_practice_membership_drives_authority");

    denied_sql(sqlx::query("UPDATE aso.cases SET gate_affirmed_at=clock_timestamp(),gate_affirmed_by=$2 WHERE id=$1")
        .bind(case_id).bind(a.actor.0).execute(&repository.pool).await);
    denied_sql(
        sqlx::query("DELETE FROM aso.gate_affirmations WHERE case_id=$1")
            .bind(case_id)
            .execute(&repository.pool)
            .await,
    );
    mark("runtime_table_writes_refused");
    denied_sql(sqlx::query("UPDATE aso.cases SET gate_affirmed_at=clock_timestamp(),gate_affirmed_by=$2 WHERE id=$1")
        .bind(case_id).bind(a.actor.0).execute(&observer).await);
    denied_sql(sqlx::query("INSERT INTO aso.cases (id,practice_id,patient_id,surgeon_id,payer_id,case_number,gate_affirmed_at,gate_affirmed_by)
        SELECT $2,practice_id,patient_id,surgeon_id,payer_id,'SYNTHETIC-FORGED',clock_timestamp(),surgeon_id FROM aso.cases WHERE id=$1")
        .bind(case_id).bind(Uuid::new_v4()).execute(&observer).await);
    denied_sql(
        sqlx::query("UPDATE aso.gate_commands SET result='{}'::jsonb WHERE command_id=$1")
            .bind(first_command.command_id)
            .execute(&observer)
            .await,
    );
    denied_sql(
        sqlx::query("DELETE FROM aso.gate_commands WHERE command_id=$1")
            .bind(first_command.command_id)
            .execute(&observer)
            .await,
    );
    denied_sql(
        sqlx::query("TRUNCATE aso.gate_commands")
            .execute(&observer)
            .await,
    );
    mark("summary_guard_and_immutable_result_refuse_direct_admin_writes");

    // Remove the summary guard only inside an observer transaction, demonstrate
    // the forged write succeeds, then roll back both data and DDL immediately.
    let mut sabotage = observer.begin().await.expect("mutation transaction failed");
    sqlx::query("ALTER TABLE aso.cases DISABLE TRIGGER cases_gate_summary_guard")
        .execute(&mut *sabotage)
        .await
        .expect("mutation setup failed");
    assert_eq!(sqlx::query("UPDATE aso.cases SET gate_affirmed_at=clock_timestamp(),gate_affirmed_by=$2 WHERE id=$1")
        .bind(case_id).bind(a.actor.0).execute(&mut *sabotage).await.expect("guard mutation control failed").rows_affected(), 1);
    sabotage.rollback().await.expect("mutation rollback failed");
    denied_sql(sqlx::query("UPDATE aso.cases SET gate_affirmed_at=clock_timestamp(),gate_affirmed_by=$2 WHERE id=$1")
        .bind(case_id).bind(a.actor.0).execute(&observer).await);
    mark("summary_guard_mutation_control_restored");

    let rollback_command = command(case_id, GateAffirmationKind::Plan, GateAction::Affirm);
    let before_rollback = counts(&observer, case_id).await;
    let gate_before = app
        .read_verified_gate(&a, case_id)
        .await
        .expect("pre-rollback gate read failed");
    sqlx::raw_sql(
        "CREATE FUNCTION aso.fixture_refuse_gate_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'synthetic audit refusal' USING ERRCODE='23514'; END $$;
        CREATE TRIGGER fixture_refuse_gate_audit BEFORE INSERT ON aso.audit_events
        FOR EACH ROW EXECUTE FUNCTION aso.fixture_refuse_gate_audit();",
    )
    .execute(&observer)
    .await
    .expect("audit failure setup failed");
    let rollback_result = app.execute_gate_command(&a, &rollback_command).await;
    sqlx::raw_sql("DROP TRIGGER fixture_refuse_gate_audit ON aso.audit_events; DROP FUNCTION aso.fixture_refuse_gate_audit();")
        .execute(&observer).await.expect("audit failure cleanup failed");
    assert_eq!(rollback_result, Err(GateError::Unavailable));
    assert_eq!(counts(&observer, case_id).await, before_rollback);
    assert_eq!(
        app.read_verified_gate(&a, case_id)
            .await
            .expect("post-rollback gate read failed"),
        gate_before
    );
    assert_eq!(
        app.lookup_gate_command(&a, rollback_command.command_id)
            .await
            .expect("rollback lookup failed"),
        None
    );
    app.execute_gate_command(&a, &rollback_command)
        .await
        .expect("rolled-back command was not reusable");
    mark("audit_failure_rolls_back_affirmation_summary_and_result");

    let duplicate = command(case_id, GateAffirmationKind::Policy, GateAction::Affirm);
    let before_duplicate = counts(&observer, case_id).await;
    let (left, right) = tokio::join!(
        app.execute_gate_command(&a, &duplicate),
        app.execute_gate_command(&a, &duplicate)
    );
    assert_eq!(
        left.expect("first concurrent duplicate failed"),
        right.expect("second concurrent duplicate failed")
    );
    let after_duplicate = counts(&observer, case_id).await;
    assert_eq!(
        after_duplicate,
        (
            before_duplicate.0,
            before_duplicate.1 + 1,
            before_duplicate.2 + 1
        )
    );
    mark("concurrent_duplicate_commits_one_audit_and_result");

    let kinds = [
        GateAffirmationKind::Policy,
        GateAffirmationKind::Section,
        GateAffirmationKind::Pathway,
        GateAffirmationKind::Plan,
    ];
    for kind in kinds {
        app.execute_gate_command(&a, &command(case_id, kind, GateAction::Remove))
            .await
            .expect("concurrency reset failed");
    }
    let commands = kinds.map(|kind| command(case_id, kind, GateAction::Affirm));
    let (one, two, three, four) = tokio::join!(
        app.execute_gate_command(&a, &commands[0]),
        app.execute_gate_command(&b, &commands[1]),
        app.execute_gate_command(&a, &commands[2]),
        app.execute_gate_command(&b, &commands[3])
    );
    for result in [one, two, three, four] {
        result.expect("same-case concurrent command failed");
    }
    let concurrent_gate = app
        .read_verified_gate(&a, case_id)
        .await
        .expect("concurrent gate read failed");
    assert_eq!(concurrent_gate.affirmed, kinds.to_vec());
    assert!(concurrent_gate.gate_affirmed_at.is_some());
    assert!(concurrent_gate.gate_affirmed_by.is_some());
    let latest: (DateTime<Utc>, Uuid) = sqlx::query_as(
        "SELECT affirmed_at,affirmed_by FROM aso.gate_affirmations
        WHERE case_id=$1 ORDER BY affirmed_at DESC,kind DESC LIMIT 1",
    )
    .bind(case_id)
    .fetch_one(&observer)
    .await
    .expect("concurrent summary verification failed");
    assert_eq!(concurrent_gate.gate_affirmed_at, Some(latest.0));
    assert_eq!(concurrent_gate.gate_affirmed_by, Some(latest.1));
    mark("same_case_concurrency_preserves_complete_derived_summary");
    observer.close().await;
}
