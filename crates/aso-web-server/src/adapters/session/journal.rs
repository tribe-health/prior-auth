//! Restricted PostgreSQL adapter for the durable logout journal.

use aso_host::{
    logout::{LogoutClaim, LogoutClaimOutcome, LogoutJournal},
    session::{AuthenticatedIdentity, SessionDenialRepository, SessionError},
};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::{PgPool, Postgres, Transaction, postgres::PgPoolOptions};
use std::time::Duration;
use uuid::Uuid;

pub struct PgLogoutJournal {
    pool: PgPool,
}

impl PgLogoutJournal {
    pub async fn connect(database_url: &str) -> Result<Self, SessionError> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(5))
            .connect(database_url)
            .await
            .map_err(|_| SessionError::Unavailable)?;
        let journal = Self { pool };
        if !journal.role_allowed().await? {
            return Err(SessionError::Unavailable);
        }
        Ok(journal)
    }

    async fn role_allowed(&self) -> Result<bool, SessionError> {
        sqlx::query_scalar(AUTHORITY_ROLE_CHECK)
            .fetch_one(&self.pool)
            .await
            .map_err(|_| SessionError::Unavailable)
    }

    async fn begin_scoped(&self) -> Result<Transaction<'static, Postgres>, SessionError> {
        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|_| SessionError::Unavailable)?;
        let allowed: bool = sqlx::query_scalar(AUTHORITY_ROLE_CHECK)
            .fetch_one(&mut *tx)
            .await
            .map_err(|_| SessionError::Unavailable)?;
        if !allowed {
            return Err(SessionError::Unavailable);
        }
        sqlx::query("SET LOCAL ROLE aso_session_authority_executor")
            .execute(&mut *tx)
            .await
            .map_err(|_| SessionError::Unavailable)?;
        sqlx::query("SET LOCAL search_path = pg_catalog, aso")
            .execute(&mut *tx)
            .await
            .map_err(|_| SessionError::Unavailable)?;
        sqlx::query("SET LOCAL statement_timeout = '2s'")
            .execute(&mut *tx)
            .await
            .map_err(|_| SessionError::Unavailable)?;
        Ok(tx)
    }
}

type ClaimRow = (Uuid, String, String, Uuid, DateTime<Utc>);

fn claim_from_row(row: ClaimRow) -> Result<LogoutClaim, SessionError> {
    Ok(LogoutClaim {
        deployment_id: row.0,
        kratos_issuer: row.1,
        kratos_session_id: row.2.parse().map_err(|_| SessionError::Unavailable)?,
        lease_token: row.3,
        lease_expires_at: row.4,
    })
}

#[async_trait]
impl LogoutJournal for PgLogoutJournal {
    async fn deny_and_claim(
        &self,
        identity: &AuthenticatedIdentity,
        now: DateTime<Utc>,
        lease_token: Uuid,
        lease_expires_at: DateTime<Utc>,
    ) -> Result<LogoutClaimOutcome, SessionError> {
        let mut tx = self.begin_scoped().await?;
        let deployment_id: Uuid = sqlx::query_scalar(
            "SELECT deployment_id FROM aso.authority_deployment WHERE singleton = true",
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| SessionError::Unavailable)?;

        sqlx::query(
            "INSERT INTO aso.session_denials (
               deployment_id, kratos_issuer, kratos_session_id,
               session_expires_at, skew_allowance, retain_until,
               confirmation_state, attempt_count, next_attempt_at,
               lease_token, lease_expires_at, last_attempt_at,
               confirmed_at, last_error_code, created_at, updated_at
             ) VALUES (
               $1, $2, $3, $4, interval '1 second', $4 + interval '1 second',
               'pending', 0, $5, NULL, NULL, NULL, NULL, NULL, $5, $5
             ) ON CONFLICT (deployment_id, kratos_issuer, kratos_session_id) DO NOTHING",
        )
        .bind(deployment_id)
        .bind(&identity.issuer)
        .bind(identity.session_id.to_string())
        .bind(identity.expires_at)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(|_| SessionError::Unavailable)?;

