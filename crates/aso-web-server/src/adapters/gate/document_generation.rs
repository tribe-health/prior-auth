//! Durable generation effects under the same restricted clinical SQL role.
//! Network work holds no transaction. Credentials live only in authorization.
use super::PgGateRepository;
use aso_host::{
    affirmation::ClinicalContext,
    document_generation::{
        DocumentAssembler, DocumentInference, DocumentTask, DocumentTaskArtifacts,
        DocumentTaskEvent, DocumentTaskState, DurableDocumentTasks, GenerationAuthorization,
        GenerationError, GenerationPolicy, GenerationProgress, GenerationSnapshot,
        compose_document,
    },
    letter_workflow::GenerateLetterCommand,
};
use async_trait::async_trait;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use uuid::Uuid;

pub(super) struct Runtime {
    inference: Arc<dyn DocumentInference>,
    assembler: Arc<dyn DocumentAssembler>,
    policy: GenerationPolicy,
    running: Mutex<HashSet<Uuid>>,
}

impl PgGateRepository {
    pub fn with_document_generation(
        mut self,
        inference: Arc<dyn DocumentInference>,
        assembler: Arc<dyn DocumentAssembler>,
        policy: GenerationPolicy,
    ) -> Self {
        self.document_generation = Some(Arc::new(Runtime {
            inference,
            assembler,
            policy,
            running: Mutex::new(HashSet::new()),
        }));
        self
    }

