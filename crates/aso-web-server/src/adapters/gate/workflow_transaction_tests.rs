//! Synthetic evidence-to-approved-letter proof against a disposable database.

use super::*;
use aso_host::{
    AppServices,
    affirmation::ClinicalContext,
    domain::{ActorId, PracticeId},
    evidence_assembly::{
        AssembleEvidenceCommand, AssembledEvidenceState, EvidenceExpectedRevisions, EvidenceInput,
    },
    letter_workflow::{
        ApproveLetterCommand, GenerateLetterCommand, LetterExpectedRevisions, LetterPurpose,
        ReviewLetterCommand,
    },
    ports::SystemClock,
    session::{Principal, UnavailableSessions},
};
use chrono::Utc;
use std::sync::Arc;

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("required fixture variable missing: {name}"))
}

fn id(name: &str) -> Uuid {
    Uuid::parse_str(&env(name)).unwrap_or_else(|_| panic!("invalid fixture UUID: {name}"))
}

fn context() -> ClinicalContext {
    ClinicalContext {
        identity_id: id("ASO_TEST_WORKFLOW_IDENTITY_ID"),
        actor: ActorId(id("ASO_TEST_WORKFLOW_ACTOR_ID")),
        practice: PracticeId(id("ASO_TEST_WORKFLOW_PRACTICE_ID")),
        principal: Principal::User,
        expires_at: Utc::now() + chrono::Duration::hours(1),
    }
}

fn mark(name: &str) {
    println!("workflow_transaction_check: {name}");
}

#[tokio::test]
#[ignore = "requires scripts/test-web-case-to-letter.py disposable PostgreSQL fixture"]
async fn case_to_approved_letter_lifecycle() {
    let repository = Arc::new(
        PgGateRepository::connect(&env("ASO_TEST_WORKFLOW_DATABASE_URL"))
            .await
            .expect("restricted workflow repository connection failed"),
    );
    let app = AppServices {
        cases: repository.clone(),
        evidence: repository.clone(),
        criteria: repository.clone(),
        letters: repository.clone(),
        authority: repository,
        clock: Arc::new(SystemClock),
        sessions: Arc::new(UnavailableSessions),
    };
    let actor = context();
    let case_id = id("ASO_TEST_WORKFLOW_CASE_ID");
    let criterion_id = id("ASO_TEST_WORKFLOW_CRITERION_ID");
    let document_id = id("ASO_TEST_WORKFLOW_DOCUMENT_ID");
    let quote = env("ASO_TEST_WORKFLOW_QUOTE");

    let empty = app
        .read_case_evidence(&actor, &["case:read".into()], case_id)
        .await
        .expect("empty evidence snapshot failed");
    assert!(empty.entries.is_empty());

    let assembled = app
        .assemble_case_evidence(
            &actor,
            &["evidence_assemble".into()],
            case_id,
            &AssembleEvidenceCommand {
                command_id: Uuid::new_v4(),
                expected_revisions: EvidenceExpectedRevisions {
                    document_set_revision: format!("{case_id}:documentSetRevision:r0"),
                    criteria_selection_revision: format!("{case_id}:criteriaSelectionRevision:r1"),
                    evidence_work_revision: format!("{case_id}:evidenceWorkRevision:r0"),
                },
                evidence_inputs: vec![EvidenceInput {
                    id: Uuid::new_v4(),
                    criterion_id,
                    expected_state: AssembledEvidenceState::Met,
                    document_id: Some(document_id),
                    page_number: Some(1),
                    quote: Some(quote.clone()),
                    rationale: "The operative-level imaging requirement is documented.".into(),
                }],
            },
        )
        .await
        .expect("evidence assembly failed");
    assert_eq!(
        assembled.evidence_revision,
        format!("{case_id}:evidenceRevision:r1")
    );
    let snapshot = app
        .read_case_evidence(&actor, &["case:read".into()], case_id)
        .await
        .expect("assembled evidence read failed");
    assert_eq!(snapshot.entries.len(), 1);
    assert_eq!(snapshot.entries[0].state, AssembledEvidenceState::Met);
    assert_eq!(snapshot.entries[0].citations[0].quote, quote);
    mark("source_backed_three_state_evidence_committed");

    let generated = app
        .generate_letter(
            &actor,
            &["letter_generate".into()],
            case_id,
            &GenerateLetterCommand {
                command_id: Uuid::new_v4(),
                expected_revisions: LetterExpectedRevisions {
                    resolution_revision: format!("{case_id}:resolutionRevision:r1"),
                    criteria_selection_revision: format!("{case_id}:criteriaSelectionRevision:r1"),
                    evidence_revision: format!("{case_id}:evidenceRevision:r1"),
                },
                purpose: LetterPurpose::PriorAuthorizationRequest,
            },
        )
        .await
        .expect("letter generation failed");
    mark("four_part_clinical_gate_verified");
    let draft = app
        .read_letter(&actor, &["case:read".into()], generated.letter_id)
        .await
        .expect("draft read failed");
    assert_eq!(draft.status, "draft");
    assert_eq!(draft.claims.len(), 1);
    assert_eq!(draft.claims[0].source_quote, quote);
    assert!(draft.body_markdown.contains("Source:"));
    mark("deterministic_cited_draft_generated");

    app.review_letter(
        &actor,
        &["letter_review".into()],
        generated.letter_id,
        &ReviewLetterCommand {
            command_id: Uuid::new_v4(),
            expected_letter_version: draft.version,
        },
    )
    .await
    .expect("letter review failed");
    let reviewed = app
        .read_letter(&actor, &["case:read".into()], generated.letter_id)
        .await
        .expect("reviewed letter read failed");
    assert_eq!(reviewed.status, "in_review");
    assert!(
        reviewed
            .claims
            .iter()
            .all(|claim| claim.support_status == "supported")
    );

    app.approve_letter(
        &actor,
        &["letter_approve".into()],
        generated.letter_id,
        &ApproveLetterCommand {
            command_id: Uuid::new_v4(),
            expected_letter_version: reviewed.version,
            expected_qa_revision: reviewed.qa_revision,
        },
    )
    .await
    .expect("clinical letter approval failed");
    let approved = app
        .read_letter(&actor, &["case:read".into()], generated.letter_id)
        .await
        .expect("approved letter read failed");
    assert_eq!(approved.status, "approved");
    assert_eq!(approved.approved_at.is_some(), true);
    mark("human_review_and_clinical_approval_committed");
}
