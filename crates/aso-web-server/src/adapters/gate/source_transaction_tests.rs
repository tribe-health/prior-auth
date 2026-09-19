//! Focused disposable-Postgres proof for authorized, audited source delivery.

use super::*;

use std::{fs, path::PathBuf, sync::Arc};

use crate::adapters::{document_store::LocalDocumentStore, memory};
use aso_host::{
    AppServices,
    ports::SystemClock,
    session::{Principal, UnavailableSessions},
    source::{DocumentSourceError, DocumentSourceRequest},
};
use sqlx::postgres::PgPoolOptions;

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("required fixture variable missing: {name}"))
}

fn context(prefix: &str) -> ClinicalContext {
    let value: serde_json::Value =
        serde_json::from_str(&env(prefix)).expect("source context JSON invalid");
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

#[tokio::test]
#[ignore = "requires the disposable RA16 PostgreSQL fixture"]
async fn document_source_transaction_authorizes_hashes_and_audits() {
    let case_id = Uuid::parse_str(&env("ASO_TEST_SOURCE_CASE_ID")).unwrap();
    let document_id = Uuid::parse_str(&env("ASO_TEST_SOURCE_DOCUMENT_ID")).unwrap();
    let root = PathBuf::from(env("ASO_TEST_SOURCE_ROOT"));
    let path = root.join("documents/source.pdf");
    let original = fs::read(&path).expect("synthetic source missing");
    let store = Arc::new(LocalDocumentStore::new(&root).expect("source root invalid"));
    let repository = Arc::new(
        PgGateRepository::connect_with_document_store(&env("ASO_TEST_DATABASE_URL"), store)
            .await
            .expect("restricted source repository connection failed"),
    );
    let services = AppServices {
        cases: repository.clone(),
        evidence: repository.clone(),
        criteria: Arc::new(memory::MemoryCriteriaRepo),
        letters: repository.clone(),
        authority: repository,
        clock: Arc::new(SystemClock),
        sessions: Arc::new(UnavailableSessions),
    };
    let request = DocumentSourceRequest {
        case_id,
        document_id,
        page_number: 2,
    };

    let source = services
        .open_document_source(&context("ASO_TEST_SOURCE_CONTEXT"), request)
        .await
        .expect("authorized source read failed");
    assert_eq!(source.bytes, original);
    assert_eq!(source.page_number, 2);
    assert_eq!(source.effective_date.to_string(), "2026-03-14");

    let observer = PgPoolOptions::new()
        .max_connections(1)
        .connect(&env("ASO_TEST_ADMIN_DATABASE_URL"))
        .await
        .expect("source observer connection failed");
    let audits: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM aso.audit_events
         WHERE action='document.source.read' AND entity_id=$1 AND case_id=$2",
    )
    .bind(document_id)
    .bind(case_id)
    .fetch_one(&observer)
    .await
    .expect("source audit observation failed");
    assert_eq!(
        audits, 1,
        "source body returned without one committed audit"
    );

    assert!(matches!(
        services
            .open_document_source(&context("ASO_TEST_SOURCE_FOREIGN_CONTEXT"), request)
            .await,
        Err(DocumentSourceError::Denied | DocumentSourceError::NotFound)
    ));
    let audits_after_denial: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM aso.audit_events
         WHERE action='document.source.read' AND entity_id=$1 AND case_id=$2",
    )
    .bind(document_id)
    .bind(case_id)
    .fetch_one(&observer)
    .await
    .unwrap();
    assert_eq!(audits_after_denial, 1);

    fs::write(&path, b"%PDF changed after authorization").unwrap();
    assert_eq!(
        services
            .open_document_source(&context("ASO_TEST_SOURCE_CONTEXT"), request)
            .await,
        Err(DocumentSourceError::IntegrityMismatch)
    );
    let audits_after_tamper: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM aso.audit_events
         WHERE action='document.source.read' AND entity_id=$1 AND case_id=$2",
    )
    .bind(document_id)
    .bind(case_id)
    .fetch_one(&observer)
    .await
    .unwrap();
    assert_eq!(audits_after_tamper, 1);
    fs::write(path, original).unwrap();
    observer.close().await;
}