    async fn task_query<T: DeserializeOwned>(
        &self,
        context: &ClinicalContext,
        sql: &'static str,
        task_id: Uuid,
    ) -> Result<T, GenerationError> {
        let mut tx = self.begin_case(context).await.map_err(case_error)?;
        let value: Value = sqlx::query_scalar(sql)
            .bind(task_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(database_error)?;
        let result = decode(value)?;
        tx.commit().await.map_err(database_error)?;
        Ok(result)
    }

    async fn task_event(
        &self,
        context: &ClinicalContext,
        task_id: Uuid,
        event_type: &str,
        payload: Value,
        stage: &str,
    ) -> Result<DocumentTask, GenerationError> {
        let mut tx = self.begin_case(context).await.map_err(case_error)?;
        let value: Value = sqlx::query_scalar("SELECT aso.append_document_task_event($1,$2,$3,$4)")
            .bind(task_id)
            .bind(event_type)
            .bind(payload)
            .bind(stage)
            .fetch_one(&mut *tx)
            .await
            .map_err(database_error)?;
        let task = decode(value)?;
        tx.commit().await.map_err(database_error)?;
        Ok(task)
    }

    async fn task_transition(
        &self,
        context: &ClinicalContext,
        task_id: Uuid,
        state: &str,
        error: Option<&str>,
    ) -> Result<DocumentTask, GenerationError> {
        let mut tx = self.begin_case(context).await.map_err(case_error)?;
        let value: Value = sqlx::query_scalar("SELECT aso.transition_document_task($1,$2,$3)")
            .bind(task_id)
            .bind(state)
            .bind(error)
            .fetch_one(&mut *tx)
            .await
            .map_err(database_error)?;
        let task = decode(value)?;
        tx.commit().await.map_err(database_error)?;
        Ok(task)
    }

    fn launch(
        &self,
        context: &ClinicalContext,
        task: &DocumentTask,
        authorization: Arc<dyn GenerationAuthorization>,
    ) -> Result<(), GenerationError> {
        if task.state.terminal() {
            return Ok(());
        }
        let runtime = self
            .document_generation
            .clone()
            .ok_or(GenerationError::Unavailable)?;
        if !runtime
            .running
            .lock()
            .map_err(|_| GenerationError::Unavailable)?
            .insert(task.id)
        {
            return Ok(());
        }
        let running = RunningTask {
            runtime: runtime.clone(),
            id: task.id,
        };
        let repository = self.clone();
        let context = ClinicalContext {
            identity_id: context.identity_id,
            actor: context.actor,
            practice: context.practice,
            principal: context.principal,
            expires_at: context.expires_at,
        };
        let task = task.clone();
        tokio::spawn(async move {
            let _running = running;
            let progress = Progress {
                repository: &repository,
                context: &context,
                task_id: task.id,
                authorization,
                stage: tokio::sync::Mutex::new(None),
                assembly_validated: AtomicBool::new(false),
            };
            if let Err(error) = repository
                .execute_task(&context, &task, &runtime, &progress)
                .await
            {
                // A revoked caller cannot mutate the task. Keep it recoverable by a
                // fresh authorized resume; never acquire migration privileges here.
                let (state, code) = failure_state(error);
                let _ = repository
                    .task_event(
                        &context,
                        task.id,
                        "RUN_ERROR",
                        json!({"type":"RUN_ERROR","code":code,"message":error.to_string()}),
                        "halted",
                    )
                    .await;
                let _ = repository
                    .task_transition(&context, task.id, state, Some(code))
                    .await;
            }
        });
        Ok(())
    }

    async fn execute_task(
        &self,
        context: &ClinicalContext,
        task: &DocumentTask,
        runtime: &Runtime,
        progress: &Progress<'_>,
    ) -> Result<(), GenerationError> {
        progress.pulse().await?;
        if task.state != DocumentTaskState::Working {
            self.task_transition(context, task.id, "working", None)
                .await?;
        }
        let snapshot: GenerationSnapshot = self
            .task_query(context, "SELECT aso.read_document_task_input($1)", task.id)
            .await?;
        progress.checkpoint("retrieval").await?;
        // The pulse also covers assemblers/tools that do not emit progress. Dropping
        // the generation future on cancellation closes its in-flight HTTP request.
        let work = compose_document(
            &snapshot,
            &runtime.policy,
            runtime.inference.as_ref(),
            runtime.assembler.as_ref(),
            progress,
        );
        tokio::pin!(work);
        let document = loop {
            tokio::select! {
                result = &mut work => break result?,
                _ = tokio::time::sleep(Duration::from_millis(500)) => progress.pulse().await?,
            }
        };
        // Only the fully source-validated assembly is eligible for provisional UI.
        progress.assembly_validated.store(true, Ordering::Release);
        let message_id = task.id.to_string();
        self.task_event(
            context,
            task.id,
            "TEXT_MESSAGE_START",
            json!({
                "type":"TEXT_MESSAGE_START","messageId":message_id,"role":"assistant"
            }),
            "persistence",
        )
        .await?;
        for chunk in document
            .assembly
            .canonical_markdown
            .chars()
            .collect::<Vec<_>>()
            .chunks(4096)
        {
            progress
                .provisional_text(&chunk.iter().collect::<String>())
                .await?;
        }
        self.task_event(
            context,
            task.id,
            "TEXT_MESSAGE_END",
            json!({
                "type":"TEXT_MESSAGE_END","messageId":message_id
            }),
            "persistence",
        )
        .await?;
        let assembly = &document.assembly;
        let mut surfaces = vec![
            json!({"surface":"DraftPreviewBlock","schema":"aso.draft_preview.v1","slot":"main","props":{
                "kindKey":assembly.kind_key,"kindVersion":assembly.kind_version,"class":"clinical_correspondence",
                "contentSha256":assembly.content_sha256,"templateDigest":assembly.template_digest,
                "canonicalMarkdown":assembly.canonical_markdown,"approvable":assembly.approvable()
            }}),
            json!({"surface":"QaFindingsBlock","schema":"aso.qa_findings.v1","slot":"side","props":{"findings":assembly.qa}}),
            json!({"surface":"ClaimsManifestBlock","schema":"aso.claims_manifest.v1","slot":"side","props":{"claims":assembly.rendered_claims}}),
        ];
        if !assembly.approvable() {
            let blocking: Vec<_> = assembly
                .qa
                .iter()
                .filter(|finding| finding.is_blocking_failure())
                .collect();
            let routing: Vec<_> = snapshot
                .evidence
                .iter()
                .filter_map(|(criterion, state)| {
                    state
                        .routes_to()
                        .map(|route| json!({"criterion":criterion,"state":state,"routesTo":route}))
                })
                .collect();
            surfaces.push(
                json!({"surface":"HaltMemoBlock","schema":"aso.halt_memo.v1","slot":"main",
                "props":{"blocking":blocking,"routing":routing}}),
            );
        }
        for surface in surfaces {
            progress.pulse().await?;
            self.task_event(
                context,
                task.id,
                "CUSTOM",
                json!({"type":"CUSTOM","name":"a2ui.surface","value":surface}),
                "persistence",
            )
            .await?;
        }
        progress.pulse().await?;
        let mut tx = self.begin_case(context).await.map_err(case_error)?;
        let _: Value = sqlx::query_scalar("SELECT aso.commit_document_generation($1,$2)")
            .bind(task.id)
            .bind(
                serde_json::to_value(&document.assembly)
                    .map_err(|_| GenerationError::InvalidAssembly)?,
            )
            .fetch_one(&mut *tx)
            .await
            .map_err(database_error)?;
        tx.commit().await.map_err(database_error)?;
        Ok(())
    }
}

struct RunningTask {
    runtime: Arc<Runtime>,
    id: Uuid,
}
impl Drop for RunningTask {
    fn drop(&mut self) {
        if let Ok(mut running) = self.runtime.running.lock() {
            running.remove(&self.id);
        }
    }
}

struct Progress<'a> {
    repository: &'a PgGateRepository,
    context: &'a ClinicalContext,
    task_id: Uuid,
    authorization: Arc<dyn GenerationAuthorization>,
    stage: tokio::sync::Mutex<Option<String>>,
    assembly_validated: AtomicBool,
}
impl Progress<'_> {
    async fn pulse(&self) -> Result<(), GenerationError> {
        self.authorization.revalidate().await?;
        match self
            .repository
            .read(self.context, self.task_id)
            .await?
            .state
        {
            DocumentTaskState::Canceled => Err(GenerationError::Canceled),
            DocumentTaskState::Failed
            | DocumentTaskState::Rejected
            | DocumentTaskState::Completed => Err(GenerationError::Stale),
            _ => Ok(()),
        }
    }
}
#[async_trait]
impl GenerationProgress for Progress<'_> {
    async fn checkpoint(&self, phase: &str) -> Result<(), GenerationError> {
        self.pulse().await?;
        let mut stage = self.stage.lock().await;
        if stage.as_deref() == Some(phase) {
            return Ok(());
        }
        if let Some(previous) = stage.as_ref() {
            self.repository
                .task_event(
                    self.context,
                    self.task_id,
                    "STEP_FINISHED",
                    json!({"type":"STEP_FINISHED","stepName":previous}),
                    phase,
                )
                .await?;
        }
        self.repository
            .task_event(
                self.context,
                self.task_id,
                "STEP_STARTED",
                json!({"type":"STEP_STARTED","stepName":phase}),
                phase,
            )
            .await?;
        *stage = Some(phase.to_owned());
        Ok(())
    }
    async fn provisional_text(&self, delta: &str) -> Result<(), GenerationError> {
        if !self.assembly_validated.load(Ordering::Acquire) {
            return Err(GenerationError::InvalidAssembly);
        }
        self.pulse().await?;
        self.repository.task_event(self.context, self.task_id, "TEXT_MESSAGE_CONTENT",
            json!({"type":"TEXT_MESSAGE_CONTENT","messageId":self.task_id.to_string(),"delta":delta}),
            "persistence").await?;
        Ok(())
    }
}

