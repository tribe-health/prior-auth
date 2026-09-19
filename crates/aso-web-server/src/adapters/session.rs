//! Concrete identity and membership adapters for the session feature.

use aso_host::{
    logout::{CoordinatedSessions, LogoutCoordinator, LogoutResult},
    ports::SystemClock,
    session::{
        AuthenticatedIdentity, IdentityProvider, IdentityRevalidation, Membership,
        MembershipRepository, Principal, SessionContinuity, SessionCredential, SessionError,
        SessionPort, SessionService, UnavailableSessions,
    },
};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use reqwest::{
    Client, Url,
    header::{COOKIE, HeaderName, HeaderValue},
    redirect,
};
use serde::Deserialize;
use sqlx::{PgPool, postgres::PgPoolOptions};
use std::{sync::Arc, time::Duration};
use uuid::Uuid;

mod journal;
mod logout;

use journal::PgLogoutJournal;
use logout::KratosSessionRevoker;

pub struct KratosIdentityProvider {
    client: Client,
    whoami: Url,
    issuer: String,
}

fn validated_base_url(base: &str, allow_insecure: bool) -> Result<Url, SessionError> {
    let url = Url::parse(base).map_err(|_| SessionError::Unavailable)?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !(url.scheme() == "https" || (allow_insecure && url.scheme() == "http"))
    {
        return Err(SessionError::Unavailable);
    }
    Ok(url)
}

impl KratosIdentityProvider {
    pub fn new(base: &str, allow_insecure: bool) -> Result<Self, SessionError> {
        let url = validated_base_url(base, allow_insecure)?;
        let issuer = url.to_string();
        let prefix = url.path().trim_end_matches('/').to_owned();
        let mut whoami = url.clone();
        whoami.set_path(&format!("{prefix}/sessions/whoami"));
        let client = Client::builder()
            .redirect(redirect::Policy::none())
            .timeout(Duration::from_secs(5))
            .no_proxy()
            .build()
            .map_err(|_| SessionError::Unavailable)?;
        Ok(Self {
            client,
            whoami,
            issuer,
        })
    }

    async fn observe(
        &self,
        credential: &SessionCredential,
    ) -> Result<Option<AuthenticatedIdentity>, SessionError> {
        let (name, value) = match credential {
            SessionCredential::Cookie(cookie) => (COOKIE, cookie.clone()),
            SessionCredential::NativeToken(token) => {
                (HeaderName::from_static("x-session-token"), token.clone())
            }
        };
        let mut value = HeaderValue::from_str(&value).map_err(|_| SessionError::Unauthenticated)?;
        value.set_sensitive(true);
        let mut response = self
            .client
            .get(self.whoami.clone())
            .header("accept", "application/json")
            .header(name, value)
            .send()
            .await
            .map_err(|_| SessionError::Unavailable)?;
        match response.status().as_u16() {
            200 => {}
            401 => return Ok(None),
            403 => return Err(SessionError::ReauthenticationRequired),
            _ => return Err(SessionError::Unavailable),
        }
        // Identity traits are untrusted and may be large; keep provider output
        // bounded and deserialize only the authoritative session fields.
        const MAX_SESSION_BYTES: usize = 64 * 1024;
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| SessionError::Unavailable)?
        {
            if chunk.len() > MAX_SESSION_BYTES - bytes.len() {
                return Err(SessionError::Unavailable);
            }
            bytes.extend_from_slice(&chunk);
        }
        let session: KratosSession =
            serde_json::from_slice(&bytes).map_err(|_| SessionError::Unavailable)?;
        if !session.active {
            return Ok(None);
        }
        Ok(Some(AuthenticatedIdentity {
            identity_id: session.identity.id,
            session_id: session.id,
            issuer: self.issuer.clone(),
            // Kratos authenticates application users. Delegated agents require
            // a separate trusted identity provider and never inherit this value.
            principal: Principal::User,
            expires_at: session.expires_at,
        }))
    }
}

#[derive(Deserialize)]
struct KratosSession {
    id: Uuid,
    active: bool,
    expires_at: DateTime<Utc>,
    identity: KratosIdentity,
}

#[derive(Deserialize)]
struct KratosIdentity {
    id: Uuid,
}

#[async_trait]
impl IdentityProvider for KratosIdentityProvider {
    async fn authenticate(
        &self,
        credential: &SessionCredential,
    ) -> Result<AuthenticatedIdentity, SessionError> {
        let identity = self
            .observe(credential)
            .await?
            .ok_or(SessionError::Unauthenticated)?;
        if identity.expires_at <= Utc::now() {
            return Err(SessionError::Unauthenticated);
        }
        Ok(identity)
    }

