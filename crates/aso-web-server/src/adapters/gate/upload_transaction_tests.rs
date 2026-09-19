//! Synthetic AppServices-to-store-to-PostgreSQL upload proof.

use super::*;
use crate::adapters::document_store::{DocumentStore, LocalDocumentStore};
use aso_host::{
    AppServices,
    document_upload::{
        DocumentMediaType, DocumentProcessingStatus, DocumentUploadError,
        MAX_DOCUMENT_UPLOAD_BYTES, MAX_DOCUMENT_UPLOAD_PAGES, UploadCaseDocumentCommand,
    },
    ports::SystemClock,
    session::{
        Principal, SessionCredential, SessionError, SessionPort, SessionSummary,
        UnavailableSessions,
    },
    source::{DocumentSourceError, DocumentSourceRequest},
};
use async_trait::async_trait;
use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use chrono::NaiveDate;
use lopdf::{Document, Object, dictionary};
use sqlx::postgres::PgPoolOptions;
use std::{path::PathBuf, sync::Arc};
use tower::ServiceExt;

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("required fixture variable missing: {name}"))
}

fn fixture_id(name: &str) -> Uuid {
    Uuid::parse_str(&env(name)).unwrap_or_else(|_| panic!("invalid fixture UUID: {name}"))
}

fn context() -> ClinicalContext {
    let value: serde_json::Value =
        serde_json::from_str(&env("ASO_TEST_UPLOAD_CONTEXT")).expect("invalid fixture context");
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

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn command(
    command_id: Uuid,
    document_id: Uuid,
    case_id: Uuid,
    bytes: &[u8],
) -> UploadCaseDocumentCommand {
    command_with_media(
        command_id,
        document_id,
        case_id,
        bytes,
        DocumentMediaType::TextPlain,
    )
}

fn command_with_media(
    command_id: Uuid,
    document_id: Uuid,
    case_id: Uuid,
    bytes: &[u8],
    media_type: DocumentMediaType,
) -> UploadCaseDocumentCommand {
    UploadCaseDocumentCommand {
        command_id,
        document_id,
        case_id,
        expected_case_input_revision: 1,
        expected_document_set_revision: 0,
        document_type_key: "policy-document".into(),
        name: "Synthetic upload service document".into(),
        effective_date: NaiveDate::from_ymd_opt(2026, 3, 1).unwrap(),
        media_type,
        content_sha256: sha256_hex(bytes),
        data: None,
    }
}

fn one_page_pdf() -> Vec<u8> {
    let mut document = Document::with_version("1.5");
    let pages_id = document.new_object_id();
    let page_id = document.add_object(dictionary! {
        "Type" => "Page",
        "Parent" => pages_id,
        "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
    });
    document.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => vec![page_id.into()],
            "Count" => 1,
        }),
    );
    let catalog_id = document.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    document.trailer.set("Root", catalog_id);
    let mut bytes = Vec::new();
    document.save_to(&mut bytes).unwrap();
    bytes
}

async fn services(root: &PathBuf) -> (Arc<AppServices>, Arc<LocalDocumentStore>) {
    let store = Arc::new(LocalDocumentStore::new(root).expect("document store unavailable"));
    let repository = Arc::new(
        PgGateRepository::connect_with_document_store(
            &env("ASO_TEST_UPLOAD_DATABASE_URL"),
            store.clone(),
        )
        .await
        .expect("restricted upload repository connection failed"),
    );
    (
        Arc::new(AppServices {
            cases: repository.clone(),
            evidence: repository.clone(),
            criteria: Arc::new(crate::adapters::unavailable::UnavailableCriteriaRepository),
            letters: repository.clone(),
            authority: repository,
            clock: Arc::new(SystemClock),
            sessions: Arc::new(UnavailableSessions),
        }),
        store,
    )
}

fn mark(name: &str) {
    println!("document_upload_transaction_check: {name}");
}

struct UploadSessions;

struct WriteThenFailStore {
    inner: Arc<LocalDocumentStore>,
}

#[async_trait]
impl DocumentStore for WriteThenFailStore {
    async fn read(&self, storage_key: &str) -> Result<Vec<u8>, DocumentSourceError> {
        self.inner.read(storage_key).await
    }

