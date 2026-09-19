//! QA checks, shaped to become the host's `letter_qa_results` rows.
//!
//! The seven keys below are the seven `qa_check_types` the schema already
//! defines. The engine emits findings against those keys and nothing else; a
//! new check is a new type row in the schema first, then a variant here.

use serde::{Deserialize, Serialize};

/// The schema's QA check types, by key.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QaCheck {
    /// Every factual claim resolves to a source document, positive page
    /// number, and source date. Blocking.
    UnsupportedClaim,
    /// No annotation is rendered as though a chart document stated it. Blocking.
    AnnotationAttribution,
    /// Every mandatory criterion in the affirmed section is addressed. Blocking.
    CriterionCoverage,
    /// The cited policy version is in force on the date of service. Blocking.
    PolicyVersionCurrency,
    /// Procedure codes match the affirmed pathway. Warning.
    CodeConsistency,
    /// Dates inside the letter agree with each other and the record. Warning.
    DateConsistency,
    /// Reading level and length. Advisory.
    Readability,
}

impl QaCheck {
    pub fn key(self) -> &'static str {
        match self {
            QaCheck::UnsupportedClaim => "unsupported_claim",
            QaCheck::AnnotationAttribution => "annotation_attribution",
            QaCheck::CriterionCoverage => "criterion_coverage",
            QaCheck::PolicyVersionCurrency => "policy_version_currency",
            QaCheck::CodeConsistency => "code_consistency",
            QaCheck::DateConsistency => "date_consistency",
            QaCheck::Readability => "readability",
        }
    }

    /// Severity as the schema declares it. Carried on the finding so a host
    /// that persists findings does not need to re-derive it.
    pub fn severity(self) -> Severity {
        match self {
            QaCheck::UnsupportedClaim
            | QaCheck::AnnotationAttribution
            | QaCheck::CriterionCoverage
            | QaCheck::PolicyVersionCurrency => Severity::Blocking,
            QaCheck::CodeConsistency | QaCheck::DateConsistency => Severity::Warning,
            QaCheck::Readability => Severity::Advisory,
        }
    }
}

/// The seven checks, in schema order.
pub const SCHEMA_QA_CHECKS: [QaCheck; 7] = [
    QaCheck::UnsupportedClaim,
    QaCheck::AnnotationAttribution,
    QaCheck::CriterionCoverage,
    QaCheck::PolicyVersionCurrency,
    QaCheck::CodeConsistency,
    QaCheck::DateConsistency,
    QaCheck::Readability,
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Blocking,
    Warning,
    Advisory,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QaOutcome {
    Pass,
    Fail,
    NotApplicable,
}

/// One finding. `data` follows the check type's JSON Schema in the host
/// schema (for example `{"uncovered": [...]}` for criterion coverage).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QaFinding {
    pub check: QaCheck,
    pub severity: Severity,
    pub outcome: QaOutcome,
    pub detail: String,
    #[serde(default, skip_serializing_if = "serde_json::Value::is_null")]
    pub data: serde_json::Value,
}

impl QaFinding {
    pub fn new(check: QaCheck, outcome: QaOutcome, detail: impl Into<String>) -> Self {
        Self {
            check,
            severity: check.severity(),
            outcome,
            detail: detail.into(),
            data: serde_json::Value::Null,
        }
    }

    pub fn with_data(mut self, data: serde_json::Value) -> Self {
        self.data = data;
        self
    }

    /// True when this finding, on its own, must stop the document from being
    /// approved: a blocking check that failed.
    pub fn is_blocking_failure(&self) -> bool {
        self.severity == Severity::Blocking && self.outcome == QaOutcome::Fail
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_match_the_schema_and_serialize_as_snake_case() {
        let keys: Vec<&str> = SCHEMA_QA_CHECKS.iter().map(|c| c.key()).collect();
        assert_eq!(
            keys,
            [
                "unsupported_claim",
                "annotation_attribution",
                "criterion_coverage",
                "policy_version_currency",
                "code_consistency",
                "date_consistency",
                "readability"
            ]
        );
        assert_eq!(
            serde_json::to_string(&QaCheck::CriterionCoverage).unwrap(),
            r#""criterion_coverage""#
        );
    }

    #[test]
    fn only_a_failed_blocking_check_blocks() {
        assert!(
            QaFinding::new(QaCheck::CriterionCoverage, QaOutcome::Fail, "").is_blocking_failure()
        );
        assert!(!QaFinding::new(QaCheck::Readability, QaOutcome::Fail, "").is_blocking_failure());
        assert!(
            !QaFinding::new(QaCheck::CriterionCoverage, QaOutcome::Pass, "").is_blocking_failure()
        );
    }
}