    async fn revalidate(
        &self,
        credential: &SessionCredential,
        previously_verified: &AuthenticatedIdentity,
    ) -> Result<IdentityRevalidation, SessionError> {
        if previously_verified.issuer != self.issuer {
            return Err(SessionError::Unauthenticated);
        }
        match self.observe(credential).await? {
            None => Ok(IdentityRevalidation::Inactive),
            Some(identity)
                if identity.session_id == previously_verified.session_id
                    && identity.identity_id == previously_verified.identity_id =>
            {
                Ok(IdentityRevalidation::Active(identity))
            }
            Some(_) => Err(SessionError::Unauthenticated),
        }
    }
}

pub struct PgMembershipRepository {
    pool: PgPool,
}

impl PgMembershipRepository {
    pub async fn connect(database_url: &str) -> Result<Self, SessionError> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(5))
            .connect(database_url)
            .await
            .map_err(|_| SessionError::Unavailable)?;
        let repository = Self { pool };
        // Reject owner/superuser service credentials even if SET ROLE could
        // disguise them. Provision a dedicated login member of the read role.
        let allowed: bool = sqlx::query_scalar(ROLE_CHECK)
            .fetch_one(&repository.pool)
            .await
            .map_err(|_| SessionError::Unavailable)?;
        if !allowed {
            return Err(SessionError::Unavailable);
        }
        Ok(repository)
    }

    /// Scope belongs to this transaction only. SQLx queues rollback on Drop for
    /// errors/cancellation; PostgreSQL restores LOCAL settings at either exit.
    async fn begin_scoped(
        &self,
        identity: &AuthenticatedIdentity,
    ) -> Result<sqlx::Transaction<'static, sqlx::Postgres>, SessionError> {
        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|_| SessionError::Unavailable)?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            .execute(&mut *tx)
            .await
            .map_err(|_| SessionError::Unavailable)?;
        let allowed: bool = sqlx::query_scalar(ROLE_CHECK)
            .fetch_one(&mut *tx)
            .await
            .map_err(|_| SessionError::Unavailable)?;
        if !allowed {
            return Err(SessionError::Unavailable);
        }
        sqlx::query("SET LOCAL ROLE aso_session_reader")
            .execute(&mut *tx)
            .await
            .map_err(|_| SessionError::Unavailable)?;
        sqlx::query("SET LOCAL search_path = pg_catalog, aso")
            .execute(&mut *tx)
            .await
            .map_err(|_| SessionError::Unavailable)?;
        sqlx::query("SELECT set_config('aso.kratos_identity_id', $1, true)")
            .bind(identity.identity_id.to_string())
            .execute(&mut *tx)
            .await
            .map_err(|_| SessionError::Unavailable)?;
        sqlx::query("SET LOCAL statement_timeout = '5s'")
            .execute(&mut *tx)
            .await
            .map_err(|_| SessionError::Unavailable)?;
        Ok(tx)
    }
}

const ROLE_CHECK: &str = "
    SELECT pg_has_role(session_user, 'aso_session_reader', 'USAGE')
       AND NOT EXISTS (
         SELECT 1 FROM pg_roles r
         WHERE r.rolname IN (session_user, 'aso_session_reader') AND (
           r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication
           OR (r.rolname = 'aso_session_reader' AND r.rolcanlogin)
           OR has_schema_privilege(r.oid, 'aso', 'CREATE')
           OR has_database_privilege(r.oid, current_database(), 'CREATE')
           OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname = 'aso'
                       AND pg_has_role(r.oid, n.nspowner, 'USAGE'))
           OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                       WHERE n.nspname = 'aso' AND (
                         pg_has_role(r.oid, c.relowner, 'USAGE') OR
                         (c.relkind IN ('r', 'p', 'v', 'm', 'f') AND (
                           has_table_privilege(r.oid, c.oid,
                             'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN') OR
                           has_any_column_privilege(r.oid, c.oid, 'INSERT, UPDATE, REFERENCES')))))
           OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                       WHERE n.nspname = 'aso' AND pg_has_role(r.oid, p.proowner, 'USAGE'))
         ))";

