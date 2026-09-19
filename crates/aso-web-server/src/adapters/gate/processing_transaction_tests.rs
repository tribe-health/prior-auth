//! Synthetic service-principal document processing integration proof.

use super::*;
use crate::adapters::{
    document_store::LocalDocumentStore, unavailable::UnavailableCriteriaRepository,
};
use aso_host::{
    AppServices,
    document_processing::{
        AUTHORIZED_DOCUMENT_JOB_GRANT, DocumentProcessingError, ProcessCaseDocumentCommand,
    },
    document_upload::{DocumentMediaType, DocumentProcessingStatus, UploadCaseDocumentCommand},
    ports::SystemClock,
    session::{Principal, UnavailableSessions},
};
use chrono::NaiveDate;
use sqlx::postgres::PgPoolOptions;
use std::{path::PathBuf, sync::Arc};

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("required fixture variable missing: {name}"))
}

fn fixture_id(name: &str) -> Uuid {
    Uuid::parse_str(&env(name)).unwrap_or_else(|_| panic!("invalid fixture UUID: {name}"))
}

fn context(name: &str, principal: Principal) -> ClinicalContext {
    let value: serde_json::Value =
        serde_json::from_str(&env(name)).expect("invalid fixture context");
    let id = |key| {
        Uuid::parse_str(value[key].as_str().expect("fixture UUID missing"))
            .expect("fixture UUID invalid")
    };
    ClinicalContext {
        identity_id: id("identity_id"),
        actor: ActorId(id("actor_id")),
        practice: PracticeId(id("practice_id")),
        principal,
        expires_at: Utc::now() + chrono::Duration::hours(1),
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

async fn services(root: &PathBuf) -> Arc<AppServices> {
    let store = Arc::new(LocalDocumentStore::new(root).expect("document store unavailable"));
    let repository = Arc::new(
        PgGateRepository::connect_with_document_store(
            &env("ASO_TEST_PROCESSING_DATABASE_URL"),
            store,
        )
        .await
        .expect("restricted processing repository connection failed"),
    );
    Arc::new(AppServices {
        cases: repository.clone(),
        evidence: repository.clone(),
        criteria: Arc::new(UnavailableCriteriaRepository),
        letters: repository.clone(),
        authority: repository,
        clock: Arc::new(SystemClock),
        sessions: Arc::new(UnavailableSessions),
    })
}

fn upload_command(
    command_id: Uuid,
    document_id: Uuid,
    case_id: Uuid,
    expected_document_set_revision: i64,
    bytes: &[u8],
) -> UploadCaseDocumentCommand {
    UploadCaseDocumentCommand {
        command_id,
        document_id,
        case_id,
        expected_case_input_revision: 1,
        expected_document_set_revision,
        document_type_key: "policy-document".into(),
        name: "Synthetic processing source".into(),
        effective_date: NaiveDate::from_ymd_opt(2026, 3, 1).unwrap(),
        media_type: DocumentMediaType::TextPlain,
        content_sha256: sha256_hex(bytes),
        data: None,
    }
}

fn processing_command(
    command_id: Uuid,
    document_id: Uuid,
    case_id: Uuid,
    expected_document_set_revision: i64,
) -> ProcessCaseDocumentCommand {
    ProcessCaseDocumentCommand {
        command_id,
        case_id,
        document_id,
        expected_document_set_revision,
    }
}

fn mark(name: &str) {
    println!("document_processing_transaction_check: {name}");
}

#[tokio::test]
#[ignore = "requires the disposable Web-05 PostgreSQL and document-store fixture"]
async fn document_processing_service_lifecycle() {
    let case_id = fixture_id("ASO_TEST_PROCESSING_CASE_ID");
    let root = PathBuf::from(env("ASO_TEST_PROCESSING_STORE_ROOT"));
    let app = services(&root).await;
    let human = context("ASO_TEST_UPLOAD_CONTEXT", Principal::User);
    let processor = context("ASO_TEST_PROCESSOR_CONTEXT", Principal::Service);
    let upload_grants = vec!["document_upload".into(), "case:read".into()];
    let processor_grants = vec![AUTHORIZED_DOCUMENT_JOB_GRANT.into()];

    let source = b" Synthetic page one\r\n\x0cSynthetic page two\r".to_vec();
    let document_id = Uuid::new_v4();
    let admin = PgPoolOptions::new()
        .max_connections(1)
        .connect(&env("ASO_TEST_ADMIN_DATABASE_URL"))
        .await
        .unwrap();
    app.upload_case_document(
        &human,
        &upload_grants,
        &upload_command(Uuid::new_v4(), document_id, case_id, 0, &source),
        source,
    )
    .await
    .expect("synthetic source upload failed");

    let command = processing_command(Uuid::new_v4(), document_id, case_id, 0);
    let processing = app
        .process_case_document(&processor, &processor_grants, &command)
        .await;
    let result = match processing {
        Ok(result) => result,
        Err(error) => {
            let state: Option<(String, Option<String>, Option<String>)> = sqlx::query_as(
                "SELECT d.processing_status, pc.state, d.processing_error_code
                   FROM aso.documents d
                   LEFT JOIN aso.document_processing_commands pc
                     ON pc.document_id=d.id AND pc.command_id=$2
                  WHERE d.id=$1",
            )
            .bind(document_id)
            .bind(command.command_id)
            .fetch_optional(&admin)
            .await
            .unwrap();
            panic!("synthetic document processing failed: {error:?}; state={state:?}");
        }
    };
    assert_eq!(result.status, DocumentProcessingStatus::Ready);
    assert_eq!(result.page_count, Some(2));
    assert_eq!(result.document_set_revision, 1);
    let looked_up = app
        .lookup_document_process_command(
            &processor,
            &processor_grants,
            case_id,
            document_id,
            command.command_id,
        )
        .await
        .unwrap();
    assert_eq!(looked_up.as_ref(), Some(&result));
    assert_eq!(
        app.process_case_document(&processor, &processor_grants, &command)
            .await
            .unwrap(),
        result
    );
    mark("queued_processing_ready_and_exact_retry");

    let pages: Vec<(i32, String, String)> = sqlx::query_as(
        "SELECT page_number, text, encode(text_sha256,'hex')
           FROM aso.document_pages WHERE document_id=$1 ORDER BY page_number",
    )
    .bind(document_id)
    .fetch_all(&admin)
    .await
    .unwrap();
    assert_eq!(
        pages,
        vec![
            (
                1,
                "Synthetic page one".into(),
                sha256_hex(b"Synthetic page one"),
            ),
            (
                2,
                "Synthetic page two".into(),
                sha256_hex(b"Synthetic page two"),
            ),
        ]
    );
    let state: (String, i32, i64, i64) = sqlx::query_as(
        "SELECT d.processing_status, d.page_count, c.document_set_revision,
                (SELECT count(*) FROM aso.document_processing_commands pc
                  WHERE pc.command_id=$2)
           FROM aso.documents d JOIN aso.cases c ON c.id=d.case_id
          WHERE d.id=$1",
    )
    .bind(document_id)
    .bind(command.command_id)
    .fetch_one(&admin)
    .await
    .unwrap();
    assert_eq!(state, ("ready".into(), 2, 1, 1));
    mark("deterministic_page_text_hashes_and_single_receipt");

    let conflicting = ProcessCaseDocumentCommand {
        document_id: Uuid::new_v4(),
        ..command.clone()
    };
    assert_eq!(
        app.process_case_document(&processor, &processor_grants, &conflicting)
            .await,
        Err(DocumentProcessingError::CommandConflict)
    );
    assert_eq!(
        app.process_case_document(&human, &processor_grants, &command)
            .await,
        Err(DocumentProcessingError::Denied)
    );
    assert_eq!(
        app.process_case_document(&processor, &[], &command).await,
        Err(DocumentProcessingError::Denied)
    );
    mark("command_conflict_human_and_missing_job_grant_refusal");

    let failed_document = Uuid::new_v4();
    let failed_source = b"Synthetic valid page\x0c   ".to_vec();
    app.upload_case_document(
        &human,
        &upload_grants,
        &upload_command(Uuid::new_v4(), failed_document, case_id, 1, &failed_source),
        failed_source,
    )
    .await
    .expect("synthetic failure source upload failed");
    let failed_command = processing_command(Uuid::new_v4(), failed_document, case_id, 1);
    assert_eq!(
        app.process_case_document(&processor, &processor_grants, &failed_command)
            .await,
        Err(DocumentProcessingError::ProcessingFailed)
    );
    let failed_result = app
        .lookup_document_process_command(
            &processor,
            &processor_grants,
            case_id,
            failed_document,
            failed_command.command_id,
        )
        .await
        .unwrap()
        .unwrap();
    assert_eq!(failed_result.status, DocumentProcessingStatus::Failed);
    assert_eq!(failed_result.document_set_revision, 1);
    assert_eq!(
        app.process_case_document(&processor, &processor_grants, &failed_command)
            .await,
        Err(DocumentProcessingError::ProcessingFailed)
    );
    let failed_state: (String, Option<String>, i64, i64) = sqlx::query_as(
        "SELECT d.processing_status, d.processing_error_code,
                c.document_set_revision,
                (SELECT count(*) FROM aso.document_pages p WHERE p.document_id=d.id)
           FROM aso.documents d JOIN aso.cases c ON c.id=d.case_id
          WHERE d.id=$1",
    )
    .bind(failed_document)
    .fetch_one(&admin)
    .await
    .unwrap();
    assert_eq!(
        failed_state,
        ("failed".into(), Some("empty_page_text".into()), 1, 0)
    );
    mark("processing_failure_is_bounded_idempotent_and_does_not_advance_set");
    admin.close().await;
}
