//! Browser HTTP contract for bounded case-document ingestion.

use aso_host::{
    document_processing::{
        AUTHORIZED_DOCUMENT_JOB_GRANT, DocumentProcessingError, DocumentProcessingResult,
        ProcessCaseDocumentCommand,
    },
    document_upload::{
        DocumentMediaType, DocumentMetadata, DocumentUploadError, DocumentUploadResult,
        MAX_DOCUMENT_UPLOAD_BYTES, UploadCaseDocumentCommand,
    },
    session::SessionError,
};
use axum::{
    Json, Router,
    extract::{
        DefaultBodyLimit, Multipart, Path, Query, Request, State,
        multipart::{MultipartError, MultipartRejection},
        rejection::{PathRejection, QueryRejection},
    },
    http::{HeaderMap, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use chrono::NaiveDate;
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    ServerState,
    session::{ClinicalContextError, clinical_context, service_context},
};

const MAX_DOCUMENT_MULTIPART_OVERHEAD_BYTES: usize = 64 * 1024;
const MAX_DOCUMENT_MULTIPART_BYTES: usize =
    MAX_DOCUMENT_UPLOAD_BYTES + MAX_DOCUMENT_MULTIPART_OVERHEAD_BYTES;
const MAX_METADATA_FIELD_BYTES: usize = 32 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DocumentQuery {
    practice_id: Option<Uuid>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProcessDocumentBody {
    command_id: Uuid,
    expected_document_set_revision: i64,
}

#[derive(Default)]
struct UploadFields {
    command_id: Option<String>,
    document_id: Option<String>,
    expected_case_input_revision: Option<String>,
    expected_document_set_revision: Option<String>,
    document_type_key: Option<String>,
    name: Option<String>,
    effective_date: Option<String>,
    media_type: Option<String>,
    content_sha256: Option<String>,
    data: Option<String>,
    file: Option<(Option<String>, Vec<u8>)>,
}

pub fn router() -> Router<ServerState> {
    Router::new()
        .route(
            "/api/cases/{case_id}/documents",
            post(upload).layer(DefaultBodyLimit::max(MAX_DOCUMENT_MULTIPART_BYTES)),
        )
        .route("/api/cases/{case_id}/documents/{document_id}", get(read))
        .route(
            "/api/cases/{case_id}/documents/{document_id}/process",
            post(process),
        )
        .route(
            "/api/cases/{case_id}/documents/{document_id}/commands/{command_id}",
            get(lookup_processing),
        )
        .route(
            "/api/cases/{case_id}/document-commands/{command_id}",
            get(lookup),
        )
        .layer(middleware::from_fn(no_store))
}

async fn no_store(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    response.headers_mut().insert(
        header::VARY,
        "Cookie, Authorization, X-Session-Token".parse().unwrap(),
    );
    response
}

fn error(status: StatusCode, code: &str) -> Response {
    (status, Json(json!({"error": code}))).into_response()
}

fn invalid() -> Response {
    error(StatusCode::BAD_REQUEST, "invalid_request")
}

fn require_capability(capabilities: &[String], required: &str) -> Result<(), Response> {
    capabilities
        .iter()
        .any(|capability| capability == required)
        .then_some(())
        .ok_or_else(|| document_error(DocumentUploadError::Denied))
}

pub(crate) fn document_error(value: DocumentUploadError) -> Response {
    let (status, code) = match value {
        DocumentUploadError::Unauthenticated => (StatusCode::UNAUTHORIZED, "session_required"),
        DocumentUploadError::Denied => (StatusCode::FORBIDDEN, "action_forbidden"),
        DocumentUploadError::NotFound => (StatusCode::NOT_FOUND, "resource_not_found"),
        DocumentUploadError::RevisionConflict => (StatusCode::CONFLICT, "stale_revision"),
        DocumentUploadError::CommandConflict => (StatusCode::CONFLICT, "command_conflict"),
        DocumentUploadError::TooLarge => (StatusCode::PAYLOAD_TOO_LARGE, "document_too_large"),
        DocumentUploadError::UnsupportedType => (
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "document_type_unsupported",
        ),
        DocumentUploadError::IntegrityMismatch => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "document_integrity_failed",
        ),
        DocumentUploadError::Invalid => (StatusCode::BAD_REQUEST, "invalid_request"),
        DocumentUploadError::Unavailable => {
            (StatusCode::SERVICE_UNAVAILABLE, "service_unavailable")
        }
    };
    error(status, code)
}

pub(crate) fn document_processing_error(value: DocumentProcessingError) -> Response {
    let (status, code) = match value {
        DocumentProcessingError::Unauthenticated => (StatusCode::UNAUTHORIZED, "session_required"),
        DocumentProcessingError::Denied => (StatusCode::FORBIDDEN, "action_forbidden"),
        DocumentProcessingError::NotFound => (StatusCode::NOT_FOUND, "resource_not_found"),
        DocumentProcessingError::RevisionConflict => (StatusCode::CONFLICT, "stale_revision"),
        DocumentProcessingError::CommandConflict => (StatusCode::CONFLICT, "command_conflict"),
        DocumentProcessingError::ProcessingFailed => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "document_processing_failed",
        ),
        DocumentProcessingError::Invalid => (StatusCode::BAD_REQUEST, "invalid_request"),
        DocumentProcessingError::Unavailable => {
            (StatusCode::SERVICE_UNAVAILABLE, "service_unavailable")
        }
    };
    error(status, code)
}

