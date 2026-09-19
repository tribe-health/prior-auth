//! Document kinds and the six classes that decide a kind's rules.
//!
//! The class, not the individual template, sets whether text must be cited,
//! who finalizes the document, and whether it leaves the practice. Adding a
//! document means adding a kind to a class; adding a class is a design change.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::qa::QaCheck;

/// The six document classes named by the authorization mechanism.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DocumentClass {
    /// Letter of medical necessity, appeal, resubmission, RFI response,
    /// external review request, post-service authorization, re-read request.
    ClinicalCorrespondence,
    /// Reviewer-identity request, utilization-review complaint, records request.
    ProceduralCorrespondence,
    /// Peer-to-peer briefing, halt memo, request-versus-operative-report
    /// reconciliation, gap worklist.
    InternalWorkProduct,
    /// Task instructions by SMS or portal. Minimum necessary.
    PatientFacing,
    /// X12 278, Da Vinci PAS bundle. Same content model, serialized; no prose.
    StructuredTransaction,
    /// The pre-signature note check. Never generates findings.
    SourceDocumentationAssist,
}

impl DocumentClass {
    /// Whether clinical text in this class must arrive as claims.
    pub fn citation_policy(self) -> CitationPolicy {
        match self {
            DocumentClass::ClinicalCorrespondence => CitationPolicy::ClaimsOnly,
            DocumentClass::ProceduralCorrespondence => CitationPolicy::ProcessFactsCited,
            DocumentClass::InternalWorkProduct => CitationPolicy::ClaimsAndEvidenceStates,
            DocumentClass::PatientFacing => CitationPolicy::TaskFactsOnly,
            DocumentClass::StructuredTransaction => CitationPolicy::ClaimsOnly,
            DocumentClass::SourceDocumentationAssist => CitationPolicy::NoGeneratedFindings,
        }
    }

    /// Whether a document of this class is transmitted outside the practice.
    pub fn leaves_practice(self) -> bool {
        match self {
            DocumentClass::ClinicalCorrespondence
            | DocumentClass::ProceduralCorrespondence
            | DocumentClass::PatientFacing
            | DocumentClass::StructuredTransaction => true,
            DocumentClass::InternalWorkProduct | DocumentClass::SourceDocumentationAssist => false,
        }
    }

    /// The host capability that finalizes a document of this class. `None`
    /// means the class has no signer (internal work product, patient tasks)
    /// or the signer is an open decision the host must resolve (procedural).
    pub fn finalize_capability(self) -> Option<&'static str> {
        match self {
            DocumentClass::ClinicalCorrespondence => Some("sign_letter"),
            DocumentClass::StructuredTransaction => Some("sign_letter"),
            DocumentClass::ProceduralCorrespondence => None, // D-8: open
            DocumentClass::InternalWorkProduct
            | DocumentClass::PatientFacing
            | DocumentClass::SourceDocumentationAssist => None,
        }
    }
}

/// How clinical text may enter a document of a given class.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CitationPolicy {
    /// Clinical text only through `claim()`.
    ClaimsOnly,
    /// Process facts cited to determinations and receipts.
    ProcessFactsCited,
    /// Claims plus evidence states read from the committed record.
    ClaimsAndEvidenceStates,
    /// Task facts only; minimum necessary.
    TaskFactsOnly,
    /// Renders required elements and clinician-entered values; never a finding.
    NoGeneratedFindings,
}

/// One registered document kind. Mirrors the host's `*_types` idiom: a key,
/// a version, a class, the template package it renders from, and the QA
/// checks it runs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentKind {
    pub key: String,
    pub version: u32,
    pub class: DocumentClass,
    /// Name of the template package this kind renders from.
    pub template_package: String,
    /// Root template inside the package.
    pub root: String,
    /// QA checks this kind runs, by schema key.
    pub qa_checks: Vec<QaCheck>,
    /// Outputs the kind may be exported to. Advisory to the exporter; the
    /// engine emits canonical Markdown only.
    #[serde(default)]
    pub outputs: Vec<String>,
}

impl DocumentKind {
    pub fn citation_policy(&self) -> CitationPolicy {
        self.class.citation_policy()
    }
}

/// The kinds an engine instance knows. Keys are unique; registering a key
/// twice replaces the earlier version, which is how a package upgrade lands.
#[derive(Debug, Default, Clone)]
pub struct KindRegistry {
    kinds: BTreeMap<String, DocumentKind>,
}

impl KindRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&mut self, kind: DocumentKind) -> &mut Self {
        self.kinds.insert(kind.key.clone(), kind);
        self
    }

    pub fn get(&self, key: &str) -> Option<&DocumentKind> {
        self.kinds.get(key)
    }

    pub fn iter(&self) -> impl Iterator<Item = &DocumentKind> {
        self.kinds.values()
    }

    pub fn len(&self) -> usize {
        self.kinds.len()
    }

    pub fn is_empty(&self) -> bool {
        self.kinds.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_class_has_a_policy_and_a_transmission_answer() {
        // Exhaustive by construction: a new class variant fails to compile
        // above until these two match statements name it.
        for class in [
            DocumentClass::ClinicalCorrespondence,
            DocumentClass::ProceduralCorrespondence,
            DocumentClass::InternalWorkProduct,
            DocumentClass::PatientFacing,
            DocumentClass::StructuredTransaction,
            DocumentClass::SourceDocumentationAssist,
        ] {
            let _ = class.citation_policy();
            let _ = class.leaves_practice();
        }
        assert_eq!(
            DocumentClass::ClinicalCorrespondence.finalize_capability(),
            Some("sign_letter")
        );
        assert_eq!(
            DocumentClass::InternalWorkProduct.finalize_capability(),
            None
        );
        assert!(!DocumentClass::InternalWorkProduct.leaves_practice());
    }

    #[test]
    fn registering_a_key_twice_replaces_the_kind() {
        let mut r = KindRegistry::new();
        let k = |v| DocumentKind {
            key: "pa.initial_request".into(),
            version: v,
            class: DocumentClass::ClinicalCorrespondence,
            template_package: "aso-prior-auth".into(),
            root: "kinds/initial_request.md.j2".into(),
            qa_checks: vec![QaCheck::UnsupportedClaim],
            outputs: vec![],
        };
        r.register(k(1)).register(k(2));
        assert_eq!(r.len(), 1);
        assert_eq!(r.get("pa.initial_request").unwrap().version, 2);
    }
}
