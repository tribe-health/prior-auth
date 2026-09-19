//! `assemble`: the pure function at the centre of the contract.

use std::collections::{BTreeMap, BTreeSet};
use std::sync::{Arc, Mutex};

use minijinja::{Environment, Error, ErrorKind, UndefinedBehavior, Value, context};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::claim::{Claim, Provenance, cite, render_claim};
use crate::kind::{CitationPolicy, DocumentKind};
use crate::package::{TemplatePackage, hex};
use crate::qa::{QaCheck, QaFinding, QaOutcome};
use crate::{EngineError, EvidenceState};

/// Context keys that would carry clinical text into a template as prose.
/// Refused at the door: this is defect 4 of ASO-DA-SPEC-001 (free-text
/// clinical fields with no document, page or date).
const CLINICAL_CONTEXT_KEYS: &[&str] = &[
    "clinical",
    "clinical_summary",
    "symptoms",
    "symptom_summary",
    "functional_impact",
    "necessity",
    "necessity_rationale",
    "findings",
    "exam",
    "neuro_exam",
    "imaging",
    "history",
    "diagnosis",
    "diagnoses",
    "denial_responses",
];

/// Facts the non-constructive QA checks compare. Each is optional; an absent
/// pair yields `not_applicable`, never a silent pass.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct CheckInputs {
    /// Policy version the letter cites and the version in force on the date
    /// of service, as the host resolved them.
    pub cited_policy_version: Option<String>,
    pub in_force_policy_version: Option<String>,
    /// Codes the letter requests and the codes of the affirmed pathway.
    pub requested_codes: Vec<String>,
    pub affirmed_pathway_codes: Vec<String>,
    /// Dates that must agree: each entry is `(label, value)`; the check fails
    /// when the same label appears with two values.
    pub dates: Vec<(String, String)>,
}

/// A signing receipt the host obtained through its own signing command. A
/// signature is rendered only from one of these, and only when its hash is
/// the hash of the document being signed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SigningReceipt {
    pub content_sha256: String,
    pub signer_display_name: String,
    pub signer_credentials: String,
    pub signed_on: String,
    pub attestation: String,
}

pub struct AssemblyInput<'a> {
    pub kind: &'a DocumentKind,
    pub package: &'a TemplatePackage,
    pub claims: &'a [Claim],
    /// Criterion identifiers the governing policy section requires.
    pub required_criteria: &'a BTreeSet<String>,
    /// Committed evidence states by criterion identifier. Read, never written.
    pub evidence: &'a BTreeMap<String, EvidenceState>,
    /// Non-clinical context: letterhead, dates, routing, codes. Clinical
    /// facts are refused here.
    pub context: serde_json::Value,
    pub checks: CheckInputs,
}

/// One rendered claim, in first-render order. The host writes one
/// `letter_claims` row per entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderedClaim {
    pub ordinal: u32,
    pub text: String,
    pub provenance: Provenance,
    pub criterion_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Assembly {
    pub kind_key: String,
    pub kind_version: u32,
    pub template_package: String,
    pub template_digest: String,
    /// The unsigned canonical body. This is what a signing receipt binds.
    pub canonical_markdown: String,
    pub rendered_claims: Vec<RenderedClaim>,
    pub qa: Vec<QaFinding>,
    /// `sha256:<hex>` over kind key, kind version, template digest and the
    /// canonical bytes.
    pub content_sha256: String,
}

impl Assembly {
    /// True when no blocking check failed.
    pub fn approvable(&self) -> bool {
        !self.qa.iter().any(QaFinding::is_blocking_failure)
    }