        let claimed: Option<ClaimRow> = sqlx::query_as(
            "UPDATE aso.session_denials
                SET lease_token = $4, lease_expires_at = $5,
                    attempt_count = attempt_count + 1,
                    last_attempt_at = $6, updated_at = $6
              WHERE deployment_id = $1 AND kratos_issuer = $2 AND kratos_session_id = $3
                AND confirmation_state = 'pending'
                AND (lease_token IS NULL OR lease_expires_at <= $6)
              RETURNING deployment_id, kratos_issuer, kratos_session_id,
                        lease_token, lease_expires_at",
        )
        .bind(deployment_id)
        .bind(&identity.issuer)
        .bind(identity.session_id.to_string())
        .bind(lease_token)
        .bind(lease_expires_at)
        .bind(now)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| SessionError::Unavailable)?;

        let outcome = if let Some(row) = claimed {
            LogoutClaimOutcome::Claimed(claim_from_row(row)?)
        } else {
            let state: String = sqlx::query_scalar(
                "SELECT confirmation_state FROM aso.session_denials
                  WHERE deployment_id = $1 AND kratos_issuer = $2 AND kratos_session_id = $3",
            )
            .bind(deployment_id)
            .bind(&identity.issuer)
            .bind(identity.session_id.to_string())
            .fetch_one(&mut *tx)
            .await
            .map_err(|_| SessionError::Unavailable)?;
            match state.as_str() {
                "confirmed" => LogoutClaimOutcome::Confirmed,
                "pending" => LogoutClaimOutcome::Pending,
                _ => return Err(SessionError::Unavailable),
            }
        };
        tx.commit().await.map_err(|_| SessionError::Unavailable)?;
        Ok(outcome)
    }

    async fn claim_next(
        &self,
        now: DateTime<Utc>,
        lease_token: Uuid,
        lease_expires_at: DateTime<Utc>,
    ) -> Result<Option<LogoutClaim>, SessionError> {
        let mut tx = self.begin_scoped().await?;
        let row: Option<ClaimRow> = sqlx::query_as(
            "WITH candidate AS (
               SELECT deployment_id, kratos_issuer, kratos_session_id
                 FROM aso.session_denials
                WHERE confirmation_state = 'pending' AND next_attempt_at <= $1
                  AND (lease_token IS NULL OR lease_expires_at <= $1)
                ORDER BY next_attempt_at, created_at
                FOR UPDATE SKIP LOCKED
                LIMIT 1
             )
             UPDATE aso.session_denials denial
                SET lease_token = $2, lease_expires_at = $3,
                    attempt_count = denial.attempt_count + 1,
                    last_attempt_at = $1, updated_at = $1
               FROM candidate
              WHERE denial.deployment_id = candidate.deployment_id
                AND denial.kratos_issuer = candidate.kratos_issuer
                AND denial.kratos_session_id = candidate.kratos_session_id
              RETURNING denial.deployment_id, denial.kratos_issuer,
                        denial.kratos_session_id, denial.lease_token,
                        denial.lease_expires_at",
        )
        .bind(now)
        .bind(lease_token)
        .bind(lease_expires_at)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| SessionError::Unavailable)?;
        tx.commit().await.map_err(|_| SessionError::Unavailable)?;
        row.map(claim_from_row).transpose()
    }

    async fn confirm(
        &self,
        claim: &LogoutClaim,
        confirmed_at: DateTime<Utc>,
    ) -> Result<bool, SessionError> {
        let mut tx = self.begin_scoped().await?;
        let updated = sqlx::query(
            "UPDATE aso.session_denials
                SET confirmation_state = 'confirmed', confirmed_at = $5,
                    next_attempt_at = NULL, lease_token = NULL,
                    lease_expires_at = NULL, last_error_code = NULL, updated_at = $5
              WHERE deployment_id = $1 AND kratos_issuer = $2 AND kratos_session_id = $3
                AND confirmation_state = 'pending' AND lease_token = $4
                AND lease_expires_at >= $5",
        )
        .bind(claim.deployment_id)
        .bind(&claim.kratos_issuer)
        .bind(claim.kratos_session_id.to_string())
        .bind(claim.lease_token)
        .bind(confirmed_at)
        .execute(&mut *tx)
        .await
        .map_err(|_| SessionError::Unavailable)?
        .rows_affected()
            == 1;
        tx.commit().await.map_err(|_| SessionError::Unavailable)?;
        Ok(updated)
    }

    async fn retry(
        &self,
        claim: &LogoutClaim,
        failed_at: DateTime<Utc>,
        next_attempt_at: DateTime<Utc>,
        error_code: &'static str,
    ) -> Result<bool, SessionError> {
        let mut tx = self.begin_scoped().await?;
        let updated = sqlx::query(
            "UPDATE aso.session_denials
                SET next_attempt_at = $6, lease_token = NULL, lease_expires_at = NULL,
                    last_error_code = $7, updated_at = $5
              WHERE deployment_id = $1 AND kratos_issuer = $2 AND kratos_session_id = $3
                AND confirmation_state = 'pending' AND lease_token = $4
                AND lease_expires_at >= $5",
        )
        .bind(claim.deployment_id)
        .bind(&claim.kratos_issuer)
        .bind(claim.kratos_session_id.to_string())
        .bind(claim.lease_token)
        .bind(failed_at)
        .bind(next_attempt_at)
        .bind(error_code)
        .execute(&mut *tx)
        .await
        .map_err(|_| SessionError::Unavailable)?
        .rows_affected()
            == 1;
        tx.commit().await.map_err(|_| SessionError::Unavailable)?;
        Ok(updated)
    }
}

