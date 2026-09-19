//! The one operation this agent performs: render a typed document from
//! cited claims and describe the surfaces that show it.

use std::sync::Arc;

use clinical_docs::{AssemblyInput, EngineError, assemble};

use crate::a2ui::{SurfaceDescriptor, describe};
use crate::contract::{AssembleRequest, AssembleResponse};
use crate::packages::Catalog;

#[derive(Debug, thiserror::Error)]
pub enum AssembleError {
    #[error("unknown document kind `{0}`")]
    UnknownKind(String),
    #[error("kind `{0}` names package `{1}`, which is not loaded")]
    PackageNotLoaded(String, String),
    #[error("caller expected package digest {expected}; loaded package is {loaded}")]
    PackageDigestMismatch { expected: String, loaded: String },
    #[error("document refused: {0}")]
    Refused(String),
    #[error("template failed to render: {0}")]
    Template(String),
}

impl AssembleError {
    /// A stable machine code for the wire. HTTP status is the route's concern.
    pub fn code(&self) -> &'static str {
        match self {
            AssembleError::UnknownKind(_) => "unknown_kind",
            AssembleError::PackageNotLoaded(..) => "package_not_loaded",
            AssembleError::PackageDigestMismatch { .. } => "package_digest_mismatch",
            AssembleError::Refused(_) => "refused",
            AssembleError::Template(_) => "template_error",
        }
    }
}

impl From<EngineError> for AssembleError {
    fn from(e: EngineError) -> Self {
        match e {
            EngineError::UnknownKind(k) => AssembleError::UnknownKind(k),
            EngineError::ClinicalTextInContext(_)
            | EngineError::PackageMismatch(..)
            | EngineError::MissingRoot(_) => AssembleError::Refused(e.to_string()),
            EngineError::Template(t) => AssembleError::Template(t.to_string()),
        }
    }
}

/// Render one document. Pure apart from reading the catalog loaded at start.
pub fn run(
    catalog: &Arc<Catalog>,
    req: &AssembleRequest,
) -> Result<AssembleResponse, AssembleError> {
    let kind = catalog
        .kinds
        .get(&req.kind)
        .ok_or_else(|| AssembleError::UnknownKind(req.kind.clone()))?;
    let package = catalog.package_for(kind).ok_or_else(|| {
        AssembleError::PackageNotLoaded(kind.key.clone(), kind.template_package.clone())
    })?;
    if let Some(expected) = &req.expected_package_digest {
        let loaded = package.digest();
        if *expected != loaded {
            return Err(AssembleError::PackageDigestMismatch {
                expected: expected.clone(),
                loaded,
            });
        }
    }
    let assembly = assemble(&AssemblyInput {
        kind,
        package,
        claims: &req.claims,
        required_criteria: &req.required_criteria,
        evidence: &req.evidence,
        context: req.context.clone(),
        checks: req.checks.clone(),
    })?;

    let mut surfaces: Vec<SurfaceDescriptor> = Vec::with_capacity(4);
    surfaces.push(
        describe(
            "DraftPreviewBlock",
            "aso.draft_preview.v1",
            "main",
            serde_json::json!({
                "kindKey": assembly.kind_key,
                "kindVersion": assembly.kind_version,
                "class": kind.class,
                "contentSha256": assembly.content_sha256,
                "templateDigest": assembly.template_digest,
                "canonicalMarkdown": assembly.canonical_markdown,
                "approvable": assembly.approvable(),
            }),
        )
        .expect("allowlisted"),
    );
    surfaces.push(
        describe(
            "QaFindingsBlock",
            "aso.qa_findings.v1",
            "side",
            serde_json::json!({ "findings": assembly.qa }),
        )
        .expect("allowlisted"),
    );
    surfaces.push(
        describe(
            "ClaimsManifestBlock",
            "aso.claims_manifest.v1",
            "side",
            serde_json::json!({ "claims": assembly.rendered_claims }),
        )
        .expect("allowlisted"),
    );
    if !assembly.approvable() {
        let blocking: Vec<&clinical_docs::QaFinding> = assembly
            .qa
            .iter()
            .filter(|q| q.is_blocking_failure())
            .collect();
        let routing: Vec<serde_json::Value> = req
            .evidence
            .iter()
            .filter_map(|(criterion, state)| state.routes_to().map(|route| serde_json::json!({ "criterion": criterion, "state": state, "routesTo": route })))
            .collect();
        surfaces.push(
            describe(
                "HaltMemoBlock",
                "aso.halt_memo.v1",
                "main",
                serde_json::json!({ "blocking": blocking, "routing": routing }),
            )
            .expect("allowlisted"),
        );
    }
    Ok(AssembleResponse { assembly, surfaces })
}
