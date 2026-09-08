//! Clinical PostgreSQL adapter. Runtime logins may execute only the approved
//! functions; migration credentials never enter this repository.

use aso_host::{
    affirmation::*,
    domain::*,
    ports::{AuthorityPort, CaseRepository, EvidenceCounts, EvidenceRepository, LetterRepository},
    reassessment::{
        EvidenceReassessmentTarget, ReassessEvidenceCommand, ReassessEvidenceResult,
        ReassessmentError,
    },
    signing::{SignLetterCommand, SignLetterResult, SigningError, SigningTarget},
};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::{PgPool, Postgres, Transaction, postgres::PgPoolOptions};
use std::time::Duration;
use uuid::Uuid;

pub struct PgGateRepository {
    pool: PgPool,
}

// Check effective ownership and writes as well as role flags: a non-superuser
// with an inherited owner role could otherwise bypass the function boundary.
const ROLE_CHECK: &str = "
    SELECT pg_has_role(session_user, 'aso_gate_executor', 'USAGE')
      AND NOT EXISTS (
        SELECT 1 FROM pg_roles r
        WHERE (r.rolname = 'aso_gate_executor'
          OR pg_has_role(session_user, r.oid, 'MEMBER')) AND (
          r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication
          OR (r.rolname = 'aso_gate_executor' AND r.rolcanlogin)
          OR has_schema_privilege(r.oid, 'aso', 'CREATE')
          OR has_database_privilege(r.oid, current_database(), 'CREATE')
          OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname = 'aso'
                     AND pg_has_role(r.oid, n.nspowner, 'MEMBER'))
          OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                     WHERE n.nspname='aso' AND (
                       pg_has_role(r.oid, c.relowner, 'MEMBER') OR
                       (c.relkind IN ('r','p','v','m','f') AND (
                         has_table_privilege(r.oid,c.oid,
                           'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN') OR
                         has_any_column_privilege(r.oid,c.oid,'INSERT, UPDATE, REFERENCES')))))
          OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                     WHERE n.nspname='aso' AND pg_has_role(r.oid,p.proowner,'MEMBER'))))";

fn failure(error: sqlx::Error) -> GateError {
    match error.as_database_error().and_then(|e| e.code()).as_deref() {
        Some("42501") => GateError::Denied,
        Some("P0002") => GateError::NotFound,
        Some("23505") => GateError::CommandConflict,
        _ => GateError::Unavailable,
    }
}

fn signing_failure(error: sqlx::Error) -> SigningError {
    match error.as_database_error().and_then(|e| e.code()).as_deref() {
        Some("42501") => SigningError::Denied,
        Some("P0002") => SigningError::NotFound,
        Some("23505") => SigningError::CommandConflict,
        Some("A0301") => SigningError::RevisionConflict,
        Some("A0302") => SigningError::SignatureConflict,
        Some("A0303") => SigningError::NotApproved,
        Some("A0304") => SigningError::GateNotAffirmed,
        Some("A0305") => SigningError::QaIncomplete,
        Some("A0306") => SigningError::SourceIncomplete,
        _ => SigningError::Unavailable,
    }
}

fn gate_to_signing(error: GateError) -> SigningError {
    match error {
        GateError::Unauthenticated => SigningError::Unauthenticated,
        GateError::Denied => SigningError::Denied,
        GateError::NotFound => SigningError::NotFound,
        GateError::CommandConflict => SigningError::CommandConflict,
        GateError::Unavailable | GateError::NativeAuthenticationUnavailable => {
            SigningError::Unavailable
        }
    }
}

fn reassessment_failure(error: sqlx::Error) -> ReassessmentError {
    match error.as_database_error().and_then(|e| e.code()).as_deref() {
        Some("42501") => ReassessmentError::Denied,
        Some("P0002") => ReassessmentError::NotFound,
        Some("23505") => ReassessmentError::CommandConflict,
        Some("A0307") => ReassessmentError::RevisionConflict,
        _ => ReassessmentError::Unavailable,
    }
}