#[async_trait]
impl SessionDenialRepository for PgLogoutJournal {
    async fn is_denied(
        &self,
        identity: &AuthenticatedIdentity,
        at: DateTime<Utc>,
    ) -> Result<bool, SessionError> {
        let mut tx = self.begin_scoped().await?;
        let denied: bool = sqlx::query_scalar(
            "SELECT EXISTS (
               SELECT 1
                 FROM aso.session_denials denial
                 JOIN aso.authority_deployment deployment
                   ON deployment.singleton = true
                  AND deployment.deployment_id = denial.deployment_id
                WHERE denial.kratos_issuer = $1
                  AND denial.kratos_session_id = $2
                  AND $3 < denial.retain_until
             )",
        )
        .bind(&identity.issuer)
        .bind(identity.session_id.to_string())
        .bind(at)
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| SessionError::Unavailable)?;
        tx.commit().await.map_err(|_| SessionError::Unavailable)?;
        Ok(denied)
    }
}

const AUTHORITY_ROLE_CHECK: &str = "
    SELECT pg_has_role(session_user, 'aso_session_authority_executor', 'SET')
       AND NOT EXISTS (
         SELECT 1 FROM pg_roles r
         WHERE r.rolname IN (session_user, 'aso_session_authority_executor') AND (
           r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication
           OR (r.rolname = 'aso_session_authority_executor' AND r.rolcanlogin)
           OR has_schema_privilege(r.oid, 'aso', 'CREATE')
           OR has_database_privilege(r.oid, current_database(), 'CREATE')
           OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname = 'aso'
                       AND pg_has_role(r.oid, n.nspowner, 'USAGE'))
           OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                       WHERE n.nspname = 'aso' AND (
                         pg_has_role(r.oid, c.relowner, 'USAGE')
                         OR has_table_privilege(r.oid, c.oid,
                              'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
                         OR (c.relname NOT IN ('authority_deployment', 'session_denials')
                             AND has_table_privilege(r.oid, c.oid, 'SELECT'))))
           OR EXISTS (SELECT 1 FROM pg_attribute a
                       JOIN pg_class c ON c.oid = a.attrelid
                       JOIN pg_namespace n ON n.oid = c.relnamespace
                       WHERE n.nspname = 'aso' AND a.attnum > 0 AND NOT a.attisdropped AND (
                         (has_column_privilege(r.oid, c.oid, a.attnum, 'INSERT') AND
                           (c.relname <> 'session_denials' OR a.attname NOT IN (
                             'deployment_id', 'kratos_issuer', 'kratos_session_id',
                             'session_expires_at', 'skew_allowance', 'retain_until',
                             'confirmation_state', 'attempt_count', 'next_attempt_at',
                             'lease_token', 'lease_expires_at', 'last_attempt_at',
                             'confirmed_at', 'last_error_code', 'created_at', 'updated_at')))
                         OR (has_column_privilege(r.oid, c.oid, a.attnum, 'UPDATE') AND
                           (c.relname <> 'session_denials' OR a.attname NOT IN (
                             'confirmation_state', 'attempt_count', 'next_attempt_at',
                             'lease_token', 'lease_expires_at', 'last_attempt_at',
                             'confirmed_at', 'last_error_code', 'updated_at')))
                         OR has_column_privilege(r.oid, c.oid, a.attnum, 'REFERENCES')))
           OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                       WHERE n.nspname = 'aso' AND pg_has_role(r.oid, p.proowner, 'USAGE'))
         ))";
