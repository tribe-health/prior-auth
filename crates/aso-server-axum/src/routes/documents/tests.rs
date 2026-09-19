use super::*;
use aso_host::{
    AppServices,
    affirmation::ClinicalContext,
    document_upload::{DocumentProcessingStatus, DocumentUploadAction},
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
use sha2::{Digest, Sha256};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicUsize, Ordering},
};
use tower::ServiceExt;

fn id(value: u128) -> Uuid {
    Uuid::from_u128(value)
}

fn now() -> DateTime<Utc> {
    "2026-09-18T12:00:00Z".parse().unwrap()
}

struct FixedClock;

impl Clock for FixedClock {
    fn now(&self) -> DateTime<Utc> {
        now()
    }
}

struct Sessions {
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
            principal: Principal::User,
            capabilities: self.capabilities.lock().unwrap().clone(),
            expires_at: now() + Duration::hours(1),
            authorization_revision: "synthetic:document-http".into(),
        })
    }
}

#[derive(Default)]
struct DocumentState {
    command: Option<UploadCaseDocumentCommand>,
    bytes: Vec<u8>,
    receipt: Option<DocumentUploadResult>,
}

#[derive(Default)]
struct Documents {
    state: Mutex<DocumentState>,
    next_error: Mutex<Option<DocumentUploadError>>,
    authorizations: AtomicUsize,
    writes: AtomicUsize,
}

impl Documents {
    fn fail(&self) -> Result<(), DocumentUploadError> {
        match self.next_error.lock().unwrap().take() {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }

    fn metadata(command: &UploadCaseDocumentCommand, byte_size: usize) -> DocumentMetadata {
        DocumentMetadata {
            id: command.document_id,
            case_id: command.case_id,
            document_type_id: id(30),
            name: command.name.clone(),
            effective_date: command.effective_date,
            content_sha256: command.content_sha256.clone(),
            media_type: command.media_type,
            byte_size: i64::try_from(byte_size).unwrap(),
            page_count: None,
            processing_status: DocumentProcessingStatus::Queued,
            processing_error_code: None,
            document_version: 1,
            revision: 1,
            committed_at: now(),
        }
    }
}

#[async_trait]
impl EvidenceRepository for Documents {
    async fn authorize_document_upload_target(
        &self,
        _: &ClinicalContext,
        case_id: Uuid,
    ) -> Result<(), DocumentUploadError> {
        self.fail()?;
        self.authorizations.fetch_add(1, Ordering::SeqCst);
        if case_id == id(21) {
            Ok(())
        } else {
            Err(DocumentUploadError::Denied)
        }
    }

    async fn upload_case_document(
        &self,
        _: &ClinicalContext,
        command: &UploadCaseDocumentCommand,
        bytes: Vec<u8>,
    ) -> Result<DocumentUploadResult, DocumentUploadError> {
        self.fail()?;
        if command.case_id != id(21) {
            return Err(DocumentUploadError::Denied);
        }
        let mut state = self.state.lock().unwrap();
        if let Some(receipt) = &state.receipt {
            if state.command.as_ref() == Some(command) && state.bytes == bytes {
                return Ok(receipt.clone());
            }
            return Err(DocumentUploadError::CommandConflict);
        }
        let receipt = DocumentUploadResult {
            command_id: command.command_id,
            action: DocumentUploadAction::Upload,
            case_id: command.case_id,
            document_id: command.document_id,
            committed_at: now(),
        };
        state.command = Some(command.clone());
        state.bytes = bytes;
        state.receipt = Some(receipt.clone());
        self.writes.fetch_add(1, Ordering::SeqCst);
        Ok(receipt)
    }

    async fn read_case_document(
        &self,
        _: &ClinicalContext,
        case_id: Uuid,
        document_id: Uuid,
    ) -> Result<DocumentMetadata, DocumentUploadError> {
        self.fail()?;
        let state = self.state.lock().unwrap();
        let command = state
            .command
            .as_ref()
            .filter(|command| command.case_id == case_id && command.document_id == document_id)
            .ok_or(DocumentUploadError::NotFound)?;
        Ok(Self::metadata(command, state.bytes.len()))
    }

    async fn lookup_document_upload_command(
        &self,
        _: &ClinicalContext,
        case_id: Uuid,
        command_id: Uuid,
    ) -> Result<Option<DocumentUploadResult>, DocumentUploadError> {
        self.fail()?;
        Ok(self
            .state
            .lock()
            .unwrap()
            .receipt
            .clone()
            .filter(|receipt| receipt.case_id == case_id && receipt.command_id == command_id))
    }