    async fn write_verified(
        &self,
        storage_key: &str,
        bytes: Vec<u8>,
        expected_sha256: [u8; 32],
    ) -> Result<(), DocumentUploadError> {
        self.inner
            .write_verified(storage_key, bytes, expected_sha256)
            .await?;
        Err(DocumentUploadError::Unavailable)
    }

    async fn delete_if_matches(
        &self,
        storage_key: &str,
        expected_sha256: [u8; 32],
    ) -> Result<(), DocumentUploadError> {
        self.inner
            .delete_if_matches(storage_key, expected_sha256)
            .await
    }
}

#[async_trait]
impl SessionPort for UploadSessions {
    async fn resolve(
        &self,
        _: &SessionCredential,
        practice: Option<Uuid>,
    ) -> Result<SessionSummary, SessionError> {
        let actor = context();
        if practice.is_some_and(|practice| practice != actor.practice.0) {
            return Err(SessionError::PracticeDenied);
        }
        Ok(SessionSummary {
            identity_id: actor.identity_id,
            session_id: Uuid::new_v4(),
            user_id: actor.actor.0,
            practice_id: actor.practice.0,
            display_name: "Synthetic Upload Coordinator".into(),
            principal: Principal::User,
            capabilities: vec!["case:read".into(), "document_upload".into()],
            expires_at: actor.expires_at,
            authorization_revision: "synthetic:web04-http".into(),
        })
    }
}

fn multipart_body(upload: &UploadCaseDocumentCommand, bytes: &[u8]) -> (String, Vec<u8>) {
    let boundary = format!("aso-web04-{}", upload.command_id);
    let mut body = Vec::new();
    let fields = [
        ("commandId", upload.command_id.to_string()),
        ("documentId", upload.document_id.to_string()),
        (
            "expectedCaseInputRevision",
            upload.expected_case_input_revision.to_string(),
        ),
        (
            "expectedDocumentSetRevision",
            upload.expected_document_set_revision.to_string(),
        ),
        ("documentTypeKey", upload.document_type_key.clone()),
        ("name", upload.name.clone()),
        ("effectiveDate", upload.effective_date.to_string()),
        ("mediaType", upload.media_type.as_str().into()),
        ("contentSha256", upload.content_sha256.clone()),
    ];
    for (name, value) in fields {
        body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
        body.extend_from_slice(
            format!("Content-Disposition: form-data; name=\"{name}\"\r\n\r\n").as_bytes(),
        );
        body.extend_from_slice(value.as_bytes());
        body.extend_from_slice(b"\r\n");
    }
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
        b"Content-Disposition: form-data; name=\"file\"; filename=\"synthetic.txt\"\r\n",
    );
    body.extend_from_slice(
        format!("Content-Type: {}\r\n\r\n", upload.media_type.as_str()).as_bytes(),
    );
    body.extend_from_slice(bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    (format!("multipart/form-data; boundary={boundary}"), body)
}

fn multipart_request(upload: &UploadCaseDocumentCommand, bytes: &[u8]) -> Request<Body> {
    let (content_type, body) = multipart_body(upload, bytes);
    Request::builder()
        .method("POST")
        .uri(format!("/api/cases/{}/documents", upload.case_id))
        .header("authorization", "Bearer synthetic-web04-http-token")
        .header("content-type", content_type)
        .body(Body::from(body))
        .unwrap()
}

fn get_request(uri: String) -> Request<Body> {
    Request::builder()
        .uri(uri)
        .header("authorization", "Bearer synthetic-web04-http-token")
        .body(Body::empty())
        .unwrap()
}

