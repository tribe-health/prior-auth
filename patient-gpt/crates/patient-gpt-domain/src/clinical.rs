// TJ-ARCH-MOB-001 compliant
//! Read-only clinical summaries. Clinical truth lives in the ASO workbench;
//! these are projections of it, never a second source.

use serde::{Deserialize, Serialize};

/// Three evidence states, never two, never a boolean.
///
/// `Gap`: the chart says no and a surgeon must argue it.
/// `Void`: the chart is silent and a coordinator must obtain it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EvidenceState {
    Met,
    Gap,
    Void,
}

/// Per-case count of criteria in each evidence state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CriteriaTally {
    pub met: u32,
    pub gap: u32,
    pub void: u32,
}

impl CriteriaTally {
    /// Builds a tally from per-criterion states. Each state lands in its own
    /// bucket; there is no combined "unmet" count.
    pub fn from_states(states: &[EvidenceState]) -> Self {
        states
            .iter()
            .fold(Self::default(), |tally, state| match state {
                EvidenceState::Met => Self {
                    met: tally.met + 1,
                    ..tally
                },
                EvidenceState::Gap => Self {
                    gap: tally.gap + 1,
                    ..tally
                },
                EvidenceState::Void => Self {
                    void: tally.void + 1,
                    ..tally
                },
            })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatientSummary {
    pub id: String,
    pub display_name: String,
    pub payer: String,
    pub case_ids: Vec<String>,
}

/// A dated next step on a case, e.g. `Submit by` or `Peer-to-peer`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseDue {
    pub kind: String,
    /// `YYYY-MM-DD`.
    pub date: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseSummary {
    pub id: String,
    pub patient_id: String,
    pub procedure: String,
    pub payer: String,
    pub closed: bool,
    pub due: Option<CaseDue>,
    pub tally: CriteriaTally,
}

/// Every generated assertion carries document, page and date. An assertion
/// without one is excluded, so the fields are required, not optional.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Citation {
    pub document_id: String,
    pub document_title: String,
    pub page: u32,
    /// `YYYY-MM-DD`.
    pub date: String,
}
