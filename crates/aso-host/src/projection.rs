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

pub const PROJECTION_REVISION: u32 = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectionId {
    AnnotationTypes,
    Annotations,
    Cases,
    CaseEvidence,
    EvidenceStates,
    EvidenceCitations,
    DocumentStatuses,
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
        id: ProjectionId::AnnotationTypes,
        relation: "aso.annotation_types",
        primary_key: "id",
        columns: &["id", "key", "name", "description"],
        scope: DefinitionScope::ApprovedReference {
            approval: "ra-15-attributed-annotations",
            key: "key",
        },
    },
    ProjectionDefinition {
        id: ProjectionId::Annotations,
        relation: "aso.annotations",
        primary_key: "id",
        columns: &[
            "id",
            "practice_id",
            "case_id",
            "annotation_type_id",
            "name",
            "body",
            "author_id",
            "author_label",
            "provenance",
            "is_included",
            "included_at",
            "target_evidence_id",
            "target_document_id",
            "revision",
            "created_at",
            "updated_at",
        ],
        scope: DefinitionScope::Practice("practice_id"),
    },
    ProjectionDefinition {
        id: ProjectionId::Cases,
        relation: "aso.cases",
        primary_key: "id",
        columns: &[
            "id",
            "practice_id",
            "case_number",
            "patient_id",
            "surgeon_id",
            "coordinator_id",
            "payer_id",
            "status",
            "date_of_service",
            "gate_affirmed_at",
            "updated_at",
            "revision",
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
        id: ProjectionId::DocumentStatuses,
        relation: "aso.document_statuses",
        primary_key: "id",
        columns: &[
            "id",
            "case_id",
            "document_type_id",
            "name",
            "effective_date",
            "content_sha256_text",
            "page_count",
            "processing_status",
            "processing_error_code",
            "updated_at",
            "revision",
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
    fn seven_table_registry_is_exact_and_practice_scoped() {
        let first = ReplicaGrant::for_session(&session(id(1), "1"));
        let second = ReplicaGrant::for_session(&session(id(2), "2"));

        assert_eq!(first.projections.len(), 7);
        assert_eq!(second.projections.len(), 7);
        assert_eq!(first.projection_revision, PROJECTION_REVISION);
        assert_eq!(second.projection_revision, PROJECTION_REVISION);
        assert_eq!(first.identity_id, id(100));
        assert_eq!(first.originating_session_id, id(200));
        assert_eq!(
            first.expires_at,
            "2026-09-08T13:00:00Z".parse::<DateTime<Utc>>().unwrap()
        );

        for projection_id in [
            ProjectionId::Annotations,
            ProjectionId::Cases,
            ProjectionId::CaseEvidence,
            ProjectionId::EvidenceCitations,
            ProjectionId::DocumentStatuses,
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

        let annotation_types = first.projection(ProjectionId::AnnotationTypes).unwrap();
        assert_eq!(annotation_types.primary_key, "id");
        assert_eq!(
            annotation_types.columns,
            ["id", "key", "name", "description"]
        );
        assert_eq!(
            annotation_types.scope,
            ProjectionScope::ApprovedReference {
                approval: "ra-15-attributed-annotations",
                key: "key",
            }
        );

        let statuses = first.projection(ProjectionId::DocumentStatuses).unwrap();
        assert_eq!(statuses.relation, "aso.document_statuses");
        assert_eq!(
            statuses.columns,
            [
                "id",
                "case_id",
                "document_type_id",
                "name",
                "effective_date",
                "content_sha256_text",
                "page_count",
                "processing_status",
                "processing_error_code",
                "updated_at",
                "revision",
            ]
        );
    }

    #[test]
    fn unapproved_metadata_and_deferred_criterion_labels_stay_protected() {
        let grant = ReplicaGrant::for_session(&session(id(1), "1"));
        for (projection, column) in [
            (ProjectionId::AnnotationTypes, "schema"),
            (ProjectionId::Annotations, "data"),
            (ProjectionId::Cases, "gate_affirmed_by"),
            (ProjectionId::Cases, "member_id"),
            (ProjectionId::Cases, "facility_id"),
            (ProjectionId::Cases, "procedure_code"),
            (ProjectionId::Cases, "plan_key"),
            (ProjectionId::Cases, "data"),
            (ProjectionId::Cases, "case_input_revision"),
            (ProjectionId::Cases, "status_revision"),
            (ProjectionId::Cases, "created_at"),
            (ProjectionId::CaseEvidence, "rationale"),
            (ProjectionId::CaseEvidence, "data"),
            (ProjectionId::CaseEvidence, "assessed_by"),
            (ProjectionId::EvidenceCitations, "quote"),
            (ProjectionId::DocumentStatuses, "practice_id"),
            (ProjectionId::DocumentStatuses, "patient_id"),
            (ProjectionId::DocumentStatuses, "author_name"),
            (ProjectionId::DocumentStatuses, "author_npi"),
            (ProjectionId::DocumentStatuses, "storage_uri"),
            (ProjectionId::DocumentStatuses, "data"),
            (ProjectionId::DocumentStatuses, "text"),
            (ProjectionId::DocumentStatuses, "embedding"),
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
    fn case_summary_is_exact_and_excludes_unapproved_case_data() {
        let grant = ReplicaGrant::for_session(&session(id(1), "1"));
        let cases = grant.projection(ProjectionId::Cases).unwrap();

        assert_eq!(
            cases.columns,
            [
                "id",
                "practice_id",
                "case_number",
                "patient_id",
                "surgeon_id",
                "coordinator_id",
                "payer_id",
                "status",
                "date_of_service",
                "gate_affirmed_at",
                "updated_at",
                "revision",
            ]
        );
        assert!(cases.permits_column("gate_affirmed_at"));
        assert!(cases.permits_column("case_number"));
        assert!(cases.permits_column("patient_id"));
        assert!(cases.permits_column("revision"));
        assert!(!cases.permits_column("gate_affirmed_by"));
        assert!(!cases.permits_column("member_id"));
        assert!(!cases.permits_column("data"));
        assert!(!cases.permits_column("created_at"));
    }
}
