//! Session authority shared by every shell. Credentials never serialize.

use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
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

/// Produced by server-side whoami validation, never from caller identity hints.
pub struct AuthenticatedIdentity {
    pub identity_id: Uuid,
    pub session_id: Uuid,
    /// Set by the trusted identity adapter, never by a request header or trait.
    pub principal: Principal,
    pub expires_at: DateTime<Utc>,
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
}

pub struct SessionService {
    pub identities: Arc<dyn IdentityProvider>,
    pub memberships: Arc<dyn MembershipRepository>,
    pub clock: Arc<dyn Clock>,
}

#[async_trait]
impl SessionPort for SessionService {
    async fn resolve(
        &self,
        credential: &SessionCredential,
        practice: Option<Uuid>,
    ) -> Result<SessionSummary, SessionError> {
        let identity = self.identities.authenticate(credential).await?;
        if identity.expires_at <= self.clock.now() {
            return Err(SessionError::Unauthenticated);
        }
        if identity.principal != Principal::User {
            return Err(SessionError::PracticeDenied);
        }
        let membership = self.memberships.resolve(&identity, practice).await?;
        // A slow database read cannot extend the validated credential's life.
        if identity.expires_at <= self.clock.now() {
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
