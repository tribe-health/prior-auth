//! Session authority shared by every shell. Credentials never serialize.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    domain::{ActorId, PracticeId},
    ports::Clock,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Principal {
    User,
    Agent,
    Service,
}

#[derive(Debug, Clone)]
pub struct VerifiedSession {
    pub actor: ActorId,
    pub practice: PracticeId,
    pub principal: Principal,
    pub on_behalf_of: Option<ActorId>,
}

impl VerifiedSession {
    pub fn may_attempt_clinical_act(&self) -> bool {
        matches!(self.principal, Principal::User)
    }
}

/// Opaque input accepted only by the trusted identity adapter. No Debug or
/// Serialize implementation: logging a request must not disclose a credential.
pub enum SessionCredential {
    Cookie(String),
    NativeToken(String),
}

impl SessionCredential {
    fn continuity_fingerprint(&self) -> [u8; 32] {
        let mut digest = Sha256::new();
        match self {
            Self::Cookie(cookie) => {
                digest.update(b"cookie\0");
                let values = cookie
                    .split(';')
                    .filter_map(|pair| pair.trim().split_once('='))
                    .filter(|(name, _)| name.trim() == "ory_kratos_session")
                    .map(|(_, value)| value.trim())
                    .collect::<Vec<_>>();
                if let [value] = values.as_slice() {
                    digest.update(value.as_bytes());
                } else {
                    digest.update(cookie.as_bytes());
                }
            }
            Self::NativeToken(token) => {
                digest.update(b"native-token\0");
                digest.update(token.as_bytes());
            }
        }
        digest.finalize().into()
    }
}

/// Produced by server-side whoami validation, never from caller identity hints.
#[derive(Clone)]
pub struct AuthenticatedIdentity {
    pub identity_id: Uuid,
    pub session_id: Uuid,
    /// Canonical Kratos deployment URL supplied by the trusted adapter.
    pub issuer: String,
    /// Set by the trusted identity adapter, never by a request header or trait.
    pub principal: Principal,
    pub expires_at: DateTime<Utc>,
}

pub enum IdentityRevalidation {
    Active(AuthenticatedIdentity),
    Inactive,
}

pub struct Membership {
    pub user_id: Uuid,
    pub practice_id: Uuid,
    pub display_name: String,
    pub capabilities: Vec<String>,
    pub authorization_revision: String,
}

/// A noncredential projection. It grants no authority to subsequent commands.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub identity_id: Uuid,
    pub session_id: Uuid,
    pub user_id: Uuid,
    pub practice_id: Uuid,
    pub display_name: String,
    pub principal: Principal,
    pub capabilities: Vec<String>,
    pub expires_at: DateTime<Utc>,
    pub authorization_revision: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum SessionError {
    #[error("authentication required")]
    Unauthenticated,
    #[error("additional authentication required")]
    ReauthenticationRequired,
    #[error("practice access denied")]
    PracticeDenied,
    #[error("session service unavailable")]
    Unavailable,
    #[error("native authentication unavailable")]
    NativeAuthenticationUnavailable,
}

#[async_trait]
pub trait IdentityProvider: Send + Sync {
    async fn authenticate(
        &self,
        credential: &SessionCredential,
    ) -> Result<AuthenticatedIdentity, SessionError>;

    /// Revalidates a credential already bound to a server-verified identity.
    /// Shell request fields must never supply `previously_verified`.
    async fn revalidate(
        &self,
        credential: &SessionCredential,
        previously_verified: &AuthenticatedIdentity,
    ) -> Result<IdentityRevalidation, SessionError> {
        match self.authenticate(credential).await {
            Ok(identity)
                if identity.issuer == previously_verified.issuer
                    && identity.session_id == previously_verified.session_id
                    && identity.identity_id == previously_verified.identity_id =>
            {
                Ok(IdentityRevalidation::Active(identity))
            }
            Ok(_) => Err(SessionError::Unauthenticated),
            Err(SessionError::Unauthenticated) => Ok(IdentityRevalidation::Inactive),
            Err(error) => Err(error),
        }
    }
}

