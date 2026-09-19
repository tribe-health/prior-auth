//! Verified case intake and lifecycle commands shared by every shell.
//!
//! Actor, principal, and practice authority come from [`ClinicalContext`].
//! Command payloads contain only case data and optimistic revision tokens.

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{AppServices, affirmation::ClinicalContext, session::Principal};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CaseStatus {
    Intake,
    Evidence,
    PolicyReview,
    AwaitingGate,
    Drafting,
    Ready,
    Submitted,
    Approved,
    Denied,
    PeerReview,
    DenialReview,
    ResponseDrafting,
    ResponseReady,
    Resubmitted,
    Appealed,
    Withdrawn,
}

impl CaseStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Intake => "intake",
            Self::Evidence => "evidence",
            Self::PolicyReview => "policy_review",
            Self::AwaitingGate => "awaiting_gate",
            Self::Drafting => "drafting",
            Self::Ready => "ready",
            Self::Submitted => "submitted",
            Self::Approved => "approved",
            Self::Denied => "denied",
            Self::PeerReview => "peer_review",
            Self::DenialReview => "denial_review",
            Self::ResponseDrafting => "response_drafting",
            Self::ResponseReady => "response_ready",
            Self::Resubmitted => "resubmitted",
            Self::Appealed => "appealed",
            Self::Withdrawn => "withdrawn",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CaseAction {
    Create,
    Update,
    Transition,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CaseInput {
    pub case_number: String,
    pub patient_id: Uuid,
    pub surgeon_id: Uuid,
    pub coordinator_id: Option<Uuid>,
    pub facility_id: Option<Uuid>,
    pub payer_id: Uuid,
    pub member_id: Option<String>,
    pub date_of_service: Option<NaiveDate>,
    pub procedure_code: Option<String>,
    pub plan_key: Option<String>,
    pub data: Value,
}

impl CaseInput {
    fn is_valid(&self) -> bool {
        !self.case_number.trim().is_empty() && self.data.is_object()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseRecord {
    pub id: Uuid,
    pub practice_id: Uuid,
    pub patient_id: Uuid,
    pub surgeon_id: Uuid,
    pub coordinator_id: Option<Uuid>,
    pub facility_id: Option<Uuid>,
    pub payer_id: Uuid,
    pub case_number: String,
    pub status: CaseStatus,
    pub member_id: Option<String>,
    pub date_of_service: Option<NaiveDate>,
    pub procedure_code: Option<String>,
    pub plan_key: Option<String>,
    pub data: Value,
    pub gate_affirmed_at: Option<DateTime<Utc>>,
    pub gate_affirmed_by: Option<Uuid>,
    pub revision: i64,
    pub case_input_revision: i64,
    pub status_revision: i64,
    pub document_set_revision: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CaseCommandResult {
    pub command_id: Uuid,
    pub action: CaseAction,
    pub case_id: Uuid,
    pub committed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateCaseCommand {
    pub command_id: Uuid,
    pub case_id: Uuid,
    pub input: CaseInput,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateCaseCommand {
    pub command_id: Uuid,
    pub case_id: Uuid,
    pub expected_revision: i64,
    pub input: CaseInput,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TransitionCaseCommand {
    pub command_id: Uuid,
    pub case_id: Uuid,
    pub expected_status_revision: i64,
    pub target_status: CaseStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum CaseError {
    #[error("authentication required")]
    Unauthenticated,
    #[error("case access denied")]
    Denied,
    #[error("case or command not found")]
    NotFound,
    #[error("case changed after it was loaded")]
    RevisionConflict,
    #[error("case lifecycle transition is invalid")]
    InvalidTransition,
    #[error("command identifier already has a different payload")]
    CommandConflict,
    #[error("case request is invalid")]
    Invalid,
    #[error("case service unavailable")]
    Unavailable,
}

impl AppServices {
    fn check_case_context(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        required_capability: &str,
    ) -> Result<(), CaseError> {
        if context.expires_at <= self.clock.now() {
            return Err(CaseError::Unauthenticated);
        }
        if context.principal != Principal::User {
            return Err(CaseError::Denied);
        }
        if !capabilities
            .iter()
            .any(|capability| capability == required_capability)
        {
            return Err(CaseError::Denied);
        }
        Ok(())
    }

    pub async fn create_case(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        command: &CreateCaseCommand,
    ) -> Result<CaseCommandResult, CaseError> {
        self.check_case_context(context, capabilities, "case_write")?;
        if !command.input.is_valid() {
            return Err(CaseError::Invalid);
        }
        self.cases.create_case(context, command).await
    }

    pub async fn update_case(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        command: &UpdateCaseCommand,
    ) -> Result<CaseCommandResult, CaseError> {
        self.check_case_context(context, capabilities, "case_write")?;
        if command.expected_revision <= 0 || !command.input.is_valid() {
            return Err(CaseError::Invalid);
        }
        self.cases.update_case(context, command).await
    }

    pub async fn transition_case(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        command: &TransitionCaseCommand,
    ) -> Result<CaseCommandResult, CaseError> {
        self.check_case_context(context, capabilities, "case_write")?;
        if command.expected_status_revision < 0 {
            return Err(CaseError::Invalid);
        }
        self.cases.transition_case(context, command).await
    }

    pub async fn read_case(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        case_id: Uuid,
    ) -> Result<CaseRecord, CaseError> {
        self.check_case_context(context, capabilities, "case:read")?;
        self.cases.read_case(context, case_id).await
    }

    pub async fn authorize_case_write_target(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        case_id: Uuid,
    ) -> Result<(), CaseError> {
        self.check_case_context(context, capabilities, "case_write")?;
        self.cases
            .authorize_case_write_target(context, case_id)
            .await
    }

    pub async fn list_cases(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
    ) -> Result<Vec<CaseRecord>, CaseError> {
        self.check_case_context(context, capabilities, "case:read")?;
        self.cases.list_cases(context).await
    }

    pub async fn lookup_create_case_command(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        command_id: Uuid,
    ) -> Result<Option<CaseCommandResult>, CaseError> {
        self.check_case_context(context, capabilities, "case_write")?;
        self.cases
            .lookup_create_case_command(context, command_id)
            .await
    }

    pub async fn lookup_case_command(
        &self,
        context: &ClinicalContext,
        capabilities: &[String],
        case_id: Uuid,
        command_id: Uuid,
    ) -> Result<Option<CaseCommandResult>, CaseError> {
        self.check_case_context(context, capabilities, "case_write")?;
        self.cases
            .lookup_case_command(context, case_id, command_id)
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        domain::{
            ActorId, Capability, CaseId, CriterionId, DomainError, GateAffirmationKind, GateState,
            Letter, LetterId, PracticeId,
        },
        ports::{
            AuthorityPort, CaseRepository, Clock, CriteriaRepository, Criterion, EvidenceCounts,
            EvidenceRepository, LetterRepository,
        },
        session::UnavailableSessions,
    };
    use async_trait::async_trait;
    use std::{
        collections::HashMap,
        sync::{
            Arc, Mutex,
            atomic::{AtomicUsize, Ordering},
        },
    };

    fn id(value: u128) -> Uuid {
        Uuid::from_u128(value)
    }

    fn now() -> DateTime<Utc> {
        "2026-09-16T12:00:00Z".parse().unwrap()
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

    fn input() -> CaseInput {
        CaseInput {
            case_number: "SYN-WEB01-UNIT".into(),
            patient_id: id(10),
            surgeon_id: id(11),
            coordinator_id: Some(id(12)),
            facility_id: None,
            payer_id: id(13),
            member_id: Some("SYN-MEMBER-001".into()),
            date_of_service: Some("2026-04-15".parse().unwrap()),
            procedure_code: Some("SYN-LUMBAR-001".into()),
            plan_key: Some("synthetic-ppo".into()),
            data: serde_json::json!({}),
        }
    }

    fn record(case_id: Uuid, input: &CaseInput) -> CaseRecord {
        CaseRecord {
            id: case_id,
            practice_id: id(3),
            patient_id: input.patient_id,
            surgeon_id: input.surgeon_id,
            coordinator_id: input.coordinator_id,
            facility_id: input.facility_id,
            payer_id: input.payer_id,
            case_number: input.case_number.trim().into(),
            status: CaseStatus::Intake,
            member_id: input.member_id.clone(),
            date_of_service: input.date_of_service,
            procedure_code: input.procedure_code.clone(),
            plan_key: input.plan_key.clone(),
            data: input.data.clone(),
            gate_affirmed_at: None,
            gate_affirmed_by: None,
            revision: 1,
            case_input_revision: 1,
            status_revision: 0,
            document_set_revision: 0,
            created_at: now(),
            updated_at: None,
        }
    }

    #[derive(Default)]
    struct CaseState {
        case: Option<CaseRecord>,
        commands: HashMap<Uuid, (Value, CaseCommandResult)>,
    }

    #[derive(Default)]
    struct CasePorts {
        state: Mutex<CaseState>,
        writes: AtomicUsize,
    }

    impl CasePorts {
        fn stored(
            state: &CaseState,
            command_id: Uuid,
            payload: &Value,
        ) -> Result<Option<CaseCommandResult>, CaseError> {
            match state.commands.get(&command_id) {
                Some((original, result)) if original == payload => Ok(Some(result.clone())),
                Some(_) => Err(CaseError::CommandConflict),
                None => Ok(None),
            }
        }
    }

    #[async_trait]
    impl CaseRepository for CasePorts {
        async fn create_case(
            &self,
            _: &ClinicalContext,
            command: &CreateCaseCommand,
        ) -> Result<CaseCommandResult, CaseError> {
            let payload = serde_json::to_value(command).unwrap();
            let mut state = self.state.lock().unwrap();
            if let Some(result) = Self::stored(&state, command.command_id, &payload)? {
                return Ok(result);
            }
            let created = record(command.case_id, &command.input);
            let result = CaseCommandResult {
                command_id: command.command_id,
                action: CaseAction::Create,
                case_id: command.case_id,
                committed_at: now(),
            };
            state.case = Some(created);
            state
                .commands
                .insert(command.command_id, (payload, result.clone()));
            self.writes.fetch_add(1, Ordering::SeqCst);
            Ok(result)
        }

        async fn update_case(
            &self,
            _: &ClinicalContext,
            command: &UpdateCaseCommand,
        ) -> Result<CaseCommandResult, CaseError> {
            let payload = serde_json::to_value(command).unwrap();
            let mut state = self.state.lock().unwrap();
            if let Some(result) = Self::stored(&state, command.command_id, &payload)? {
                return Ok(result);
            }
            let current = state.case.as_ref().ok_or(CaseError::NotFound)?;
            if current.revision != command.expected_revision {
                return Err(CaseError::RevisionConflict);
            }
            let mut updated = record(command.case_id, &command.input);
            updated.status = current.status;
            updated.revision = current.revision + 1;
            updated.case_input_revision = current.case_input_revision + 1;
            updated.status_revision = current.status_revision;
            let result = CaseCommandResult {
                command_id: command.command_id,
                action: CaseAction::Update,
                case_id: command.case_id,
                committed_at: now(),
            };
            state.case = Some(updated);
            state
                .commands
                .insert(command.command_id, (payload, result.clone()));
            self.writes.fetch_add(1, Ordering::SeqCst);
            Ok(result)
        }

        async fn transition_case(
            &self,
            _: &ClinicalContext,
            command: &TransitionCaseCommand,
        ) -> Result<CaseCommandResult, CaseError> {
            let payload = serde_json::to_value(command).unwrap();
            let mut state = self.state.lock().unwrap();
            if let Some(result) = Self::stored(&state, command.command_id, &payload)? {
                return Ok(result);
            }
            let current = state.case.as_ref().ok_or(CaseError::NotFound)?;
            if current.status_revision != command.expected_status_revision {
                return Err(CaseError::RevisionConflict);
            }
            if (current.status, command.target_status) != (CaseStatus::Intake, CaseStatus::Evidence)
            {
                return Err(CaseError::InvalidTransition);
            }
            let mut updated = current.clone();
            updated.status = command.target_status;
            updated.revision += 1;
            updated.status_revision += 1;
            let result = CaseCommandResult {
                command_id: command.command_id,
                action: CaseAction::Transition,
                case_id: command.case_id,
                committed_at: now(),
            };
            state.case = Some(updated);
            state
                .commands
                .insert(command.command_id, (payload, result.clone()));
            self.writes.fetch_add(1, Ordering::SeqCst);
            Ok(result)
        }

        async fn read_case(
            &self,
            _: &ClinicalContext,
            case_id: Uuid,
        ) -> Result<CaseRecord, CaseError> {
            self.state
                .lock()
                .unwrap()
                .case
                .clone()
                .filter(|case| case.id == case_id)
                .ok_or(CaseError::NotFound)
        }

        async fn authorize_case_write_target(
            &self,
            _: &ClinicalContext,
            case_id: Uuid,
        ) -> Result<(), CaseError> {
            self.state
                .lock()
                .unwrap()
                .case
                .as_ref()
                .filter(|case| case.id == case_id)
                .map(|_| ())
                .ok_or(CaseError::NotFound)
        }

        async fn list_cases(&self, _: &ClinicalContext) -> Result<Vec<CaseRecord>, CaseError> {
            Ok(self
                .state
                .lock()
                .unwrap()
                .case
                .clone()
                .into_iter()
                .collect())
        }

        async fn lookup_create_case_command(
            &self,
            _: &ClinicalContext,
            command_id: Uuid,
        ) -> Result<Option<CaseCommandResult>, CaseError> {
            Ok(self
                .state
                .lock()
                .unwrap()
                .commands
                .get(&command_id)
                .map(|(_, result)| result.clone())
                .filter(|result| result.action == CaseAction::Create))
        }

        async fn lookup_case_command(
            &self,
            _: &ClinicalContext,
            case_id: Uuid,
            command_id: Uuid,
        ) -> Result<Option<CaseCommandResult>, CaseError> {
            Ok(self
                .state
                .lock()
                .unwrap()
                .commands
                .get(&command_id)
                .map(|(_, result)| result.clone())
                .filter(|result| result.case_id == case_id))
        }

        async fn gate_state(&self, _: CaseId) -> Result<GateState, DomainError> {
            panic!("legacy gate state")
        }

        async fn record_affirmation(
            &self,
            _: CaseId,
            _: GateAffirmationKind,
            _: ActorId,
            _: DateTime<Utc>,
        ) -> Result<GateState, DomainError> {
            panic!("legacy affirmation")
        }
    }

    struct FixedClock;
    impl Clock for FixedClock {
        fn now(&self) -> DateTime<Utc> {
            now()
        }
    }

    struct Unused;
    #[async_trait]
    impl EvidenceRepository for Unused {
        async fn counts(&self, _: CaseId) -> Result<EvidenceCounts, DomainError> {
            panic!("evidence")
        }
    }
    #[async_trait]
    impl CriteriaRepository for Unused {
        async fn get(&self, _: CriterionId) -> Result<Criterion, DomainError> {
            panic!("criterion")
        }
        async fn live_for_payer(&self, _: &str) -> Result<Vec<Criterion>, DomainError> {
            panic!("criteria")
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
    #[async_trait]
    impl AuthorityPort for Unused {
        async fn holds(&self, _: ActorId, _: Capability) -> Result<bool, DomainError> {
            panic!("authority")
        }
    }

    fn services(cases: Arc<CasePorts>) -> AppServices {
        AppServices {
            cases,
            evidence: Arc::new(Unused),
            criteria: Arc::new(Unused),
            letters: Arc::new(Unused),
            authority: Arc::new(Unused),
            clock: Arc::new(FixedClock),
            sessions: Arc::new(UnavailableSessions),
        }
    }

    #[tokio::test]
    async fn commands_reconcile_and_advance_distinct_revisions() {
        let ports = Arc::new(CasePorts::default());
        let app = services(ports.clone());
        let actor = context(Principal::User);
        let read_capabilities = vec!["case:read".into()];
        let write_capabilities = vec!["case_write".into()];
        let create = CreateCaseCommand {
            command_id: id(20),
            case_id: id(21),
            input: input(),
        };

        let created = app
            .create_case(&actor, &write_capabilities, &create)
            .await
            .unwrap();
        assert_eq!(
            app.create_case(&actor, &write_capabilities, &create)
                .await
                .unwrap(),
            created
        );
        let mut changed = create.clone();
        changed.input.case_number = "SYN-CHANGED".into();
        assert_eq!(
            app.create_case(&actor, &write_capabilities, &changed).await,
            Err(CaseError::CommandConflict)
        );
        let created_record = app
            .read_case(&actor, &read_capabilities, create.case_id)
            .await
            .unwrap();
        assert_eq!(created_record.status, CaseStatus::Intake);
        assert_eq!(
            (
                created_record.revision,
                created_record.case_input_revision,
                created_record.status_revision,
            ),
            (1, 1, 0)
        );
        assert_eq!(
            app.list_cases(&actor, &read_capabilities).await.unwrap(),
            vec![created_record]
        );
        assert_eq!(
            app.lookup_create_case_command(&actor, &write_capabilities, create.command_id)
                .await
                .unwrap(),
            Some(created.clone())
        );

        let mut revised_input = input();
        revised_input.member_id = Some("SYN-MEMBER-002".into());
        let update = UpdateCaseCommand {
            command_id: id(22),
            case_id: create.case_id,
            expected_revision: 1,
            input: revised_input,
        };
        let updated = app
            .update_case(&actor, &write_capabilities, &update)
            .await
            .unwrap();
        assert_eq!(updated.case_id, create.case_id);
        let updated_record = app
            .read_case(&actor, &read_capabilities, create.case_id)
            .await
            .unwrap();
        assert_eq!(
            (updated_record.revision, updated_record.case_input_revision),
            (2, 2)
        );
        let mut stale = update.clone();
        stale.command_id = id(23);
        assert_eq!(
            app.update_case(&actor, &write_capabilities, &stale).await,
            Err(CaseError::RevisionConflict)
        );

        let transition = TransitionCaseCommand {
            command_id: id(24),
            case_id: create.case_id,
            expected_status_revision: 0,
            target_status: CaseStatus::Evidence,
        };
        let transitioned = app
            .transition_case(&actor, &write_capabilities, &transition)
            .await
            .unwrap();
        let transitioned_record = app
            .read_case(&actor, &read_capabilities, create.case_id)
            .await
            .unwrap();
        assert_eq!(
            (
                transitioned_record.status,
                transitioned_record.revision,
                transitioned_record.case_input_revision,
                transitioned_record.status_revision,
            ),
            (CaseStatus::Evidence, 3, 2, 1)
        );
        assert_eq!(
            app.lookup_case_command(
                &actor,
                &write_capabilities,
                create.case_id,
                transition.command_id,
            )
            .await
            .unwrap(),
            Some(transitioned)
        );
        let invalid = TransitionCaseCommand {
            command_id: id(25),
            case_id: create.case_id,
            expected_status_revision: 1,
            target_status: CaseStatus::Ready,
        };
        assert_eq!(
            app.transition_case(&actor, &write_capabilities, &invalid)
                .await,
            Err(CaseError::InvalidTransition)
        );
        assert_eq!(ports.writes.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn invalid_or_unverified_commands_never_reach_the_repository() {
        let ports = Arc::new(CasePorts::default());
        let app = services(ports.clone());
        let read_capabilities = vec!["case:read".into()];
        let write_capabilities = vec!["case_write".into()];
        let mut create = CreateCaseCommand {
            command_id: id(30),
            case_id: id(31),
            input: input(),
        };
        assert_eq!(
            app.create_case(&context(Principal::Agent), &write_capabilities, &create,)
                .await,
            Err(CaseError::Denied)
        );
        let mut expired = context(Principal::User);
        expired.expires_at = now();
        assert_eq!(
            app.create_case(&expired, &write_capabilities, &create)
                .await,
            Err(CaseError::Unauthenticated)
        );
        create.input.case_number = "   ".into();
        assert_eq!(
            app.create_case(&context(Principal::User), &write_capabilities, &create)
                .await,
            Err(CaseError::Invalid)
        );
        assert_eq!(
            app.create_case(
                &context(Principal::User),
                &read_capabilities,
                &CreateCaseCommand {
                    command_id: id(32),
                    case_id: id(33),
                    input: input(),
                }
            )
            .await,
            Err(CaseError::Denied)
        );
        assert_eq!(
            app.list_cases(&context(Principal::User), &write_capabilities)
                .await,
            Err(CaseError::Denied)
        );
        assert_eq!(ports.writes.load(Ordering::SeqCst), 0);
    }
}
