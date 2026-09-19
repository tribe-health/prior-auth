//! Host-owned document generation contracts. The engine has no authority or I/O.
//!
//! Model references select sources already authorized by the host. They never
//! supply document metadata, an actor, a provider route, or a signing receipt.

use std::collections::{BTreeMap, BTreeSet};

use async_trait::async_trait;
pub use clinical_docs::{Assembly, CheckInputs, Claim, EvidenceState, Provenance};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    affirmation::ClinicalContext,
    letter_workflow::{GenerateLetterCommand, LetterCommandResult, LetterPurpose},
};

pub const UNSOURCED_ASSERTION: &str =
    "This assertion has no source document. It will not be included.";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AuthorizedSource {
    pub id: String,
    pub document_id: Uuid,
    pub document_version: u32,
    pub title: String,
    pub page: u32,
    pub effective_date: chrono::NaiveDate,
    pub content_sha256: String,
    pub text: String,
    pub criterion_ids: BTreeSet<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AuthorizedAnnotation {
    pub id: Uuid,
    pub source_id: String,
    pub author: String,
    pub authored_on: chrono::NaiveDate,
    pub text: String,
}

/// Host-selected configuration; this is never deserialized from an agent body.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InferenceRoute {
    SyntheticDemo,
    ProductionPhi,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ProviderQualification {
    pub us_processing: bool,
    pub baa: bool,
    pub zero_retention: bool,
}

impl ProviderQualification {
    pub fn permits(self, route: InferenceRoute, synthetic_case: bool) -> bool {
        match route {
            InferenceRoute::SyntheticDemo => synthetic_case,
            InferenceRoute::ProductionPhi => self.us_processing && self.baa && self.zero_retention,
        }
    }
}

/// Internal, immutable authorized read. The database supplies its snapshot token.
/// Neither sources nor annotations are unrestricted real-time projections.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerationSnapshot {
    pub case_id: Uuid,
    pub practice_id: Uuid,
    pub snapshot_token: String,
    pub synthetic_case: bool,
    pub purpose: LetterPurpose,
    pub original_request_id: Option<Uuid>,
    pub determination_id: Option<Uuid>,
    pub sources: Vec<AuthorizedSource>,
    pub annotations: Vec<AuthorizedAnnotation>,
    pub required_criteria: BTreeSet<String>,
    pub evidence: BTreeMap<String, EvidenceState>,
    pub context: serde_json::Value,
    pub checks: CheckInputs,
}

