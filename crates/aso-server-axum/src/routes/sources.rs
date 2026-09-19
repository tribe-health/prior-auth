//! Authenticated, audited document-source delivery.

use std::fmt::Write;

use aso_host::source::{DocumentSourceError, DocumentSourceRequest};
use axum::{
    Router,
    body::Body,
    extract::{
        Path, Query, State,
        rejection::{PathRejection, QueryRejection},
    },
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::{
    ServerState,
    session::{ClinicalContextError, clinical_context, session_error},
};

pub fn router() -> Router<ServerState> {
    Router::new().route(
        "/api/cases/{case_id}/documents/{document_id}/source",
        get(open),
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SourceQuery {
    practice_id: Option<Uuid>,
    page: u32,
}

fn error(status: StatusCode, code: &str) -> Response {
    let mut response = (status, axum::Json(json!({"error":code}))).into_response();
    private_headers(response.headers_mut());
    response
}

fn invalid() -> Response {
    error(StatusCode::BAD_REQUEST, "invalid_document_source_request")
}

fn source_error(value: DocumentSourceError) -> Response {
    let (status, code) = match value {
        DocumentSourceError::Unauthenticated => (StatusCode::UNAUTHORIZED, "unauthenticated"),
        DocumentSourceError::Denied => (StatusCode::FORBIDDEN, "document_source_denied"),
        DocumentSourceError::NotFound => (StatusCode::NOT_FOUND, "document_source_not_found"),
        DocumentSourceError::Invalid => {
            (StatusCode::BAD_REQUEST, "invalid_document_source_request")
        }
        DocumentSourceError::TooLarge => {
            (StatusCode::PAYLOAD_TOO_LARGE, "document_source_too_large")
        }
        DocumentSourceError::IntegrityMismatch => (
            StatusCode::SERVICE_UNAVAILABLE,
            "document_source_integrity_failed",
        ),
        DocumentSourceError::Unavailable | DocumentSourceError::NativeAuthenticationUnavailable => {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "document_source_unavailable",
            )
        }
    };
    error(status, code)
}

fn context_error(value: ClinicalContextError) -> Response {
    match value {
        ClinicalContextError::Session(error) => {
            let mut response = session_error(error);
            private_headers(response.headers_mut());
            response
        }
        ClinicalContextError::NonHuman => source_error(DocumentSourceError::Denied),
    }
}

fn private_headers(headers: &mut HeaderMap) {
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(header::PRAGMA, HeaderValue::from_static("no-cache"));
    headers.insert(header::EXPIRES, HeaderValue::from_static("0"));
    headers.insert(
        header::VARY,
        HeaderValue::from_static("Cookie, Authorization, X-Session-Token"),
    );
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
}

fn sha256_etag(bytes: &[u8]) -> String {
    let mut value = String::with_capacity(73);
    value.push_str("\"sha256-");
    for byte in bytes {
        write!(&mut value, "{byte:02x}").expect("writing to a string cannot fail");
    }
    value.push('"');
    value
}

async fn open(
    State(state): State<ServerState>,
    headers: HeaderMap,
    path: Result<Path<(Uuid, Uuid)>, PathRejection>,
    query: Result<Query<SourceQuery>, QueryRejection>,
) -> Result<Response, Response> {
    let Path((case_id, document_id)) = path.map_err(|_| invalid())?;
    let Query(query) = query.map_err(|_| invalid())?;
    let (context, _) = clinical_context(&state, &headers, query.practice_id)
        .await
        .map_err(context_error)?;
    let source = state
        .services
        .open_document_source(
            &context,
            DocumentSourceRequest {
                case_id,
                document_id,
                page_number: query.page,
            },
        )
        .await
        .map_err(source_error)?;

    let body_len = source.bytes.len();
    let mut response = Response::new(Body::from(source.bytes));
    *response.status_mut() = StatusCode::OK;
    private_headers(response.headers_mut());
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(&source.media_type)
            .map_err(|_| source_error(DocumentSourceError::Unavailable))?,
    );
    headers.insert(
        header::CONTENT_LENGTH,
        HeaderValue::from_str(&body_len.to_string())
            .map_err(|_| source_error(DocumentSourceError::Unavailable))?,
    );
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("inline"),
    );
    headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("none"));
    headers.insert(
        header::ETAG,
        HeaderValue::from_str(&sha256_etag(&source.content_sha256))
            .map_err(|_| source_error(DocumentSourceError::Unavailable))?,
    );
    headers.insert(
        "x-aso-source-document-id",
        HeaderValue::from_str(&source.document_id.to_string())
            .map_err(|_| source_error(DocumentSourceError::Unavailable))?,
    );
    headers.insert(
        "x-aso-source-effective-date",
        HeaderValue::from_str(&source.effective_date.to_string())
            .map_err(|_| source_error(DocumentSourceError::Unavailable))?,
    );
    headers.insert(
        "x-aso-source-page",
        HeaderValue::from_str(&source.page_number.to_string())
            .map_err(|_| source_error(DocumentSourceError::Unavailable))?,
    );
    headers.insert(
        "x-aso-source-page-count",
        HeaderValue::from_str(&source.page_count.to_string())
            .map_err(|_| source_error(DocumentSourceError::Unavailable))?,
    );
    Ok(response)
}

#[cfg(test)]
mod tests;