    async fn counts(&self, _: CaseId) -> Result<EvidenceCounts, DomainError> {
        Err(DomainError::NotFound)
    }
}

struct Unused;

#[async_trait]
impl CaseRepository for Unused {
    async fn gate_state(&self, _: CaseId) -> Result<GateState, DomainError> {
        Err(DomainError::NotFound)
    }

    async fn record_affirmation(
        &self,
        _: CaseId,
        _: GateAffirmationKind,
        _: ActorId,
        _: DateTime<Utc>,
    ) -> Result<GateState, DomainError> {
        Err(DomainError::NotFound)
    }
}

#[async_trait]
impl CriteriaRepository for Unused {
    async fn get(&self, _: CriterionId) -> Result<Criterion, DomainError> {
        Err(DomainError::NotFound)
    }

    async fn live_for_payer(&self, _: &str) -> Result<Vec<Criterion>, DomainError> {
        Err(DomainError::NotFound)
    }
}

#[async_trait]
impl LetterRepository for Unused {
    async fn get(&self, _: LetterId) -> Result<Letter, DomainError> {
        Err(DomainError::NotFound)
    }

    async fn unresolved_non_policy_retrievals(
        &self,
        _: LetterId,
    ) -> Result<Vec<CriterionId>, DomainError> {
        Err(DomainError::NotFound)
    }

    async fn sign(&self, _: LetterId, _: ActorId, _: DateTime<Utc>) -> Result<Letter, DomainError> {
        Err(DomainError::NotFound)
    }
}

#[async_trait]
impl AuthorityPort for Unused {
    async fn holds(&self, _: ActorId, _: Capability) -> Result<bool, DomainError> {
        Ok(false)
    }
}

struct Fixture {
    app: Router,
    documents: Arc<Documents>,
    sessions: Arc<Sessions>,
}

impl Fixture {
    fn new() -> Self {
        let documents = Arc::new(Documents::default());
        let sessions = Arc::new(Sessions {
            capabilities: Mutex::new(vec!["case:read".into(), "document_upload".into()]),
        });
        let unused = Arc::new(Unused);
        let services = Arc::new(AppServices {
            cases: unused.clone(),
            evidence: documents.clone(),
            criteria: unused.clone(),
            letters: unused.clone(),
            authority: unused,
            clock: Arc::new(FixedClock),
            sessions: sessions.clone(),
        });
        Self {
            app: crate::api_router(ServerState { services }),
            documents,
            sessions,
        }
    }

