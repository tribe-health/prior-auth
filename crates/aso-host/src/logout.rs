//! Durable logout coordination shared by HTTP and desktop shells.

use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    ports::Clock,
    session::{
        AuthenticatedIdentity, IdentityProvider, InactiveSessionObserver, SessionCredential,
        SessionError, SessionPort, SessionSummary,
    },
};

/// The server has either confirmed Kratos inactivity or committed a denial
/// whose Kratos confirmation remains recoverable.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogoutResult {
    Confirmed,
    DeniedPending,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogoutClaim {
    pub deployment_id: Uuid,
    pub kratos_issuer: String,
    pub kratos_session_id: Uuid,
    pub lease_token: Uuid,
    pub lease_expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LogoutClaimOutcome {
    Confirmed,
    Pending,
    Claimed(LogoutClaim),
}

#[async_trait]
pub trait LogoutJournal: Send + Sync {
    async fn deny_and_claim(
        &self,
        identity: &AuthenticatedIdentity,
        now: DateTime<Utc>,
        lease_token: Uuid,
        lease_expires_at: DateTime<Utc>,
    ) -> Result<LogoutClaimOutcome, SessionError>;

    async fn claim_next(
        &self,
        now: DateTime<Utc>,
        lease_token: Uuid,
        lease_expires_at: DateTime<Utc>,
    ) -> Result<Option<LogoutClaim>, SessionError>;

    async fn confirm(
        &self,
        claim: &LogoutClaim,
        confirmed_at: DateTime<Utc>,
    ) -> Result<bool, SessionError>;

    async fn retry(
        &self,
        claim: &LogoutClaim,
        failed_at: DateTime<Utc>,
        next_attempt_at: DateTime<Utc>,
        error_code: &'static str,
    ) -> Result<bool, SessionError>;
}

#[async_trait]
pub trait SessionRevoker: Send + Sync {
    /// A successful result means Kratos confirms this session ID is inactive.
    async fn revoke(&self, claim: &LogoutClaim) -> Result<(), SessionError>;
}

pub struct LogoutCoordinator {
    pub identities: Arc<dyn IdentityProvider>,
    pub journal: Arc<dyn LogoutJournal>,
    pub revoker: Arc<dyn SessionRevoker>,
    pub clock: Arc<dyn Clock>,
    pub lease_duration: Duration,
    pub retry_delay: Duration,
}

impl LogoutCoordinator {
    pub async fn logout(
        &self,
        credential: &SessionCredential,
    ) -> Result<LogoutResult, SessionError> {
        let identity = self.identities.authenticate(credential).await?;
        let now = self.clock.now();
        if identity.expires_at <= now {
            return Err(SessionError::Unauthenticated);
        }
        let lease_token = Uuid::new_v4();
        let outcome = self
            .journal
            .deny_and_claim(&identity, now, lease_token, now + self.lease_duration)
            .await?;
        self.finish(outcome).await
    }

    pub async fn recover_one(&self) -> Result<Option<LogoutResult>, SessionError> {
        let now = self.clock.now();
        let claim = self
            .journal
            .claim_next(now, Uuid::new_v4(), now + self.lease_duration)
            .await?;
        match claim {
            Some(claim) => self
                .finish(LogoutClaimOutcome::Claimed(claim))
                .await
                .map(Some),
            None => Ok(None),
        }
    }

    async fn record_inactive(&self, identity: &AuthenticatedIdentity) -> Result<(), SessionError> {
        let now = self.clock.now();
        let outcome = self
            .journal
            .deny_and_claim(identity, now, Uuid::new_v4(), now + self.lease_duration)
            .await?;
        if let LogoutClaimOutcome::Claimed(claim) = outcome {
            // The trusted whoami observation already proved inactivity. The
            // denial is durable even if this bounded confirmation loses its lease.
            let _ = self.journal.confirm(&claim, self.clock.now()).await?;
        }
        Ok(())
    }

    async fn finish(&self, outcome: LogoutClaimOutcome) -> Result<LogoutResult, SessionError> {
        let claim = match outcome {
            LogoutClaimOutcome::Confirmed => return Ok(LogoutResult::Confirmed),
            LogoutClaimOutcome::Pending => return Ok(LogoutResult::DeniedPending),
            LogoutClaimOutcome::Claimed(claim) => claim,
        };

        if self.revoker.revoke(&claim).await.is_err() {
            let failed_at = self.clock.now();
            let _ = self
                .journal
                .retry(
                    &claim,
                    failed_at,
                    failed_at + self.retry_delay,
                    "kratos_revocation_unavailable",
                )
                .await;
            return Ok(LogoutResult::DeniedPending);
        }
        if self.journal.confirm(&claim, self.clock.now()).await? {
            Ok(LogoutResult::Confirmed)
        } else {
            Ok(LogoutResult::DeniedPending)
        }
    }
}

#[async_trait]
impl InactiveSessionObserver for LogoutCoordinator {
    async fn observe_inactive(&self, identity: &AuthenticatedIdentity) -> Result<(), SessionError> {
        self.record_inactive(identity).await
    }
}

pub struct CoordinatedSessions {
    pub resolver: Arc<dyn SessionPort>,
    pub logout: Arc<LogoutCoordinator>,
}

#[async_trait]
impl SessionPort for CoordinatedSessions {
    async fn resolve(
        &self,
        credential: &SessionCredential,
        practice: Option<Uuid>,
    ) -> Result<SessionSummary, SessionError> {
        self.resolver.resolve(credential, practice).await
    }

    async fn resolve_previously_verified(
        &self,
        credential: &SessionCredential,
        previously_verified: &AuthenticatedIdentity,
        practice: Option<Uuid>,
    ) -> Result<SessionSummary, SessionError> {
        self.resolver
            .resolve_previously_verified(credential, previously_verified, practice)
            .await
    }

    async fn logout(&self, credential: &SessionCredential) -> Result<LogoutResult, SessionError> {
        let result = self.logout.logout(credential).await?;
        self.resolver.forget(credential)?;
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use std::{
        collections::VecDeque,
        sync::{
            Mutex,
            atomic::{AtomicUsize, Ordering},
        },
    };

    use super::*;
    use crate::session::Principal;

    fn now() -> DateTime<Utc> {
        "2026-09-09T12:00:00Z".parse().unwrap()
    }

    fn claim() -> LogoutClaim {
        LogoutClaim {
            deployment_id: Uuid::from_u128(1),
            kratos_issuer: "https://identity.example.test/".into(),
            kratos_session_id: Uuid::from_u128(2),
            lease_token: Uuid::from_u128(3),
            lease_expires_at: now() + Duration::seconds(5),
        }
    }

    struct FixedClock;

    impl Clock for FixedClock {
        fn now(&self) -> DateTime<Utc> {
            now()
        }
    }

    struct Identity {
        events: Arc<Mutex<Vec<&'static str>>>,
    }

    #[async_trait]
    impl IdentityProvider for Identity {
        async fn authenticate(
            &self,
            _: &SessionCredential,
        ) -> Result<AuthenticatedIdentity, SessionError> {
            self.events.lock().unwrap().push("authenticate");
            Ok(AuthenticatedIdentity {
                identity_id: Uuid::from_u128(4),
                session_id: claim().kratos_session_id,
                issuer: claim().kratos_issuer,
                principal: Principal::User,
                expires_at: now() + Duration::hours(1),
            })
        }
    }

    struct Journal {
        events: Arc<Mutex<Vec<&'static str>>>,
        deny_outcome: Mutex<LogoutClaimOutcome>,
        recovery_claim: Mutex<Option<LogoutClaim>>,
        confirm_result: bool,
        deny_error: Mutex<Option<SessionError>>,
        confirm_error: Mutex<Option<SessionError>>,
    }

    #[async_trait]
    impl LogoutJournal for Journal {
        async fn deny_and_claim(
            &self,
            identity: &AuthenticatedIdentity,
            _: DateTime<Utc>,
            lease_token: Uuid,
            lease_expires_at: DateTime<Utc>,
        ) -> Result<LogoutClaimOutcome, SessionError> {
            self.events.lock().unwrap().push("deny");
            if let Some(error) = self.deny_error.lock().unwrap().take() {
                return Err(error);
            }
            let configured = self.deny_outcome.lock().unwrap().clone();
            Ok(match configured {
                LogoutClaimOutcome::Claimed(mut claim) => {
                    claim.kratos_issuer.clone_from(&identity.issuer);
                    claim.kratos_session_id = identity.session_id;
                    claim.lease_token = lease_token;
                    claim.lease_expires_at = lease_expires_at;
                    LogoutClaimOutcome::Claimed(claim)
                }
                other => other,
            })
        }

        async fn claim_next(
            &self,
            _: DateTime<Utc>,
            _: Uuid,
            _: DateTime<Utc>,
        ) -> Result<Option<LogoutClaim>, SessionError> {
            self.events.lock().unwrap().push("claim_next");
            Ok(self.recovery_claim.lock().unwrap().take())
        }

        async fn confirm(&self, _: &LogoutClaim, _: DateTime<Utc>) -> Result<bool, SessionError> {
            self.events.lock().unwrap().push("confirm");
            if let Some(error) = self.confirm_error.lock().unwrap().take() {
                return Err(error);
            }
            Ok(self.confirm_result)
        }

        async fn retry(
            &self,
            _: &LogoutClaim,
            _: DateTime<Utc>,
            _: DateTime<Utc>,
            _: &'static str,
        ) -> Result<bool, SessionError> {
            self.events.lock().unwrap().push("retry");
            Ok(true)
        }
    }

    struct Revoker {
        events: Arc<Mutex<Vec<&'static str>>>,
        results: Mutex<VecDeque<Result<(), SessionError>>>,
    }

    struct ForgettingResolver {
        forgets: AtomicUsize,
    }

    #[async_trait]
    impl SessionPort for ForgettingResolver {
        async fn resolve(
            &self,
            _: &SessionCredential,
            _: Option<Uuid>,
        ) -> Result<SessionSummary, SessionError> {
            Err(SessionError::Unavailable)
        }

        fn forget(&self, _: &SessionCredential) -> Result<(), SessionError> {
            self.forgets.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }
    }

    #[async_trait]
    impl SessionRevoker for Revoker {
        async fn revoke(&self, _: &LogoutClaim) -> Result<(), SessionError> {
            self.events.lock().unwrap().push("revoke");
            self.results.lock().unwrap().pop_front().unwrap_or(Ok(()))
        }
    }

    fn coordinator(
        outcome: LogoutClaimOutcome,
        recovery_claim: Option<LogoutClaim>,
        confirm_result: bool,
        revoke_results: Vec<Result<(), SessionError>>,
    ) -> (LogoutCoordinator, Arc<Mutex<Vec<&'static str>>>) {
        coordinator_with_faults(
            outcome,
            recovery_claim,
            confirm_result,
            revoke_results,
            None,
            None,
        )
    }

    fn coordinator_with_faults(
        outcome: LogoutClaimOutcome,
        recovery_claim: Option<LogoutClaim>,
        confirm_result: bool,
        revoke_results: Vec<Result<(), SessionError>>,
        deny_error: Option<SessionError>,
        confirm_error: Option<SessionError>,
    ) -> (LogoutCoordinator, Arc<Mutex<Vec<&'static str>>>) {
        let events = Arc::new(Mutex::new(Vec::new()));
        (
            LogoutCoordinator {
                identities: Arc::new(Identity {
                    events: events.clone(),
                }),
                journal: Arc::new(Journal {
                    events: events.clone(),
                    deny_outcome: Mutex::new(outcome),
                    recovery_claim: Mutex::new(recovery_claim),
                    confirm_result,
                    deny_error: Mutex::new(deny_error),
                    confirm_error: Mutex::new(confirm_error),
                }),
                revoker: Arc::new(Revoker {
                    events: events.clone(),
                    results: Mutex::new(revoke_results.into()),
                }),
                clock: Arc::new(FixedClock),
                lease_duration: Duration::seconds(5),
                retry_delay: Duration::seconds(1),
            },
            events,
        )
    }

    #[tokio::test]
    async fn logout_commits_denial_before_revocation_and_confirms_under_the_lease() {
        let (coordinator, events) = coordinator(
            LogoutClaimOutcome::Claimed(claim()),
            None,
            true,
            vec![Ok(())],
        );

        let result = coordinator
            .logout(&SessionCredential::NativeToken("synthetic".into()))
            .await;

        assert_eq!(result, Ok(LogoutResult::Confirmed));
        assert_eq!(
            *events.lock().unwrap(),
            ["authenticate", "deny", "revoke", "confirm"]
        );
    }

    #[tokio::test]
    async fn failed_revocation_leaves_a_retryable_denial() {
        let (coordinator, events) = coordinator(
            LogoutClaimOutcome::Claimed(claim()),
            None,
            true,
            vec![Err(SessionError::Unavailable)],
        );

        let result = coordinator
            .logout(&SessionCredential::Cookie("synthetic".into()))
            .await;

        assert_eq!(result, Ok(LogoutResult::DeniedPending));
        assert_eq!(
            *events.lock().unwrap(),
            ["authenticate", "deny", "revoke", "retry"]
        );
    }

    #[tokio::test]
    async fn failure_before_denial_commit_never_contacts_kratos_or_reports_success() {
        let (coordinator, events) = coordinator_with_faults(
            LogoutClaimOutcome::Claimed(claim()),
            None,
            true,
            vec![Ok(())],
            Some(SessionError::Unavailable),
            None,
        );

        let result = coordinator
            .logout(&SessionCredential::Cookie("synthetic".into()))
            .await;

        assert_eq!(result, Err(SessionError::Unavailable));
        assert_eq!(*events.lock().unwrap(), ["authenticate", "deny"]);
    }

    #[tokio::test]
    async fn completion_write_failure_recovers_after_idempotent_kratos_confirmation() {
        let (coordinator, events) = coordinator_with_faults(
            LogoutClaimOutcome::Claimed(claim()),
            Some(claim()),
            true,
            vec![Ok(()), Ok(())],
            None,
            Some(SessionError::Unavailable),
        );

        assert_eq!(
            coordinator
                .logout(&SessionCredential::NativeToken("synthetic".into()))
                .await,
            Err(SessionError::Unavailable)
        );
        assert_eq!(
            coordinator.recover_one().await,
            Ok(Some(LogoutResult::Confirmed))
        );
        assert_eq!(
            *events.lock().unwrap(),
            [
                "authenticate",
                "deny",
                "revoke",
                "confirm",
                "claim_next",
                "revoke",
                "confirm"
            ]
        );
    }

    #[tokio::test]
    async fn coordinated_logout_forgets_continuity_after_a_durable_outcome() {
        let (coordinator, _) = coordinator(
            LogoutClaimOutcome::Claimed(claim()),
            None,
            true,
            vec![Ok(())],
        );
        let resolver = Arc::new(ForgettingResolver {
            forgets: AtomicUsize::new(0),
        });
        let sessions = CoordinatedSessions {
            resolver: resolver.clone(),
            logout: Arc::new(coordinator),
        };

        assert_eq!(
            sessions
                .logout(&SessionCredential::NativeToken("synthetic".into()))
                .await,
            Ok(LogoutResult::Confirmed)
        );
        assert_eq!(resolver.forgets.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn recovery_claims_without_a_credential_and_finishes_idempotently() {
        let (coordinator, events) = coordinator(
            LogoutClaimOutcome::Pending,
            Some(claim()),
            true,
            vec![Ok(())],
        );

        assert_eq!(
            coordinator.recover_one().await,
            Ok(Some(LogoutResult::Confirmed))
        );
        assert_eq!(*events.lock().unwrap(), ["claim_next", "revoke", "confirm"]);
    }

    #[tokio::test]
    async fn trusted_inactive_observation_persists_and_confirms_without_revocation() {
        let (coordinator, events) =
            coordinator(LogoutClaimOutcome::Claimed(claim()), None, true, vec![]);
        let previous = AuthenticatedIdentity {
            identity_id: Uuid::from_u128(4),
            session_id: claim().kratos_session_id,
            issuer: claim().kratos_issuer,
            principal: Principal::User,
            expires_at: now() + Duration::hours(1),
        };

        assert_eq!(coordinator.observe_inactive(&previous).await, Ok(()));
        assert_eq!(*events.lock().unwrap(), ["deny", "confirm"]);
    }

    #[tokio::test]
    async fn lost_lease_and_existing_rows_never_report_false_confirmation() {
        let (lost_lease_coordinator, events) = coordinator(
            LogoutClaimOutcome::Claimed(claim()),
            None,
            false,
            vec![Ok(())],
        );
        assert_eq!(
            lost_lease_coordinator
                .logout(&SessionCredential::NativeToken("synthetic".into()))
                .await,
            Ok(LogoutResult::DeniedPending)
        );
        assert_eq!(
            *events.lock().unwrap(),
            ["authenticate", "deny", "revoke", "confirm"]
        );

        for (outcome, expected) in [
            (LogoutClaimOutcome::Confirmed, LogoutResult::Confirmed),
            (LogoutClaimOutcome::Pending, LogoutResult::DeniedPending),
        ] {
            let (coordinator, events) = coordinator(outcome, None, true, vec![]);
            assert_eq!(
                coordinator
                    .logout(&SessionCredential::NativeToken("synthetic".into()))
                    .await,
                Ok(expected)
            );
            assert_eq!(*events.lock().unwrap(), ["authenticate", "deny"]);
        }
    }
}