#[async_trait]
impl DurableDocumentTasks for PgGateRepository {
    async fn start(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        command: &GenerateLetterCommand,
        authorization: Arc<dyn GenerationAuthorization>,
    ) -> Result<DocumentTask, GenerationError> {
        if self.document_generation.is_none() {
            return Err(GenerationError::Unavailable);
        }
        authorization.revalidate().await?;
        let mut tx = self.begin_case(context).await.map_err(case_error)?;
        let purpose = serde_json::to_value(&command.purpose)
            .map_err(|_| GenerationError::InvalidCandidate)?;
        let value: Value = sqlx::query_scalar("SELECT aso.start_document_task($1,$2,$3,$4,$5,$6)")
            .bind(command.command_id)
            .bind(case_id)
            .bind(&command.expected_revisions.resolution_revision)
            .bind(&command.expected_revisions.criteria_selection_revision)
            .bind(&command.expected_revisions.evidence_revision)
            .bind(purpose.as_str().ok_or(GenerationError::InvalidCandidate)?)
            .fetch_one(&mut *tx)
            .await
            .map_err(database_error)?;
        let task = decode(value)?;
        tx.commit().await.map_err(database_error)?;
        self.launch(context, &task, authorization)?;
        Ok(task)
    }
    async fn read(
        &self,
        context: &ClinicalContext,
        task_id: Uuid,
    ) -> Result<DocumentTask, GenerationError> {
        self.task_query(context, "SELECT aso.read_document_task($1)", task_id)
            .await
    }
    async fn resume(
        &self,
        context: &ClinicalContext,
        task_id: Uuid,
        authorization: Arc<dyn GenerationAuthorization>,
    ) -> Result<DocumentTask, GenerationError> {
        authorization.revalidate().await?;
        let task = self.read(context, task_id).await?;
        self.launch(context, &task, authorization)?;
        Ok(task)
    }
    async fn letter_artifacts(
        &self,
        context: &ClinicalContext,
        letter_id: Uuid,
    ) -> Result<Option<DocumentTaskArtifacts>, GenerationError> {
        self.task_query(context, "SELECT aso.read_letter_assembly($1)", letter_id)
            .await
    }
    async fn artifacts(
        &self,
        context: &ClinicalContext,
        task_id: Uuid,
    ) -> Result<DocumentTaskArtifacts, GenerationError> {
        self.task_query(
            context,
            "SELECT aso.read_document_task_artifacts($1)",
            task_id,
        )
        .await
    }
    async fn cancel(
        &self,
        context: &ClinicalContext,
        task_id: Uuid,
    ) -> Result<DocumentTask, GenerationError> {
        self.task_query(context, "SELECT aso.cancel_document_task($1)", task_id)
            .await
    }
    async fn events(
        &self,
        context: &ClinicalContext,
        task_id: Uuid,
        after_sequence: i64,
    ) -> Result<Vec<DocumentTaskEvent>, GenerationError> {
        if after_sequence < 0 {
            return Err(GenerationError::InvalidCandidate);
        }
        let mut tx = self.begin_case(context).await.map_err(case_error)?;
        let value: Value = sqlx::query_scalar("SELECT aso.read_document_task_events($1,$2)")
            .bind(task_id)
            .bind(after_sequence)
            .fetch_one(&mut *tx)
            .await
            .map_err(database_error)?;
        let events = decode(value)?;
        tx.commit().await.map_err(database_error)?;
        Ok(events)
    }
}