    async fn request(&self, request: Request<Body>) -> Response {
        self.app.clone().oneshot(request).await.unwrap()
    }
}

fn digest(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn multipart_body(bytes: &[u8], media_type: &str) -> (String, Vec<u8>) {
    multipart_body_with_file_type(bytes, media_type, media_type)
}

fn multipart_body_with_file_type(
    bytes: &[u8],
    declared_media_type: &str,
    file_media_type: &str,
) -> (String, Vec<u8>) {
    let boundary = "aso-synthetic-document-boundary";
    let mut body = Vec::new();
    let fields = [
        ("commandId", id(40).to_string()),
        ("documentId", id(41).to_string()),
        ("expectedCaseInputRevision", "1".into()),
        ("expectedDocumentSetRevision", "0".into()),
        ("documentTypeKey", "policy-document".into()),
        ("name", "Synthetic policy upload".into()),
        ("effectiveDate", "2026-03-01".into()),
        ("mediaType", declared_media_type.into()),
        ("contentSha256", digest(bytes)),
        ("data", "{}".into()),
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
    body.extend_from_slice(format!("Content-Type: {file_media_type}\r\n\r\n").as_bytes());
    body.extend_from_slice(bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    (format!("multipart/form-data; boundary={boundary}"), body)
}

fn upload_request(uri: &str, bytes: &[u8], media_type: &str) -> Request<Body> {
    let (content_type, body) = multipart_body(bytes, media_type);
    Request::builder()
        .method("POST")
        .uri(uri)
        .header("authorization", "Bearer synthetic-document-token")
        .header("content-type", content_type)
        .body(Body::from(body))
        .unwrap()
}

fn get_request(uri: &str) -> Request<Body> {
    Request::builder()
        .uri(uri)
        .header("authorization", "Bearer synthetic-document-token")
        .body(Body::empty())
        .unwrap()
}

fn policy_request(method: &str, uri: &str) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri("/internal/gate/authorize")
        .header("authorization", "Bearer synthetic-document-token")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({"method": method, "uri": uri}).to_string(),
        ))
        .unwrap()
}

async fn response_body(response: Response) -> Value {
    let bytes = to_bytes(response.into_body(), 128 * 1024).await.unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

#[tokio::test]
async fn multipart_upload_reads_metadata_and_reconciles_receipt() {
    let fixture = Fixture::new();
    let source = b"Synthetic policy source page one.";
    let upload = fixture
        .request(upload_request(
            &format!("/api/cases/{}/documents", id(21)),
            source,
            "text/plain",
        ))
        .await;
    assert_eq!(upload.status(), StatusCode::OK);
    assert_eq!(upload.headers()[header::CACHE_CONTROL], "no-store");
    let receipt = response_body(upload).await;
    assert_eq!(receipt["commandId"], id(40).to_string());
    assert_eq!(receipt["documentId"], id(41).to_string());
    assert!(!receipt.to_string().contains("Synthetic policy source"));

    let metadata = fixture
        .request(get_request(&format!(
            "/api/cases/{}/documents/{}",
            id(21),
            id(41)
        )))
        .await;
    assert_eq!(metadata.status(), StatusCode::OK);
    let metadata = response_body(metadata).await;
    assert_eq!(metadata["processingStatus"], "queued");
    assert_eq!(metadata["byteSize"], source.len());
    assert!(metadata.get("storageKey").is_none());

    let lookup = fixture
        .request(get_request(&format!(
            "/api/cases/{}/document-commands/{}",
            id(21),
            id(40)
        )))
        .await;
    assert_eq!(lookup.status(), StatusCode::OK);
    assert_eq!(response_body(lookup).await, receipt);
    assert_eq!(fixture.documents.writes.load(Ordering::SeqCst), 1);
    let state = fixture.documents.state.lock().unwrap();
    assert_eq!(state.bytes, source);
    assert_eq!(state.command.as_ref().unwrap().case_id, id(21));
}

#[tokio::test]
async fn upload_refuses_anonymous_missing_capability_and_foreign_practice() {
    let fixture = Fixture::new();
    let source = b"Synthetic bounded upload";
    let anonymous = {
        let (content_type, body) = multipart_body(source, "text/plain");
        fixture
            .request(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/cases/{}/documents", id(21)))
                    .header("content-type", content_type)
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
    };
    assert_eq!(anonymous.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(response_body(anonymous).await["error"], "session_required");

    fixture.sessions.capabilities.lock().unwrap().clear();
    let missing = fixture
        .request(upload_request(
            &format!("/api/cases/{}/documents", id(21)),
            source,
            "text/plain",
        ))
        .await;
    assert_eq!(missing.status(), StatusCode::FORBIDDEN);
    assert_eq!(response_body(missing).await["error"], "action_forbidden");

    *fixture.sessions.capabilities.lock().unwrap() = vec!["document_upload".into()];
    let foreign = fixture
        .request(upload_request(
            &format!("/api/cases/{}/documents?practiceId={}", id(21), id(99)),
            source,
            "text/plain",
        ))
        .await;
    assert_eq!(foreign.status(), StatusCode::FORBIDDEN);
    assert_eq!(response_body(foreign).await["error"], "action_forbidden");
    assert_eq!(fixture.documents.writes.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn multipart_and_service_failures_use_frozen_error_codes() {
    let fixture = Fixture::new();
    let malformed = fixture
        .request(
            Request::builder()
                .method("POST")
                .uri(format!("/api/cases/{}/documents", id(21)))
                .header("authorization", "Bearer synthetic-document-token")
                .header("content-type", "application/json")
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await;
    assert_eq!(malformed.status(), StatusCode::BAD_REQUEST);
    assert_eq!(response_body(malformed).await["error"], "invalid_request");

    let mismatch = {
        let (content_type, body) =
            multipart_body_with_file_type(b"Synthetic plain text", "text/plain", "application/pdf");
        fixture
            .request(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/cases/{}/documents", id(21)))
                    .header("authorization", "Bearer synthetic-document-token")
                    .header("content-type", content_type)
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
    };
    assert_eq!(mismatch.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);
    assert_eq!(
        response_body(mismatch).await["error"],
        "document_type_unsupported"
    );

    for (source, status, code) in [
        (
            DocumentUploadError::RevisionConflict,
            StatusCode::CONFLICT,
            "stale_revision",
        ),
        (
            DocumentUploadError::CommandConflict,
            StatusCode::CONFLICT,
            "command_conflict",
        ),
        (
            DocumentUploadError::TooLarge,
            StatusCode::PAYLOAD_TOO_LARGE,
            "document_too_large",
        ),
        (
            DocumentUploadError::UnsupportedType,
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "document_type_unsupported",
        ),
        (
            DocumentUploadError::IntegrityMismatch,
            StatusCode::UNPROCESSABLE_ENTITY,
            "document_integrity_failed",
        ),
        (
            DocumentUploadError::Unavailable,
            StatusCode::SERVICE_UNAVAILABLE,
            "service_unavailable",
        ),
    ] {
        *fixture.documents.next_error.lock().unwrap() = Some(source);
        let response = fixture
            .request(upload_request(
                &format!("/api/cases/{}/documents", id(21)),
                b"Synthetic typed refusal",
                "text/plain",
            ))
            .await;
        assert_eq!(response.status(), status);
        assert_eq!(response_body(response).await["error"], code);
    }
}

#[tokio::test]
async fn route_specific_body_limit_maps_to_document_too_large() {
    let fixture = Fixture::new();
    let request = Request::builder()
        .method("POST")
        .uri(format!("/api/cases/{}/documents", id(21)))
        .header("authorization", "Bearer synthetic-document-token")
        .header(
            "content-type",
            "multipart/form-data; boundary=aso-oversized-boundary",
        )
        .body(Body::from(vec![b'x'; MAX_DOCUMENT_MULTIPART_BYTES + 1]))
        .unwrap();
    let response = fixture.request(request).await;
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    assert_eq!(response_body(response).await["error"], "document_too_large");
    assert_eq!(fixture.documents.writes.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn independent_gate_policy_authorizes_document_targets_without_mutating() {
    let fixture = Fixture::new();
    for (method, uri) in [
        ("POST", format!("/api/cases/{}/documents", id(21))),
        (
            "GET",
            format!("/api/cases/{}/document-commands/{}", id(21), id(40)),
        ),
    ] {
        let response = fixture.request(policy_request(method, &uri)).await;
        assert_eq!(response.status(), StatusCode::NO_CONTENT, "{method} {uri}");
    }
    assert_eq!(fixture.documents.authorizations.load(Ordering::SeqCst), 2);
    assert_eq!(fixture.documents.writes.load(Ordering::SeqCst), 0);

    fixture.sessions.capabilities.lock().unwrap().clear();
    let missing = fixture
        .request(policy_request(
            "POST",
            &format!("/api/cases/{}/documents", id(21)),
        ))
        .await;
    assert_eq!(missing.status(), StatusCode::FORBIDDEN);
    assert_eq!(response_body(missing).await["error"], "action_forbidden");

    *fixture.sessions.capabilities.lock().unwrap() = vec!["document_upload".into()];
    let foreign = fixture
        .request(policy_request(
            "POST",
            &format!("/api/cases/{}/documents", id(99)),
        ))
        .await;
    assert_eq!(foreign.status(), StatusCode::FORBIDDEN);
    assert_eq!(response_body(foreign).await["error"], "action_forbidden");
    assert_eq!(fixture.documents.writes.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn every_document_error_has_the_frozen_http_mapping() {
    for (source, status, code) in [
        (
            DocumentUploadError::Unauthenticated,
            StatusCode::UNAUTHORIZED,
            "session_required",
        ),
        (
            DocumentUploadError::Denied,
            StatusCode::FORBIDDEN,
            "action_forbidden",
        ),
        (
            DocumentUploadError::NotFound,
            StatusCode::NOT_FOUND,
            "resource_not_found",
        ),
        (
            DocumentUploadError::RevisionConflict,
            StatusCode::CONFLICT,
            "stale_revision",
        ),
        (
            DocumentUploadError::CommandConflict,
            StatusCode::CONFLICT,
            "command_conflict",
        ),
        (
            DocumentUploadError::TooLarge,
            StatusCode::PAYLOAD_TOO_LARGE,
            "document_too_large",
        ),
        (
            DocumentUploadError::UnsupportedType,
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "document_type_unsupported",
        ),
        (
            DocumentUploadError::IntegrityMismatch,
            StatusCode::UNPROCESSABLE_ENTITY,
            "document_integrity_failed",
        ),
        (
            DocumentUploadError::Invalid,
            StatusCode::BAD_REQUEST,
            "invalid_request",
        ),
        (
            DocumentUploadError::Unavailable,
            StatusCode::SERVICE_UNAVAILABLE,
            "service_unavailable",
        ),
    ] {
        let response = document_error(source);
        assert_eq!(response.status(), status);
        assert_eq!(response_body(response).await["error"], code);
    }
}
