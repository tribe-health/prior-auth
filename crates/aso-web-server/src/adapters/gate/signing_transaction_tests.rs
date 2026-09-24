//! Focused synthetic PostgreSQL proof for verified-context letter signing.

use super::*;
use crate::adapters::memory;
use aso_host::{
    AppServices,
    ports::SystemClock,
    session::{Principal, UnavailableSessions},
};
use sqlx::{PgPool, postgres::PgPoolOptions};
use std::sync::Arc;

macro_rules! audited_sql {
    ($($arg:tt)*) => {
        sqlx::AssertSqlSafe(format!($($arg)*))
    };
}

fn mark(name: &str) {
    println!("gate_transaction_check: signing_{name}");
}

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("required fixture variable missing: {name}"))
}

async fn wait_for_backend_lock(pool: &PgPool, backend_pid: i32, label: &str) {
    for _ in 0..100 {
        let waiting: bool = sqlx::query_scalar(
            "SELECT COALESCE((
               SELECT wait_event_type = 'Lock'
               FROM pg_catalog.pg_stat_activity
               WHERE pid = $1
             ), false)",
        )
        .bind(backend_pid)
        .fetch_one(pool)
        .await
        .expect("lock wait observation failed");
        if waiting {
            return;
        }
        tokio::task::yield_now().await;
    }
    panic!("{label} did not reach a database lock wait");
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

async fn complete_gate(app: &AppServices, context: &ClinicalContext, case_id: Uuid) {
    for kind in GateAffirmationKind::ALL {
        app.execute_gate_command(
            context,
            &GateCommand {
                command_id: Uuid::new_v4(),
                case_id,
                kind,
                action: GateAction::Affirm,
            },
        )
        .await
        .expect("gate setup failed");
    }
}