#[async_trait]
impl MembershipRepository for PgMembershipRepository {
    async fn resolve(
        &self,
        identity: &AuthenticatedIdentity,
        practice: Option<Uuid>,
    ) -> Result<Membership, SessionError> {
        let mut tx = self.begin_scoped(identity).await?;
        let row: Option<(Uuid, Uuid, String, Vec<String>, String)> = sqlx::query_as("
            SELECT u.id, COALESCE($2, u.practice_id),
                   COALESCE(u.display_name, u.full_name),
                   ARRAY(SELECT c.capability_key FROM aso.user_capabilities c
                         WHERE c.user_id = u.id AND c.practice_id = COALESCE($2, u.practice_id)
                         ORDER BY c.capability_key),
                   r.incarnation::text || ':' || r.revision::text
            FROM aso.users u CROSS JOIN aso.authorization_revision r
            WHERE u.id = aso.current_app_user_id() AND u.kratos_identity_id = $1
              AND u.status = 'active' AND r.singleton
              AND EXISTS (SELECT 1 FROM aso.user_roles ur
                          WHERE ur.user_id = u.id AND ur.practice_id = COALESCE($2, u.practice_id))")
            .bind(identity.identity_id).bind(practice).fetch_optional(&mut *tx)
            .await.map_err(|_| SessionError::Unavailable)?;
        tx.commit().await.map_err(|_| SessionError::Unavailable)?;
        let (user_id, practice_id, display_name, capabilities, authorization_revision) =
            row.ok_or(SessionError::PracticeDenied)?;
        Ok(Membership {
            user_id,
            practice_id,
            display_name,
            capabilities,
            authorization_revision,
        })
    }
}

pub struct ConfiguredSessionRuntime {
    pub sessions: Arc<dyn SessionPort>,
    pub logout_recovery: Option<Arc<LogoutCoordinator>>,
}

pub async fn configured_sessions(
    database_url: Option<String>,
    authority_database_url: Option<String>,
    kratos_public_url: Option<String>,
    kratos_admin_url: Option<String>,
    allow_insecure: bool,
) -> Result<ConfiguredSessionRuntime, SessionError> {
    match (
        database_url,
        authority_database_url,
        kratos_public_url,
        kratos_admin_url,
    ) {
        (None, None, None, None) => Ok(ConfiguredSessionRuntime {
            sessions: Arc::new(UnavailableSessions),
            logout_recovery: None,
        }),
        (Some(database), Some(authority_database), Some(kratos), Some(kratos_admin)) => {
            let identities: Arc<dyn IdentityProvider> =
                Arc::new(KratosIdentityProvider::new(&kratos, allow_insecure)?);
            let journal = Arc::new(PgLogoutJournal::connect(&authority_database).await?);
            let logout = Arc::new(LogoutCoordinator {
                identities: identities.clone(),
                journal: journal.clone(),
                revoker: Arc::new(KratosSessionRevoker::new(
                    &kratos_admin,
                    &kratos,
                    allow_insecure,
                )?),
                clock: Arc::new(SystemClock),
                lease_duration: chrono::Duration::seconds(5),
                retry_delay: chrono::Duration::seconds(1),
            });
            let resolver: Arc<dyn SessionPort> = Arc::new(SessionService {
                identities,
                memberships: Arc::new(PgMembershipRepository::connect(&database).await?),
                denials: journal,
                inactive_observer: logout.clone(),
                clock: Arc::new(SystemClock),
                continuity: Arc::new(SessionContinuity::default()),
            });
            Ok(ConfiguredSessionRuntime {
                sessions: Arc::new(CoordinatedSessions {
                    resolver,
                    logout: logout.clone(),
                }),
                logout_recovery: Some(logout),
            })
        }
        _ => Err(SessionError::Unavailable),
    }
}

pub async fn run_logout_recovery(coordinator: Arc<LogoutCoordinator>) {
    let mut interval = tokio::time::interval(Duration::from_millis(250));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        interval.tick().await;
        match coordinator.recover_one().await {
            Ok(Some(LogoutResult::DeniedPending)) => {
                tracing::warn!("logout recovery remains pending")
            }
            Ok(Some(LogoutResult::Confirmed)) | Ok(None) => {}
            Err(_) => tracing::warn!("logout recovery unavailable"),
        }
    }
}

#[cfg(test)]
mod journal_tests;