#[async_trait]
pub trait SessionDenialRepository: Send + Sync {
    async fn is_denied(
        &self,
        identity: &AuthenticatedIdentity,
        at: DateTime<Utc>,
    ) -> Result<bool, SessionError>;
}

#[async_trait]
pub trait InactiveSessionObserver: Send + Sync {
    async fn observe_inactive(&self, identity: &AuthenticatedIdentity) -> Result<(), SessionError>;
}

#[async_trait]
pub trait MembershipRepository: Send + Sync {
    async fn resolve(
        &self,
        identity: &AuthenticatedIdentity,
        practice: Option<Uuid>,
    ) -> Result<Membership, SessionError>;
}

#[async_trait]
pub trait SessionPort: Send + Sync {
    async fn resolve(
        &self,
        credential: &SessionCredential,
        practice: Option<Uuid>,
    ) -> Result<SessionSummary, SessionError>;

    /// Used only by a mounted server path that retained the identity returned
    /// by a prior successful validation. No transport may deserialize it.
    async fn resolve_previously_verified(
        &self,
        _: &SessionCredential,
        _: &AuthenticatedIdentity,
        _: Option<Uuid>,
    ) -> Result<SessionSummary, SessionError> {
        Err(SessionError::Unavailable)
    }

    async fn logout(
        &self,
        _: &SessionCredential,
    ) -> Result<crate::logout::LogoutResult, SessionError> {
        Err(SessionError::Unavailable)
    }

    fn forget(&self, _: &SessionCredential) -> Result<(), SessionError> {
        Ok(())
    }
}

/// Process-local continuity for a single configured authority deployment.
/// Credentials are never retained; the key is a one-way fingerprint.
#[derive(Default)]
pub struct SessionContinuity {
    identities: Mutex<HashMap<[u8; 32], AuthenticatedIdentity>>,
}

impl SessionContinuity {
    fn recall(
        &self,
        credential: &SessionCredential,
        now: DateTime<Utc>,
    ) -> Result<Option<AuthenticatedIdentity>, SessionError> {
        let mut identities = self
            .identities
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        identities.retain(|_, identity| identity.expires_at > now);
        Ok(identities
            .get(&credential.continuity_fingerprint())
            .cloned())
    }

    fn remember(
        &self,
        credential: &SessionCredential,
        identity: AuthenticatedIdentity,
    ) -> Result<(), SessionError> {
        self.identities
            .lock()
            .map_err(|_| SessionError::Unavailable)?
            .insert(credential.continuity_fingerprint(), identity);
        Ok(())
    }

    fn forget(&self, credential: &SessionCredential) -> Result<(), SessionError> {
        self.identities
            .lock()
            .map_err(|_| SessionError::Unavailable)?
            .remove(&credential.continuity_fingerprint());
        Ok(())
    }
}

pub struct SessionService {
    pub identities: Arc<dyn IdentityProvider>,
    pub memberships: Arc<dyn MembershipRepository>,
    pub denials: Arc<dyn SessionDenialRepository>,
    pub inactive_observer: Arc<dyn InactiveSessionObserver>,
    pub clock: Arc<dyn Clock>,
    pub continuity: Arc<SessionContinuity>,
}

impl SessionService {
    async fn resolve_identity(
        &self,
        identity: AuthenticatedIdentity,
        practice: Option<Uuid>,
    ) -> Result<SessionSummary, SessionError> {
        let now = self.clock.now();
        if identity.expires_at <= now {
            return Err(SessionError::Unauthenticated);
        }
        if identity.principal != Principal::User {
            return Err(SessionError::PracticeDenied);
        }
        if self.denials.is_denied(&identity, now).await? {
            return Err(SessionError::Unauthenticated);
        }
        let membership = self.memberships.resolve(&identity, practice).await?;
        // Slow authority reads cannot extend a credential or race a denial
        // committed while membership was resolving.
        let now = self.clock.now();
        if identity.expires_at <= now || self.denials.is_denied(&identity, now).await? {
            return Err(SessionError::Unauthenticated);
        }
        Ok(SessionSummary {
            identity_id: identity.identity_id,
            session_id: identity.session_id,
            user_id: membership.user_id,
            practice_id: membership.practice_id,
            display_name: membership.display_name,
            principal: identity.principal,
            capabilities: membership.capabilities,
            expires_at: identity.expires_at,
            authorization_revision: membership.authorization_revision,
        })
    }
}

