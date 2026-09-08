//! Server-owned replica projection registry.
//!
//! A caller selects a verified practice through the session boundary. It does
//! not select a relation, predicate, primary key, or column list. Everything
//! absent from this registry remains protected until a later privacy decision
//! adds it to a new projection revision.

use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::session::SessionSummary;

pub const PROJECTION_REVISION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectionId {
    Cases,
    CaseEvidence,
    EvidenceStates,
    EvidenceCitations,
    Documents,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ProjectionScope {
    Practice {
        column: &'static str,
        value: Uuid,
    },
    ApprovedReference {
        approval: &'static str,
        key: &'static str,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrantedProjection {
    pub id: ProjectionId,
    pub relation: &'static str,
    pub primary_key: &'static str,
    pub columns: &'static [&'static str],
    pub scope: ProjectionScope,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplicaGrant {
    pub identity_id: Uuid,
    pub originating_session_id: Uuid,
    pub practice_id: Uuid,
    pub authorization_revision: String,
    pub projection_revision: u32,
    pub expires_at: DateTime<Utc>,
    pub projections: Vec<GrantedProjection>,
}

struct ProjectionDefinition {
    id: ProjectionId,
    relation: &'static str,
    primary_key: &'static str,
    columns: &'static [&'static str],
    scope: DefinitionScope,
}

enum DefinitionScope {
    Practice(&'static str),
    ApprovedReference {
        approval: &'static str,
        key: &'static str,
    },
}

const DEFINITIONS: &[ProjectionDefinition] = &[
    ProjectionDefinition {
        id: ProjectionId::Cases,
        relation: "aso.cases",
        primary_key: "id",
        columns: &[
            "id",
            "practice_id",
            "status",
            "gate_affirmed_at",
            "created_at",
            "updated_at",
        ],
        scope: DefinitionScope::Practice("practice_id"),
    },
    ProjectionDefinition {
        id: ProjectionId::CaseEvidence,
        relation: "aso.case_evidence",
        primary_key: "id",
        columns: &[
            "id",
            "practice_id",
            "case_id",
            "policy_criterion_id",
            "state",
            "assessed_at",
            "created_at",
            "updated_at",
        ],
        scope: DefinitionScope::Practice("practice_id"),
    },
    ProjectionDefinition {
        id: ProjectionId::EvidenceStates,
        relation: "aso.evidence_states",
        primary_key: "key",
        columns: &["key", "label", "meaning"],
        scope: DefinitionScope::ApprovedReference {
            approval: "adr-003-three-evidence-states",
            key: "key",
        },
    },
    ProjectionDefinition {
        id: ProjectionId::EvidenceCitations,
        relation: "aso.evidence_citations",
        primary_key: "id",
        columns: &[
            "id",
            "practice_id",
            "case_evidence_id",
            "document_id",
            "page_number",
            "relevance",
            "created_at",
        ],
        scope: DefinitionScope::Practice("practice_id"),
    },
    ProjectionDefinition {
        id: ProjectionId::Documents,
        relation: "aso.documents",
        primary_key: "id",
        columns: &[
            "id",
            "practice_id",
            "document_type_id",
            "case_id",
            "name",
            "effective_date",
            "page_count",
            "content_sha256",
        ],
        scope: DefinitionScope::Practice("practice_id"),
    },
];

impl ReplicaGrant {
    pub fn for_session(session: &SessionSummary) -> Self {
        let projections = DEFINITIONS
            .iter()
            .map(|definition| GrantedProjection {
                id: definition.id,
                relation: definition.relation,
                primary_key: definition.primary_key,
                columns: definition.columns,
                scope: match definition.scope {
                    DefinitionScope::Practice(column) => ProjectionScope::Practice {
                        column,
                        value: session.practice_id,
                    },
                    DefinitionScope::ApprovedReference { approval, key } => {
                        ProjectionScope::ApprovedReference { approval, key }
                    }
                },
            })
            .collect();
        Self {
            identity_id: session.identity_id,
            originating_session_id: session.session_id,
            practice_id: session.practice_id,
            authorization_revision: session.authorization_revision.clone(),
            projection_revision: PROJECTION_REVISION,
            expires_at: session.expires_at,
            projections,
        }
    }

    pub fn projection(&self, id: ProjectionId) -> Option<&GrantedProjection> {
        self.projections
            .iter()
            .find(|projection| projection.id == id)
    }
}

impl GrantedProjection {
    pub fn permits_column(&self, column: &str) -> bool {
        self.columns.contains(&column)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::Principal;

    fn id(value: u128) -> Uuid {
        Uuid::from_u128(value)
    }

    fn session(practice_id: Uuid, suffix: &str) -> SessionSummary {
        SessionSummary {
            identity_id: id(100),
            session_id: id(200),
            user_id: id(300),
            practice_id,
            display_name: "Synthetic Registry User".into(),
            principal: Principal::User,
            capabilities: vec![],
            expires_at: "2026-09-08T13:00:00Z".parse().unwrap(),
            authorization_revision: format!("membership:{suffix}"),
        }
    }

    #[test]
    fn five_table_registry_is_exact_and_practice_scoped() {
        let first = ReplicaGrant::for_session(&session(id(1), "1"));
        let second = ReplicaGrant::for_session(&session(id(2), "2"));

        assert_eq!(first.projections.len(), 5);
        assert_eq!(second.projections.len(), 5);
        assert_eq!(first.projection_revision, PROJECTION_REVISION);
        assert_eq!(second.projection_revision, PROJECTION_REVISION);
        assert_eq!(first.identity_id, id(100));
        assert_eq!(first.originating_session_id, id(200));
        assert_eq!(
            first.expires_at,
            "2026-09-08T13:00:00Z".parse::<DateTime<Utc>>().unwrap()
        );

        for projection_id in [
            ProjectionId::Cases,
            ProjectionId::CaseEvidence,
            ProjectionId::EvidenceCitations,
            ProjectionId::Documents,
        ] {
            assert_eq!(
                first.projection(projection_id).unwrap().scope,
                ProjectionScope::Practice {
                    column: "practice_id",
                    value: id(1),
                }
            );
            assert_eq!(
                second.projection(projection_id).unwrap().scope,
                ProjectionScope::Practice {
                    column: "practice_id",
                    value: id(2),
                }
            );
        }

        let states = first.projection(ProjectionId::EvidenceStates).unwrap();
        assert_eq!(states.primary_key, "key");
        assert_eq!(states.columns, ["key", "label", "meaning"]);
        assert_eq!(
            states.scope,
            ProjectionScope::ApprovedReference {
                approval: "adr-003-three-evidence-states",
                key: "key",
            }
        );
    }

    #[test]
    fn unapproved_metadata_and_deferred_criterion_labels_stay_protected() {
        let grant = ReplicaGrant::for_session(&session(id(1), "1"));
        for (projection, column) in [
            (ProjectionId::Cases, "patient_id"),
            (ProjectionId::Cases, "surgeon_id"),
            (ProjectionId::Cases, "payer_id"),
            (ProjectionId::Cases, "case_number"),
            (ProjectionId::Cases, "gate_affirmed_by"),
            (ProjectionId::CaseEvidence, "rationale"),
            (ProjectionId::CaseEvidence, "data"),
            (ProjectionId::CaseEvidence, "assessed_by"),
            (ProjectionId::EvidenceCitations, "quote"),
            (ProjectionId::Documents, "patient_id"),
            (ProjectionId::Documents, "author_name"),
            (ProjectionId::Documents, "author_npi"),
            (ProjectionId::Documents, "storage_uri"),
            (ProjectionId::Documents, "data"),
        ] {
            assert!(!grant.projection(projection).unwrap().permits_column(column));
        }

        assert!(
            grant
                .projections
                .iter()
                .all(|projection| projection.relation != "aso.policy_criteria")
        );
    }

    #[test]
    fn reactive_gate_summary_is_approved_without_actor_identity() {
        let grant = ReplicaGrant::for_session(&session(id(1), "1"));
        let cases = grant.projection(ProjectionId::Cases).unwrap();

        assert_eq!(
            cases.columns,
            [
                "id",
                "practice_id",
                "status",
                "gate_affirmed_at",
                "created_at",
                "updated_at",
            ]
        );
        assert!(cases.permits_column("gate_affirmed_at"));
        assert!(!cases.permits_column("gate_affirmed_by"));
    }
}