async fn json_body(response: axum::response::Response) -> serde_json::Value {
    let bytes = to_bytes(response.into_body(), 128 * 1024).await.unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

#[tokio::test]
#[ignore = "requires scripts/test-web04-document-upload-service.py disposable PostgreSQL fixture"]
async fn document_upload_service_lifecycle() {
    let root = PathBuf::from(env("ASO_TEST_UPLOAD_STORE_ROOT"));
    let case_id = fixture_id("ASO_TEST_UPLOAD_CASE_ID");
    let foreign_case_id = fixture_id("ASO_TEST_UPLOAD_FOREIGN_CASE_ID");
    let actor = context();
    let upload_capability = vec!["document_upload".into()];
    let read_capability = vec!["case:read".into()];
    let bytes = b"Synthetic upload page one.".to_vec();
    let upload = command(Uuid::new_v4(), Uuid::new_v4(), case_id, &bytes);

    let (app, store) = services(&root).await;
    let receipt = app
        .upload_case_document(&actor, &upload_capability, &upload, bytes.clone())
        .await
        .expect("document upload failed");
    assert_eq!(receipt.command_id, upload.command_id);
    assert_eq!(receipt.document_id, upload.document_id);
    let metadata = app
        .read_case_document(&actor, &read_capability, case_id, upload.document_id)
        .await
        .expect("document metadata read failed");
    assert_eq!(metadata.processing_status, DocumentProcessingStatus::Queued);
    assert_eq!(metadata.page_count, None);
    assert_eq!(metadata.content_sha256, upload.content_sha256);
    assert_eq!(metadata.byte_size, i64::try_from(bytes.len()).unwrap());
    let storage_key = format!(
        "documents/{}/{}/{}",
        actor.practice.0, upload.document_id, upload.content_sha256
    );
    assert_eq!(store.read(&storage_key).await.unwrap(), bytes);
    mark("durable_bytes_and_queued_metadata_commit");

    drop(app);
    drop(store);
    let (restarted, restarted_store) = services(&root).await;
    assert_eq!(
        restarted
            .upload_case_document(&actor, &upload_capability, &upload, bytes.clone())
            .await
            .expect("restart retry failed"),
        receipt
    );
    assert_eq!(
        restarted
            .lookup_document_upload_command(&actor, &upload_capability, case_id, upload.command_id,)
            .await
            .expect("upload lookup failed"),
        Some(receipt)
    );
    assert_eq!(restarted_store.read(&storage_key).await.unwrap(), bytes);
    mark("restart_retry_and_command_lookup_reconcile");

    let admin = PgPoolOptions::new()
        .max_connections(1)
        .connect(&env("ASO_TEST_ADMIN_DATABASE_URL"))
        .await
        .expect("admin fixture connection failed");
    let pdf_bytes = one_page_pdf();
    let pdf_upload = command_with_media(
        Uuid::new_v4(),
        Uuid::new_v4(),
        case_id,
        &pdf_bytes,
        DocumentMediaType::ApplicationPdf,
    );
    restarted
        .upload_case_document(&actor, &upload_capability, &pdf_upload, pdf_bytes.clone())
        .await
        .expect("PDF upload failed");
    let mut admin_materialization = admin
        .begin()
        .await
        .expect("fixture materialization transaction failed");
    sqlx::query("SET LOCAL search_path = aso, public")
        .execute(&mut *admin_materialization)
        .await
        .expect("fixture materialization search path failed");
    sqlx::query("UPDATE aso.documents SET page_count=1 WHERE id=$1 OR id=$2")
        .bind(upload.document_id)
        .bind(pdf_upload.document_id)
        .execute(&mut *admin_materialization)
        .await
        .expect("fixture page materialization failed");
    admin_materialization
        .commit()
        .await
        .expect("fixture materialization commit failed");
    let source = restarted
        .open_document_source(
            &actor,
            DocumentSourceRequest {
                case_id,
                document_id: upload.document_id,
                page_number: 1,
            },
        )
        .await
        .expect("uploaded text source did not reopen");
    assert_eq!(source.media_type, "text/plain");
    assert_eq!(source.bytes, bytes);
    let pdf_source = restarted
        .open_document_source(
            &actor,
            DocumentSourceRequest {
                case_id,
                document_id: pdf_upload.document_id,
                page_number: 1,
            },
        )
        .await
        .expect("uploaded PDF source did not reopen");
    assert_eq!(pdf_source.media_type, "application/pdf");
    assert_eq!(pdf_source.bytes, pdf_bytes);
    mark("authoritative_media_type_reopens_extensionless_object");

    let failed_bytes = b"Synthetic post-write failure.".to_vec();
    let failed = command(Uuid::new_v4(), Uuid::new_v4(), case_id, &failed_bytes);
    let failed_storage_key = format!(
        "documents/{}/{}/{}",
        actor.practice.0, failed.document_id, failed.content_sha256
    );
    let failing_store = Arc::new(WriteThenFailStore {
        inner: restarted_store.clone(),
    });
    let failing_repository = PgGateRepository::connect_with_document_store(
        &env("ASO_TEST_UPLOAD_DATABASE_URL"),
        failing_store,
    )
    .await
    .expect("failing upload repository connection failed");
    assert_eq!(
        failing_repository
            .upload_case_document(&actor, &failed, failed_bytes.clone())
            .await,
        Err(DocumentUploadError::Unavailable)
    );
    assert!(matches!(
        restarted_store.read(&failed_storage_key).await,
        Err(DocumentSourceError::NotFound)
    ));
    let failed_rows: i64 = sqlx::query_scalar(
        "SELECT (SELECT count(*) FROM aso.document_upload_staging WHERE command_id=$1) + (SELECT count(*) FROM aso.document_upload_commands WHERE command_id=$1) + (SELECT count(*) FROM aso.documents WHERE id=$2)",
    )
    .bind(failed.command_id)
    .bind(failed.document_id)
    .fetch_one(&admin)
    .await
    .expect("post-write cleanup fixture query failed");
    assert_eq!(failed_rows, 0);
    let retry_repository = PgGateRepository::connect_with_document_store(
        &env("ASO_TEST_UPLOAD_DATABASE_URL"),
        restarted_store.clone(),
    )
    .await
    .expect("retry upload repository connection failed");
    retry_repository
        .upload_case_document(&actor, &failed, failed_bytes)
        .await
        .expect("post-write failure retry failed");
    mark("post_write_failure_cleans_object_and_staging_for_retry");

    let expired_bytes = b"Synthetic expired staging object.".to_vec();
    let expired_digest: [u8; 32] = Sha256::digest(&expired_bytes).into();
    let expired_command_id = Uuid::new_v4();
    let expired_document_id = Uuid::new_v4();
    let expired_storage_key = format!(
        "documents/{}/{}/{}",
        actor.practice.0,
        expired_document_id,
        sha256_hex(&expired_bytes)
    );
    restarted_store
        .write_verified(&expired_storage_key, expired_bytes, expired_digest)
        .await
        .expect("expired fixture object write failed");
    sqlx::query(
        "INSERT INTO aso.document_upload_staging (kratos_identity_id,practice_id,command_id,staging_id,actor_id,case_id,document_id,document_type_id,expected_case_input_revision,expected_document_set_revision,name,effective_date,media_type,byte_size,content_sha256,data,storage_key,payload,reserved_at,expires_at) VALUES ($1,$2,$3,$3,$4,$5,$6,(SELECT id FROM aso.document_types WHERE key='policy-document'),1,0,'Synthetic expired upload','2026-03-01','text/plain',$7,$8,NULL,$9,'{}'::jsonb,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour')",
    )
    .bind(actor.identity_id)
    .bind(actor.practice.0)
    .bind(expired_command_id)
    .bind(actor.actor.0)
    .bind(case_id)
    .bind(expired_document_id)
    .bind(i64::try_from(b"Synthetic expired staging object.".len()).unwrap())
    .bind(expired_digest.as_slice())
    .bind(&expired_storage_key)
    .execute(&admin)
    .await
    .expect("expired staging fixture insert failed");
    let _reconciled = PgGateRepository::connect_with_document_store(
        &env("ASO_TEST_UPLOAD_DATABASE_URL"),
        restarted_store.clone(),
    )
    .await
    .expect("startup cleanup reconciliation failed");
    assert!(matches!(
        restarted_store.read(&expired_storage_key).await,
        Err(DocumentSourceError::NotFound)
    ));
    let expired_rows: i64 =
        sqlx::query_scalar("SELECT count(*) FROM aso.document_upload_staging WHERE command_id=$1")
            .bind(expired_command_id)
            .fetch_one(&admin)
            .await
            .expect("expired cleanup fixture query failed");
    assert_eq!(expired_rows, 0);
    mark("startup_reconciles_expired_staging_and_object");

    let mut conflict = upload.clone();
    conflict.name = "Synthetic changed command payload".into();
    assert_eq!(
        restarted
            .upload_case_document(&actor, &upload_capability, &conflict, bytes.clone())
            .await,
        Err(DocumentUploadError::CommandConflict)
    );

    let oversized = vec![b'x'; MAX_DOCUMENT_UPLOAD_BYTES + 1];
    let oversized_command = command(Uuid::new_v4(), Uuid::new_v4(), case_id, &oversized);
    assert_eq!(
        restarted
            .upload_case_document(&actor, &upload_capability, &oversized_command, oversized,)
            .await,
        Err(DocumentUploadError::TooLarge)
    );

    let mut too_many_pages = b"page".to_vec();
    for _ in 0..MAX_DOCUMENT_UPLOAD_PAGES {
        too_many_pages.extend_from_slice(b"\x0cpage");
    }
    let page_command = command(Uuid::new_v4(), Uuid::new_v4(), case_id, &too_many_pages);
    assert_eq!(
        restarted
            .upload_case_document(&actor, &upload_capability, &page_command, too_many_pages,)
            .await,
        Err(DocumentUploadError::TooLarge)
    );

    let disguised_pdf = b"%PDF-not-a-text-document".to_vec();
    let disguised_command = command(Uuid::new_v4(), Uuid::new_v4(), case_id, &disguised_pdf);
    assert_eq!(
        restarted
            .upload_case_document(
                &actor,
                &upload_capability,
                &disguised_command,
                disguised_pdf,
            )
            .await,
        Err(DocumentUploadError::UnsupportedType)
    );

    let declared = b"declared bytes".to_vec();
    let integrity_command = command(Uuid::new_v4(), Uuid::new_v4(), case_id, &declared);
    assert_eq!(
        restarted
            .upload_case_document(
                &actor,
                &upload_capability,
                &integrity_command,
                b"different bytes".to_vec(),
            )
            .await,
        Err(DocumentUploadError::IntegrityMismatch)
    );
    mark("conflict_size_page_type_and_digest_refusals");

    let foreign_bytes = b"Synthetic foreign upload".to_vec();
    let foreign = command(
        Uuid::new_v4(),
        Uuid::new_v4(),
        foreign_case_id,
        &foreign_bytes,
    );
    assert_eq!(
        restarted
            .upload_case_document(&actor, &upload_capability, &foreign, foreign_bytes)
            .await,
        Err(DocumentUploadError::Denied)
    );
    assert_eq!(
        restarted
            .upload_case_document(&actor, &[], &upload, bytes.clone())
            .await,
        Err(DocumentUploadError::Denied)
    );
    let mut expired = context();
    expired.expires_at = Utc::now() - chrono::Duration::seconds(1);
    assert_eq!(
        restarted
            .upload_case_document(&expired, &upload_capability, &upload, bytes)
            .await,
        Err(DocumentUploadError::Unauthenticated)
    );
    mark("tenant_capability_and_session_refusals");
}

#[tokio::test]
#[ignore = "requires scripts/test-web04-document-upload-http.py disposable PostgreSQL fixture"]
async fn document_upload_http_lifecycle() {
    let root = PathBuf::from(env("ASO_TEST_UPLOAD_STORE_ROOT"));
    let case_id = fixture_id("ASO_TEST_UPLOAD_CASE_ID");
    let foreign_case_id = fixture_id("ASO_TEST_UPLOAD_FOREIGN_CASE_ID");
    let actor = context();
    let store = Arc::new(LocalDocumentStore::new(&root).expect("document store unavailable"));
    let repository = Arc::new(
        PgGateRepository::connect_with_document_store(
            &env("ASO_TEST_UPLOAD_DATABASE_URL"),
            store.clone(),
        )
        .await
        .expect("restricted upload repository connection failed"),
    );
    let services = Arc::new(AppServices {
        cases: repository.clone(),
        evidence: repository.clone(),
        criteria: Arc::new(crate::adapters::unavailable::UnavailableCriteriaRepository),
        letters: repository.clone(),
        authority: repository,
        clock: Arc::new(SystemClock),
        sessions: Arc::new(UploadSessions),
    });
    let app = aso_server_axum::api_router(aso_server_axum::ServerState { services });
    let bytes = b"Synthetic upload page one.".to_vec();
    let upload = command(Uuid::new_v4(), Uuid::new_v4(), case_id, &bytes);

    let uploaded = app
        .clone()
        .oneshot(multipart_request(&upload, &bytes))
        .await
        .unwrap();
    assert_eq!(uploaded.status(), StatusCode::OK);
    let receipt = json_body(uploaded).await;
    assert_eq!(receipt["commandId"], upload.command_id.to_string());
    assert_eq!(receipt["documentId"], upload.document_id.to_string());
    assert!(!receipt.to_string().contains("Synthetic upload page one"));

    let metadata = app
        .clone()
        .oneshot(get_request(format!(
            "/api/cases/{case_id}/documents/{}",
            upload.document_id
        )))
        .await
        .unwrap();
    assert_eq!(metadata.status(), StatusCode::OK);
    let metadata = json_body(metadata).await;
    assert_eq!(metadata["processingStatus"], "queued");
    assert!(metadata.get("storageKey").is_none());

    let lookup = app
        .clone()
        .oneshot(get_request(format!(
            "/api/cases/{case_id}/document-commands/{}",
            upload.command_id
        )))
        .await
        .unwrap();
    assert_eq!(lookup.status(), StatusCode::OK);
    assert_eq!(json_body(lookup).await, receipt);

    let policy = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/internal/gate/authorize")
                .header("authorization", "Bearer synthetic-web04-http-token")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "method": "POST",
                        "uri": format!("/api/cases/{case_id}/documents"),
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(policy.status(), StatusCode::NO_CONTENT);
    mark("mounted_http_upload_read_lookup_and_gate");

    let exact_retry = app
        .clone()
        .oneshot(multipart_request(&upload, &bytes))
        .await
        .unwrap();
    assert_eq!(exact_retry.status(), StatusCode::OK);
    assert_eq!(json_body(exact_retry).await, receipt);

    let mut conflict = upload.clone();
    conflict.name = "Synthetic changed HTTP upload".into();
    let conflict = app
        .clone()
        .oneshot(multipart_request(&conflict, &bytes))
        .await
        .unwrap();
    assert_eq!(conflict.status(), StatusCode::CONFLICT);
    assert_eq!(json_body(conflict).await["error"], "command_conflict");

    let tampered = command(Uuid::new_v4(), Uuid::new_v4(), case_id, b"declared");
    let tampered = app
        .clone()
        .oneshot(multipart_request(&tampered, b"different"))
        .await
        .unwrap();
    assert_eq!(tampered.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        json_body(tampered).await["error"],
        "document_integrity_failed"
    );
    mark("mounted_http_retry_conflict_and_integrity_refusal");

    let foreign_bytes = b"Synthetic foreign HTTP upload".to_vec();
    let foreign = command(
        Uuid::new_v4(),
        Uuid::new_v4(),
        foreign_case_id,
        &foreign_bytes,
    );
    let foreign = app
        .clone()
        .oneshot(multipart_request(&foreign, &foreign_bytes))
        .await
        .unwrap();
    assert_eq!(foreign.status(), StatusCode::FORBIDDEN);
    assert_eq!(json_body(foreign).await["error"], "action_forbidden");

    let anonymous = {
        let (content_type, body) = multipart_body(&upload, &bytes);
        app.oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/cases/{case_id}/documents"))
                .header("content-type", content_type)
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap()
    };
    assert_eq!(anonymous.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(json_body(anonymous).await["error"], "session_required");
    mark("mounted_http_anonymous_and_foreign_tenant_refusal");

    let storage_key = format!(
        "documents/{}/{}/{}",
        actor.practice.0, upload.document_id, upload.content_sha256
    );
    assert_eq!(store.read(&storage_key).await.unwrap(), bytes);
}