#[async_trait]
impl SessionPort for SessionService {
    async fn resolve(
        &self,
        credential: &SessionCredential,
        practice: Option<Uuid>,
    ) -> Result<SessionSummary, SessionError> {
        if let Some(previously_verified) = self.continuity.recall(credential, self.clock.now())? {
            let result = self
                .resolve_previously_verified(credential, &previously_verified, practice)
                .await;
            if matches!(
                result,
                Err(SessionError::Unauthenticated | SessionError::ReauthenticationRequired)
            ) {
                self.continuity.forget(credential)?;
            }
            return result;
        }
        let identity = self.identities.authenticate(credential).await?;
        let result = self.resolve_identity(identity.clone(), practice).await;
        if result.is_ok() {
            self.continuity.remember(credential, identity)?;
        }
        result
    }

    async fn resolve_previously_verified(
        &self,
        credential: &SessionCredential,
        previously_verified: &AuthenticatedIdentity,
        practice: Option<Uuid>,
    ) -> Result<SessionSummary, SessionError> {
        match self
            .identities
            .revalidate(credential, previously_verified)
            .await?
        {
            IdentityRevalidation::Active(identity) => {
                self.resolve_identity(identity, practice).await
            }
            IdentityRevalidation::Inactive => {
                if previously_verified.expires_at > self.clock.now() {
                    self.inactive_observer
                        .observe_inactive(previously_verified)
                        .await?;
                }
                Err(SessionError::Unauthenticated)
            }
        }
    }

    fn forget(&self, credential: &SessionCredential) -> Result<(), SessionError> {
        self.continuity.forget(credential)
    }
}

/// Clean-checkout composition refuses authenticated session work until configured.
pub struct UnavailableSessions;

#[async_trait]
impl SessionPort for UnavailableSessions {
    async fn resolve(
        &self,
        _: &SessionCredential,
        _: Option<Uuid>,
    ) -> Result<SessionSummary, SessionError> {
        Err(SessionError::Unavailable)
    }
}

#[cfg(test)]
mod tests {
    use std::{
        collections::VecDeque,
        sync::{
            Arc, Mutex,
            atomic::{AtomicUsize, Ordering},
        },
    };

    use super::*;

    fn now() -> DateTime<Utc> {
        "2026-09-09T12:00:00Z".parse().unwrap()
    }

    fn identity() -> AuthenticatedIdentity {
        AuthenticatedIdentity {
            identity_id: Uuid::from_u128(1),
            session_id: Uuid::from_u128(2),
            issuer: "https://identity.example.test/".into(),
            principal: Principal::User,
            expires_at: now() + chrono::Duration::hours(1),
        }
    }

    struct FixedClock;

    impl Clock for FixedClock {
        fn now(&self) -> DateTime<Utc> {
            now()
        }
    }

    struct Identity {
        revalidation: Mutex<Option<IdentityRevalidation>>,
    }

    #[async_trait]
    impl IdentityProvider for Identity {
        async fn authenticate(
            &self,
            _: &SessionCredential,
        ) -> Result<AuthenticatedIdentity, SessionError> {
            Ok(identity())
        }

        async fn revalidate(
            &self,
            _: &SessionCredential,
            _: &AuthenticatedIdentity,
        ) -> Result<IdentityRevalidation, SessionError> {
            Ok(self.revalidation.lock().unwrap().take().unwrap())
        }
    }

    struct Memberships {
        calls: AtomicUsize,
    }

