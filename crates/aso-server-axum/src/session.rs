//! Verified session.
//!
//! A session is produced by validating a token against the identity provider —
//! never by trusting a decoded claim from the request. Decoded hints are
//! display-only.
//!
//! An AI assistant acting for a surgeon arrives as a *different principal*:
//! `Principal::Agent` rather than `Principal::User`, even at an identical
//! subject id. A policy granting a surgeon the ability to sign therefore
//! grants a delegated agent nothing at all.

use aso_host::domain::{ActorId, PracticeId};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Principal {
    /// A human, authenticated by session.
    User,
    /// A delegated agent. Never inherits the delegator's clinical authority.
    Agent,
    /// A machine client.
    Service,
}

#[derive(Debug, Clone)]
pub struct VerifiedSession {
    pub actor: ActorId,
    pub practice: PracticeId,
    pub principal: Principal,
    /// Set only for `Principal::Agent`: who this agent acts for. Recorded for
    /// audit — it grants nothing.
    pub on_behalf_of: Option<ActorId>,
}

impl VerifiedSession {
    /// Clinical acts require a human principal in addition to the capability.
    /// Two independent conditions, so neither alone is sufficient.
    pub fn may_attempt_clinical_act(&self) -> bool {
        matches!(self.principal, Principal::User)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn session(principal: Principal) -> VerifiedSession {
        VerifiedSession {
            actor: ActorId(Uuid::nil()),
            practice: PracticeId(Uuid::nil()),
            principal,
            on_behalf_of: None,
        }
    }

    #[test]
    fn an_agent_may_not_attempt_a_clinical_act() {
        assert!(!session(Principal::Agent).may_attempt_clinical_act());
        assert!(!session(Principal::Service).may_attempt_clinical_act());
        assert!(session(Principal::User).may_attempt_clinical_act());
    }
}