fn processing_context_error(value: ClinicalContextError) -> Response {
    let error = match value {
        ClinicalContextError::Session(SessionError::Unauthenticated) => {
            DocumentProcessingError::Unauthenticated
        }
        ClinicalContextError::Session(
            SessionError::ReauthenticationRequired | SessionError::PracticeDenied,
        )
        | ClinicalContextError::NonHuman => DocumentProcessingError::Denied,
        ClinicalContextError::Session(
            SessionError::Unavailable | SessionError::NativeAuthenticationUnavailable,
        ) => DocumentProcessingError::Unavailable,
    };
    document_processing_error(error)
}

pub(crate) fn document_context_error(value: ClinicalContextError) -> Response {
    let error = match value {
        ClinicalContextError::Session(SessionError::Unauthenticated) => {
            DocumentUploadError::Unauthenticated
        }
        ClinicalContextError::Session(
            SessionError::ReauthenticationRequired | SessionError::PracticeDenied,
        )
        | ClinicalContextError::NonHuman => DocumentUploadError::Denied,
        ClinicalContextError::Session(
            SessionError::Unavailable | SessionError::NativeAuthenticationUnavailable,
        ) => DocumentUploadError::Unavailable,
    };
    document_error(error)
}

fn multipart_error(value: MultipartError) -> Response {
    if value.status() == StatusCode::PAYLOAD_TOO_LARGE {
        document_error(DocumentUploadError::TooLarge)
    } else {
        invalid()
    }
}

fn set_once<T>(slot: &mut Option<T>, value: T) -> Result<(), Response> {
    if slot.replace(value).is_some() {
        Err(invalid())
    } else {
        Ok(())
    }
}

async fn text_field(field: axum::extract::multipart::Field<'_>) -> Result<String, Response> {
    if field.file_name().is_some() {
        return Err(invalid());
    }
    let bytes = field.bytes().await.map_err(multipart_error)?;
    if bytes.len() > MAX_METADATA_FIELD_BYTES {
        return Err(invalid());
    }
    String::from_utf8(bytes.to_vec()).map_err(|_| invalid())
}

async fn parse_upload(
    case_id: Uuid,
    mut multipart: Multipart,
) -> Result<(UploadCaseDocumentCommand, Vec<u8>), Response> {
    let mut fields = UploadFields::default();
    while let Some(field) = multipart.next_field().await.map_err(multipart_error)? {
        let field_name = field.name().map(str::to_owned).ok_or_else(invalid)?;
        match field_name.as_str() {
            "file" => {
                let content_type = field.content_type().map(str::to_owned);
                let bytes = field.bytes().await.map_err(multipart_error)?;
                if bytes.len() > MAX_DOCUMENT_UPLOAD_BYTES {
                    return Err(document_error(DocumentUploadError::TooLarge));
                }
                set_once(&mut fields.file, (content_type, bytes.to_vec()))?;
            }
            "commandId" => {
                set_once(&mut fields.command_id, text_field(field).await?)?;
            }
            "documentId" => {
                set_once(&mut fields.document_id, text_field(field).await?)?;
            }
            "expectedCaseInputRevision" => set_once(
                &mut fields.expected_case_input_revision,
                text_field(field).await?,
            )?,
            "expectedDocumentSetRevision" => set_once(
                &mut fields.expected_document_set_revision,
                text_field(field).await?,
            )?,
            "documentTypeKey" => {
                set_once(&mut fields.document_type_key, text_field(field).await?)?;
            }
            "name" => set_once(&mut fields.name, text_field(field).await?)?,
            "effectiveDate" => {
                set_once(&mut fields.effective_date, text_field(field).await?)?;
            }
            "mediaType" => {
                set_once(&mut fields.media_type, text_field(field).await?)?;
            }
            "contentSha256" => {
                set_once(&mut fields.content_sha256, text_field(field).await?)?;
            }
            "data" => set_once(&mut fields.data, text_field(field).await?)?,
            _ => return Err(invalid()),
        }
    }

    let media_type = match fields.media_type.as_deref() {
        Some("application/pdf") => DocumentMediaType::ApplicationPdf,
        Some("text/plain") => DocumentMediaType::TextPlain,
        _ => return Err(document_error(DocumentUploadError::UnsupportedType)),
    };
    let (file_content_type, bytes) = fields.file.ok_or_else(invalid)?;
    if file_content_type.as_deref() != Some(media_type.as_str()) {
        return Err(document_error(DocumentUploadError::UnsupportedType));
    }
    let data = fields
        .data
        .map(|value| serde_json::from_str::<Value>(&value).map_err(|_| invalid()))
        .transpose()?;
    let command = UploadCaseDocumentCommand {
        command_id: fields
            .command_id
            .ok_or_else(invalid)?
            .parse()
            .map_err(|_| invalid())?,
        document_id: fields
            .document_id
            .ok_or_else(invalid)?
            .parse()
            .map_err(|_| invalid())?,
        case_id,
        expected_case_input_revision: fields
            .expected_case_input_revision
            .ok_or_else(invalid)?
            .parse()
            .map_err(|_| invalid())?,
        expected_document_set_revision: fields
            .expected_document_set_revision
            .ok_or_else(invalid)?
            .parse()
            .map_err(|_| invalid())?,
        document_type_key: fields.document_type_key.ok_or_else(invalid)?,
        name: fields.name.ok_or_else(invalid)?,
        effective_date: fields
            .effective_date
            .ok_or_else(invalid)?
            .parse::<NaiveDate>()
            .map_err(|_| invalid())?,
        media_type,
        content_sha256: fields.content_sha256.ok_or_else(invalid)?,
        data,
    };
    Ok((command, bytes))
}

