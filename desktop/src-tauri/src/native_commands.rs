//! Host-only transport from Tauri commands to the mounted Gate HTTP surface.
//!
//! The renderer supplies resource identifiers and mutation intent. The opaque
//! Kratos credential is added here after it is read from the platform keyring.
//! Gate, the shared application services, and PostgreSQL therefore retain the
//! same independent checks used by the browser HTTP path.

use std::time::Duration;

use aso_host::{
    affirmation::{GateCommandResult, GateError, GateMutation, GateSnapshot},
    annotation::{AnnotationError, AnnotationMutation, AnnotationResult},
    reassessment::{ReassessEvidenceMutation, ReassessEvidenceResult, ReassessmentError},
    session::SessionCredential,
    signing::{SignLetterMutation, SignLetterResult, SigningError, SigningTarget},
};
use async_trait::async_trait;
use reqwest::{Client, Method, Response, Url, header::HeaderValue, redirect};
use serde::{Serialize, de::DeserializeOwned};
use uuid::Uuid;

const MAX_COMMAND_RESPONSE_BYTES: usize = 1024 * 1024;

#[async_trait]
pub trait NativeClinicalCommandPort: Send + Sync {
    async fn gate_state(
        &self,
        credential: &SessionCredential,
        case_id: Uuid,
        practice_id: Option<Uuid>,
    ) -> Result<GateSnapshot, GateError>;

    async fn affirm_gate(
        &self,
        credential: &SessionCredential,
        case_id: Uuid,
        practice_id: Option<Uuid>,
        request: &GateMutation,
    ) -> Result<GateCommandResult, GateError>;

    async fn remove_gate(
        &self,
        credential: &SessionCredential,
        case_id: Uuid,
        practice_id: Option<Uuid>,
        request: &GateMutation,
    ) -> Result<GateCommandResult, GateError>;

    async fn lookup_gate_command(
        &self,
        credential: &SessionCredential,
        case_id: Uuid,
        practice_id: Option<Uuid>,
        command_id: Uuid,
    ) -> Result<Option<GateCommandResult>, GateError>;

    async fn signing_target(
        &self,
        credential: &SessionCredential,
        letter_id: Uuid,
        practice_id: Option<Uuid>,
    ) -> Result<SigningTarget, SigningError>;

    async fn sign_letter(
        &self,
        credential: &SessionCredential,
        letter_id: Uuid,
        practice_id: Option<Uuid>,
        request: &SignLetterMutation,
    ) -> Result<SignLetterResult, SigningError>;

    async fn lookup_sign_letter_command(
        &self,
        credential: &SessionCredential,
        letter_id: Uuid,
        practice_id: Option<Uuid>,
        command_id: Uuid,
    ) -> Result<Option<SignLetterResult>, SigningError>;

    async fn reassess_evidence(
        &self,
        credential: &SessionCredential,
        case_id: Uuid,
        evidence_id: Uuid,
        practice_id: Option<Uuid>,
        request: &ReassessEvidenceMutation,
    ) -> Result<ReassessEvidenceResult, ReassessmentError>;

    async fn lookup_reassessment_command(
        &self,
        credential: &SessionCredential,
        case_id: Uuid,
        evidence_id: Uuid,
        practice_id: Option<Uuid>,
        command_id: Uuid,
    ) -> Result<Option<ReassessEvidenceResult>, ReassessmentError>;

    async fn save_annotation(
        &self,
        credential: &SessionCredential,
        case_id: Uuid,
        annotation_id: Uuid,
        practice_id: Option<Uuid>,
        request: &AnnotationMutation,
    ) -> Result<AnnotationResult, AnnotationError>;

    async fn lookup_annotation_command(
        &self,
        credential: &SessionCredential,
        case_id: Uuid,
        annotation_id: Uuid,
        practice_id: Option<Uuid>,
        command_id: Uuid,
    ) -> Result<Option<AnnotationResult>, AnnotationError>;
}

pub struct UnavailableNativeClinicalCommands;

#[async_trait]
impl NativeClinicalCommandPort for UnavailableNativeClinicalCommands {
    async fn gate_state(
        &self,
        _: &SessionCredential,
        _: Uuid,
        _: Option<Uuid>,
    ) -> Result<GateSnapshot, GateError> {
        Err(GateError::Unavailable)
    }