    #[async_trait]
    impl MembershipRepository for Memberships {
        async fn resolve(
            &self,
            _: &AuthenticatedIdentity,
            practice: Option<Uuid>,
        ) -> Result<Membership, SessionError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(Membership {
                user_id: Uuid::from_u128(3),
                practice_id: practice.unwrap_or(Uuid::from_u128(4)),
                display_name: "Synthetic User".into(),
                capabilities: vec![],
                authorization_revision: "synthetic:1".into(),
            })
        }
    }

    struct Denials {
        results: Mutex<VecDeque<bool>>,
    }

    #[async_trait]
    impl SessionDenialRepository for Denials {
        async fn is_denied(
            &self,
            _: &AuthenticatedIdentity,
            _: DateTime<Utc>,
        ) -> Result<bool, SessionError> {
            Ok(self.results.lock().unwrap().pop_front().unwrap_or(false))
        }
    }

    struct Observer {
        observed: Mutex<Vec<(String, Uuid)>>,
    }

    #[async_trait]
    impl InactiveSessionObserver for Observer {
        async fn observe_inactive(
            &self,
            identity: &AuthenticatedIdentity,
        ) -> Result<(), SessionError> {
            self.observed
                .lock()
                .unwrap()
                .push((identity.issuer.clone(), identity.session_id));
            Ok(())
        }
    }

    fn service(
        denial_results: Vec<bool>,
        revalidation: IdentityRevalidation,
    ) -> (SessionService, Arc<Memberships>, Arc<Observer>) {
        let memberships = Arc::new(Memberships {
            calls: AtomicUsize::new(0),
        });
        let observer = Arc::new(Observer {
            observed: Mutex::new(Vec::new()),
        });
        (
            SessionService {
                identities: Arc::new(Identity {
                    revalidation: Mutex::new(Some(revalidation)),
                }),
                memberships: memberships.clone(),
                denials: Arc::new(Denials {
                    results: Mutex::new(denial_results.into()),
                }),
                inactive_observer: observer.clone(),
                clock: Arc::new(FixedClock),
                continuity: Arc::new(SessionContinuity::default()),
            },
            memberships,
            observer,
        )
    }

    #[tokio::test]
    async fn denied_session_is_refused_before_membership_resolution() {
        let (service, memberships, _) =
            service(vec![true], IdentityRevalidation::Active(identity()));

        let result = service
            .resolve(
                &SessionCredential::NativeToken("synthetic".into()),
                Some(Uuid::from_u128(4)),
            )
            .await;

        assert_eq!(result, Err(SessionError::Unauthenticated));
        assert_eq!(memberships.calls.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn denial_committed_during_membership_resolution_blocks_the_result() {
        let (service, memberships, _) =
            service(vec![false, true], IdentityRevalidation::Active(identity()));

        let result = service
            .resolve(
                &SessionCredential::Cookie("synthetic".into()),
                Some(Uuid::from_u128(4)),
            )
            .await;

        assert_eq!(result, Err(SessionError::Unauthenticated));
        assert_eq!(memberships.calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn trusted_inactive_revalidation_records_the_prior_identity_before_refusal() {
        let (service, memberships, observer) = service(vec![], IdentityRevalidation::Inactive);
        let previous = identity();

        let result = service
            .resolve_previously_verified(
                &SessionCredential::Cookie("synthetic".into()),
                &previous,
                Some(Uuid::from_u128(4)),
            )
            .await;

        assert_eq!(result, Err(SessionError::Unauthenticated));
        assert_eq!(memberships.calls.load(Ordering::SeqCst), 0);
        assert_eq!(
            *observer.observed.lock().unwrap(),
            [(previous.issuer, previous.session_id)]
        );
    }

    #[tokio::test]
    async fn mounted_resolve_revalidates_cached_identity_and_records_inactive() {
        let (service, memberships, observer) =
            service(vec![false, false], IdentityRevalidation::Inactive);
        let first =
            SessionCredential::Cookie("theme=dark; ory_kratos_session=synthetic-session".into());
        let second =
            SessionCredential::Cookie("ory_kratos_session=synthetic-session; theme=light".into());

        assert!(
            service
                .resolve(&first, Some(Uuid::from_u128(4)))
                .await
                .is_ok()
        );
        assert_eq!(
            service.resolve(&second, Some(Uuid::from_u128(4))).await,
            Err(SessionError::Unauthenticated)
        );
        assert_eq!(memberships.calls.load(Ordering::SeqCst), 1);
        assert_eq!(
            *observer.observed.lock().unwrap(),
            [(identity().issuer, identity().session_id)]
        );
    }
}