async fn create_signature(pool: &PgPool, actor: Uuid, version: i32) -> Uuid {
    sqlx::query_scalar("INSERT INTO aso.signatures
        (user_id,version,image_uri,image_sha256,credential_line,is_current)
        VALUES ($1,$2,'synthetic://signature',decode(repeat('ab',32),'hex'),'Synthetic Surgeon, MD',true)
        RETURNING id")
        .bind(actor).bind(version).fetch_one(pool).await.expect("signature setup failed")
}

async fn create_letter(
    pool: &PgPool,
    case_id: Uuid,
    actor: Uuid,
    version: i32,
    complete_qa: bool,
    source: SourceFixture,
) -> Uuid {
    let letter_id: Uuid = sqlx::query_scalar(
        "INSERT INTO aso.letters
        (case_id,version,status,body_markdown,content_sha256)
        VALUES ($1,$2,'draft','Synthetic cited letter',decode(repeat('cd',32),'hex'))
        RETURNING id",
    )
    .bind(case_id)
    .bind(version)
    .fetch_one(pool)
    .await
    .expect("letter setup failed");
    let qa_limit = if complete_qa { i64::MAX } else { 1 };
    sqlx::query(
        "INSERT INTO aso.letter_qa_results
        (qa_check_type_id,letter_id,name,data,outcome)
        SELECT id,$1,name,NULL,'pass' FROM aso.qa_check_types ORDER BY key LIMIT $2",
    )
    .bind(letter_id)
    .bind(qa_limit)
    .execute(pool)
    .await
    .expect("QA setup failed");
    if source == SourceFixture::Document {
        let document_id: Uuid = sqlx::query_scalar(
            "INSERT INTO aso.documents
            (document_type_id,patient_id,case_id,name,data,effective_date,content_sha256,page_count)
            SELECT (SELECT id FROM aso.document_types WHERE name='Office Visit Note'),
              c.patient_id,c.id,'Synthetic source',
              jsonb_build_object('encounter_date','2026-09-01'),DATE '2026-09-01',
              decode(repeat('ef',32),'hex'),1
            FROM aso.cases c WHERE c.id=$1 RETURNING id",
        )
        .bind(case_id)
        .fetch_one(pool)
        .await
        .expect("document setup failed");
        sqlx::query(
            "INSERT INTO aso.letter_claims
            (letter_id,ordinal,claim_text,document_id,page_number)
            VALUES ($1,1,'Synthetic supported assertion',$2,1),
                   ($1,2,'Second synthetic supported assertion',$2,1)",
        )
        .bind(letter_id)
        .bind(document_id)
        .execute(pool)
        .await
        .expect("claim setup failed");
    } else if source == SourceFixture::Annotation {
        let annotation_id: Uuid = sqlx::query_scalar("INSERT INTO aso.annotations
            (annotation_type_id,case_id,name,data,body,author_id,is_included,included_at)
            SELECT (SELECT id FROM aso.annotation_types WHERE name='Clinical Judgment'),
              $1,'Synthetic surgeon annotation',jsonb_build_object('assertion','Synthetic judgment'),
              'Synthetic judgment',$2,true,clock_timestamp()
            RETURNING id")
            .bind(case_id).bind(actor).fetch_one(pool).await.expect("annotation setup failed");
        sqlx::query(
            "INSERT INTO aso.letter_claims
            (letter_id,ordinal,claim_text,annotation_id)
            VALUES ($1,1,'Synthetic annotation-only assertion',$2)",
        )
        .bind(letter_id)
        .bind(annotation_id)
        .execute(pool)
        .await
        .expect("annotation claim setup failed");
    }
    let approval = sqlx::query(
        "UPDATE aso.letters SET status='approved',approved_by=$2,
        approved_at=clock_timestamp() WHERE id=$1",
    )
    .bind(letter_id)
    .bind(actor)
    .execute(pool)
    .await;
    if complete_qa && source == SourceFixture::Document {
        approval.expect("approval setup failed");
    } else {
        let error = approval.expect_err("incomplete letter was approved");
        assert_eq!(
            error
                .as_database_error()
                .and_then(|database| database.code())
                .as_deref(),
            Some(if complete_qa { "A0306" } else { "A0305" })
        );
    }
    letter_id
}

async fn create_complete_cited_draft(pool: &PgPool, case_id: Uuid, version: i32) -> (Uuid, Uuid) {
    let letter_id: Uuid = sqlx::query_scalar(
        "INSERT INTO aso.letters
         (case_id,version,status,body_markdown,content_sha256)
         VALUES ($1,$2,'draft','Synthetic QA race',decode(repeat('77',32),'hex'))
         RETURNING id",
    )
    .bind(case_id)
    .bind(version)
    .fetch_one(pool)
    .await
    .expect("QA race letter setup failed");
    sqlx::query(
        "INSERT INTO aso.letter_qa_results
         (qa_check_type_id,letter_id,name,data,outcome)
         SELECT id,$1,name,NULL,'pass' FROM aso.qa_check_types ORDER BY key",
    )
    .bind(letter_id)
    .execute(pool)
    .await
    .expect("QA race results setup failed");
    let document_id: Uuid = sqlx::query_scalar(
        "INSERT INTO aso.documents
         (document_type_id,patient_id,case_id,name,data,effective_date,content_sha256,page_count)
         SELECT (SELECT id FROM aso.document_types WHERE name='Office Visit Note'),
           c.patient_id,c.id,'Synthetic race source',
           jsonb_build_object('encounter_date','2026-09-01'),DATE '2026-09-01',
           decode(repeat('76',32),'hex'),1
         FROM aso.cases c WHERE c.id=$1 RETURNING id",
    )
    .bind(case_id)
    .fetch_one(pool)
    .await
    .expect("race source document setup failed");
    sqlx::query(
        "INSERT INTO aso.letter_claims
         (letter_id,ordinal,claim_text,document_id,page_number)
         VALUES ($1,1,'Synthetic race assertion',$2,1)",
    )
    .bind(letter_id)
    .bind(document_id)
    .execute(pool)
    .await
    .expect("race claim setup failed");
    (letter_id, document_id)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SourceFixture {
    Document,
    Annotation,
    None,
}

fn command(target: &SigningTarget) -> SignLetterCommand {
    SignLetterCommand {
        command_id: Uuid::new_v4(),
        letter_id: target.letter_id,
        expected_letter_version: target.letter_version,
        expected_qa_revision: target.qa_revision,
        expected_signature_version: target.signature_version.expect("current signature missing"),
    }
}

async fn direct_trigger(
    pool: &PgPool,
    context: &ClinicalContext,
    letter_id: Uuid,
    signature_id: Uuid,
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
        "UPDATE aso.letters SET status='signed',signature_id=$2,
        signed_at=clock_timestamp() WHERE id=$1",
    )
    .bind(letter_id)
    .bind(signature_id)
    .execute(&mut *tx)
    .await;
    tx.rollback().await?;
    result.map(|done| done.rows_affected())
}

#[tokio::test]
#[ignore = "requires the disposable PostgreSQL fixture"]
async fn signing_gate_transaction_lifecycle() {
    let contexts: serde_json::Value =
        serde_json::from_str(&env("ASO_TEST_GATE_CONTEXTS")).expect("fixture contexts invalid");
    let a = context(&contexts["A"]);
    let admin = context(&contexts["admin"]);
    let foreign = context(&contexts["foreign"]);
    let agent = ClinicalContext {
        identity_id: a.identity_id,
        actor: a.actor,
        practice: a.practice,
        principal: Principal::Agent,
        expires_at: a.expires_at,
    };
    let case_id = Uuid::parse_str(&env("ASO_TEST_GATE_CASE_ID")).expect("case UUID invalid");
    let foreign_case_id =
        Uuid::parse_str(&env("ASO_TEST_FOREIGN_CASE_ID")).expect("foreign case UUID invalid");

    let repository = Arc::new(
        PgGateRepository::connect(&env("ASO_TEST_DATABASE_URL"))
            .await
            .expect("restricted repository connection failed"),
    );
    let observer = PgPoolOptions::new()
        .max_connections(3)
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
        evidence: Arc::new(memory::MemoryEvidenceRepo),
        criteria: Arc::new(memory::MemoryCriteriaRepo),
        letters: repository.clone(),
        authority: repository.clone(),
        clock: Arc::new(SystemClock),
        sessions: Arc::new(UnavailableSessions),
    };

    complete_gate(&app, &a, case_id).await;

    let (claims_racing_letter, claims_racing_document) =
        create_complete_cited_draft(&observer, foreign_case_id, 100).await;
    let mut claims_truncate_first = observer
        .begin()
        .await
        .expect("claims truncate-first transaction failed");
    sqlx::query("TRUNCATE aso.letter_claims")
        .execute(&mut *claims_truncate_first)
        .await
        .expect("claims truncate-first setup failed");
    let mut claims_approval_connection = observer
        .acquire()
        .await
        .expect("claims approval race connection failed");
    let claims_approval_pid: i32 = sqlx::query_scalar("SELECT pg_catalog.pg_backend_pid()")
        .fetch_one(&mut *claims_approval_connection)
        .await
        .expect("claims approval backend PID read failed");
    let claims_approval_race = tokio::spawn(async move {
        sqlx::query(
            "UPDATE aso.letters SET status='approved',approved_by=$2,
             approved_at=clock_timestamp() WHERE id=$1",
        )
        .bind(claims_racing_letter)
        .bind(foreign.actor.0)
        .execute(&mut *claims_approval_connection)
        .await
    });
    wait_for_backend_lock(
        &observer,
        claims_approval_pid,
        "approval behind claims truncate",
    )
    .await;
    claims_truncate_first
        .commit()
        .await
        .expect("claims truncate-first commit failed");
    let claims_approval_error = claims_approval_race
        .await
        .expect("claims approval race task failed")
        .expect_err("approval committed after concurrent claim truncation");
    assert_eq!(
        claims_approval_error
            .as_database_error()
            .and_then(|database| database.code())
            .as_deref(),
        Some("A0306")
    );
    let truncated_claim_state: (String, i64) = sqlx::query_as(
        "SELECT status,
           (SELECT count(*) FROM aso.letter_claims WHERE letter_id=$1)
         FROM aso.letters WHERE id=$1",
    )
    .bind(claims_racing_letter)
    .fetch_one(&observer)
    .await
    .expect("claims truncate-first state observation failed");
    assert_eq!(truncated_claim_state, ("draft".into(), 0));
    mark("claims_truncate_commits_first_and_concurrent_approval_is_refused");

    sqlx::query(
        "INSERT INTO aso.letter_claims
         (letter_id,ordinal,claim_text,document_id,page_number)
         VALUES ($1,1,'Synthetic race assertion',$2,1)",
    )
    .bind(claims_racing_letter)
    .bind(claims_racing_document)
    .execute(&observer)
    .await
    .expect("claims race restoration failed");
    let mut claims_approval_first = observer
        .begin()
        .await
        .expect("claims approval-first transaction failed");
    sqlx::query(
        "UPDATE aso.letters SET status='approved',approved_by=$2,
         approved_at=clock_timestamp() WHERE id=$1",
    )
    .bind(claims_racing_letter)
    .bind(foreign.actor.0)
    .execute(&mut *claims_approval_first)
    .await
    .expect("claims approval-first setup failed");
    let mut claims_truncate_connection = observer
        .acquire()
        .await
        .expect("claims truncate race connection failed");
    let claims_truncate_pid: i32 = sqlx::query_scalar("SELECT pg_catalog.pg_backend_pid()")
        .fetch_one(&mut *claims_truncate_connection)
        .await
        .expect("claims truncate backend PID read failed");
    let claims_truncate_race = tokio::spawn(async move {
        sqlx::query("TRUNCATE aso.letter_claims")
            .execute(&mut *claims_truncate_connection)
            .await
    });
    wait_for_backend_lock(
        &observer,
        claims_truncate_pid,
        "claims truncate behind approval",
    )
    .await;
    claims_approval_first
        .commit()
        .await
        .expect("claims approval-first commit failed");
    let claims_truncate_error = claims_truncate_race
        .await
        .expect("claims truncate race task failed")
        .expect_err("claim truncation committed after concurrent approval");
    assert_eq!(
        claims_truncate_error
            .as_database_error()
            .and_then(|database| database.code())
            .as_deref(),
        Some("42501")
    );
    let approved_claim_state: (String, bool) = sqlx::query_as(
        "SELECT letter.status,
           (SELECT count(*) FROM aso.letter_claims claim
            WHERE claim.letter_id=letter.id) = 1
         FROM aso.letters letter WHERE letter.id=$1",
    )
    .bind(claims_racing_letter)
    .fetch_one(&observer)
    .await
    .expect("claims approval-first state observation failed");
    assert_eq!(approved_claim_state, ("approved".into(), true));
    mark("approval_commits_first_and_concurrent_claims_truncate_is_refused");

    let mut claims_race_cleanup = observer
        .begin()
        .await
        .expect("claims race cleanup transaction failed");
    sqlx::query("SET LOCAL session_replication_role = replica")
        .execute(&mut *claims_race_cleanup)
        .await
        .expect("claims race cleanup trigger suspension failed");
    sqlx::query("DELETE FROM aso.letter_claims WHERE letter_id=$1")
        .bind(claims_racing_letter)
        .execute(&mut *claims_race_cleanup)
        .await
        .expect("claims race claim cleanup failed");
    sqlx::query("DELETE FROM aso.letter_qa_results WHERE letter_id=$1")
        .bind(claims_racing_letter)
        .execute(&mut *claims_race_cleanup)
        .await
        .expect("claims race QA cleanup failed");
    sqlx::query("DELETE FROM aso.letters WHERE id=$1")
        .bind(claims_racing_letter)
        .execute(&mut *claims_race_cleanup)
        .await
        .expect("claims race letter cleanup failed");
    sqlx::query("DELETE FROM aso.documents WHERE id=$1")
        .bind(claims_racing_document)
        .execute(&mut *claims_race_cleanup)
        .await
        .expect("claims race document cleanup failed");
    claims_race_cleanup
        .commit()
        .await
        .expect("claims race cleanup commit failed");

    let (qa_racing_letter, _) = create_complete_cited_draft(&observer, foreign_case_id, 101).await;
    let mut truncate_first = observer
        .begin()
        .await
        .expect("truncate-first transaction failed");
    sqlx::query("TRUNCATE aso.letter_qa_results")
        .execute(&mut *truncate_first)
        .await
        .expect("truncate-first setup failed");
    let mut approval_connection = observer
        .acquire()
        .await
        .expect("approval race connection failed");
    let approval_pid: i32 = sqlx::query_scalar("SELECT pg_catalog.pg_backend_pid()")
        .fetch_one(&mut *approval_connection)
        .await
        .expect("approval backend PID read failed");
    let approval_race = tokio::spawn(async move {
        sqlx::query(
            "UPDATE aso.letters SET status='approved',approved_by=$2,
             approved_at=clock_timestamp() WHERE id=$1",
        )
        .bind(qa_racing_letter)
        .bind(foreign.actor.0)
        .execute(&mut *approval_connection)
        .await
    });
    wait_for_backend_lock(&observer, approval_pid, "approval behind truncate").await;
    truncate_first
        .commit()
        .await
        .expect("truncate-first commit failed");
    let approval_error = approval_race
        .await
        .expect("approval race task failed")
        .expect_err("approval committed after concurrent QA truncation");
    assert_eq!(
        approval_error
            .as_database_error()
            .and_then(|database| database.code())
            .as_deref(),
        Some("A0305")
    );
    let truncated_state: (String, i64) = sqlx::query_as(
        "SELECT status,
           (SELECT count(*) FROM aso.letter_qa_results WHERE letter_id=$1)
         FROM aso.letters WHERE id=$1",
    )
    .bind(qa_racing_letter)
    .fetch_one(&observer)
    .await
    .expect("truncate-first state observation failed");
    assert_eq!(truncated_state, ("draft".into(), 0));
    mark("qa_truncate_commits_first_and_concurrent_approval_is_refused");

    sqlx::query(
        "INSERT INTO aso.letter_qa_results
         (qa_check_type_id,letter_id,name,data,outcome)
         SELECT id,$1,name,NULL,'pass' FROM aso.qa_check_types ORDER BY key",
    )
    .bind(qa_racing_letter)
    .execute(&observer)
    .await
    .expect("QA race results restoration failed");
    let mut approval_first = observer
        .begin()
        .await
        .expect("approval-first transaction failed");
    sqlx::query(
        "UPDATE aso.letters SET status='approved',approved_by=$2,
         approved_at=clock_timestamp() WHERE id=$1",
    )
    .bind(qa_racing_letter)
    .bind(foreign.actor.0)
    .execute(&mut *approval_first)
    .await
    .expect("approval-first setup failed");
    let mut truncate_connection = observer
        .acquire()
        .await
        .expect("truncate race connection failed");
    let truncate_pid: i32 = sqlx::query_scalar("SELECT pg_catalog.pg_backend_pid()")
        .fetch_one(&mut *truncate_connection)
        .await
        .expect("truncate backend PID read failed");
    let truncate_race = tokio::spawn(async move {
        sqlx::query("TRUNCATE aso.letter_qa_results")
            .execute(&mut *truncate_connection)
            .await
    });
    wait_for_backend_lock(&observer, truncate_pid, "truncate behind approval").await;
    approval_first
        .commit()
        .await
        .expect("approval-first commit failed");
    let truncate_error = truncate_race
        .await
        .expect("truncate race task failed")
        .expect_err("QA truncation committed after concurrent approval");
    assert_eq!(
        truncate_error
            .as_database_error()
            .and_then(|database| database.code())
            .as_deref(),
        Some("42501")
    );
    let approved_qa_state: (String, bool) = sqlx::query_as(
        "SELECT letter.status,
           letter.approved_qa_revision = letter.qa_revision
           AND (SELECT count(*) FROM aso.letter_qa_results result
                WHERE result.letter_id=letter.id)
               = (SELECT count(*) FROM aso.qa_check_types)
         FROM aso.letters letter WHERE letter.id=$1",
    )
    .bind(qa_racing_letter)
    .fetch_one(&observer)
    .await
    .expect("approval-first state observation failed");
    assert_eq!(approved_qa_state, ("approved".into(), true));
    mark("approval_commits_first_and_concurrent_qa_truncate_is_refused");

    let signature_id = create_signature(&observer, a.actor.0, 1).await;
    let ready_letter = create_letter(
        &observer,
        case_id,
        a.actor.0,
        1,
        true,
        SourceFixture::Document,
    )
    .await;
    let ready = app
        .read_signing_target(&a, LetterId(ready_letter))
        .await
        .expect("ready target read failed");
    assert!(
        ready.approved_by_actor
            && ready.is_current
            && ready.gate_affirmed
            && ready.qa_complete
            && ready.sources_complete
    );
    mark("complete_target_observed");

    for (changed, expected) in [
        (
            SignLetterCommand {
                expected_letter_version: ready.letter_version + 1,
                ..command(&ready)
            },
            SigningError::RevisionConflict,
        ),
        (
            SignLetterCommand {
                expected_qa_revision: ready.qa_revision + 1,
                ..command(&ready)
            },
            SigningError::RevisionConflict,
        ),
        (
            SignLetterCommand {
                expected_signature_version: 2,
                ..command(&ready)
            },
            SigningError::SignatureConflict,
        ),
    ] {
        assert_eq!(app.execute_sign_letter(&a, &changed).await, Err(expected));
        assert_eq!(
            repository.execute_sign_letter(&a, &changed).await,
            Err(expected)
        );
    }
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT status FROM aso.letters WHERE id=$1")
            .bind(ready_letter)
            .fetch_one(&observer)
            .await
            .unwrap(),
        "approved"
    );
    mark("service_and_database_refuse_stale_letter_qa_and_signature_revisions");

    let draft_letter: Uuid = sqlx::query_scalar(
        "INSERT INTO aso.letters
        (case_id,version,status,body_markdown,content_sha256)
        VALUES ($1,99,'draft','Synthetic move target',decode(repeat('aa',32),'hex'))
        RETURNING id",
    )
    .bind(foreign_case_id)
    .fetch_one(&observer)
    .await
    .expect("draft move target failed");
    let move_result = sqlx::query(
        "UPDATE aso.letter_claims SET letter_id=$2
        WHERE letter_id=$1 AND ordinal=1",
    )
    .bind(ready_letter)
    .bind(draft_letter)
    .execute(&observer)
    .await;
    assert!(move_result.is_err());
    mark("approved_source_mapping_cannot_move_to_draft_letter");

    let qa_move_result = sqlx::query(
        "UPDATE aso.letter_qa_results SET letter_id=$2
         WHERE id=(SELECT id FROM aso.letter_qa_results WHERE letter_id=$1 LIMIT 1)",
    )
    .bind(ready_letter)
    .bind(draft_letter)
    .execute(&observer)
    .await
    .expect_err("approved QA row moved to a draft letter");
    assert_eq!(
        qa_move_result
            .as_database_error()
            .and_then(|database| database.code())
            .as_deref(),
        Some("42501")
    );
    mark("approved_qa_cannot_move_to_draft_letter");

    let qa_truncate = sqlx::query("TRUNCATE aso.letter_qa_results")
        .execute(&observer)
        .await
        .expect_err("approved QA rows were truncated");
    assert_eq!(
        qa_truncate
            .as_database_error()
            .and_then(|database| database.code())
            .as_deref(),
        Some("42501")
    );
    mark("approved_qa_cannot_be_truncated");

    let claims_truncate = sqlx::query("TRUNCATE aso.letter_claims")
        .execute(&observer)
        .await
        .expect_err("approved source mappings were truncated");
    assert_eq!(
        claims_truncate
            .as_database_error()
            .and_then(|database| database.code())
            .as_deref(),
        Some("42501")
    );
    mark("approved_source_mappings_cannot_be_truncated");

    let demotion = sqlx::query("UPDATE aso.letters SET status='draft' WHERE id=$1")
        .bind(ready_letter)
        .execute(&observer)
        .await
        .expect_err("approved letter returned to draft");
    assert_eq!(
        demotion
            .as_database_error()
            .and_then(|database| database.code())
            .as_deref(),
        Some("42501")
    );
    mark("approved_letter_cannot_return_to_draft");

    let source_document: Uuid = sqlx::query_scalar(
        "SELECT document_id FROM aso.letter_claims
         WHERE letter_id=$1 AND document_id IS NOT NULL LIMIT 1",
    )
    .bind(ready_letter)
    .fetch_one(&observer)
    .await
    .expect("approved source document missing");
    let source_update = sqlx::query(
        "UPDATE aso.documents SET content_sha256=decode(repeat('11',32),'hex') WHERE id=$1",
    )
    .bind(source_document)
    .execute(&observer)
    .await
    .expect_err("approved source document content changed in place");
    assert_eq!(
        source_update
            .as_database_error()
            .and_then(|database| database.code())
            .as_deref(),
        Some("42501")
    );
    assert_eq!(
        sqlx::query_scalar::<_, Vec<u8>>("SELECT content_sha256 FROM aso.documents WHERE id=$1")
            .bind(source_document)
            .fetch_one(&observer)
            .await
            .expect("approved source hash observation failed"),
        vec![0xef; 32]
    );
    mark("approved_source_document_content_is_immutable");

    let racing_letter: Uuid = sqlx::query_scalar(
        "INSERT INTO aso.letters
         (case_id,version,status,body_markdown,content_sha256)
         VALUES ($1,100,'draft','Synthetic approval race',decode(repeat('22',32),'hex'))
         RETURNING id",
    )
    .bind(foreign_case_id)
    .fetch_one(&observer)
    .await
    .expect("approval race letter setup failed");
    sqlx::query(
        "INSERT INTO aso.letter_qa_results
         (qa_check_type_id,letter_id,name,data,outcome)
         SELECT id,$1,name,NULL,'pass' FROM aso.qa_check_types ORDER BY key",
    )
    .bind(racing_letter)
    .execute(&observer)
    .await
    .expect("approval race QA setup failed");
    let racing_document: Uuid = sqlx::query_scalar(
        "INSERT INTO aso.documents
         (document_type_id,patient_id,case_id,name,data,effective_date,content_sha256,page_count)
         SELECT (SELECT id FROM aso.document_types WHERE name='Office Visit Note'),
           c.patient_id,c.id,'Synthetic racing source',
           jsonb_build_object('encounter_date','2026-09-02'),DATE '2026-09-02',
           decode(repeat('33',32),'hex'),1
         FROM aso.cases c WHERE c.id=$1 RETURNING id",
    )
    .bind(foreign_case_id)
    .fetch_one(&observer)
    .await
    .expect("approval race document setup failed");
    sqlx::query(
        "INSERT INTO aso.letter_claims
         (letter_id,ordinal,claim_text,document_id,page_number)
         VALUES ($1,1,'Synthetic racing assertion',$2,1)",
    )
    .bind(racing_letter)
    .bind(racing_document)
    .execute(&observer)
    .await
    .expect("approval race claim setup failed");
    let mut approval = observer.begin().await.expect("approval transaction failed");
    sqlx::query(
        "UPDATE aso.letters SET status='approved',approved_by=$2,
         approved_at=clock_timestamp() WHERE id=$1",
    )
    .bind(racing_letter)
    .bind(foreign.actor.0)
    .execute(&mut *approval)
    .await
    .expect("approval race setup failed");
    let source_pool = observer.clone();
    let source_race = tokio::spawn(async move {
        sqlx::query(
            "UPDATE aso.documents SET content_sha256=decode(repeat('44',32),'hex') WHERE id=$1",
        )
        .bind(racing_document)
        .execute(&source_pool)
        .await
    });
    for _ in 0..100 {
        tokio::task::yield_now().await;
        if source_race.is_finished() {
            break;
        }
    }
    assert!(
        !source_race.is_finished(),
        "source mutation did not wait for the approval transaction"
    );
    approval.commit().await.expect("approval commit failed");
    let source_race_error = source_race
        .await
        .expect("source race task failed")
        .expect_err("source mutation committed after approval");
    assert_eq!(
        source_race_error
            .as_database_error()
            .and_then(|database| database.code())
            .as_deref(),
        Some("42501")
    );
    mark("source_mutation_cannot_commit_after_concurrent_approval");

    let published_schema = format!("ra03_published_{}", Uuid::new_v4().simple());
    let schema_publication = format!("ra03_schema_{}", Uuid::new_v4().simple());
    sqlx::query(audited_sql!("CREATE SCHEMA {published_schema}"))
        .execute(&observer)
        .await
        .expect("publication race schema setup failed");

    let mut schema_move_first = observer
        .begin()
        .await
        .expect("schema-move-first transaction failed");
    sqlx::query(audited_sql!(
        "ALTER TABLE aso.letter_sign_commands SET SCHEMA {published_schema}"
    ))
    .execute(&mut *schema_move_first)
    .await
    .expect("schema-move-first setup failed");
    let mut publication_connection = observer
        .acquire()
        .await
        .expect("publication race connection failed");
    let publication_pid: i32 = sqlx::query_scalar("SELECT pg_catalog.pg_backend_pid()")
        .fetch_one(&mut *publication_connection)
        .await
        .expect("publication backend PID read failed");
    let schema_for_publication = published_schema.clone();
    let publication_for_create = schema_publication.clone();
    let publication_race = tokio::spawn(async move {
        sqlx::query(audited_sql!(
            "CREATE PUBLICATION {publication_for_create} FOR TABLES IN SCHEMA {schema_for_publication}"
        ))
        .execute(&mut *publication_connection)
        .await
    });
    wait_for_backend_lock(
        &observer,
        publication_pid,
        "publication behind protected schema move",
    )
    .await;
    schema_move_first
        .commit()
        .await
        .expect("schema-move-first commit failed");
    let publication_error = publication_race
        .await
        .expect("publication race task failed")
        .expect_err("schema publication committed after protected table move");
    assert_eq!(
        publication_error
            .as_database_error()
            .and_then(|database| database.code())
            .as_deref(),
        Some("40001")
    );
    sqlx::query(audited_sql!(
        "ALTER TABLE {published_schema}.letter_sign_commands SET SCHEMA aso"
    ))
    .execute(&observer)
    .await
    .expect("schema-move-first cleanup failed");
    mark("protected_schema_move_commits_first_and_publication_is_refused");

    let mut publication_first = observer
        .begin()
        .await
        .expect("publication-first transaction failed");
    sqlx::query(audited_sql!(
        "CREATE PUBLICATION {schema_publication} FOR TABLES IN SCHEMA {published_schema}"
    ))
    .execute(&mut *publication_first)
    .await
    .expect("publication-first setup failed");
    let mut schema_move_connection = observer
        .acquire()
        .await
        .expect("schema move race connection failed");
    let schema_move_pid: i32 = sqlx::query_scalar("SELECT pg_catalog.pg_backend_pid()")
        .fetch_one(&mut *schema_move_connection)
        .await
        .expect("schema move backend PID read failed");
    let schema_for_move = published_schema.clone();
    let schema_move_race = tokio::spawn(async move {
        sqlx::query(audited_sql!(
            "ALTER TABLE aso.letter_sign_commands SET SCHEMA {schema_for_move}"
        ))
        .execute(&mut *schema_move_connection)
        .await
    });
    wait_for_backend_lock(
        &observer,
        schema_move_pid,
        "protected schema move behind publication",
    )
    .await;
    publication_first
        .commit()
        .await
        .expect("publication-first commit failed");
    let schema_move_error = schema_move_race
        .await
        .expect("schema move race task failed")
        .expect_err("protected table moved into a concurrently published schema");
    assert_eq!(
        schema_move_error
            .as_database_error()
            .and_then(|database| database.code())
            .as_deref(),
        Some("40001")
    );
    let protected_state: (bool, bool) = sqlx::query_as(
        "SELECT to_regclass('aso.letter_sign_commands') IS NOT NULL,
           NOT EXISTS (
             SELECT FROM pg_catalog.pg_publication_namespace publication_schema
             JOIN pg_catalog.pg_class relation
               ON relation.relnamespace = publication_schema.pnnspid
             JOIN aso.local_replication_exclusions excluded
               ON excluded.relation_oid = relation.oid
           )",
    )
    .fetch_one(&observer)
    .await
    .expect("publication race state observation failed");
    assert_eq!(protected_state, (true, true));
    sqlx::query(audited_sql!("DROP PUBLICATION {schema_publication}"))
        .execute(&observer)
        .await
        .expect("publication-first cleanup failed");
    mark("publication_commits_first_and_protected_schema_move_is_refused");

    let mut table_create_first = observer
        .begin()
        .await
        .expect("table-create-first transaction failed");
    sqlx::query(audited_sql!(
        "CREATE TABLE {published_schema}.gate_commands (id integer PRIMARY KEY)"
    ))
    .execute(&mut *table_create_first)
    .await
    .expect("table-create-first setup failed");
    let mut create_publication_connection = observer
        .acquire()
        .await
        .expect("create-table publication race connection failed");
    let create_publication_pid: i32 = sqlx::query_scalar("SELECT pg_catalog.pg_backend_pid()")
        .fetch_one(&mut *create_publication_connection)
        .await
        .expect("create-table publication backend PID read failed");
    let schema_for_create_publication = published_schema.clone();
    let publication_for_table_create = schema_publication.clone();
    let create_publication_race = tokio::spawn(async move {
        sqlx::query(audited_sql!(
            "CREATE PUBLICATION {publication_for_table_create} FOR TABLES IN SCHEMA {schema_for_create_publication}"
        ))
        .execute(&mut *create_publication_connection)
        .await
    });
    wait_for_backend_lock(
        &observer,
        create_publication_pid,
        "publication behind protected table creation",
    )
    .await;
    table_create_first
        .commit()
        .await
        .expect("table-create-first commit failed");
    let create_publication_error = create_publication_race
        .await
        .expect("create-table publication race task failed")
        .expect_err("schema publication committed after protected table creation");
    assert_eq!(
        create_publication_error
            .as_database_error()
            .and_then(|database| database.code())
            .as_deref(),
        Some("40001")
    );
    sqlx::query(audited_sql!("DROP TABLE {published_schema}.gate_commands"))
        .execute(&observer)
        .await
        .expect("table-create-first cleanup failed");
    mark("protected_table_creation_commits_first_and_publication_is_refused");

    let mut create_publication_first = observer
        .begin()
        .await
        .expect("create-publication-first transaction failed");
    sqlx::query(audited_sql!(
        "CREATE PUBLICATION {schema_publication} FOR TABLES IN SCHEMA {published_schema}"
    ))
    .execute(&mut *create_publication_first)
    .await
    .expect("create-publication-first setup failed");
    let mut table_create_connection = observer
        .acquire()
        .await
        .expect("protected table create race connection failed");
    let table_create_pid: i32 = sqlx::query_scalar("SELECT pg_catalog.pg_backend_pid()")
        .fetch_one(&mut *table_create_connection)
        .await
        .expect("protected table create backend PID read failed");
    let schema_for_table_create = published_schema.clone();
    let table_create_race = tokio::spawn(async move {
        sqlx::query(audited_sql!(
            "CREATE TABLE {schema_for_table_create}.gate_commands (id integer PRIMARY KEY)"
        ))
        .execute(&mut *table_create_connection)
        .await
    });
    wait_for_backend_lock(
        &observer,
        table_create_pid,
        "protected table creation behind publication",
    )
    .await;
    create_publication_first
        .commit()
        .await
        .expect("create-publication-first commit failed");
    let table_create_error = table_create_race
        .await
        .expect("protected table create race task failed")
        .expect_err("protected table was created in a concurrently published schema");
    assert_eq!(
        table_create_error
            .as_database_error()
            .and_then(|database| database.code())
            .as_deref(),
        Some("40001")
    );
    let create_race_safe: bool = sqlx::query_scalar(audited_sql!(
        "SELECT to_regclass('{published_schema}.gate_commands') IS NULL
          AND EXISTS (
            SELECT FROM pg_catalog.pg_publication WHERE pubname='{schema_publication}'
          )"
    ))
    .fetch_one(&observer)
    .await
    .expect("protected table create race state observation failed");
    assert!(create_race_safe);
    sqlx::query(audited_sql!("DROP PUBLICATION {schema_publication}"))
        .execute(&observer)
        .await
        .expect("create-publication-first cleanup failed");
    sqlx::query(audited_sql!("DROP SCHEMA {published_schema}"))
        .execute(&observer)
        .await
        .expect("publication race schema cleanup failed");
    mark("publication_commits_first_and_protected_table_creation_is_refused");

    let allowed = command(&ready);
    for caller in [&admin, &agent, &foreign] {
        assert_eq!(
            app.execute_sign_letter(caller, &allowed).await,
            Err(SigningError::Denied)
        );
        assert_eq!(
            repository.execute_sign_letter(caller, &allowed).await,
            Err(SigningError::Denied)
        );
    }
    for caller in [&admin, &agent, &foreign] {
        let error = direct_trigger(&observer, caller, ready_letter, signature_id)
            .await
            .expect_err("independent signing trigger accepted a denied caller");
        assert_eq!(
            error
                .as_database_error()
                .and_then(|database| database.code())
                .as_deref(),
            Some("42501")
        );
    }
    assert_eq!(
        direct_trigger(&observer, &a, ready_letter, signature_id)
            .await
            .unwrap(),
        1
    );
    mark("service_function_and_trigger_independently_refuse_admin_agent_and_foreign_scope");

    sqlx::query(
        "ALTER TABLE aso.letter_sign_commands
         ADD CONSTRAINT ra03_reject_signing_receipt CHECK (false) NOT VALID",
    )
    .execute(&observer)
    .await
    .expect("signing receipt failure injection failed");
    assert_eq!(
        app.execute_sign_letter(&a, &allowed).await,
        Err(SigningError::Unavailable)
    );
    let rollback: (String, Option<Uuid>, Option<DateTime<Utc>>, i64, i64) = sqlx::query_as(
        "SELECT l.status,l.signature_id,l.signed_at,
          (SELECT count(*) FROM aso.audit_events
           WHERE entity_id=$1 AND action='letter.sign'),
          (SELECT count(*) FROM aso.letter_sign_commands
           WHERE command_id=$2)
         FROM aso.letters l WHERE l.id=$1",
    )
    .bind(ready_letter)
    .bind(allowed.command_id)
    .fetch_one(&observer)
    .await
    .expect("signing rollback observation failed");
    assert_eq!(rollback, ("approved".into(), None, None, 0, 0));
    assert_eq!(
        app.lookup_sign_letter_command(&a, LetterId(ready_letter), allowed.command_id)
            .await,
        Ok(None)
    );
    sqlx::query(
        "ALTER TABLE aso.letter_sign_commands
         DROP CONSTRAINT ra03_reject_signing_receipt",
    )
    .execute(&observer)
    .await
    .expect("signing receipt failure cleanup failed");
    mark("receipt_failure_rolls_back_letter_audit_and_command");

    let signed = app
        .execute_sign_letter(&a, &allowed)
        .await
        .expect("authorized signing failed");
    assert_eq!(signed.signature_id, signature_id);
    assert_eq!(signed.letter_version, 1);
    let counts: (i64, i64, String) = sqlx::query_as(
        "SELECT
        (SELECT count(*) FROM aso.letter_sign_commands WHERE letter_id=$1),
        (SELECT count(*) FROM aso.audit_events WHERE entity_id=$1 AND action='letter.sign'),
        (SELECT status FROM aso.letters WHERE id=$1)",
    )
    .bind(ready_letter)
    .fetch_one(&observer)
    .await
    .expect("signing counts failed");
    assert_eq!(counts, (1, 1, "signed".into()));
    mark("authorized_signing_commits_one_letter_audit_and_result");

    assert_eq!(
        app.execute_sign_letter(&a, &allowed).await,
        Ok(signed.clone())
    );
    assert_eq!(
        app.lookup_sign_letter_command(&a, LetterId(ready_letter), allowed.command_id)
            .await,
        Ok(Some(signed.clone()))
    );
    let replay_counts: (i64, i64) = sqlx::query_as(
        "SELECT
          (SELECT count(*) FROM aso.letter_sign_commands WHERE letter_id=$1),
          (SELECT count(*) FROM aso.audit_events WHERE entity_id=$1 AND action='letter.sign')",
    )
    .bind(ready_letter)
    .fetch_one(&observer)
    .await
    .expect("signing replay counts failed");
    assert_eq!(replay_counts, (1, 1));
    mark("lost_response_repeat_and_lookup_return_one_signing_effect");

    let missing_qa = create_letter(
        &observer,
        case_id,
        a.actor.0,
        2,
        false,
        SourceFixture::Document,
    )
    .await;
    let qa_target = app
        .read_signing_target(&a, LetterId(missing_qa))
        .await
        .unwrap();
    assert!(
        qa_target.status == LetterStatus::Draft
            && !qa_target.qa_complete
            && qa_target.sources_complete
    );
    let qa_command = command(&qa_target);
    assert_eq!(
        app.execute_sign_letter(&a, &qa_command).await,
        Err(SigningError::NotApproved)
    );
    assert_eq!(
        repository.execute_sign_letter(&a, &qa_command).await,
        Err(SigningError::NotApproved)
    );
    mark("incomplete_qa_cannot_be_approved_or_signed");

    let missing_source =
        create_letter(&observer, case_id, a.actor.0, 3, true, SourceFixture::None).await;
    let source_state: (String, Option<i64>, i32, i64) = sqlx::query_as(
        "SELECT status,approved_qa_revision,version,qa_revision
         FROM aso.letters WHERE id=$1",
    )
    .bind(missing_source)
    .fetch_one(&observer)
    .await
    .expect("incomplete source state read failed");
    assert_eq!(source_state.0, "draft");
    assert_eq!(source_state.1, None);
    let source_command = SignLetterCommand {
        command_id: Uuid::new_v4(),
        letter_id: LetterId(missing_source),
        expected_letter_version: source_state.2,
        expected_qa_revision: source_state.3,
        expected_signature_version: 1,
    };
    assert_eq!(
        repository.execute_sign_letter(&a, &source_command).await,
        Err(SigningError::NotApproved)
    );
    mark("incomplete_sources_cannot_be_approved_or_signed");

    let annotation_only = create_letter(
        &observer,
        case_id,
        a.actor.0,
        4,
        true,
        SourceFixture::Annotation,
    )
    .await;
    let annotation_state: (String, Option<i64>, i32, i64) = sqlx::query_as(
        "SELECT status,approved_qa_revision,version,qa_revision
         FROM aso.letters WHERE id=$1",
    )
    .bind(annotation_only)
    .fetch_one(&observer)
    .await
    .expect("annotation-only state read failed");
    assert_eq!(annotation_state.0, "draft");
    assert_eq!(annotation_state.1, None);
    let annotation_command = SignLetterCommand {
        command_id: Uuid::new_v4(),
        letter_id: LetterId(annotation_only),
        expected_letter_version: annotation_state.2,
        expected_qa_revision: annotation_state.3,
        expected_signature_version: 1,
    };
    assert_eq!(
        repository
            .execute_sign_letter(&a, &annotation_command)
            .await,
        Err(SigningError::NotApproved),
    );
    mark("annotation_only_assertion_cannot_be_approved_as_document_citation");

    observer.close().await;
}