    async fn affirm_gate(
        &self,
        _: &SessionCredential,
        _: Uuid,
        _: Option<Uuid>,
        _: &GateMutation,
    ) -> Result<GateCommandResult, GateError> {
        Err(GateError::Unavailable)
    }

    async fn remove_gate(
        &self,
        _: &SessionCredential,
        _: Uuid,
        _: Option<Uuid>,
        _: &GateMutation,
    ) -> Result<GateCommandResult, GateError> {
        Err(GateError::Unavailable)
    }

    async fn lookup_gate_command(
        &self,
        _: &SessionCredential,
        _: Uuid,
        _: Option<Uuid>,
        _: Uuid,
    ) -> Result<Option<GateCommandResult>, GateError> {
        Err(GateError::Unavailable)
    }

    async fn signing_target(
        &self,
        _: &SessionCredential,
        _: Uuid,
        _: Option<Uuid>,
    ) -> Result<SigningTarget, SigningError> {
        Err(SigningError::Unavailable)
    }

    async fn sign_letter(
        &self,
        _: &SessionCredential,
        _: Uuid,
        _: Option<Uuid>,
        _: &SignLetterMutation,
    ) -> Result<SignLetterResult, SigningError> {
        Err(SigningError::Unavailable)
    }

    async fn lookup_sign_letter_command(
        &self,
        _: &SessionCredential,
        _: Uuid,
        _: Option<Uuid>,
        _: Uuid,
    ) -> Result<Option<SignLetterResult>, SigningError> {
        Err(SigningError::Unavailable)
    }

    async fn reassess_evidence(
        &self,
        _: &SessionCredential,
        _: Uuid,
        _: Uuid,
        _: Option<Uuid>,
        _: &ReassessEvidenceMutation,
    ) -> Result<ReassessEvidenceResult, ReassessmentError> {
        Err(ReassessmentError::Unavailable)
    }

    async fn lookup_reassessment_command(
        &self,
        _: &SessionCredential,
        _: Uuid,
        _: Uuid,
        _: Option<Uuid>,
        _: Uuid,
    ) -> Result<Option<ReassessEvidenceResult>, ReassessmentError> {
        Err(ReassessmentError::Unavailable)
    }

    async fn save_annotation(
        &self,
        _: &SessionCredential,
        _: Uuid,
        _: Uuid,
        _: Option<Uuid>,
        _: &AnnotationMutation,
    ) -> Result<AnnotationResult, AnnotationError> {
        Err(AnnotationError::Unavailable)
    }

    async fn lookup_annotation_command(
        &self,
        _: &SessionCredential,
        _: Uuid,
        _: Uuid,
        _: Option<Uuid>,
        _: Uuid,
    ) -> Result<Option<AnnotationResult>, AnnotationError> {
        Err(AnnotationError::Unavailable)
    }
}

#[derive(Debug)]
struct GatewayError {
    status: u16,
    code: String,
}

pub struct HttpNativeClinicalCommands {
    base: Url,
    client: Client,
}

impl HttpNativeClinicalCommands {
    pub fn new(base: &str, allow_insecure: bool) -> Result<Self, &'static str> {
        let mut base = Url::parse(base).map_err(|_| "invalid native Gate URL")?;
        if !base.username().is_empty()
            || base.password().is_some()
            || base.query().is_some()
            || base.fragment().is_some()
            || !(base.scheme() == "https" || allow_insecure && base.scheme() == "http")
        {
            return Err("invalid native Gate URL");
        }
        if !base.path().ends_with('/') {
            base.set_path(&format!("{}/", base.path()));
        }
        let client = Client::builder()
            .redirect(redirect::Policy::none())
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|_| "native Gate client unavailable")?;
        Ok(Self { base, client })
    }

    fn endpoint(&self, segments: &[&str], practice_id: Option<Uuid>) -> Result<Url, GatewayError> {
        let mut url = self.base.clone();
        {
            let mut path = url.path_segments_mut().map_err(|_| GatewayError {
                status: 503,
                code: "native_gateway_unavailable".into(),
            })?;
            path.pop_if_empty();
            path.extend(segments);
        }
        if let Some(practice_id) = practice_id {
            url.query_pairs_mut()
                .append_pair("practiceId", &practice_id.to_string());
        }
        Ok(url)
    }

    async fn exchange<T: DeserializeOwned>(
        &self,
        credential: &SessionCredential,
        method: Method,
        url: Url,
        body: Option<&impl Serialize>,
    ) -> Result<T, GatewayError> {
        let token = match credential {
            SessionCredential::NativeToken(token) => token,
            SessionCredential::Cookie(_) => {
                return Err(GatewayError {
                    status: 503,
                    code: "native_authentication_unavailable".into(),
                });
            }
        };
        let mut token_header = HeaderValue::from_str(token).map_err(|_| GatewayError {
            status: 503,
            code: "native_authentication_unavailable".into(),
        })?;
        token_header.set_sensitive(true);
        let mut request = self
            .client
            .request(method, url)
            .header("accept", "application/json")
            .header("x-session-token", token_header);
        if let Some(body) = body {
            request = request.json(body);
        }
        let response = request.send().await.map_err(|_| GatewayError {
            status: 503,
            code: "native_gateway_unavailable".into(),
        })?;
        bounded_response(response).await
    }

    async fn get<T: DeserializeOwned>(
        &self,
        credential: &SessionCredential,
        segments: &[&str],
        practice_id: Option<Uuid>,
    ) -> Result<T, GatewayError> {
        let url = self.endpoint(segments, practice_id)?;
        self.exchange::<T>(credential, Method::GET, url, None::<&&()>)
            .await
    }

    async fn post<T: DeserializeOwned>(
        &self,
        credential: &SessionCredential,
        segments: &[&str],
        practice_id: Option<Uuid>,
        body: &impl Serialize,
    ) -> Result<T, GatewayError> {
        let url = self.endpoint(segments, practice_id)?;
        self.exchange(credential, Method::POST, url, Some(body))
            .await
    }
}