async fn upload(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<DocumentQuery>, QueryRejection>,
    multipart: Result<Multipart, MultipartRejection>,
) -> Result<Json<DocumentUploadResult>, Response> {
    let Path(case_id) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(document_context_error)?;
    require_capability(&capabilities, "document_upload")?;
    let multipart = multipart.map_err(|_| invalid())?;
    let (command, bytes) = parse_upload(case_id, multipart).await?;
    state
        .services
        .upload_case_document(&context, &capabilities, &command, bytes)
        .await
        .map(Json)
        .map_err(document_error)
}

async fn read(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<(Uuid, Uuid)>, PathRejection>,
    query: Result<Query<DocumentQuery>, QueryRejection>,
) -> Result<Json<DocumentMetadata>, Response> {
    let Path((case_id, document_id)) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(document_context_error)?;
    require_capability(&capabilities, "case:read")?;
    state
        .services
        .read_case_document(&context, &capabilities, case_id, document_id)
        .await
        .map(Json)
        .map_err(document_error)
}

async fn lookup(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<(Uuid, Uuid)>, PathRejection>,
    query: Result<Query<DocumentQuery>, QueryRejection>,
) -> Result<Json<DocumentUploadResult>, Response> {
    let Path((case_id, command_id)) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, capabilities) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(document_context_error)?;
    require_capability(&capabilities, "document_upload")?;
    state
        .services
        .lookup_document_upload_command(&context, &capabilities, case_id, command_id)
        .await
        .map_err(document_error)?
        .map(Json)
        .ok_or_else(|| document_error(DocumentUploadError::NotFound))
}

async fn process(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<(Uuid, Uuid)>, PathRejection>,
    query: Result<Query<DocumentQuery>, QueryRejection>,
    body: Result<Json<ProcessDocumentBody>, axum::extract::rejection::JsonRejection>,
) -> Result<Json<DocumentProcessingResult>, Response> {
    let Path((case_id, document_id)) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let Json(body) = body.map_err(|_| invalid())?;
    let (context, grants) = service_context(&state, &headers, query.practice_id)
        .await
        .map_err(processing_context_error)?;
    require_capability(&grants, AUTHORIZED_DOCUMENT_JOB_GRANT)
        .map_err(|_| document_processing_error(DocumentProcessingError::Denied))?;
    let command = ProcessCaseDocumentCommand {
        command_id: body.command_id,
        case_id,
        document_id,
        expected_document_set_revision: body.expected_document_set_revision,
    };
    state
        .services
        .process_case_document(&context, &grants, &command)
        .await
        .map(Json)
        .map_err(document_processing_error)
}

async fn lookup_processing(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<(Uuid, Uuid, Uuid)>, PathRejection>,
    query: Result<Query<DocumentQuery>, QueryRejection>,
) -> Result<Json<DocumentProcessingResult>, Response> {
    let Path((case_id, document_id, command_id)) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, grants) = service_context(&state, &headers, query.practice_id)
        .await
        .map_err(processing_context_error)?;
    require_capability(&grants, AUTHORIZED_DOCUMENT_JOB_GRANT)
        .map_err(|_| document_processing_error(DocumentProcessingError::Denied))?;
    state
        .services
        .lookup_document_process_command(&context, &grants, case_id, document_id, command_id)
        .await
        .map_err(document_processing_error)?
        .map(Json)
        .ok_or_else(|| document_processing_error(DocumentProcessingError::NotFound))
}

#[cfg(test)]
mod tests;
