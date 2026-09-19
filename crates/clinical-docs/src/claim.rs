//! Claims: the only channel through which clinical text enters a document.

use serde::{Deserialize, Serialize};

/// Where a claim comes from. Mirrors the host's `letter_claims` row:
/// `document_id` is NOT NULL and `annotation_id` is nullable, so a claim that
/// leaves the practice always rests on a document, and an annotation can only
/// add attribution to one. An annotation with no document is internal work
/// product only (the web-00 frozen citation contract, decision 2).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Provenance {
    /// A chart document at an exact immutable version, page and effective date.
    Document {
        document_id: String,
        document_version: u32,
        title: String,
        page: u32,
        effective_date: String,
        content_sha256: String,
        /// The quoted span the claim rests on. Carried so the host can persist
        /// `source_quote` and the span without a second lookup.
        #[serde(default)]
        source_quote: String,
    },
    /// A document-backed statement carrying a clinician's attribution: the
    /// document is the evidence, the annotation is who is drawing the
    /// conclusion. Rendered with the author in the sentence and the document
    /// citation after it. This is the only attributed form allowed in a
    /// document that leaves the practice.
    AttributedDocument {
        document_id: String,
        document_version: u32,
        title: String,
        page: u32,
        effective_date: String,
        content_sha256: String,
        #[serde(default)]
        source_quote: String,
        annotation_id: String,
        author: String,
        authored_on: String,
    },
    /// A clinician's opinion with no backing document. Internal work product
    /// only; refused by `claim()` in any class whose documents leave the
    /// practice.
    Annotation {
        annotation_id: String,
        author: String,
        authored_on: String,
    },
}

impl Provenance {
    /// True when the claim rests on a chart document.
    pub fn has_document(&self) -> bool {
        !matches!(self, Provenance::Annotation { .. })
    }

    /// The annotation author, when the claim carries attribution.
    pub fn author(&self) -> Option<&str> {
        match self {
            Provenance::Document { .. } => None,
            Provenance::AttributedDocument { author, .. }
            | Provenance::Annotation { author, .. } => Some(author),
        }
    }

    pub fn annotation_id(&self) -> Option<&str> {
        match self {
            Provenance::Document { .. } => None,
            Provenance::AttributedDocument { annotation_id, .. }
            | Provenance::Annotation { annotation_id, .. } => Some(annotation_id),
        }
    }
}

/// One cited statement. `ordinal` is the stable identity a template uses.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Claim {
    pub ordinal: u32,
    pub text: String,
    pub provenance: Provenance,
    /// Criterion this claim addresses, when it addresses one. Used by the
    /// coverage check; free-standing claims carry `None`.
    #[serde(default)]
    pub criterion_id: Option<String>,
}

/// The parenthetical citation for a provenance.
pub fn cite(p: &Provenance) -> String {
    match p {
        Provenance::Document {
            title,
            page,
            effective_date,
            ..
        }
        | Provenance::AttributedDocument {
            title,
            page,
            effective_date,
            ..
        } => {
            format!("({title}, p. {page}, {effective_date})")
        }
        Provenance::Annotation {
            author,
            authored_on,
            ..
        } => {
            format!("(clinical judgment of {author}, {authored_on})")
        }
    }
}

/// The sentence a template receives for `claim(ordinal)`.
pub fn render_claim(c: &Claim) -> String {
    match &c.provenance {
        Provenance::Document { .. } => format!("{} {}", c.text, cite(&c.provenance)),
        Provenance::AttributedDocument { author, .. } | Provenance::Annotation { author, .. } => {
            format!(
                "In the clinical judgment of {author}, {} {}",
                c.text,
                cite(&c.provenance)
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn doc_claim() -> Claim {
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
                source_quote: "4.5 mm translation".into(),
            },
            criterion_id: Some("C1".into()),
        }
    }

    #[test]
    fn document_claims_carry_title_page_and_date() {
        let s = render_claim(&doc_claim());
        assert!(s.ends_with("(Flexion-extension radiograph report, p. 1, 2026-04-15)"));
    }

    #[test]
    fn annotation_claims_carry_the_author_inside_the_sentence() {
        let c = Claim {
            ordinal: 2,
            text: "decompression alone would destabilize the segment.".into(),
            provenance: Provenance::Annotation {
                annotation_id: "ann-7".into(),
                author: "Dr. A. Okafor".into(),
                authored_on: "2026-09-01".into(),
            },
            criterion_id: None,
        };
        let s = render_claim(&c);
        assert!(s.starts_with("In the clinical judgment of Dr. A. Okafor,"));
        assert!(s.contains("(clinical judgment of Dr. A. Okafor, 2026-09-01)"));
    }

    #[test]
    fn an_attributed_document_claim_carries_author_and_document_citation() {
        let c = Claim {
            ordinal: 3,
            text: "decompression alone would destabilize the segment.".into(),
            provenance: Provenance::AttributedDocument {
                document_id: "doc-office-1".into(),
                document_version: 3,
                title: "Office notes".into(),
                page: 3,
                effective_date: "2026-07-28".into(),
                content_sha256: "ee".into(),
                source_quote: "4.5 mm translation".into(),
                annotation_id: "ann-7".into(),
                author: "Dr. A. Okafor".into(),
                authored_on: "2026-09-01".into(),
            },
            criterion_id: None,
        };
        let s = render_claim(&c);
        assert!(s.starts_with("In the clinical judgment of Dr. A. Okafor,"));
        assert!(s.ends_with("(Office notes, p. 3, 2026-07-28)"));
        assert!(c.provenance.has_document());
    }

    #[test]
    fn a_claim_with_both_or_neither_source_is_unrepresentable_on_the_wire() {
        // Two sources: the tagged enum rejects the extra fields.
        let both = serde_json::json!({
            "ordinal": 1, "text": "x",
            "provenance": {"kind": "document", "documentId": "d", "documentVersion": 1, "title": "t",
                           "page": 1, "effectiveDate": "2026-01-01", "contentSha256": "aa",
                           "annotationId": "ann-1"}
        });
        assert!(serde_json::from_value::<Claim>(both).is_err());
        // No source at all.
        let none = serde_json::json!({"ordinal": 1, "text": "x"});
        assert!(serde_json::from_value::<Claim>(none).is_err());
    }
}