async fn bounded_response<T: DeserializeOwned>(mut response: Response) -> Result<T, GatewayError> {
    let status = response.status().as_u16();
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| GatewayError {
        status: 503,
        code: "native_gateway_unavailable".into(),
    })? {
        if chunk.len() > MAX_COMMAND_RESPONSE_BYTES.saturating_sub(bytes.len()) {
            return Err(GatewayError {
                status: 503,
                code: "native_gateway_response_too_large".into(),
            });
        }
        bytes.extend_from_slice(&chunk);
    }
    if (200..300).contains(&status) {
        return serde_json::from_slice(&bytes).map_err(|_| GatewayError {
            status: 503,
            code: "native_gateway_response_invalid".into(),
        });
    }
    let code = serde_json::from_slice::<serde_json::Value>(&bytes)
        .ok()
        .and_then(|value| {
            value
                .get("error")
                .and_then(|value| value.as_str())
                .map(str::to_owned)
        })
        .unwrap_or_else(|| "native_gateway_unavailable".into());
    Err(GatewayError { status, code })
}

fn gate_error(error: GatewayError) -> GateError {
    match (error.status, error.code.as_str()) {
        (401, _) => GateError::Unauthenticated,
        (403, _) => GateError::Denied,
        (404, _) => GateError::NotFound,
        (409, "command_conflict") => GateError::CommandConflict,
        (503, "native_authentication_unavailable") => GateError::NativeAuthenticationUnavailable,
        _ => GateError::Unavailable,
    }
}

fn signing_error(error: GatewayError) -> SigningError {
    match (error.status, error.code.as_str()) {
        (401, _) => SigningError::Unauthenticated,
        (403, _) => SigningError::Denied,
        (404, _) => SigningError::NotFound,
        (409, "revision_conflict") => SigningError::RevisionConflict,
        (409, "signature_conflict") => SigningError::SignatureConflict,
        (409, "letter_not_approved") => SigningError::NotApproved,
        (409, "gate_not_affirmed") => SigningError::GateNotAffirmed,
        (409, "qa_incomplete") => SigningError::QaIncomplete,
        (409, "source_incomplete") => SigningError::SourceIncomplete,
        (409, "command_conflict") => SigningError::CommandConflict,
        (503, "native_authentication_unavailable") => SigningError::NativeAuthenticationUnavailable,
        _ => SigningError::Unavailable,
    }
}

fn reassessment_error(error: GatewayError) -> ReassessmentError {
    match (error.status, error.code.as_str()) {
        (401, _) => ReassessmentError::Unauthenticated,
        (403, _) => ReassessmentError::Denied,
        (404, _) => ReassessmentError::NotFound,
        (409, "revision_conflict") => ReassessmentError::RevisionConflict,
        (409, "command_conflict") => ReassessmentError::CommandConflict,
        (503, "native_authentication_unavailable") => {
            ReassessmentError::NativeAuthenticationUnavailable
        }
        _ => ReassessmentError::Unavailable,
    }
}