#[cfg(test)]
mod transaction_tests;

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Router,
        http::{HeaderMap, StatusCode},
        routing::get,
    };
    use std::sync::Mutex;

    #[tokio::test]
    async fn session_provider_refuses_invalid_or_unavailable_authority() {
        let valid = serde_json::json!({
            "id": Uuid::new_v4(), "active": true,
            "expires_at": (Utc::now() + chrono::Duration::minutes(5)).to_rfc3339(),
            "identity": { "id": Uuid::new_v4(), "traits": { "role": "surgeon" } },
        });
        let mut inactive = valid.clone();
        inactive["active"] = false.into();
        let mut missing_active = valid.clone();
        missing_active.as_object_mut().unwrap().remove("active");
        let mut expired = valid.clone();
        expired["expires_at"] = "2000-01-01T00:00:00Z".into();
        let scenarios = [
            (200, inactive.to_string(), SessionError::Unauthenticated),
            (200, missing_active.to_string(), SessionError::Unavailable),
            (200, expired.to_string(), SessionError::Unauthenticated),
            (200, "invalid JSON".into(), SessionError::Unavailable),
            (200, "x".repeat(65 * 1024), SessionError::Unavailable),
            (401, "{}".into(), SessionError::Unauthenticated),
            (403, "{}".into(), SessionError::ReauthenticationRequired),
            (302, "{}".into(), SessionError::Unavailable),
            (500, "{}".into(), SessionError::Unavailable),
        ];
        for (status, body, expected) in scenarios {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let base = format!("http://{}", listener.local_addr().unwrap());
            let app = Router::new().route(
                "/sessions/whoami",
                get(move || {
                    let body = body.clone();
                    async move { (StatusCode::from_u16(status).unwrap(), body) }
                }),
            );
            let server = tokio::spawn(async move {
                axum::serve(listener, app).await.unwrap();
            });
            let provider = KratosIdentityProvider::new(&base, true).unwrap();
            let result = provider
                .authenticate(&SessionCredential::NativeToken("synthetic-test".into()))
                .await;
            server.abort();
            assert!(matches!(result, Err(error) if error == expected));
        }
    }

    #[tokio::test]
    async fn native_token_uses_the_kratos_session_header() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let observed = Arc::new(Mutex::new(None));
        let capture = observed.clone();
        let body = serde_json::json!({
            "id": Uuid::new_v4(),
            "active": true,
            "expires_at": (Utc::now() + chrono::Duration::minutes(5)).to_rfc3339(),
            "identity": { "id": Uuid::new_v4() },
        })
        .to_string();
        let app = Router::new().route(
            "/sessions/whoami",
            get(move |headers: HeaderMap| {
                let body = body.clone();
                let capture = capture.clone();
                async move {
                    *capture.lock().unwrap() = Some((
                        headers
                            .get("x-session-token")
                            .and_then(|value| value.to_str().ok())
                            .map(str::to_owned),
                        headers
                            .get("authorization")
                            .and_then(|value| value.to_str().ok())
                            .map(str::to_owned),
                    ));
                    (StatusCode::OK, body)
                }
            }),
        );
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        let provider = KratosIdentityProvider::new(&base, true).unwrap();

        assert!(
            provider
                .authenticate(&SessionCredential::NativeToken("synthetic-test".into()))
                .await
                .is_ok()
        );
        server.abort();
        assert_eq!(
            *observed.lock().unwrap(),
            Some((Some("synthetic-test".into()), None))
        );
    }

    #[tokio::test]
    async fn session_provider_connection_failure_is_unavailable() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        drop(listener);
        let provider = KratosIdentityProvider::new(&base, true).unwrap();
        let result = provider
            .authenticate(&SessionCredential::NativeToken("synthetic-test".into()))
            .await;
        assert!(matches!(result, Err(SessionError::Unavailable)));
    }

    #[tokio::test]
    async fn revalidation_reports_inactive_only_for_a_trusted_prior_issuer() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let app = Router::new().route(
            "/sessions/whoami",
            get(|| async { (StatusCode::UNAUTHORIZED, "{}") }),
        );
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        let provider = KratosIdentityProvider::new(&base, true).unwrap();
        let previous = AuthenticatedIdentity {
            identity_id: Uuid::new_v4(),
            session_id: Uuid::new_v4(),
            issuer: provider.issuer.clone(),
            principal: Principal::User,
            expires_at: Utc::now() + chrono::Duration::minutes(5),
        };

        assert!(matches!(
            provider
                .revalidate(
                    &SessionCredential::NativeToken("synthetic-test".into()),
                    &previous,
                )
                .await,
            Ok(IdentityRevalidation::Inactive)
        ));
        let mut foreign = previous.clone();
        foreign.issuer = "https://different-identity.example.test/".into();
        assert!(matches!(
            provider
                .revalidate(
                    &SessionCredential::NativeToken("synthetic-test".into()),
                    &foreign,
                )
                .await,
            Err(SessionError::Unauthenticated)
        ));
        server.abort();
    }

    #[test]
    fn session_provider_requires_explicit_plaintext_development_opt_in() {
        assert!(KratosIdentityProvider::new("http://localhost:4433", false).is_err());
        assert!(
            KratosIdentityProvider::new("https://localhost:4433?token=synthetic", false).is_err()
        );
        assert!(
            KratosIdentityProvider::new("https://user:synthetic@localhost:4433", false).is_err()
        );
        assert!(KratosIdentityProvider::new("https://localhost:4433", false).is_ok());
    }
}
