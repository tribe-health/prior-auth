// TJ-ARCH-MOB-001 compliant
//! Who is acting. Role and principal kind are separate axes on purpose.

use serde::{Deserialize, Serialize};

/// Readiness payload for `GET /api/health`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Health {
    /// Always `"ok"` when the core answered.
    pub status: String,
    pub version: String,
}

/// Practice role. An administrator holds configuration powers only; it never
/// holds clinical authority (affirm, sign, submit, record outcome).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Surgeon,
    Coordinator,
    Administrator,
}

/// A delegated agent acting for a surgeon is a different principal. A policy
/// that grants the surgeon signing authority grants the agent nothing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrincipalKind {
    Human,
    DelegatedAgent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Principal {
    pub id: String,
    pub display_name: String,
    pub role: Role,
    pub kind: PrincipalKind,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub principal: Principal,
    pub practice: String,
}