fn annotation_error(error: GatewayError) -> AnnotationError {
    match (error.status, error.code.as_str()) {
        (400, _) => AnnotationError::Invalid,
        (401, _) => AnnotationError::Unauthenticated,
        (403, _) => AnnotationError::Denied,
        (404, _) => AnnotationError::NotFound,
        (409, "revision_conflict") => AnnotationError::RevisionConflict,
        (409, "command_conflict") => AnnotationError::CommandConflict,
        (503, "native_authentication_unavailable") => {
            AnnotationError::NativeAuthenticationUnavailable
        }
        _ => AnnotationError::Unavailable,
    }
}

#[async_trait]
impl NativeClinicalCommandPort for HttpNativeClinicalCommands {
    async fn gate_state(
        &self,
        credential: &SessionCredential,
        case_id: Uuid,
        practice_id: Option<Uuid>,
    ) -> Result<GateSnapshot, GateError> {
        self.get(
            credential,
            &["api", "cases", &case_id.to_string(), "gate"],
            practice_id,
        )
        .await
        .map_err(gate_error)
    }

    async fn affirm_gate(
        &self,
        credential: &SessionCredential,
        case_id: Uuid,
        practice_id: Option<Uuid>,
        request: &GateMutation,
    ) -> Result<GateCommandResult, GateError> {
        self.post(
            credential,
            &["api", "cases", &case_id.to_string(), "gate", "affirm"],
            practice_id,
            request,
        )
        .await
        .map_err(gate_error)
    }

    async fn remove_gate(
        &self,
        credential: &SessionCredential,
        case_id: Uuid,
        practice_id: Option<Uuid>,
        request: &GateMutation,
    ) -> Result<GateCommandResult, GateError> {
        self.post(
            credential,
            &["api", "cases", &case_id.to_string(), "gate", "remove"],
            practice_id,
            request,
        )
        .await
        .map_err(gate_error)
    }

    async fn lookup_gate_command(
        &self,
        credential: &SessionCredential,
        case_id: Uuid,
        practice_id: Option<Uuid>,
        command_id: Uuid,
    ) -> Result<Option<GateCommandResult>, GateError> {
        match self
            .get(
                credential,
                &[
                    "api",
                    "cases",
                    &case_id.to_string(),
                    "gate",
                    "commands",
                    &command_id.to_string(),
                ],
                practice_id,
            )
            .await
        {
            Ok(result) => Ok(Some(result)),
            Err(error) if error.status == 404 => Ok(None),
            Err(error) => Err(gate_error(error)),
        }
    }

    async fn signing_target(
        &self,
        credential: &SessionCredential,
        letter_id: Uuid,
        practice_id: Option<Uuid>,
    ) -> Result<SigningTarget, SigningError> {
        self.get(
            credential,
            &["api", "letters", &letter_id.to_string(), "signing-target"],
            practice_id,
        )
        .await
        .map_err(signing_error)
    }

    async fn sign_letter(
        &self,
        credential: &SessionCredential,
        letter_id: Uuid,
        practice_id: Option<Uuid>,
        request: &SignLetterMutation,
    ) -> Result<SignLetterResult, SigningError> {
        self.post(
            credential,
            &["api", "letters", &letter_id.to_string(), "sign"],
            practice_id,
            request,
        )
        .await
        .map_err(signing_error)
    }

    async fn lookup_sign_letter_command(
        &self,
        credential: &SessionCredential,
        letter_id: Uuid,
        practice_id: Option<Uuid>,
        command_id: Uuid,
    ) -> Result<Option<SignLetterResult>, SigningError> {
        match self
            .get(
                credential,
                &[
                    "api",
                    "letters",
                    &letter_id.to_string(),
                    "sign",
                    "commands",
                    &command_id.to_string(),
                ],
                practice_id,
            )
            .await
        {
            Ok(result) => Ok(Some(result)),
            Err(error) if error.status == 404 => Ok(None),
            Err(error) => Err(signing_error(error)),
        }
    }

    async fn reassess_evidence(
        &self,
        credential: &SessionCredential,
        case_id: Uuid,
        evidence_id: Uuid,
        practice_id: Option<Uuid>,
        request: &ReassessEvidenceMutation,
    ) -> Result<ReassessEvidenceResult, ReassessmentError> {
        self.post(
            credential,
            &[
                "api",
                "cases",
                &case_id.to_string(),
                "evidence",
                &evidence_id.to_string(),
                "state",
            ],
            practice_id,
            request,
        )
        .await
        .map_err(reassessment_error)
    }