fn decode<T: DeserializeOwned>(value: Value) -> Result<T, GenerationError> {
    T::deserialize(value).map_err(|_| GenerationError::Unavailable)
}
fn case_error(error: aso_host::case_management::CaseError) -> GenerationError {
    use aso_host::case_management::CaseError;
    match error {
        CaseError::Unauthenticated | CaseError::Denied | CaseError::NotFound => {
            GenerationError::Denied
        }
        CaseError::RevisionConflict | CaseError::CommandConflict => GenerationError::Stale,
        _ => GenerationError::Unavailable,
    }
}
fn database_error(error: sqlx::Error) -> GenerationError {
    match error
        .as_database_error()
        .and_then(|error| error.code())
        .as_deref()
    {
        Some("42501" | "P0002") => GenerationError::Denied,
        Some("40001" | "23505" | "55000") => GenerationError::Stale,
        Some("22023" | "23514") => GenerationError::InvalidAssembly,
        _ => GenerationError::Unavailable,
    }
}
fn failure_state(error: GenerationError) -> (&'static str, &'static str) {
    match error {
        GenerationError::Canceled => ("canceled", "canceled"),
        GenerationError::Denied => ("auth-required", "authority_revoked"),
        GenerationError::Stale => ("input-required", "stale_input"),
        GenerationError::ProviderNotQualified => ("rejected", "provider_not_qualified"),
        GenerationError::InvalidCandidate => ("failed", "invalid_candidate"),
        GenerationError::InvalidCitation => ("failed", "invalid_citation"),
        GenerationError::InvalidAssembly => ("failed", "invalid_assembly"),
        GenerationError::Unavailable => ("failed", "unavailable"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aso_host::{
        domain::{ActorId, PracticeId},
        session::Principal,
    };

    #[tokio::test]
    #[ignore = "requires migrated local synthetic demo and restricted runtime credentials"]
    async fn postgres_snapshot_decodes_host_contract() {
        let runtime_url =
            std::env::var("ASO_TEST_GENERATION_DATABASE_URL").expect("runtime fixture URL");
        let admin_url =
            std::env::var("ASO_TEST_GENERATION_ADMIN_DATABASE_URL").expect("admin fixture URL");
        let admin = sqlx::postgres::PgPoolOptions::new()
            .max_connections(1)
            .connect(&admin_url)
            .await
            .expect("fixture inspection connection");
        let case_id = Uuid::parse_str("10000000-0000-4000-8000-000000000005").unwrap();
        let actor_id = Uuid::parse_str("10000000-0000-4000-8000-000000000002").unwrap();
        let practice_id = Uuid::parse_str("10000000-0000-4000-8000-000000000001").unwrap();
        let (identity_id, resolution, selection, evidence): (Uuid, i64, i64, i64) = sqlx::query_as(
            "SELECT u.kratos_identity_id,c.resolution_revision,c.criteria_selection_revision,c.evidence_revision
             FROM aso.users u JOIN aso.cases c ON c.practice_id=u.practice_id
             JOIN aso.practices p ON p.id=c.practice_id WHERE u.id=$1 AND c.id=$2 AND p.key='aso-demo'")
            .bind(actor_id).bind(case_id).fetch_one(&admin).await.expect("synthetic fixture revisions");
        let repository = PgGateRepository::connect(&runtime_url)
            .await
            .expect("restricted repository");
        let context = ClinicalContext {
            identity_id,
            actor: ActorId(actor_id),
            practice: PracticeId(practice_id),
            principal: Principal::User,
            expires_at: chrono::Utc::now() + chrono::Duration::minutes(5),
        };
        let mut tx = repository
            .begin_case(&context)
            .await
            .expect("restricted task transaction");
        let value: Value = sqlx::query_scalar("SELECT aso.start_document_task($1,$2,$3,$4,$5,$6)")
            .bind(Uuid::new_v4())
            .bind(case_id)
            .bind(format!("{case_id}:resolutionRevision:r{resolution}"))
            .bind(format!("{case_id}:criteriaSelectionRevision:r{selection}"))
            .bind(format!("{case_id}:evidenceRevision:r{evidence}"))
            .bind("prior_authorization_request")
            .fetch_one(&mut *tx)
            .await
            .expect("start scoped task");
        let task: DocumentTask = serde_json::from_value(value).expect("DocumentTask wire contract");
        let value: Value = sqlx::query_scalar("SELECT aso.read_document_task_input($1)")
            .bind(task.id)
            .fetch_one(&mut *tx)
            .await
            .expect("read scoped task snapshot");
        let snapshot: GenerationSnapshot =
            serde_json::from_value(value).expect("GenerationSnapshot wire contract");
        assert_eq!(snapshot.case_id, case_id);
        assert_eq!(snapshot.practice_id, practice_id);
        assert_eq!(snapshot.snapshot_token.len(), 64);
        assert!(!snapshot.required_criteria.is_empty());
        assert!(
            snapshot
                .required_criteria
                .iter()
                .all(|criterion| snapshot.evidence.contains_key(criterion))
        );
        assert!(snapshot.sources.iter().all(|source| source.page > 0
            && source.document_version > 0
            && source.content_sha256.len() == 64
            && !source.text.is_empty()));
        tx.rollback().await.expect("fixture task rollback");
        admin.close().await;
    }
}