fn gate_to_reassessment(error: GateError) -> ReassessmentError {
    match error {
        GateError::Unauthenticated => ReassessmentError::Unauthenticated,
        GateError::Denied => ReassessmentError::Denied,
        GateError::NotFound => ReassessmentError::NotFound,
        GateError::CommandConflict => ReassessmentError::CommandConflict,
        GateError::Unavailable | GateError::NativeAuthenticationUnavailable => {
            ReassessmentError::Unavailable
        }
    }
}

impl PgGateRepository {
    pub async fn connect(url: &str) -> Result<Self, GateError> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(5))
            .connect(url)
            .await
            .map_err(failure)?;
        let allowed: bool = sqlx::query_scalar(ROLE_CHECK)
            .fetch_one(&pool)
            .await
            .map_err(failure)?;
        if !allowed {
            return Err(GateError::Unavailable);
        }
        Ok(Self { pool })
    }

    async fn begin(
        &self,
        context: &ClinicalContext,
    ) -> Result<Transaction<'static, Postgres>, GateError> {
        let mut tx = self.pool.begin().await.map_err(failure)?;
        let allowed: bool = sqlx::query_scalar(ROLE_CHECK)
            .fetch_one(&mut *tx)
            .await
            .map_err(failure)?;
        if !allowed {
            return Err(GateError::Unavailable);
        }
        sqlx::query("SET LOCAL ROLE aso_gate_executor")
            .execute(&mut *tx)
            .await
            .map_err(failure)?;
        sqlx::query("SET LOCAL search_path = pg_catalog, aso, pg_temp")
            .execute(&mut *tx)
            .await
            .map_err(failure)?;
        sqlx::query("SET LOCAL statement_timeout = '5s'")
            .execute(&mut *tx)
            .await
            .map_err(failure)?;
        let principal = match context.principal {
            aso_host::session::Principal::User => "user",
            aso_host::session::Principal::Agent => "agent",
            aso_host::session::Principal::Service => "service",
        };
        sqlx::query(
            "SELECT set_config('aso.kratos_identity_id',$1,true),
            set_config('aso.actor_id',$2,true), set_config('aso.practice_id',$3,true),
            set_config('aso.principal',$4,true), set_config('aso.session_expires_at',$5,true)",
        )
        .bind(context.identity_id.to_string())
        .bind(context.actor.to_string())
        .bind(context.practice.to_string())
        .bind(principal)
        .bind(context.expires_at.to_rfc3339())
        .execute(&mut *tx)
        .await
        .map_err(failure)?;
        Ok(tx)
    }
}

#[async_trait]
impl CaseRepository for PgGateRepository {
    async fn gate_state(&self, _: CaseId) -> Result<GateState, DomainError> {
        Err(DomainError::Storage(
            "verified gate context required".into(),
        ))
    }

    async fn record_affirmation(
        &self,
        _: CaseId,
        _: GateAffirmationKind,
        _: ActorId,
        _: DateTime<Utc>,
    ) -> Result<GateState, DomainError> {
        Err(DomainError::Storage(
            "verified gate command required".into(),
        ))
    }

    async fn execute_gate_command(
        &self,
        context: &ClinicalContext,
        command: &GateCommand,
    ) -> Result<GateCommandResult, GateError> {
        let kind = match command.kind {
            GateAffirmationKind::Policy => "policy",
            GateAffirmationKind::Section => "section",
            GateAffirmationKind::Pathway => "pathway",
            GateAffirmationKind::Plan => "plan",
        };
        let action = match command.action {
            GateAction::Affirm => "affirm",
            GateAction::Remove => "remove",
        };
        let mut tx = self.begin(context).await?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.apply_gate_command($1,$2,$3,$4)")
                .bind(command.command_id)
                .bind(command.case_id)
                .bind(kind)
                .bind(action)
                .fetch_one(&mut *tx)
                .await
                .map_err(failure)?;
        let result = serde_json::from_value(value).map_err(|_| GateError::Unavailable)?;
        tx.commit().await.map_err(failure)?;
        Ok(result)
    }