    async fn lookup_reassessment_command(
        &self,
        credential: &SessionCredential,
        case_id: Uuid,
        evidence_id: Uuid,
        practice_id: Option<Uuid>,
        command_id: Uuid,
    ) -> Result<Option<ReassessEvidenceResult>, ReassessmentError> {
        match self
            .get(
                credential,
                &[
                    "api",
                    "cases",
                    &case_id.to_string(),
                    "evidence",
                    &evidence_id.to_string(),
                    "commands",
                    &command_id.to_string(),
                ],
                practice_id,
            )
            .await
        {
            Ok(result) => Ok(Some(result)),
            Err(error) if error.status == 404 => Ok(None),
            Err(error) => Err(reassessment_error(error)),
        }
    }

    async fn save_annotation(
        &self,
        credential: &SessionCredential,
        case_id: Uuid,
        annotation_id: Uuid,
        practice_id: Option<Uuid>,
        request: &AnnotationMutation,
    ) -> Result<AnnotationResult, AnnotationError> {
        self.post(
            credential,
            &[
                "api",
                "cases",
                &case_id.to_string(),
                "annotations",
                &annotation_id.to_string(),
            ],
            practice_id,
            request,
        )
        .await
        .map_err(annotation_error)
    }

    async fn lookup_annotation_command(
        &self,
        credential: &SessionCredential,
        case_id: Uuid,
        annotation_id: Uuid,
        practice_id: Option<Uuid>,
        command_id: Uuid,
    ) -> Result<Option<AnnotationResult>, AnnotationError> {
        match self
            .get(
                credential,
                &[
                    "api",
                    "cases",
                    &case_id.to_string(),
                    "annotations",
                    &annotation_id.to_string(),
                    "commands",
                    &command_id.to_string(),
                ],
                practice_id,
            )
            .await
        {
            Ok(result) => Ok(Some(result)),
            Err(error) if error.status == 404 => Ok(None),
            Err(error) => Err(annotation_error(error)),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use axum::{
        Json, Router,
        body::Body,
        extract::State,
        http::{Request, StatusCode},
        response::IntoResponse,
    };
    use serde_json::json;

    use super::*;

    #[derive(Debug, PartialEq, Eq)]
    struct ObservedRequest {
        method: String,
        path_and_query: String,
        credential: String,
    }

    async fn deny_and_record(
        State(observed): State<Arc<Mutex<Vec<ObservedRequest>>>>,
        request: Request<Body>,
    ) -> impl IntoResponse {
        let credential = request
            .headers()
            .get("x-session-token")
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .to_owned();
        observed.lock().unwrap().push(ObservedRequest {
            method: request.method().to_string(),
            path_and_query: request
                .uri()
                .path_and_query()
                .map(ToString::to_string)
                .unwrap_or_default(),
            credential,
        });
        (StatusCode::FORBIDDEN, Json(json!({ "error": "denied" })))
    }

    #[tokio::test]
    async fn mounted_gateway_transport_preserves_all_command_paths_and_host_credential() {
        let observed = Arc::new(Mutex::new(Vec::new()));
        let router = Router::new()
            .fallback(deny_and_record)
            .with_state(Arc::clone(&observed));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let _ = axum::serve(listener, router).await;
        });
        let transport =
            HttpNativeClinicalCommands::new(&format!("http://{address}"), true).unwrap();
        let credential = SessionCredential::NativeToken("host-only-token".into());
        let case_id = Uuid::from_u128(1);
        let resource_id = Uuid::from_u128(2);
        let practice_id = Uuid::from_u128(3);
        let command_id = Uuid::from_u128(4);
        let gate_mutation: GateMutation = serde_json::from_value(json!({
            "commandId": command_id,
            "kind": "policy"
        }))
        .unwrap();
        let sign_mutation: SignLetterMutation = serde_json::from_value(json!({
            "commandId": command_id,
            "expectedLetterVersion": 2,
            "expectedQaRevision": 3,
            "expectedSignatureVersion": 1
        }))
        .unwrap();
        let reassessment_mutation: ReassessEvidenceMutation = serde_json::from_value(json!({
            "commandId": command_id,
            "state": "gap",
            "expectedAssessedAt": "2026-09-16T12:00:00Z"
        }))
        .unwrap();
        let annotation_mutation: AnnotationMutation = serde_json::from_value(json!({
            "commandId": command_id,
            "annotationId": resource_id,
            "annotationTypeId": Uuid::from_u128(5),
            "name": "Clinical judgment",
            "data": { "assertion": "Synthetic opinion." },
            "body": "Synthetic opinion.",
            "targetEvidenceId": resource_id,
            "targetDocumentId": null,
            "disposition": "held",
            "expectedRevision": 0
        }))
        .unwrap();

        assert_eq!(
            transport
                .gate_state(&credential, case_id, Some(practice_id))
                .await,
            Err(GateError::Denied)
        );
        assert_eq!(
            transport
                .affirm_gate(&credential, case_id, Some(practice_id), &gate_mutation,)
                .await,
            Err(GateError::Denied)
        );
        assert_eq!(
            transport
                .remove_gate(&credential, case_id, Some(practice_id), &gate_mutation,)
                .await,
            Err(GateError::Denied)
        );
        assert_eq!(
            transport
                .lookup_gate_command(&credential, case_id, Some(practice_id), command_id)
                .await,
            Err(GateError::Denied)
        );
        assert_eq!(
            transport
                .signing_target(&credential, resource_id, Some(practice_id))
                .await,
            Err(SigningError::Denied)
        );
        assert_eq!(
            transport
                .sign_letter(&credential, resource_id, Some(practice_id), &sign_mutation,)
                .await,
            Err(SigningError::Denied)
        );
        assert_eq!(
            transport
                .lookup_sign_letter_command(
                    &credential,
                    resource_id,
                    Some(practice_id),
                    command_id,
                )
                .await,
            Err(SigningError::Denied)
        );
        assert_eq!(
            transport
                .reassess_evidence(
                    &credential,
                    case_id,
                    resource_id,
                    Some(practice_id),
                    &reassessment_mutation,
                )
                .await,
            Err(ReassessmentError::Denied)
        );
        assert_eq!(
            transport
                .lookup_reassessment_command(
                    &credential,
                    case_id,
                    resource_id,
                    Some(practice_id),
                    command_id,
                )
                .await,
            Err(ReassessmentError::Denied)
        );
        assert_eq!(
            transport
                .save_annotation(
                    &credential,
                    case_id,
                    resource_id,
                    Some(practice_id),
                    &annotation_mutation,
                )
                .await,
            Err(AnnotationError::Denied)
        );
        assert_eq!(
            transport
                .lookup_annotation_command(
                    &credential,
                    case_id,
                    resource_id,
                    Some(practice_id),
                    command_id,
                )
                .await,
            Err(AnnotationError::Denied)
        );

        let practice_query = format!("?practiceId={practice_id}");
        let expected = [
            ("GET", format!("/api/cases/{case_id}/gate{practice_query}")),
            (
                "POST",
                format!("/api/cases/{case_id}/gate/affirm{practice_query}"),
            ),
            (
                "POST",
                format!("/api/cases/{case_id}/gate/remove{practice_query}"),
            ),
            (
                "GET",
                format!("/api/cases/{case_id}/gate/commands/{command_id}{practice_query}"),
            ),
            (
                "GET",
                format!("/api/letters/{resource_id}/signing-target{practice_query}"),
            ),
            (
                "POST",
                format!("/api/letters/{resource_id}/sign{practice_query}"),
            ),
            (
                "GET",
                format!("/api/letters/{resource_id}/sign/commands/{command_id}{practice_query}"),
            ),
            (
                "POST",
                format!("/api/cases/{case_id}/evidence/{resource_id}/state{practice_query}"),
            ),
            (
                "GET",
                format!(
                    "/api/cases/{case_id}/evidence/{resource_id}/commands/{command_id}{practice_query}"
                ),
            ),
            (
                "POST",
                format!("/api/cases/{case_id}/annotations/{resource_id}{practice_query}"),
            ),
            (
                "GET",
                format!(
                    "/api/cases/{case_id}/annotations/{resource_id}/commands/{command_id}{practice_query}"
                ),
            ),
        ];
        let requests = observed.lock().unwrap();
        assert_eq!(requests.len(), expected.len());
        for (request, (method, path_and_query)) in requests.iter().zip(expected) {
            assert_eq!(request.method, method);
            assert_eq!(request.path_and_query, path_and_query);
            assert_eq!(request.credential, "host-only-token");
        }
        server.abort();
    }
}