    /// The signed body: the canonical body plus a signature block rendered
    /// from a receipt. Refused unless the receipt names this exact content
    /// hash — a signature never comes from caller data.
    pub fn render_signed(&self, receipt: &SigningReceipt) -> Result<String, SignatureRefused> {
        if receipt.content_sha256 != self.content_sha256 {
            return Err(SignatureRefused::HashMismatch {
                expected: self.content_sha256.clone(),
                receipt: receipt.content_sha256.clone(),
            });
        }
        let mut out = self.canonical_markdown.clone();
        if !out.ends_with('\n') {
            out.push('\n');
        }
        out.push_str(&format!(
            "\n**{}**  \n{}\n\n*{} Signed {}. Content hash {}.*\n",
            receipt.signer_display_name,
            receipt.signer_credentials,
            receipt.attestation,
            receipt.signed_on,
            receipt.content_sha256
        ));
        Ok(out)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SignatureRefused {
    #[error("signing receipt is for {receipt}, not this document ({expected})")]
    HashMismatch { expected: String, receipt: String },
}

/// Assemble a document. Pure: no I/O, no clock, no storage.
pub fn assemble(input: &AssemblyInput) -> Result<Assembly, EngineError> {
    refuse_clinical_context(&input.context)?;
    if input.package.name != input.kind.template_package {
        return Err(EngineError::PackageMismatch(
            input.package.name.clone(),
            input.kind.key.clone(),
        ));
    }
    if !input.package.contains(&input.kind.root) {
        return Err(EngineError::MissingRoot(input.kind.root.clone()));
    }

    let by_ordinal: Arc<BTreeMap<u32, Claim>> = Arc::new(
        input
            .claims
            .iter()
            .map(|c| (c.ordinal, c.clone()))
            .collect(),
    );
    let used: Arc<Mutex<Vec<u32>>> = Arc::new(Mutex::new(Vec::new()));

    let mut env = Environment::new();
    env.set_undefined_behavior(UndefinedBehavior::SemiStrict);
    env.set_trim_blocks(true);
    env.set_lstrip_blocks(true);
    let files = input.package.files.clone();
    env.set_loader(move |name| Ok(files.get(name).cloned()));

    // Annotation-only claims are internal work product only. A document that
    // leaves the practice cites chart documents; an annotation may add
    // attribution to one but cannot stand in for one (web-00, decision 2).
    let policy = input.kind.citation_policy();
    let external = policy != CitationPolicy::ClaimsAndEvidenceStates;
    let refuse_documentless = move |c: &Claim| -> Result<(), Error> {
        if external && !c.provenance.has_document() {
            return Err(Error::new(
                ErrorKind::InvalidOperation,
                format!(
                    "claim {} is an annotation with no backing document; external correspondence cites documents only",
                    c.ordinal
                ),
            ));
        }
        Ok(())
    };

    // claim(ordinal): the only channel for clinical text.
    let (claims_fn, used_fn) = (Arc::clone(&by_ordinal), Arc::clone(&used));
    env.add_function("claim", move |ordinal: u32| -> Result<Value, Error> {
        let c = claims_fn.get(&ordinal).ok_or_else(|| {
            Error::new(
                ErrorKind::InvalidOperation,
                format!("claim {ordinal} does not exist; clinical text must come from a claim"),
            )
        })?;
        refuse_documentless(c)?;
        let mut u = used_fn.lock().expect("claim usage lock");
        if !u.contains(&ordinal) {
            u.push(ordinal);
        }
        Ok(Value::from(render_claim(c)))
    });

    // claims_for(criterion_id): every claim addressing a criterion, rendered.
    let (claims_fn, used_fn) = (Arc::clone(&by_ordinal), Arc::clone(&used));
    env.add_function(
        "claims_for",
        move |criterion: String| -> Result<Value, Error> {
            let mut out = Vec::new();
            let mut u = used_fn.lock().expect("claim usage lock");
            for c in claims_fn.values() {
                if c.criterion_id.as_deref() == Some(criterion.as_str()) {
                    refuse_documentless(c)?;
                    if !u.contains(&c.ordinal) {
                        u.push(c.ordinal);
                    }
                    out.push(Value::from(render_claim(c)));
                }
            }
            Ok(Value::from(out))
        },
    );

    // evidence_state(criterion_id): read-only, and only for classes whose
    // policy allows a state to appear in the document at all.
    let evidence: Arc<BTreeMap<String, EvidenceState>> = Arc::new(input.evidence.clone());
    env.add_function("evidence_state", move |criterion: String| -> Result<Value, Error> {
        if policy != CitationPolicy::ClaimsAndEvidenceStates {
            return Err(Error::new(
                ErrorKind::InvalidOperation,
                format!("evidence_state({criterion}) is not available to a {policy:?} document; states appear only in internal work product"),
            ));
        }
        match evidence.get(&criterion) {
            Some(state) => {
                let (label, route) = match state {
                    EvidenceState::Met => ("met", "none"),
                    EvidenceState::Gap => ("gap", "clinician"),
                    EvidenceState::Void => ("void", "coordinator"),
                };
                Ok(context! { state => label, routes_to => route })
            }
            None => Err(Error::new(
                ErrorKind::InvalidOperation,
                format!("no committed evidence state for criterion {criterion}"),
            )),
        }
    });

    let body = env
        .get_template(&input.kind.root)?
        .render(context! { ctx => input.context, kind => context! { key => input.kind.key, version => input.kind.version } })?;

    let rendered_ordinals = used.lock().expect("claim usage lock").clone();
    let rendered_claims: Vec<RenderedClaim> = rendered_ordinals
        .iter()
        .filter_map(|o| by_ordinal.get(o))
        .map(|c| RenderedClaim {
            ordinal: c.ordinal,
            text: c.text.clone(),
            provenance: c.provenance.clone(),
            criterion_id: c.criterion_id.clone(),
        })
        .collect();

    let qa = run_checks(input, &body, &rendered_claims);

    let template_digest = input.package.digest();
    let mut h = Sha256::new();
    h.update(input.kind.key.as_bytes());
    h.update([0u8]);
    h.update(input.kind.version.to_string().as_bytes());
    h.update([0u8]);
    h.update(template_digest.as_bytes());
    h.update([0u8]);
    h.update(body.as_bytes());

    Ok(Assembly {
        kind_key: input.kind.key.clone(),
        kind_version: input.kind.version,
        template_package: input.package.name.clone(),
        template_digest,
        canonical_markdown: body,
        rendered_claims,
        qa,
        content_sha256: format!("sha256:{}", hex(&h.finalize())),
    })
}

fn refuse_clinical_context(ctx: &serde_json::Value) -> Result<(), EngineError> {
    if let Some(map) = ctx.as_object() {
        for key in map.keys() {
            if CLINICAL_CONTEXT_KEYS.contains(&key.as_str()) {
                return Err(EngineError::ClinicalTextInContext(key.clone()));
            }
        }
    }
    Ok(())
}

fn run_checks(input: &AssemblyInput, body: &str, rendered: &[RenderedClaim]) -> Vec<QaFinding> {
    let mut out = Vec::with_capacity(input.kind.qa_checks.len());
    for check in &input.kind.qa_checks {
        out.push(match check {
            QaCheck::UnsupportedClaim => unsupported_claim(body, rendered),
            QaCheck::AnnotationAttribution => annotation_attribution(body, rendered),
            QaCheck::CriterionCoverage => criterion_coverage(input.required_criteria, rendered),
            QaCheck::PolicyVersionCurrency => policy_version_currency(&input.checks),
            QaCheck::CodeConsistency => code_consistency(&input.checks),
            QaCheck::DateConsistency => date_consistency(&input.checks),
            QaCheck::Readability => readability(body),
        });
    }
    out
}

/// Constructive by design; the post-render half catches a template that
/// mangles a rendered claim (a `truncate` or `replace` filter) so that its
/// citation no longer reaches the page.
fn unsupported_claim(body: &str, rendered: &[RenderedClaim]) -> QaFinding {
    let missing: Vec<u32> = rendered
        .iter()
        .filter(|c| !body.contains(&cite(&c.provenance)))
        .map(|c| c.ordinal)
        .collect();
    if missing.is_empty() {
        QaFinding::new(
            QaCheck::UnsupportedClaim,
            QaOutcome::Pass,
            "Clinical text entered only through claim(); every rendered claim carries its citation.",
        )
    } else {
        QaFinding::new(
            QaCheck::UnsupportedClaim,
            QaOutcome::Fail,
            format!("Rendered claims whose citation does not reach the page: {missing:?}"),
        )
        .with_data(serde_json::json!({ "claim_ordinals": missing }))
    }
}

fn annotation_attribution(body: &str, rendered: &[RenderedClaim]) -> QaFinding {
    let mut bare = Vec::new();
    for c in rendered {
        if let (Some(author), Some(annotation_id)) =
            (c.provenance.author(), c.provenance.annotation_id())
        {
            let phrase = format!("In the clinical judgment of {author}, {}", c.text);
            if !body.contains(&phrase) {
                bare.push(annotation_id.to_string());
            }
        }
    }
    if bare.is_empty() {
        QaFinding::new(
            QaCheck::AnnotationAttribution,
            QaOutcome::Pass,
            "Every rendered annotation carries its author inside the sentence.",
        )
    } else {
        QaFinding::new(
            QaCheck::AnnotationAttribution,
            QaOutcome::Fail,
            format!("Annotations rendered without attribution: {bare:?}"),
        )
        .with_data(serde_json::json!({ "annotation_ids": bare }))
    }
}

fn criterion_coverage(required: &BTreeSet<String>, rendered: &[RenderedClaim]) -> QaFinding {
    let covered: BTreeSet<&str> = rendered
        .iter()
        .filter_map(|c| c.criterion_id.as_deref())
        .collect();
    let uncovered: Vec<&String> = required
        .iter()
        .filter(|r| !covered.contains(r.as_str()))
        .collect();
    if uncovered.is_empty() {
        QaFinding::new(
            QaCheck::CriterionCoverage,
            QaOutcome::Pass,
            "Every required criterion is addressed by a rendered claim.",
        )
    } else {
        QaFinding::new(
            QaCheck::CriterionCoverage,
            QaOutcome::Fail,
            format!("Required criteria with no rendered claim: {uncovered:?}"),
        )
        .with_data(serde_json::json!({ "uncovered": uncovered }))
    }
}

fn policy_version_currency(c: &CheckInputs) -> QaFinding {
    match (&c.cited_policy_version, &c.in_force_policy_version) {
        (Some(cited), Some(in_force)) if cited == in_force => QaFinding::new(
            QaCheck::PolicyVersionCurrency,
            QaOutcome::Pass,
            format!("Cited policy version {cited} is in force on the date of service."),
        )
        .with_data(serde_json::json!({ "cited_version": cited, "in_force_version": in_force })),
        (Some(cited), Some(in_force)) => QaFinding::new(
            QaCheck::PolicyVersionCurrency,
            QaOutcome::Fail,
            format!("Cited policy version {cited}; version in force is {in_force}."),
        )
        .with_data(serde_json::json!({ "cited_version": cited, "in_force_version": in_force })),
        _ => QaFinding::new(
            QaCheck::PolicyVersionCurrency,
            QaOutcome::NotApplicable,
            "No policy version pair supplied by the host.",
        ),
    }
}

fn code_consistency(c: &CheckInputs) -> QaFinding {
    if c.requested_codes.is_empty() || c.affirmed_pathway_codes.is_empty() {
        return QaFinding::new(
            QaCheck::CodeConsistency,
            QaOutcome::NotApplicable,
            "No requested/affirmed code pair supplied by the host.",
        );
    }
    let affirmed: BTreeSet<&str> = c
        .affirmed_pathway_codes
        .iter()
        .map(String::as_str)
        .collect();
    let mismatched: Vec<&String> = c
        .requested_codes
        .iter()
        .filter(|code| !affirmed.contains(code.as_str()))
        .collect();
    if mismatched.is_empty() {
        QaFinding::new(
            QaCheck::CodeConsistency,
            QaOutcome::Pass,
            "Requested codes match the affirmed pathway.",
        )
    } else {
        QaFinding::new(
            QaCheck::CodeConsistency,
            QaOutcome::Fail,
            format!("Requested codes outside the affirmed pathway: {mismatched:?}"),
        )
        .with_data(serde_json::json!({ "mismatched_codes": mismatched }))
    }
}

fn date_consistency(c: &CheckInputs) -> QaFinding {
    if c.dates.is_empty() {
        return QaFinding::new(
            QaCheck::DateConsistency,
            QaOutcome::NotApplicable,
            "No dated facts supplied by the host.",
        );
    }
    let mut seen: BTreeMap<&str, &str> = BTreeMap::new();
    let mut conflicts = Vec::new();
    for (label, value) in &c.dates {
        match seen.get(label.as_str()) {
            Some(prev) if *prev != value.as_str() => conflicts.push(label.clone()),
            Some(_) => {}
            None => {
                seen.insert(label, value);
            }
        }
    }
    if conflicts.is_empty() {
        QaFinding::new(
            QaCheck::DateConsistency,
            QaOutcome::Pass,
            "Every dated fact agrees with itself across the document.",
        )
    } else {
        QaFinding::new(
            QaCheck::DateConsistency,
            QaOutcome::Fail,
            format!("Dated facts with conflicting values: {conflicts:?}"),
        )
        .with_data(serde_json::json!({ "labels": conflicts }))
    }
}

/// Advisory. Reports words and sentences; fails only when the mean sentence
/// is long enough that a reviewer would not read it (> 40 words).
fn readability(body: &str) -> QaFinding {
    let words = body.split_whitespace().count();
    let sentences = body.matches(['.', '!', '?']).count().max(1);
    let mean = words as f64 / sentences as f64;
    let outcome = if mean > 40.0 {
        QaOutcome::Fail
    } else {
        QaOutcome::Pass
    };
    QaFinding::new(
        QaCheck::Readability,
        outcome,
        format!("{words} words over {sentences} sentences ({mean:.1} per sentence)."),
    )
    .with_data(serde_json::json!({ "words": words, "sentences": sentences }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kind::DocumentClass;
    use crate::qa::SCHEMA_QA_CHECKS;

    fn package(root: &str) -> TemplatePackage {
        let mut f = BTreeMap::new();
        f.insert("letter.md.j2".to_string(), root.to_string());
        TemplatePackage::new("test-pkg", f)
    }

    fn kind(class: DocumentClass) -> DocumentKind {
        DocumentKind {
            key: "test.kind".into(),
            version: 1,
            class,
            template_package: "test-pkg".into(),
            root: "letter.md.j2".into(),
            qa_checks: SCHEMA_QA_CHECKS.to_vec(),
            outputs: vec![],
        }
    }

    fn claims() -> Vec<Claim> {
        vec![
            Claim {
                ordinal: 1,
                text: "Flexion-extension radiographs demonstrate 4.5 mm of translation at L4-L5."
                    .into(),
                provenance: Provenance::Document {
                    document_id: "doc-rad-1".into(),
                    document_version: 1,
                    title: "Flexion-extension radiograph report".into(),
                    page: 1,
                    effective_date: "2026-04-15".into(),
                    content_sha256: "ab12".into(),
                    source_quote: "4.5 mm".into(),
                },
                criterion_id: Some("C1".into()),
            },
            Claim {
                ordinal: 2,
                text: "decompression alone would destabilize the segment.".into(),
                provenance: Provenance::AttributedDocument {
                    document_id: "doc-rad-1".into(),
                    document_version: 1,
                    title: "Flexion-extension radiograph report".into(),
                    page: 1,
                    effective_date: "2026-04-15".into(),
                    content_sha256: "ab12".into(),
                    source_quote: "4.5 mm".into(),
                    annotation_id: "ann-7".into(),
                    author: "Dr. A. Okafor".into(),
                    authored_on: "2026-09-01".into(),
                },
                criterion_id: None,
            },
            Claim {
                ordinal: 4,
                text: "the nicotine test was ordered and has not resulted.".into(),
                provenance: Provenance::Annotation {
                    annotation_id: "ann-9".into(),
                    author: "Dr. A. Okafor".into(),
                    authored_on: "2026-09-15".into(),
                },
                criterion_id: None,
            },
            Claim {
                ordinal: 3,
                text: "Nicotine abstinence is verified by cotinine testing.".into(),
                provenance: Provenance::Document {
                    document_id: "doc-lab-2".into(),
                    document_version: 2,
                    title: "Laboratory results".into(),
                    page: 1,
                    effective_date: "2026-08-20".into(),
                    content_sha256: "cd34".into(),
                    source_quote: "cotinine negative".into(),
                },
                criterion_id: Some("C4".into()),
            },
        ]
    }

    fn run(
        root: &str,
        class: DocumentClass,
        required: &[&str],
        ctx: serde_json::Value,
    ) -> Result<Assembly, EngineError> {
        let pkg = package(root);
        let k = kind(class);
        let c = claims();
        let req: BTreeSet<String> = required.iter().map(|s| s.to_string()).collect();
        let ev: BTreeMap<String, EvidenceState> = [
            ("C1".to_string(), EvidenceState::Met),
            ("C4".to_string(), EvidenceState::Void),
            ("C2".to_string(), EvidenceState::Gap),
        ]
        .into_iter()
        .collect();
        assemble(&AssemblyInput {
            kind: &k,
            package: &pkg,
            claims: &c,
            required_criteria: &req,
            evidence: &ev,
            context: ctx,
            checks: CheckInputs::default(),
        })
    }

    const ROOT: &str = "Dear {{ ctx.salutation }},\n\n{{ claim(1) }}\n\n{{ claim(2) }}\n";

    #[test]
    fn document_claims_render_with_page_and_date_and_annotations_with_attribution() {
        let a = run(
            ROOT,
            DocumentClass::ClinicalCorrespondence,
            &["C1"],
            serde_json::json!({ "salutation": "Reviewer" }),
        )
        .unwrap();
        assert!(
            a.canonical_markdown
                .contains("(Flexion-extension radiograph report, p. 1, 2026-04-15)")
        );
        assert!(
            a.canonical_markdown
                .contains("In the clinical judgment of Dr. A. Okafor,")
        );
        let ordinals: Vec<u32> = a.rendered_claims.iter().map(|c| c.ordinal).collect();
        assert_eq!(ordinals, vec![1, 2]);
        assert!(
            a.qa.iter().all(|q| q.outcome != QaOutcome::Fail),
            "{:#?}",
            a.qa
        );
        assert!(a.approvable());
        assert_eq!(a.qa.len(), 7, "one finding per schema check");
    }

    #[test]
    fn required_criterion_left_out_fails_criterion_coverage() {
        let a = run(
            ROOT,
            DocumentClass::ClinicalCorrespondence,
            &["C1", "C4"],
            serde_json::json!({ "salutation": "R" }),
        )
        .unwrap();
        let cov =
            a.qa.iter()
                .find(|q| q.check == QaCheck::CriterionCoverage)
                .unwrap();
        assert_eq!(cov.outcome, QaOutcome::Fail);
        assert_eq!(cov.data["uncovered"], serde_json::json!(["C4"]));
        assert!(!a.approvable());
    }

    #[test]
    fn a_template_cannot_invent_a_claim() {
        let err = run(
            "{{ claim(99) }}",
            DocumentClass::ClinicalCorrespondence,
            &[],
            serde_json::json!({}),
        )
        .unwrap_err()
        .to_string();
        assert!(err.contains("claim 99 does not exist"), "{err}");
    }

    #[test]
    fn clinical_text_in_context_is_refused_at_the_door() {
        let err = run(
            ROOT,
            DocumentClass::ClinicalCorrespondence,
            &[],
            serde_json::json!({ "salutation": "R", "symptom_summary": "low back pain" }),
        )
        .unwrap_err();
        assert!(
            matches!(err, EngineError::ClinicalTextInContext(ref k) if k == "symptom_summary"),
            "{err}"
        );
    }

    #[test]
    fn a_letter_cannot_print_an_evidence_state_but_a_work_product_can() {
        let root = "{% set s = evidence_state('C4') %}{{ s.state }} → {{ s.routes_to }}";
        let err = run(
            root,
            DocumentClass::ClinicalCorrespondence,
            &[],
            serde_json::json!({}),
        )
        .unwrap_err()
        .to_string();
        assert!(err.contains("not available"), "{err}");
        let memo = run(
            root,
            DocumentClass::InternalWorkProduct,
            &[],
            serde_json::json!({}),
        )
        .unwrap();
        assert_eq!(memo.canonical_markdown.trim(), "void → coordinator");
        let root_gap = "{% set s = evidence_state('C2') %}{{ s.state }} → {{ s.routes_to }}";
        let memo = run(
            root_gap,
            DocumentClass::InternalWorkProduct,
            &[],
            serde_json::json!({}),
        )
        .unwrap();
        assert_eq!(memo.canonical_markdown.trim(), "gap → clinician");
    }

    #[test]
    fn an_annotation_without_a_document_is_refused_in_correspondence_and_allowed_in_work_product() {
        let err = run(
            "{{ claim(4) }}",
            DocumentClass::ClinicalCorrespondence,
            &[],
            serde_json::json!({}),
        )
        .unwrap_err()
        .to_string();
        assert!(err.contains("no backing document"), "{err}");
        let memo = run(
            "{{ claim(4) }}",
            DocumentClass::InternalWorkProduct,
            &[],
            serde_json::json!({}),
        )
        .unwrap();
        assert!(
            memo.canonical_markdown
                .starts_with("In the clinical judgment of Dr. A. Okafor,")
        );
        // An attributed DOCUMENT claim is fine in correspondence: author in the sentence, document cited after it.
        let letter = run(
            "{{ claim(2) }}",
            DocumentClass::ClinicalCorrespondence,
            &[],
            serde_json::json!({}),
        )
        .unwrap();
        assert!(
            letter
                .canonical_markdown
                .contains("In the clinical judgment of Dr. A. Okafor, decompression alone")
        );
        assert!(
            letter
                .canonical_markdown
                .contains("(Flexion-extension radiograph report, p. 1, 2026-04-15)")
        );
    }

    #[test]
    fn the_engine_never_assigns_a_state_for_an_unknown_criterion() {
        let root = "{{ evidence_state('C9').state }}";
        let err = run(
            root,
            DocumentClass::InternalWorkProduct,
            &[],
            serde_json::json!({}),
        )
        .unwrap_err()
        .to_string();
        assert!(err.contains("no committed evidence state"), "{err}");
    }

    #[test]
    fn a_template_that_strips_a_citation_fails_unsupported_claim() {
        let root = "{{ claim(1)[:20] }}";
        let a = run(
            root,
            DocumentClass::ClinicalCorrespondence,
            &[],
            serde_json::json!({}),
        )
        .unwrap();
        let f =
            a.qa.iter()
                .find(|q| q.check == QaCheck::UnsupportedClaim)
                .unwrap();
        assert_eq!(f.outcome, QaOutcome::Fail);
        assert_eq!(f.data["claim_ordinals"], serde_json::json!([1]));
    }

    #[test]
    fn a_template_that_strips_attribution_fails_annotation_attribution() {
        let root = "{{ claim(2) | replace('In the clinical judgment of Dr. A. Okafor, ', '') }}";
        let a = run(
            root,
            DocumentClass::ClinicalCorrespondence,
            &[],
            serde_json::json!({}),
        )
        .unwrap();
        let f =
            a.qa.iter()
                .find(|q| q.check == QaCheck::AnnotationAttribution)
                .unwrap();
        assert_eq!(f.outcome, QaOutcome::Fail);
    }

    #[test]
    fn same_inputs_same_hash_and_any_package_edit_changes_it() {
        let a1 = run(
            ROOT,
            DocumentClass::ClinicalCorrespondence,
            &["C1"],
            serde_json::json!({ "salutation": "R" }),
        )
        .unwrap();
        let a2 = run(
            ROOT,
            DocumentClass::ClinicalCorrespondence,
            &["C1"],
            serde_json::json!({ "salutation": "R" }),
        )
        .unwrap();
        assert_eq!(a1.content_sha256, a2.content_sha256);
        let mut pkg = package(ROOT);
        pkg.files
            .insert("unused.md.j2".into(), "changed boilerplate".into());
        let k = kind(DocumentClass::ClinicalCorrespondence);
        let c = claims();
        let req = BTreeSet::from(["C1".to_string()]);
        let ev = BTreeMap::new();
        let a3 = assemble(&AssemblyInput {
            kind: &k,
            package: &pkg,
            claims: &c,
            required_criteria: &req,
            evidence: &ev,
            context: serde_json::json!({ "salutation": "R" }),
            checks: CheckInputs::default(),
        })
        .unwrap();
        assert_ne!(
            a1.content_sha256, a3.content_sha256,
            "a template package change must change the affirmed hash"
        );
        assert!(a1.content_sha256.starts_with("sha256:"));
    }

    #[test]
    fn a_signature_renders_only_from_a_receipt_bound_to_this_hash() {
        let a = run(
            ROOT,
            DocumentClass::ClinicalCorrespondence,
            &["C1"],
            serde_json::json!({ "salutation": "R" }),
        )
        .unwrap();
        let good = SigningReceipt {
            content_sha256: a.content_sha256.clone(),
            signer_display_name: "Kevin James, MD".into(),
            signer_credentials: "Orthopaedic Spine Surgery".into(),
            signed_on: "2026-09-19".into(),
            attestation: "I attest the enclosed records support this letter.".into(),
        };
        let signed = a.render_signed(&good).unwrap();
        assert!(signed.contains("**Kevin James, MD**"));
        let bad = SigningReceipt {
            content_sha256: "sha256:0000".into(),
            ..good
        };
        assert!(matches!(
            a.render_signed(&bad),
            Err(SignatureRefused::HashMismatch { .. })
        ));
        // A template has no route to a signature: no `signature` function exists.
        let err = run(
            "{{ signature() }}",
            DocumentClass::ClinicalCorrespondence,
            &[],
            serde_json::json!({}),
        )
        .unwrap_err()
        .to_string();
        assert!(err.contains("signature"), "{err}");
    }

    #[test]
    fn non_constructive_checks_report_not_applicable_without_inputs_and_fail_on_conflict() {
        let a = run(
            ROOT,
            DocumentClass::ClinicalCorrespondence,
            &[],
            serde_json::json!({ "salutation": "R" }),
        )
        .unwrap();
        for k in [
            QaCheck::PolicyVersionCurrency,
            QaCheck::CodeConsistency,
            QaCheck::DateConsistency,
        ] {
            assert_eq!(
                a.qa.iter().find(|q| q.check == k).unwrap().outcome,
                QaOutcome::NotApplicable,
                "{k:?}"
            );
        }
        let pkg = package(ROOT);
        let k = kind(DocumentClass::ClinicalCorrespondence);
        let c = claims();
        let req = BTreeSet::new();
        let ev = BTreeMap::new();
        let checks = CheckInputs {
            cited_policy_version: Some("v14".into()),
            in_force_policy_version: Some("v15".into()),
            requested_codes: vec!["22633".into(), "63047".into()],
            affirmed_pathway_codes: vec!["22633".into()],
            dates: vec![
                ("date_of_service".into(), "2026-10-06".into()),
                ("date_of_service".into(), "2026-10-07".into()),
            ],
        };
        let a = assemble(&AssemblyInput {
            kind: &k,
            package: &pkg,
            claims: &c,
            required_criteria: &req,
            evidence: &ev,
            context: serde_json::json!({ "salutation": "R" }),
            checks,
        })
        .unwrap();
        let get = |k| a.qa.iter().find(|q| q.check == k).unwrap();
        assert_eq!(get(QaCheck::PolicyVersionCurrency).outcome, QaOutcome::Fail);
        assert_eq!(
            get(QaCheck::CodeConsistency).data["mismatched_codes"],
            serde_json::json!(["63047"])
        );
        assert_eq!(get(QaCheck::DateConsistency).outcome, QaOutcome::Fail);
        assert!(!a.approvable(), "policy currency is blocking");
    }

    #[test]
    fn package_and_root_mismatches_are_refused() {
        let pkg = package(ROOT);
        let mut k = kind(DocumentClass::ClinicalCorrespondence);
        k.template_package = "other".into();
        let c = claims();
        let (req, ev) = (BTreeSet::new(), BTreeMap::new());
        let err = assemble(&AssemblyInput {
            kind: &k,
            package: &pkg,
            claims: &c,
            required_criteria: &req,
            evidence: &ev,
            context: serde_json::json!({}),
            checks: CheckInputs::default(),
        })
        .unwrap_err();
        assert!(matches!(err, EngineError::PackageMismatch(..)));
        let mut k = kind(DocumentClass::ClinicalCorrespondence);
        k.root = "missing.md.j2".into();
        let err = assemble(&AssemblyInput {
            kind: &k,
            package: &pkg,
            claims: &c,
            required_criteria: &req,
            evidence: &ev,
            context: serde_json::json!({}),
            checks: CheckInputs::default(),
        })
        .unwrap_err();
        assert!(matches!(err, EngineError::MissingRoot(..)));
    }
}
