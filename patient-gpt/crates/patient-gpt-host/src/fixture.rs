// TJ-ARCH-MOB-001 compliant
//! Synthetic clinical fixture, ported from `docs/design/patient-chat/data.js`.
//!
//! Every name, payer and identifier here is invented for the prototype. This
//! adapter exists for the scaffold only; shells never embed it. Tallies are
//! computed from each case's criteria states as written in data.js.

use async_trait::async_trait;
use patient_gpt_domain::{
    CaseDue, CaseSummary, CriteriaTally, EvidenceState, PatientSummary, Principal, PrincipalKind,
    Role, Session,
};

use crate::{ClinicalReadPort, HostError};

use EvidenceState::{Gap, Met, Void};

struct PatientRow {
    id: &'static str,
    name: &'static str,
    payer: &'static str,
}

struct CaseRow {
    id: &'static str,
    patient_id: &'static str,
    procedure: &'static str,
    payer: &'static str,
    closed: bool,
    due: Option<(&'static str, &'static str)>,
    /// Criteria states in data.js `order`.
    criteria: &'static [EvidenceState],
}

const PATIENTS: &[PatientRow] = &[
    PatientRow {
        id: "kaminski",
        name: "Renata Kaminski",
        payer: "BCBS TX · PPO",
    },
    PatientRow {
        id: "delgado",
        name: "Marcus Delgado",
        payer: "Aetna · Open Access",
    },
    PatientRow {
        id: "brennan",
        name: "Odalys Brennan",
        payer: "Cigna · OAP",
    },
    PatientRow {
        id: "vasquez",
        name: "Theo Vasquez",
        payer: "Humana · Gold Plus HMO",
    },
    PatientRow {
        id: "raman",
        name: "Priya Raman",
        payer: "BCBS TX · PPO",
    },
];

const CASES: &[CaseRow] = &[
    // pain met, pt gap, func met, img met, nic met, a1c void
    CaseRow {
        id: "PA-2026-0431",
        patient_id: "kaminski",
        procedure: "Right L4–L5 decompression with instrumented fusion",
        payer: "BCBS TX · PPO",
        closed: false,
        due: Some(("Submit by", "2026-10-06")),
        criteria: &[Met, Gap, Met, Met, Met, Void],
    },
    CaseRow {
        id: "PA-2026-0212",
        patient_id: "kaminski",
        procedure: "Right L4–L5 transforaminal epidural steroid injection",
        payer: "BCBS TX · PPO",
        closed: true,
        due: None,
        criteria: &[Met, Met],
    },
    CaseRow {
        id: "PA-2026-0447",
        patient_id: "delgado",
        procedure: "C5–C6 anterior cervical discectomy and fusion",
        payer: "Aetna · Open Access",
        closed: false,
        due: Some(("Submit by", "2026-10-03")),
        criteria: &[Met, Met, Met],
    },
    CaseRow {
        id: "PA-2026-0419",
        patient_id: "brennan",
        procedure: "Left L5–S1 microdiscectomy",
        payer: "Cigna · OAP",
        closed: false,
        due: Some(("Peer-to-peer", "2026-10-05")),
        criteria: &[Met, Gap, Met],
    },
    CaseRow {
        id: "PA-2026-0452",
        patient_id: "vasquez",
        procedure: "L3–L5 lumbar laminectomy",
        payer: "Humana · Gold Plus HMO",
        closed: false,
        due: Some(("Submit by", "2026-10-09")),
        criteria: &[Met, Void, Void],
    },
    CaseRow {
        id: "PA-2026-0398",
        patient_id: "raman",
        procedure: "C6–C7 cervical disc arthroplasty",
        payer: "BCBS TX · PPO",
        closed: false,
        due: Some(("Follow up by", "2026-10-12")),
        criteria: &[Met, Met, Met],
    },
];

/// Read-only synthetic adapter for [`ClinicalReadPort`].
#[derive(Debug, Default, Clone, Copy)]
pub struct SyntheticClinicalFixture;

impl SyntheticClinicalFixture {
    fn case_summary(row: &CaseRow) -> CaseSummary {
        CaseSummary {
            id: row.id.to_owned(),
            patient_id: row.patient_id.to_owned(),
            procedure: row.procedure.to_owned(),
            payer: row.payer.to_owned(),
            closed: row.closed,
            due: row.due.map(|(kind, date)| CaseDue {
                kind: kind.to_owned(),
                date: date.to_owned(),
            }),
            tally: CriteriaTally::from_states(row.criteria),
        }
    }
}

#[async_trait]
impl ClinicalReadPort for SyntheticClinicalFixture {
    async fn session(&self) -> Result<Session, HostError> {
        Ok(Session {
            principal: Principal {
                id: "synthetic-surgeon-kjames".to_owned(),
                display_name: "Dr. K. James".to_owned(),
                role: Role::Surgeon,
                kind: PrincipalKind::Human,
            },
            practice: "Advanced Spine & Orthopedics".to_owned(),
        })
    }

    async fn list_patients(&self) -> Result<Vec<PatientSummary>, HostError> {
        Ok(PATIENTS
            .iter()
            .map(|patient| PatientSummary {
                id: patient.id.to_owned(),
                display_name: patient.name.to_owned(),
                payer: patient.payer.to_owned(),
                case_ids: CASES
                    .iter()
                    .filter(|case| case.patient_id == patient.id)
                    .map(|case| case.id.to_owned())
                    .collect(),
            })
            .collect())
    }

    async fn list_cases(&self, patient_id: &str) -> Result<Vec<CaseSummary>, HostError> {
        if !PATIENTS.iter().any(|patient| patient.id == patient_id) {
            return Err(HostError::NotFound(format!(
                "patient `{patient_id}` not found"
            )));
        }
        Ok(CASES
            .iter()
            .filter(|case| case.patient_id == patient_id)
            .map(Self::case_summary)
            .collect())
    }
}
