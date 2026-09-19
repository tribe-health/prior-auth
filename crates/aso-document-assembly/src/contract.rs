//! The request and response the agent exchanges with its one caller, the
//! host's `draft_document` command.
//!
//! Bodies are actor-free. Identity, actor and signature never travel in a
//! payload: authority lives in Gate, `AppServices` and Postgres. The request
//! type is `deny_unknown_fields`, so `actor`, `identity`, `affirmed` or
//! `signature` are rejected at deserialization, and a test below keeps that
//! true.

use std::collections::{BTreeMap, BTreeSet};

use clinical_docs::{Assembly, CheckInputs, Claim, EvidenceState};
use serde::{Deserialize, Serialize};

use crate::a2ui::SurfaceDescriptor;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AssembleRequest {
    /// Registered kind key, e.g. `pa.initial_request`.
    pub kind: String,
    /// The package digest the caller expects. When present it must equal the
    /// digest of the package this agent loaded; a mismatch is refused so a
    /// letter is never rendered against a package the host did not pin.
    #[serde(default)]
    pub expected_package_digest: Option<String>,
    pub claims: Vec<Claim>,
    #[serde(default)]
    pub required_criteria: BTreeSet<String>,
    /// Committed evidence states by criterion, read by the host from
    /// `case_evidence`. The agent never changes one.
    #[serde(default)]
    pub evidence: BTreeMap<String, EvidenceState>,
    /// Non-clinical context: letterhead, dates, routing, codes.
    #[serde(default)]
    pub context: serde_json::Value,
    #[serde(default)]
    pub checks: CheckInputs,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssembleResponse {
    pub assembly: Assembly,
    pub surfaces: Vec<SurfaceDescriptor>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn actor_identity_and_signature_fields_are_refused_in_a_body() {
        for field in ["actor", "identity", "affirmed", "signature", "signedBy"] {
            let body =
                serde_json::json!({ "kind": "pa.initial_request", "claims": [], field: true });
            let err = serde_json::from_value::<AssembleRequest>(body)
                .unwrap_err()
                .to_string();
            assert!(err.contains("unknown field"), "{field}: {err}");
        }
    }

    #[test]
    fn a_minimal_request_deserializes_with_defaults() {
        let r: AssembleRequest = serde_json::from_value(
            serde_json::json!({ "kind": "pa.initial_request", "claims": [] }),
        )
        .unwrap();
        assert!(r.required_criteria.is_empty());
        assert!(r.evidence.is_empty());
        assert_eq!(r.checks, CheckInputs::default());
    }
}