impl GenerationSnapshot {
    pub fn kind(&self) -> &'static str {
        match self.purpose {
            LetterPurpose::PriorAuthorizationRequest => "pa.initial_request",
            LetterPurpose::CorrectedResubmission | LetterPurpose::ClinicalAppeal => {
                "pa.denial_response"
            }
        }
    }

    pub fn response_mode(&self) -> Option<&'static str> {
        match self.purpose {
            LetterPurpose::PriorAuthorizationRequest => None,
            LetterPurpose::CorrectedResubmission => Some("corrected_resubmission"),
            LetterPurpose::ClinicalAppeal => Some("clinical_appeal"),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CandidateClaim {
    pub text: String,
    pub source_id: String,
    pub source_quote: String,
    pub criterion_id: Option<String>,
    pub annotation_id: Option<Uuid>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CandidateDocument {
    pub claims: Vec<CandidateClaim>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AssemblyRequest {
    pub kind: String,
    pub expected_package_digest: String,
    pub claims: Vec<Claim>,
    pub required_criteria: BTreeSet<String>,
    pub evidence: BTreeMap<String, EvidenceState>,
    pub context: serde_json::Value,
    pub checks: CheckInputs,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum GenerationError {
    #[error("document generation is not authorized")]
    Denied,
    #[error("document generation was canceled")]
    Canceled,
    #[error("generation input changed; review the current case")]
    Stale,
    #[error("the inference provider is not qualified for this case")]
    ProviderNotQualified,
    #[error("the model response does not satisfy the candidate contract")]
    InvalidCandidate,
    #[error("the response names a source outside the authorized evidence")]
    InvalidCitation,
    #[error("the assembly does not match its requested package or digest")]
    InvalidAssembly,
    #[error("document generation is temporarily unavailable")]
    Unavailable,
}

/// Exclusion is explicit. Invalid source identifiers/metadata refuse the whole
/// candidate; empty/documentless assertions are excluded and reported to the UI.
pub struct ResolvedClaims {
    pub claims: Vec<Claim>,
    pub excluded_count: usize,
}

pub fn resolve_candidates(
    snapshot: &GenerationSnapshot,
    candidate: CandidateDocument,
) -> Result<ResolvedClaims, GenerationError> {
    if candidate.claims.len() > 128 {
        return Err(GenerationError::InvalidCandidate);
    }
    let mut resolved = ResolvedClaims {
        claims: Vec::new(),
        excluded_count: 0,
    };
    for candidate in candidate.claims {
        if candidate.source_id.is_empty()
            || candidate.text.trim().is_empty()
            || candidate.source_quote.trim().is_empty()
        {
            resolved.excluded_count += 1;
            continue;
        }
        let source = snapshot
            .sources
            .iter()
            .find(|source| source.id == candidate.source_id)
            .ok_or(GenerationError::InvalidCitation)?;
        if source.page == 0
            || source.document_version == 0
            || source.document_id.is_nil()
            || !source.text.contains(&candidate.source_quote)
            || candidate
                .criterion_id
                .as_ref()
                .is_some_and(|id| !source.criterion_ids.contains(id))
            || source.content_sha256.len() != 64
            || !source
                .content_sha256
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(GenerationError::InvalidCitation);
        }
        if candidate.text.len() > 16_384 || candidate.source_quote.len() > 16_384 {
            return Err(GenerationError::InvalidCandidate);
        }
        let provenance = if let Some(annotation_id) = candidate.annotation_id {
            let annotation = snapshot
                .annotations
                .iter()
                .find(|annotation| {
                    annotation.id == annotation_id
                        && annotation.source_id == source.id
                        && !annotation.author.trim().is_empty()
                })
                .ok_or(GenerationError::InvalidCitation)?;
            Provenance::AttributedDocument {
                document_id: source.document_id.to_string(),
                document_version: source.document_version,
                title: source.title.clone(),
                page: source.page,
                effective_date: source.effective_date.to_string(),
                content_sha256: source.content_sha256.clone(),
                source_quote: candidate.source_quote,
                annotation_id: annotation.id.to_string(),
                author: annotation.author.clone(),
                authored_on: annotation.authored_on.to_string(),
            }
        } else {
            Provenance::Document {
                document_id: source.document_id.to_string(),
                document_version: source.document_version,
                title: source.title.clone(),
                page: source.page,
                effective_date: source.effective_date.to_string(),
                content_sha256: source.content_sha256.clone(),
                source_quote: candidate.source_quote,
            }
        };
        resolved.claims.push(Claim {
            ordinal: resolved.claims.len() as u32 + 1,
            text: candidate.text,
            provenance,
            criterion_id: candidate.criterion_id,
        });
    }
    Ok(resolved)
}

/// Decode the engine's hash without changing its preimage or the HTTP format.
/// Also bind every rendered claim and all seven findings to the host request.
pub fn validate_assembly(
    request: &AssemblyRequest,
    assembly: &Assembly,
) -> Result<[u8; 32], GenerationError> {
    if assembly.kind_key != request.kind
        || assembly.template_digest != request.expected_package_digest
        || assembly.kind_version == 0
        || assembly.qa.len() != clinical_docs::SCHEMA_QA_CHECKS.len()
    {
        return Err(GenerationError::InvalidAssembly);
    }
    for check in clinical_docs::SCHEMA_QA_CHECKS {
        if assembly
            .qa
            .iter()
            .filter(|finding| finding.check == check && finding.severity == check.severity())
            .count()
            != 1
        {
            return Err(GenerationError::InvalidAssembly);
        }
    }
    let mut seen = BTreeSet::new();
    for claim in &assembly.rendered_claims {
        if !seen.insert(claim.ordinal)
            || !request.claims.iter().any(|source| {
                source.ordinal == claim.ordinal
                    && source.text == claim.text
                    && source.provenance == claim.provenance
                    && source.criterion_id == claim.criterion_id
            })
        {
            return Err(GenerationError::InvalidAssembly);
        }
    }
    let mut hash = Sha256::new();
    hash.update(assembly.kind_key.as_bytes());
    hash.update([0]);
    hash.update(assembly.kind_version.to_string().as_bytes());
    hash.update([0]);
    hash.update(assembly.template_digest.as_bytes());
    hash.update([0]);
    hash.update(assembly.canonical_markdown.as_bytes());
    let bytes: [u8; 32] = hash.finalize().into();
    let expected = format!(
        "sha256:{}",
        bytes
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>()
    );
    if assembly.content_sha256 != expected {
        return Err(GenerationError::InvalidAssembly);
    }
    Ok(bytes)
}

/// Trusted host adapters implement these effects; no implementation belongs in
/// the stateless kernel. Every source/task read takes verified clinical context.
#[async_trait]
pub trait GenerationRepository: Send + Sync {
    async fn prepare(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        command: &GenerateLetterCommand,
    ) -> Result<GenerationSnapshot, GenerationError>;
    async fn commit(
        &self,
        context: &ClinicalContext,
        command: &GenerateLetterCommand,
        snapshot: &GenerationSnapshot,
        assembly: &Assembly,
        task_id: Uuid,
    ) -> Result<LetterCommandResult, GenerationError>;
}

#[async_trait]
pub trait DocumentAssembler: Send + Sync {
    async fn assemble(&self, request: &AssemblyRequest) -> Result<Assembly, GenerationError>;
}

#[async_trait]
pub trait GenerationProgress: Send + Sync {
    async fn checkpoint(&self, phase: &str) -> Result<(), GenerationError>;
    async fn provisional_text(&self, delta: &str) -> Result<(), GenerationError>;
}

#[async_trait]
pub trait DocumentInference: Send + Sync {
    async fn compose(
        &self,
        snapshot: &GenerationSnapshot,
        progress: &dyn GenerationProgress,
    ) -> Result<CandidateDocument, GenerationError>;
}

#[async_trait]
pub trait AuthorizedGenerationTools: Send + Sync {
    async fn source_page(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        source_id: &str,
    ) -> Result<AuthorizedSource, GenerationError>;
}

#[derive(Clone)]
pub struct GenerationPolicy {
    pub route: InferenceRoute,
    pub qualification: ProviderQualification,
    pub package_digest: String,
}

pub struct GeneratedDocument {
    pub assembly: Assembly,
    pub digest_bytes: [u8; 32],
    pub excluded_count: usize,
}

/// Remote effects finish before the caller opens its final commit transaction.
/// A checkpoint is also a host cancellation/authority boundary.
pub async fn compose_document(
    snapshot: &GenerationSnapshot,
    policy: &GenerationPolicy,
    inference: &dyn DocumentInference,
    assembler: &dyn DocumentAssembler,
    progress: &dyn GenerationProgress,
) -> Result<GeneratedDocument, GenerationError> {
    if !policy
        .qualification
        .permits(policy.route, snapshot.synthetic_case)
    {
        return Err(GenerationError::ProviderNotQualified);
    }
    if snapshot.response_mode().is_some()
        && (snapshot.original_request_id.is_none() || snapshot.determination_id.is_none())
    {
        return Err(GenerationError::InvalidCandidate);
    }
    progress.checkpoint("generation").await?;
    let candidate = inference.compose(snapshot, progress).await?;
    progress.checkpoint("citation_validation").await?;
    let resolved = resolve_candidates(snapshot, candidate)?;
    let mut context = snapshot.context.clone();
    if let Some(mode) = snapshot.response_mode() {
        let object = context
            .as_object_mut()
            .ok_or(GenerationError::InvalidCandidate)?;
        object.insert("response_mode".into(), mode.into());
        let determination = object
            .get_mut("determination")
            .and_then(serde_json::Value::as_object_mut)
            .ok_or(GenerationError::InvalidCitation)?;
        let document_id = determination
            .get("document_id")
            .and_then(serde_json::Value::as_str)
            .ok_or(GenerationError::InvalidCitation)?;
        let ordinal = resolved
            .claims
            .iter()
            .find_map(|claim| match &claim.provenance {
                Provenance::Document {
                    document_id: id, ..
                }
                | Provenance::AttributedDocument {
                    document_id: id, ..
                } if id == document_id => Some(claim.ordinal),
                _ => None,
            })
            .ok_or(GenerationError::InvalidCitation)?;
        determination.insert("claim_ordinal".into(), ordinal.into());
    }
    let request = AssemblyRequest {
        kind: snapshot.kind().into(),
        expected_package_digest: policy.package_digest.clone(),
        claims: resolved.claims,
        required_criteria: snapshot.required_criteria.clone(),
        evidence: snapshot.evidence.clone(),
        context,
        checks: snapshot.checks.clone(),
    };
    progress.checkpoint("assembly").await?;
    let assembly = assembler.assemble(&request).await?;
    let digest_bytes = validate_assembly(&request, &assembly)?;
    progress.checkpoint("persistence").await?;
    Ok(GeneratedDocument {
        assembly,
        digest_bytes,
        excluded_count: resolved.excluded_count,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DocumentTaskState {
    Submitted,
    Working,
    InputRequired,
    Completed,
    Canceled,
    Failed,
    Rejected,
    AuthRequired,
}

impl DocumentTaskState {
    pub fn terminal(self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Canceled | Self::Failed | Self::Rejected
        )
    }

    pub fn permits_transition(self, next: Self) -> bool {
        if self.terminal() {
            return false;
        }
        match next {
            Self::Submitted => false,
            Self::Working => matches!(
                self,
                Self::Submitted | Self::InputRequired | Self::AuthRequired
            ),
            Self::Completed => self == Self::Working,
            Self::InputRequired | Self::AuthRequired => self == Self::Working,
            Self::Canceled | Self::Failed | Self::Rejected => true,
        }
    }
}

/// Safe status projection. Prompts, source pages, and artifacts stay in scoped
/// authorized read endpoints; task IDs do not authorize access to them.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentTask {
    pub id: Uuid,
    pub case_id: Uuid,
    pub command_id: Uuid,
    pub purpose: LetterPurpose,
    pub state: DocumentTaskState,
    pub stage: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub letter_id: Option<Uuid>,
    pub error_code: Option<String>,
    pub last_sequence: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentTaskEvent {
    pub task_id: Uuid,
    pub sequence: i64,
    pub occurred_at: chrono::DateTime<chrono::Utc>,
    pub event_type: String,
    pub payload: serde_json::Value,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentTaskArtifacts {
    pub assembly: Assembly,
    pub letter: LetterCommandResult,
}

#[async_trait]
pub trait GenerationAuthorization: Send + Sync {
    async fn revalidate(&self) -> Result<(), GenerationError>;
}

#[async_trait]
pub trait DurableDocumentTasks: Send + Sync {
    async fn start(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        command: &GenerateLetterCommand,
        authorization: std::sync::Arc<dyn GenerationAuthorization>,
    ) -> Result<DocumentTask, GenerationError>;
    async fn read(
        &self,
        context: &ClinicalContext,
        task_id: Uuid,
    ) -> Result<DocumentTask, GenerationError>;
    async fn resume(
        &self,
        context: &ClinicalContext,
        task_id: Uuid,
        authorization: std::sync::Arc<dyn GenerationAuthorization>,
    ) -> Result<DocumentTask, GenerationError>;
    async fn artifacts(
        &self,
        context: &ClinicalContext,
        task_id: Uuid,
    ) -> Result<DocumentTaskArtifacts, GenerationError>;
    async fn letter_artifacts(
        &self,
        context: &ClinicalContext,
        letter_id: Uuid,
    ) -> Result<Option<DocumentTaskArtifacts>, GenerationError>;
    async fn cancel(
        &self,
        context: &ClinicalContext,
        task_id: Uuid,
    ) -> Result<DocumentTask, GenerationError>;
    async fn events(
        &self,
        context: &ClinicalContext,
        task_id: Uuid,
        after_sequence: i64,
    ) -> Result<Vec<DocumentTaskEvent>, GenerationError>;
}

/// A live task retains only an opaque caller credential in host memory. A
/// resumed task must acquire a new credential; credentials are never persisted.
struct SessionGenerationAuthorization {
    sessions: std::sync::Arc<dyn crate::session::SessionPort>,
    credential: crate::session::SessionCredential,
    identity_id: Uuid,
    actor_id: Uuid,
    practice_id: Uuid,
}

#[async_trait]
impl GenerationAuthorization for SessionGenerationAuthorization {
    async fn revalidate(&self) -> Result<(), GenerationError> {
        let session = self
            .sessions
            .resolve(&self.credential, Some(self.practice_id))
            .await
            .map_err(|_| GenerationError::Denied)?;
        if session.identity_id != self.identity_id
            || session.user_id != self.actor_id
            || session.practice_id != self.practice_id
            || session.expires_at <= chrono::Utc::now()
            || session.principal != crate::session::Principal::User
            || !session
                .capabilities
                .iter()
                .any(|cap| cap == "letter_generate")
        {
            return Err(GenerationError::Denied);
        }
        Ok(())
    }
}

impl crate::AppServices {
    fn document_task_port(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        write: bool,
    ) -> Result<&dyn DurableDocumentTasks, GenerationError> {
        if context.expires_at <= self.clock.now()
            || context.principal != crate::session::Principal::User
            || !capabilities
                .iter()
                .any(|cap| cap == "letter_generate" || (!write && cap == "case:read"))
        {
            return Err(GenerationError::Denied);
        }
        self.letters
            .document_tasks()
            .ok_or(GenerationError::Unavailable)
    }

    fn generation_authorization(
        &self,
        context: &ClinicalContext,
        credential: crate::session::SessionCredential,
    ) -> std::sync::Arc<dyn GenerationAuthorization> {
        std::sync::Arc::new(SessionGenerationAuthorization {
            sessions: self.sessions.clone(),
            credential,
            identity_id: context.identity_id,
            actor_id: context.actor.0,
            practice_id: context.practice.0,
        })
    }

    pub async fn start_document_task(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        credential: crate::session::SessionCredential,
        case_id: Uuid,
        command: &GenerateLetterCommand,
    ) -> Result<DocumentTask, GenerationError> {
        if case_id.is_nil() || command.command_id.is_nil() {
            return Err(GenerationError::InvalidCandidate);
        }
        let tasks = self.document_task_port(context, capabilities, true)?;
        let authorization = self.generation_authorization(context, credential);
        authorization.revalidate().await?;
        tasks.start(context, case_id, command, authorization).await
    }

    pub async fn resume_document_task(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        credential: crate::session::SessionCredential,
        task_id: Uuid,
    ) -> Result<DocumentTask, GenerationError> {
        let tasks = self.document_task_port(context, capabilities, true)?;
        let authorization = self.generation_authorization(context, credential);
        authorization.revalidate().await?;
        tasks.resume(context, task_id, authorization).await
    }

    pub async fn read_document_task(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        task_id: Uuid,
    ) -> Result<DocumentTask, GenerationError> {
        self.document_task_port(context, capabilities, false)?
            .read(context, task_id)
            .await
    }

    pub async fn cancel_document_task(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        task_id: Uuid,
    ) -> Result<DocumentTask, GenerationError> {
        self.document_task_port(context, capabilities, true)?
            .cancel(context, task_id)
            .await
    }

    pub async fn document_task_events(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        task_id: Uuid,
        after_sequence: i64,
    ) -> Result<Vec<DocumentTaskEvent>, GenerationError> {
        if after_sequence < 0 {
            return Err(GenerationError::InvalidCandidate);
        }
        self.document_task_port(context, capabilities, false)?
            .events(context, task_id, after_sequence)
            .await
    }

    pub async fn letter_assembly_artifacts(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        letter_id: Uuid,
    ) -> Result<Option<DocumentTaskArtifacts>, GenerationError> {
        self.document_task_port(context, capabilities, false)?
            .letter_artifacts(context, letter_id)
            .await
    }

    pub async fn document_task_artifacts(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        task_id: Uuid,
    ) -> Result<DocumentTaskArtifacts, GenerationError> {
        self.document_task_port(context, capabilities, false)?
            .artifacts(context, task_id)
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use clinical_docs::{AssemblyInput, DocumentClass, DocumentKind, TemplatePackage};

    fn snapshot() -> GenerationSnapshot {
        GenerationSnapshot {
            case_id: Uuid::from_u128(1),
            practice_id: Uuid::from_u128(2),
            snapshot_token: "synthetic-snapshot".into(),
            synthetic_case: true,
            purpose: LetterPurpose::PriorAuthorizationRequest,
            original_request_id: None,
            determination_id: None,
            sources: vec![AuthorizedSource {
                id: "therapy-page-1".into(),
                document_id: Uuid::from_u128(3),
                document_version: 1,
                title: "Synthetic therapy note".into(),
                page: 1,
                effective_date: chrono::NaiveDate::from_ymd_opt(2026, 9, 1).unwrap(),
                content_sha256: "ab".repeat(32),
                text: "Synthetic patient completed twelve weeks of therapy.".into(),
                criterion_ids: BTreeSet::from(["therapy".into()]),
            }],
            annotations: Vec::new(),
            required_criteria: BTreeSet::from(["therapy".into()]),
            evidence: BTreeMap::from([("therapy".into(), EvidenceState::Met)]),
            context: serde_json::json!({}),
            checks: CheckInputs::default(),
        }
    }

    fn candidate() -> CandidateClaim {
        CandidateClaim {
            text: "Twelve weeks of therapy are documented.".into(),
            source_id: "therapy-page-1".into(),
            source_quote: "completed twelve weeks of therapy".into(),
            criterion_id: Some("therapy".into()),
            annotation_id: None,
        }
    }

    #[test]
    fn invented_sources_quotes_and_unrelated_criteria_are_refused() {
        for field in ["source", "quote", "criterion", "annotation"] {
            let mut claim = candidate();
            match field {
                "source" => claim.source_id = "invented-page".into(),
                "quote" => claim.source_quote = "translation of 12 mm".into(),
                "criterion" => claim.criterion_id = Some("unrelated-imaging".into()),
                _ => claim.annotation_id = Some(Uuid::from_u128(4)),
            }
            assert!(
                matches!(
                    resolve_candidates(
                        &snapshot(),
                        CandidateDocument {
                            claims: vec![claim]
                        }
                    ),
                    Err(GenerationError::InvalidCitation)
                ),
                "{field}"
            );
        }
    }

    #[test]
    fn source_metadata_comes_from_the_host_and_missing_sources_are_excluded() {
        let mut unsupported = candidate();
        unsupported.source_id.clear();
        let resolved = resolve_candidates(
            &snapshot(),
            CandidateDocument {
                claims: vec![unsupported, candidate()],
            },
        )
        .unwrap();
        assert_eq!(resolved.excluded_count, 1);
        assert_eq!(resolved.claims.len(), 1);
        assert_eq!(resolved.claims[0].ordinal, 1);
        let Provenance::Document {
            page,
            effective_date,
            title,
            ..
        } = &resolved.claims[0].provenance
        else {
            panic!("document provenance required")
        };
        assert_eq!(*page, 1);
        assert_eq!(effective_date, "2026-09-01");
        assert_eq!(title, "Synthetic therapy note");
        let mut body = serde_json::to_value(candidate()).unwrap();
        body["documentId"] = serde_json::json!(Uuid::from_u128(99));
        assert!(serde_json::from_value::<CandidateClaim>(body).is_err());
    }

    #[test]
    fn production_cannot_fall_back_to_synthetic_or_partial_qualification() {
        let disabled = ProviderQualification::default();
        assert!(disabled.permits(InferenceRoute::SyntheticDemo, true));
        assert!(!disabled.permits(InferenceRoute::SyntheticDemo, false));
        assert!(!disabled.permits(InferenceRoute::ProductionPhi, true));
        for qualification in [
            ProviderQualification {
                us_processing: false,
                baa: true,
                zero_retention: true,
            },
            ProviderQualification {
                us_processing: true,
                baa: false,
                zero_retention: true,
            },
            ProviderQualification {
                us_processing: true,
                baa: true,
                zero_retention: false,
            },
        ] {
            assert!(!qualification.permits(InferenceRoute::ProductionPhi, false));
        }
    }

    #[test]
    fn terminal_tasks_do_not_restart_and_input_required_resumes() {
        for state in [
            DocumentTaskState::Completed,
            DocumentTaskState::Failed,
            DocumentTaskState::Canceled,
            DocumentTaskState::Rejected,
        ] {
            assert!(state.terminal());
            assert!(!state.permits_transition(DocumentTaskState::Working));
            assert!(!state.permits_transition(DocumentTaskState::Completed));
        }
        assert!(DocumentTaskState::InputRequired.permits_transition(DocumentTaskState::Working));
        assert!(!DocumentTaskState::Submitted.permits_transition(DocumentTaskState::Completed));
    }

    #[test]
    fn engine_digest_and_rendered_manifest_survive_host_validation() {
        let snapshot = snapshot();
        let claims = resolve_candidates(
            &snapshot,
            CandidateDocument {
                claims: vec![candidate()],
            },
        )
        .unwrap()
        .claims;
        let package = TemplatePackage::new(
            "synthetic",
            BTreeMap::from([("root.md.j2".into(), "{{ claim(1) }}\n{{ claim(1) }}".into())]),
        );
        let kind = DocumentKind {
            key: "pa.initial_request".into(),
            version: 1,
            class: DocumentClass::ClinicalCorrespondence,
            template_package: "synthetic".into(),
            root: "root.md.j2".into(),
            qa_checks: clinical_docs::SCHEMA_QA_CHECKS.to_vec(),
            outputs: vec![],
        };
        let request = AssemblyRequest {
            kind: kind.key.clone(),
            expected_package_digest: package.digest(),
            claims,
            required_criteria: snapshot.required_criteria,
            evidence: snapshot.evidence,
            context: snapshot.context,
            checks: snapshot.checks,
        };
        let assembly = clinical_docs::assemble(&AssemblyInput {
            kind: &kind,
            package: &package,
            claims: &request.claims,
            required_criteria: &request.required_criteria,
            evidence: &request.evidence,
            context: request.context.clone(),
            checks: request.checks.clone(),
        })
        .unwrap();
        assert_eq!(
            assembly.rendered_claims.len(),
            1,
            "persist one entry even when a claim renders twice"
        );
        let bytes = validate_assembly(&request, &assembly).unwrap();
        assert_eq!(bytes.len(), 32);
        for tamper in ["body", "package", "claim", "qa"] {
            let mut invalid = assembly.clone();
            match tamper {
                "body" => invalid.canonical_markdown.push_str("unsourced extra text"),
                "package" => invalid.template_digest = "sha256:unapproved".into(),
                "claim" => invalid.rendered_claims[0].text = "invented claim".into(),
                _ => {
                    invalid.qa.pop();
                }
            }
            assert_eq!(
                validate_assembly(&request, &invalid),
                Err(GenerationError::InvalidAssembly),
                "{tamper}"
            );
        }
    }
}
