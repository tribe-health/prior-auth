//! Domain types. These mirror `docs/design/schema/schema.sql`; when the schema
//! changes, this module changes with it in the same commit.

use serde::{Deserialize, Serialize};
use std::fmt;
use uuid::Uuid;

macro_rules! id_type {
    ($name:ident, $doc:literal) => {
        #[doc = $doc]
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
        pub struct $name(pub Uuid);
        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(f, "{}", self.0)
            }
        }
    };
}

id_type!(ActorId, "An application user, mapped 1:1 to an Ory Kratos identity.");
id_type!(CaseId, "One authorization case.");
id_type!(LetterId, "One version of a letter of medical necessity.");
id_type!(CriterionId, "One addressable payer requirement.");
id_type!(DocumentId, "One chart document.");
id_type!(AnnotationId, "One surgeon clinical annotation.");
id_type!(PracticeId, "The tenant boundary.");

/// Named capabilities, not a role check.
///
/// Call sites ask whether an actor holds `AffirmGate`, never whether they are
/// "a surgeon". Adding a fourth role then touches no call site.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Capability {
    Configure,
    /// Clinical. An administrator holds every configuration power and is
    /// refused this one.
    AffirmGate,
    /// Clinical.
    SignLetter,
    /// Clinical.
    Annotate,
    Submit,
    ViewAudit,
}

impl Capability {
    /// Clinical capabilities are the ones an administrator must never hold,
    /// however much system access they otherwise have.
    pub const fn is_clinical(self) -> bool {
        matches!(self, Self::AffirmGate | Self::SignLetter | Self::Annotate)
    }
}

/// The three evidence states. Three, never two.
///
/// `Gap` and `Void` call for opposite actions: a gap is a chart that says no
/// and must be argued; a void is a chart that is silent and must be obtained.
/// Collapsing them into one "unmet" bucket sends the wrong person to do the
/// wrong job.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceState {
    Met,
    Gap,
    Void,
}

/// The four surgeon-gate confirmations.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GateAffirmationKind {
    Policy,
    Section,
    Pathway,
    Plan,
}

impl GateAffirmationKind {
    pub const ALL: [Self; 4] = [Self::Policy, Self::Section, Self::Pathway, Self::Plan];
}

/// Derived state: affirmed only when all four exist.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct GateState {
    pub affirmed: Vec<GateAffirmationKind>,
}

impl GateState {
    pub fn is_affirmed(&self) -> bool {
        GateAffirmationKind::ALL.iter().all(|k| self.affirmed.contains(k))
    }
    pub fn outstanding(&self) -> Vec<GateAffirmationKind> {
        GateAffirmationKind::ALL
            .into_iter()
            .filter(|k| !self.affirmed.contains(k))
            .collect()
    }
}

/// Evidence grade for a payer criterion, ordered strongest first.
///
/// The split that matters is `citable_as_policy`. A derived rule is legitimate
/// clinical knowledge and must never be stated to a payer as its own published
/// requirement.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceGrade {
    Published,
    ObtainedByRequest,
    PayerVerbal,
    DerivedObserved,
    PeerShared,
}

impl EvidenceGrade {
    pub const fn citable_as_policy(self) -> bool {
        matches!(self, Self::Published | Self::ObtainedByRequest)
    }
    /// Half-life in days for retrieval decay. `None` means it does not decay.
    pub const fn decay_half_life_days(self) -> Option<u32> {
        match self {
            Self::Published | Self::ObtainedByRequest => None,
            Self::PayerVerbal => Some(365),
            Self::DerivedObserved | Self::PeerShared => Some(180),
        }
    }
    /// How a letter must introduce a claim of this grade.
    pub const fn attribution(self) -> Attribution {
        match self {
            Self::Published | Self::ObtainedByRequest => Attribution::PublishedPolicy,
            Self::PayerVerbal => Attribution::PayerStated,
            Self::DerivedObserved => Attribution::PracticeExperience,
            Self::PeerShared => Attribution::PeerReported,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Attribution {
    PublishedPolicy,
    PracticeExperience,
    PeerReported,
    PayerStated,
}

/// Exactly one source per claim.
///
/// The enum is the type-level form of the database's XOR constraint: a
/// criterion-backed claim has its own variant, so surgeon opinion can never be
/// smuggled through the document slot.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "source", rename_all = "snake_case")]
pub enum ClaimSource {
    Document { document_id: DocumentId, page: Option<u32> },
    Annotation { annotation_id: AnnotationId },
    Criterion { criterion_id: CriterionId, attribution: Attribution },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Letter {
    pub id: LetterId,
    pub case_id: CaseId,
    pub version: u32,
    pub status: LetterStatus,
    pub signed_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LetterStatus {
    Draft,
    InReview,
    Approved,
    Signed,
    Superseded,
}

#[derive(Debug, thiserror::Error)]
pub enum DomainError {
    #[error("actor {actor} does not hold the {capability:?} capability")]
    CapabilityDenied { capability: Capability, actor: ActorId },

    #[error("case {case_id} has not been affirmed at the surgeon gate")]
    GateNotAffirmed { case_id: CaseId },

    #[error("{count} non-policy criteria were retrieved but not attributed or excluded")]
    UnattributedCriteria { count: usize },

    #[error("criterion is graded {grade:?} and may not be presented as published policy")]
    NotCitableAsPolicy { grade: EvidenceGrade },

    #[error("not found")]
    NotFound,

    #[error("storage: {0}")]
    Storage(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gate_needs_all_four() {
        let mut g = GateState::default();
        assert!(!g.is_affirmed());
        g.affirmed = vec![
            GateAffirmationKind::Policy,
            GateAffirmationKind::Section,
            GateAffirmationKind::Pathway,
        ];
        assert!(!g.is_affirmed(), "three of four is not affirmed");
        assert_eq!(g.outstanding(), vec![GateAffirmationKind::Plan]);
        g.affirmed.push(GateAffirmationKind::Plan);
        assert!(g.is_affirmed());
    }

    #[test]
    fn derived_grades_are_never_citable_as_policy() {
        for g in [EvidenceGrade::DerivedObserved, EvidenceGrade::PeerShared, EvidenceGrade::PayerVerbal] {
            assert!(!g.citable_as_policy(), "{g:?} must not be citable as policy");
            assert_ne!(g.attribution(), Attribution::PublishedPolicy);
        }
        assert!(EvidenceGrade::Published.citable_as_policy());
    }

    #[test]
    fn only_derived_knowledge_decays() {
        assert!(EvidenceGrade::Published.decay_half_life_days().is_none());
        assert_eq!(EvidenceGrade::DerivedObserved.decay_half_life_days(), Some(180));
    }

    #[test]
    fn admin_capabilities_are_never_clinical() {
        assert!(!Capability::Configure.is_clinical());
        assert!(!Capability::ViewAudit.is_clinical());
        assert!(Capability::AffirmGate.is_clinical());
        assert!(Capability::SignLetter.is_clinical());
    }
}
