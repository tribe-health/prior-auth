//! Document assembly engine.
//!
//! A rendered clinical document contains exactly three kinds of text:
//!
//! 1. **template prose** — versioned, reviewed boilerplate; never a clinical assertion
//! 2. **document claims** — a statement backed by a source document, page and date
//! 3. **annotation claims** — a clinician's attributed opinion, never rendered as chart fact
//!
//! Clinical text reaches a template only through `claim(ordinal)`. The engine records
//! every ordinal rendered, so an unsupported claim is impossible by construction and
//! criterion coverage is a set difference. The engine has no clock, no I/O and no
//! storage: the same inputs always produce the same bytes and the same hash.
//!
//! The engine never assigns an evidence state. States are read from the caller's
//! committed record and only ever *read* here (see [`EvidenceState`]).
//!
//! This crate is deliberately domain-agnostic. It names no practice, no product and
//! no shell, so a desktop or mobile host can link it in-process on the local lane
//! while a server-side agent exposes the same function over a network channel.

pub mod claim;
pub mod engine;
pub mod kind;
pub mod package;
pub mod qa;

pub use claim::{Claim, Provenance, cite, render_claim};
pub use engine::{
    Assembly, AssemblyInput, CheckInputs, RenderedClaim, SignatureRefused, SigningReceipt, assemble,
};
pub use kind::{CitationPolicy, DocumentClass, DocumentKind, KindRegistry};
pub use package::{TemplatePackage, package_digest};
pub use qa::{QaCheck, QaFinding, QaOutcome, SCHEMA_QA_CHECKS};

use serde::{Deserialize, Serialize};

/// Mirror of the host's three evidence states. Read-only here: the engine never
/// assigns one. A missing match arm anywhere in this crate is a compile error,
/// and that is deliberate — `Void` is not a weak `Gap`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EvidenceState {
    /// A dated source document satisfies the criterion — cite it.
    Met,
    /// A document exists and contradicts or falls short — a clinician argues it.
    Gap,
    /// Nothing in the record addresses it — a coordinator obtains it.
    Void,
}

impl EvidenceState {
    /// Who does the work an unresolved state asks for. Routing is part of the
    /// contract because collapsing the two unresolved states sends the wrong
    /// person to the wrong job.
    pub fn routes_to(self) -> Option<Route> {
        match self {
            EvidenceState::Met => None,
            EvidenceState::Gap => Some(Route::Clinician),
            EvidenceState::Void => Some(Route::Coordinator),
        }
    }
}

/// The role an unresolved evidence state is routed to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Route {
    Clinician,
    Coordinator,
}

/// Errors the engine can produce. Every variant is a refusal, never a silent
/// degradation: a document that cannot be assembled under the contract is not
/// assembled at all.
#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("unknown document kind `{0}`")]
    UnknownKind(String),
    #[error("template package `{0}` is not the package kind `{1}` was registered against")]
    PackageMismatch(String, String),
    #[error("root template `{0}` is missing from the package")]
    MissingRoot(String),
    #[error("template error: {0}")]
    Template(#[from] minijinja::Error),
    #[error("clinical text refused outside a claim: context field `{0}`")]
    ClinicalTextInContext(String),
}

#[cfg(test)]
mod evidence_state_tests {
    use super::*;

    #[test]
    fn gap_routes_to_the_clinician_and_void_to_the_coordinator() {
        // ADR-003: a gap is a chart that says no; a void is a chart that is silent.
        assert_eq!(EvidenceState::Gap.routes_to(), Some(Route::Clinician));
        assert_eq!(EvidenceState::Void.routes_to(), Some(Route::Coordinator));
        assert_eq!(EvidenceState::Met.routes_to(), None);
    }

    #[test]
    fn wire_values_are_lowercase_and_void_survives() {
        let json =
            serde_json::to_string(&[EvidenceState::Met, EvidenceState::Gap, EvidenceState::Void])
                .unwrap();
        assert_eq!(json, r#"["met","gap","void"]"#);
        let back: Vec<EvidenceState> = serde_json::from_str(&json).unwrap();
        assert_eq!(back[2], EvidenceState::Void);
        assert!(serde_json::from_str::<EvidenceState>(r#""unmet""#).is_err());
    }
}
