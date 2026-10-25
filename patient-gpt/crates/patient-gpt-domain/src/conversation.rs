// TJ-ARCH-MOB-001 compliant
//! Conversation scope: all patients, one patient, or one case.

use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Serialize};

/// The wire form is tagged by `kind`. The query-string form is
/// `all | patient:<id> | case:<patientId>:<caseId>`; anything else is
/// rejected, never defaulted to `all`.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ConversationScope {
    All,
    Patient { patient_id: String },
    Case { patient_id: String, case_id: String },
}

impl ConversationScope {
    /// The patient this scope is bound to, if any.
    pub fn patient_id(&self) -> Option<&str> {
        match self {
            Self::All => None,
            Self::Patient { patient_id } | Self::Case { patient_id, .. } => Some(patient_id),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ScopeParseError {
    #[error("scope is empty; expected all | patient:<id> | case:<patientId>:<caseId>")]
    Empty,
    #[error("unknown scope kind `{0}`; expected all | patient:<id> | case:<patientId>:<caseId>")]
    UnknownKind(String),
    #[error("scope `{0}` is malformed; expected all | patient:<id> | case:<patientId>:<caseId>")]
    Malformed(String),
}

impl FromStr for ConversationScope {
    type Err = ScopeParseError;

    fn from_str(raw: &str) -> Result<Self, Self::Err> {
        if raw.is_empty() {
            return Err(ScopeParseError::Empty);
        }
        let parts: Vec<&str> = raw.split(':').collect();
        let malformed = || ScopeParseError::Malformed(raw.to_owned());
        if parts.iter().any(|part| part.is_empty()) {
            return Err(malformed());
        }
        match parts.as_slice() {
            ["all"] => Ok(Self::All),
            ["patient", patient_id] => Ok(Self::Patient {
                patient_id: (*patient_id).to_owned(),
            }),
            ["case", patient_id, case_id] => Ok(Self::Case {
                patient_id: (*patient_id).to_owned(),
                case_id: (*case_id).to_owned(),
            }),
            ["all", ..] | ["patient", ..] | ["case", ..] => Err(malformed()),
            [kind, ..] => Err(ScopeParseError::UnknownKind((*kind).to_owned())),
            [] => Err(ScopeParseError::Empty),
        }
    }
}

impl fmt::Display for ConversationScope {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::All => f.write_str("all"),
            Self::Patient { patient_id } => write!(f, "patient:{patient_id}"),
            Self::Case {
                patient_id,
                case_id,
            } => write!(f, "case:{patient_id}:{case_id}"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummary {
    pub id: String,
    pub scope: ConversationScope,
    pub title: String,
    /// RFC 3339.
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRequest {
    pub conversation_id: Option<String>,
    pub scope: ConversationScope,
    pub message: String,
}
