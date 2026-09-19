//! Attributed clinical annotations shared by every shell.
//!
//! The verified session supplies authorship. Transport input carries the
//! clinical opinion and its source target, never an actor or practice.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{AppServices, affirmation::ClinicalContext, session::Principal};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnnotationDisposition {
    Included,
    Held,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnnotationMutation {
    pub command_id: Uuid,
    pub annotation_id: Uuid,
    pub annotation_type_id: Uuid,
    pub name: String,
    pub data: Option<Value>,
    pub body: String,
    pub target_evidence_id: Option<Uuid>,
    pub target_document_id: Option<Uuid>,
    pub disposition: AnnotationDisposition,
    pub expected_revision: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AnnotationCommand {
    pub command_id: Uuid,
    pub annotation_id: Uuid,
    pub case_id: Uuid,
    pub annotation_type_id: Uuid,
    pub name: String,
    pub data: Option<Value>,
    pub body: String,
    pub target_evidence_id: Option<Uuid>,
    pub target_document_id: Option<Uuid>,
    pub disposition: AnnotationDisposition,
    pub expected_revision: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationResult {
    pub command_id: Uuid,
    pub annotation_id: Uuid,
    pub case_id: Uuid,
    pub annotation_type_id: Uuid,
    pub name: String,
    pub data: Option<Value>,
    pub body: String,
    pub author_id: Uuid,
    pub author_label: String,
    pub provenance: String,
    pub target_evidence_id: Option<Uuid>,
    pub target_document_id: Option<Uuid>,
    pub disposition: AnnotationDisposition,
    pub expected_revision: i64,
    pub revision: i64,
    pub committed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum AnnotationError {
    #[error("authentication required")]
    Unauthenticated,
    #[error("annotation denied")]
    Denied,
    #[error("annotation or command not found")]
    NotFound,
    #[error("annotation changed after it was reviewed")]
    RevisionConflict,
    #[error("command identifier already has a different payload")]
    CommandConflict,
    #[error("annotation request is invalid")]
    Invalid,
    #[error("annotation service unavailable")]
    Unavailable,
    #[error("native authentication unavailable")]
    NativeAuthenticationUnavailable,
}

impl AppServices {
    fn check_annotation_context(&self, context: &ClinicalContext) -> Result<(), AnnotationError> {
        if context.expires_at <= self.clock.now() {
            return Err(AnnotationError::Unauthenticated);
        }
        if context.principal != Principal::User {
            return Err(AnnotationError::Denied);
        }
        Ok(())
    }

    fn annotation_command_matches(command: &AnnotationCommand, result: &AnnotationResult) -> bool {
        result.command_id == command.command_id
            && result.annotation_id == command.annotation_id
            && result.case_id == command.case_id
            && result.annotation_type_id == command.annotation_type_id
            && result.name == command.name
            && result.data == command.data
            && result.body == command.body
            && result.target_evidence_id == command.target_evidence_id
            && result.target_document_id == command.target_document_id
            && result.disposition == command.disposition
            && result.expected_revision == command.expected_revision
    }

    /// Read-only resource check used by the independent Gate policy callback.
    /// The clinical command repeats authority checks before writing.
    pub async fn read_annotation_target(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        annotation_id: Uuid,
    ) -> Result<(), AnnotationError> {
        self.check_annotation_context(context)?;
        self.evidence
            .read_annotation_target(context, case_id, annotation_id)
            .await
    }

    pub async fn execute_annotation(
        &self,
        context: &ClinicalContext,
        command: &AnnotationCommand,
    ) -> Result<AnnotationResult, AnnotationError> {
        self.check_annotation_context(context)?;
        if command.name.trim().is_empty()
            || command.body.trim().is_empty()
            || command.expected_revision < 0
            || command.target_evidence_id.is_some() && command.target_document_id.is_some()
        {
            return Err(AnnotationError::Invalid);
        }
        if let Some(original) = self
            .evidence
            .lookup_annotation_command(context, command.command_id)
            .await?
        {
            if !Self::annotation_command_matches(command, &original) {
                return Err(AnnotationError::CommandConflict);
            }
            if !self
                .authority
                .may_annotate(context, original.case_id, original.annotation_id)
                .await?
            {
                return Err(AnnotationError::Denied);
            }
            return Ok(original);
        }
        if !self
            .authority
            .may_annotate(context, command.case_id, command.annotation_id)
            .await?
        {
            return Err(AnnotationError::Denied);
        }
        self.check_annotation_context(context)?;
        self.evidence.execute_annotation(context, command).await
    }

    pub async fn lookup_annotation_command(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        annotation_id: Uuid,
        command_id: Uuid,
    ) -> Result<Option<AnnotationResult>, AnnotationError> {
        self.check_annotation_context(context)?;
        if !self
            .authority
            .may_annotate(context, case_id, annotation_id)
            .await?
        {
            return Err(AnnotationError::Denied);
        }
        Ok(self
            .evidence
            .lookup_annotation_command(context, command_id)
            .await?
            .filter(|result| result.case_id == case_id && result.annotation_id == annotation_id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        domain::{
            ActorId, CaseId, CriterionId, DomainError, GateAffirmationKind, GateState, Letter,
            LetterId, PracticeId,
        },
        ports::{
            AuthorityPort, CaseRepository, Clock, CriteriaRepository, Criterion, EvidenceCounts,
            EvidenceRepository, LetterRepository,
        },
        session::UnavailableSessions,
    };
    use async_trait::async_trait;
    use std::sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    };

    fn id(value: u128) -> Uuid {
        Uuid::from_u128(value)
    }

    fn now() -> DateTime<Utc> {
        "2026-09-15T12:00:00Z".parse().unwrap()
    }

    fn context(principal: Principal) -> ClinicalContext {
        ClinicalContext {
            identity_id: id(1),
            actor: ActorId(id(2)),
            practice: PracticeId(id(3)),
            principal,
            expires_at: now() + chrono::Duration::hours(1),
        }
    }

    fn command() -> AnnotationCommand {
        AnnotationCommand {
            command_id: id(4),
            annotation_id: id(5),
            case_id: id(6),
            annotation_type_id: id(7),
            name: "Clinical judgment".into(),
            data: None,
            body: "Synthetic attributed opinion.".into(),
            target_evidence_id: Some(id(8)),
            target_document_id: None,
            disposition: AnnotationDisposition::Held,
            expected_revision: 0,
        }
    }

    fn result() -> AnnotationResult {
        let command = command();
        AnnotationResult {
            command_id: command.command_id,
            annotation_id: command.annotation_id,
            case_id: command.case_id,
            annotation_type_id: command.annotation_type_id,
            name: command.name,
            data: command.data,
            body: command.body,
            author_id: id(2),
            author_label: "Synthetic Surgeon".into(),
            provenance: "surgeon".into(),
            target_evidence_id: command.target_evidence_id,
            target_document_id: command.target_document_id,
            disposition: command.disposition,
            expected_revision: command.expected_revision,
            revision: 1,
            committed_at: now(),
        }
    }

    struct FixedClock;
    impl Clock for FixedClock {
        fn now(&self) -> DateTime<Utc> {
            now()
        }
    }

    struct AnnotationPorts {
        allowed: AtomicBool,
        reads: AtomicUsize,
        writes: AtomicUsize,
        stored: Mutex<Option<AnnotationResult>>,
    }

    #[async_trait]
    impl EvidenceRepository for AnnotationPorts {
        async fn read_annotation_target(
            &self,
            _: &ClinicalContext,
            _: Uuid,
            _: Uuid,
        ) -> Result<(), AnnotationError> {
            self.reads.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }

        async fn execute_annotation(
            &self,
            _: &ClinicalContext,
            _: &AnnotationCommand,
        ) -> Result<AnnotationResult, AnnotationError> {
            self.writes.fetch_add(1, Ordering::SeqCst);
            Ok(result())
        }

        async fn lookup_annotation_command(
            &self,
            _: &ClinicalContext,
            _: Uuid,
        ) -> Result<Option<AnnotationResult>, AnnotationError> {
            Ok(self.stored.lock().unwrap().clone())
        }

        async fn counts(&self, _: CaseId) -> Result<EvidenceCounts, DomainError> {
            panic!("counts")
        }
    }

    #[async_trait]
    impl AuthorityPort for AnnotationPorts {
        async fn may_annotate(
            &self,
            _: &ClinicalContext,
            _: Uuid,
            _: Uuid,
        ) -> Result<bool, AnnotationError> {
            Ok(self.allowed.load(Ordering::SeqCst))
        }

        async fn holds(
            &self,
            _: ActorId,
            _: crate::domain::Capability,
        ) -> Result<bool, DomainError> {
            panic!("legacy authority")
        }
    }

    struct Unused;
    #[async_trait]
    impl CaseRepository for Unused {
        async fn gate_state(&self, _: CaseId) -> Result<GateState, DomainError> {
            panic!("gate")
        }
        async fn record_affirmation(
            &self,
            _: CaseId,
            _: GateAffirmationKind,
            _: ActorId,
            _: DateTime<Utc>,
        ) -> Result<GateState, DomainError> {
            panic!("affirm")
        }
    }
    #[async_trait]
    impl CriteriaRepository for Unused {
        async fn get(&self, _: CriterionId) -> Result<Criterion, DomainError> {
            panic!("criterion")
        }
        async fn live_for_payer(&self, _: &str) -> Result<Vec<Criterion>, DomainError> {
            panic!("payer")
        }
    }
    #[async_trait]
    impl LetterRepository for Unused {
        async fn get(&self, _: LetterId) -> Result<Letter, DomainError> {
            panic!("letter")
        }
        async fn unresolved_non_policy_retrievals(
            &self,
            _: LetterId,
        ) -> Result<Vec<CriterionId>, DomainError> {
            panic!("retrieval")
        }
        async fn sign(
            &self,
            _: LetterId,
            _: ActorId,
            _: DateTime<Utc>,
        ) -> Result<Letter, DomainError> {
            panic!("sign")
        }
    }

    fn services(ports: Arc<AnnotationPorts>) -> AppServices {
        AppServices {
            cases: Arc::new(Unused),
            evidence: ports.clone(),
            criteria: Arc::new(Unused),
            letters: Arc::new(Unused),
            authority: ports,
            clock: Arc::new(FixedClock),
            sessions: Arc::new(UnavailableSessions),
        }
    }

    #[tokio::test]
    async fn authorized_command_preserves_attribution_source_and_disposition() {
        let ports = Arc::new(AnnotationPorts {
            allowed: AtomicBool::new(true),
            reads: AtomicUsize::new(0),
            writes: AtomicUsize::new(0),
            stored: Mutex::new(None),
        });
        let saved = services(ports.clone())
            .execute_annotation(&context(Principal::User), &command())
            .await
            .unwrap();

        assert_eq!(saved.author_id, id(2));
        assert_eq!(saved.author_label, "Synthetic Surgeon");
        assert_eq!(saved.provenance, "surgeon");
        assert_eq!(saved.target_evidence_id, Some(id(8)));
        assert_eq!(saved.disposition, AnnotationDisposition::Held);
        assert_eq!(ports.writes.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn gateway_target_check_is_read_only() {
        let ports = Arc::new(AnnotationPorts {
            allowed: AtomicBool::new(true),
            reads: AtomicUsize::new(0),
            writes: AtomicUsize::new(0),
            stored: Mutex::new(None),
        });

        services(ports.clone())
            .read_annotation_target(&context(Principal::User), id(6), id(5))
            .await
            .unwrap();

        assert_eq!(ports.reads.load(Ordering::SeqCst), 1);
        assert_eq!(ports.writes.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn nonhuman_and_changed_retry_never_write() {
        let ports = Arc::new(AnnotationPorts {
            allowed: AtomicBool::new(true),
            reads: AtomicUsize::new(0),
            writes: AtomicUsize::new(0),
            stored: Mutex::new(Some(result())),
        });
        let app = services(ports.clone());
        assert_eq!(
            app.execute_annotation(&context(Principal::Agent), &command())
                .await,
            Err(AnnotationError::Denied)
        );
        let mut changed = command();
        changed.body = "Changed retry".into();
        assert_eq!(
            app.execute_annotation(&context(Principal::User), &changed)
                .await,
            Err(AnnotationError::CommandConflict)
        );
        assert_eq!(ports.writes.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn transport_refuses_caller_selected_authorship() {
        let value = serde_json::json!({
            "commandId": id(4),
            "annotationId": id(5),
            "annotationTypeId": id(7),
            "name": "Clinical judgment",
            "data": null,
            "body": "Synthetic attributed opinion.",
            "targetEvidenceId": id(8),
            "targetDocumentId": null,
            "disposition": "held",
            "expectedRevision": 0,
            "authorId": id(99)
        });

        assert!(serde_json::from_value::<AnnotationMutation>(value).is_err());
    }
}