    async fn read_verified_gate(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
    ) -> Result<GateSnapshot, GateError> {
        let mut tx = self.begin(context).await?;
        let value: serde_json::Value = sqlx::query_scalar("SELECT aso.read_gate($1)")
            .bind(case_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(failure)?;
        let result = serde_json::from_value(value).map_err(|_| GateError::Unavailable)?;
        tx.commit().await.map_err(failure)?;
        Ok(result)
    }

    async fn lookup_gate_command(
        &self,
        context: &ClinicalContext,
        command_id: Uuid,
    ) -> Result<Option<GateCommandResult>, GateError> {
        let mut tx = self.begin(context).await?;
        let value: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT aso.lookup_gate_command($1)")
                .bind(command_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(failure)?;
        let result = value
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| GateError::Unavailable)?;
        tx.commit().await.map_err(failure)?;
        Ok(result)
    }
}

#[async_trait]
impl AuthorityPort for PgGateRepository {
    async fn holds(&self, _: ActorId, _: Capability) -> Result<bool, DomainError> {
        Err(DomainError::Storage(
            "verified authority context required".into(),
        ))
    }

    async fn may_affirm_gate(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
    ) -> Result<bool, GateError> {
        let mut tx = self.begin(context).await?;
        let result = sqlx::query_scalar("SELECT aso.may_affirm_gate($1)")
            .bind(case_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(failure)?;
        tx.commit().await.map_err(failure)?;
        Ok(result)
    }

    async fn may_sign_letter(
        &self,
        context: &ClinicalContext,
        letter_id: LetterId,
    ) -> Result<bool, SigningError> {
        let mut tx = self.begin(context).await.map_err(gate_to_signing)?;
        let result = sqlx::query_scalar("SELECT aso.may_sign_letter($1)")
            .bind(letter_id.0)
            .fetch_one(&mut *tx)
            .await
            .map_err(signing_failure)?;
        tx.commit().await.map_err(signing_failure)?;
        Ok(result)
    }

    async fn may_reassess_evidence(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        evidence_id: Uuid,
    ) -> Result<bool, ReassessmentError> {
        let mut tx = self.begin(context).await.map_err(gate_to_reassessment)?;
        let result = sqlx::query_scalar("SELECT aso.may_reassess_evidence($1,$2)")
            .bind(case_id)
            .bind(evidence_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(reassessment_failure)?;
        tx.commit().await.map_err(reassessment_failure)?;
        Ok(result)
    }
}

#[async_trait]
impl EvidenceRepository for PgGateRepository {
    async fn read_reassessment_target(
        &self,
        context: &ClinicalContext,
        case_id: Uuid,
        evidence_id: Uuid,
    ) -> Result<EvidenceReassessmentTarget, ReassessmentError> {
        let mut tx = self.begin(context).await.map_err(gate_to_reassessment)?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.read_reassessment_target($1,$2)")
                .bind(case_id)
                .bind(evidence_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(reassessment_failure)?;
        let result = serde_json::from_value(value).map_err(|_| ReassessmentError::Unavailable)?;
        tx.commit().await.map_err(reassessment_failure)?;
        Ok(result)
    }

    async fn execute_reassessment(
        &self,
        context: &ClinicalContext,
        command: &ReassessEvidenceCommand,
    ) -> Result<ReassessEvidenceResult, ReassessmentError> {
        let state = match command.state {
            EvidenceState::Met => "met",
            EvidenceState::Gap => "gap",
            EvidenceState::Void => "void",
        };
        let mut tx = self.begin(context).await.map_err(gate_to_reassessment)?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.apply_evidence_reassessment_command($1,$2,$3,$4,$5)")
                .bind(command.command_id)
                .bind(command.case_id)
                .bind(command.evidence_id)
                .bind(command.expected_assessed_at)
                .bind(state)
                .fetch_one(&mut *tx)
                .await
                .map_err(reassessment_failure)?;
        let result = serde_json::from_value(value).map_err(|_| ReassessmentError::Unavailable)?;
        tx.commit().await.map_err(reassessment_failure)?;
        Ok(result)
    }

    async fn lookup_reassessment_command(
        &self,
        context: &ClinicalContext,
        command_id: Uuid,
    ) -> Result<Option<ReassessEvidenceResult>, ReassessmentError> {
        let mut tx = self.begin(context).await.map_err(gate_to_reassessment)?;
        let value: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT aso.lookup_evidence_reassessment_command($1)")
                .bind(command_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(reassessment_failure)?;
        let result = value
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| ReassessmentError::Unavailable)?;
        tx.commit().await.map_err(reassessment_failure)?;
        Ok(result)
    }

    async fn counts(&self, _: CaseId) -> Result<EvidenceCounts, DomainError> {
        Err(DomainError::Storage(
            "verified evidence read context required".into(),
        ))
    }
}

#[async_trait]
impl LetterRepository for PgGateRepository {
    async fn read_signing_target(
        &self,
        context: &ClinicalContext,
        letter_id: LetterId,
    ) -> Result<SigningTarget, SigningError> {
        let mut tx = self.begin(context).await.map_err(gate_to_signing)?;
        let value: serde_json::Value = sqlx::query_scalar("SELECT aso.read_signing_target($1)")
            .bind(letter_id.0)
            .fetch_one(&mut *tx)
            .await
            .map_err(signing_failure)?;
        let result = serde_json::from_value(value).map_err(|_| SigningError::Unavailable)?;
        tx.commit().await.map_err(signing_failure)?;
        Ok(result)
    }

    async fn execute_sign_letter(
        &self,
        context: &ClinicalContext,
        command: &SignLetterCommand,
    ) -> Result<SignLetterResult, SigningError> {
        let mut tx = self.begin(context).await.map_err(gate_to_signing)?;
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT aso.apply_letter_sign_command($1,$2,$3,$4,$5)")
                .bind(command.command_id)
                .bind(command.letter_id.0)
                .bind(command.expected_letter_version)
                .bind(command.expected_qa_revision)
                .bind(command.expected_signature_version)
                .fetch_one(&mut *tx)
                .await
                .map_err(signing_failure)?;
        let result = serde_json::from_value(value).map_err(|_| SigningError::Unavailable)?;
        tx.commit().await.map_err(signing_failure)?;
        Ok(result)
    }

    async fn lookup_sign_letter_command(
        &self,
        context: &ClinicalContext,
        command_id: Uuid,
    ) -> Result<Option<SignLetterResult>, SigningError> {
        let mut tx = self.begin(context).await.map_err(gate_to_signing)?;
        let value: Option<serde_json::Value> =
            sqlx::query_scalar("SELECT aso.lookup_letter_sign_command($1)")
                .bind(command_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(signing_failure)?;
        let result = value
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| SigningError::Unavailable)?;
        tx.commit().await.map_err(signing_failure)?;
        Ok(result)
    }

    async fn get(&self, _: LetterId) -> Result<Letter, DomainError> {
        Err(DomainError::Storage(
            "verified letter context required".into(),
        ))
    }

    async fn unresolved_non_policy_retrievals(
        &self,
        _: LetterId,
    ) -> Result<Vec<CriterionId>, DomainError> {
        Err(DomainError::Storage(
            "verified letter context required".into(),
        ))
    }

    async fn sign(&self, _: LetterId, _: ActorId, _: DateTime<Utc>) -> Result<Letter, DomainError> {
        Err(DomainError::Storage(
            "verified signing command required".into(),
        ))
    }
}

#[cfg(test)]
mod reassessment_transaction_tests;
#[cfg(test)]
mod signing_transaction_tests;
#[cfg(test)]
mod transaction_tests;
