//! Focused disposable-PostgreSQL proof for the criteria catalog service.

use super::*;

use std::sync::Arc;

use aso_host::{
    AppServices,
    criteria_catalog::{
        CriteriaCatalogExpectedRevisions, CriteriaCatalogInput, CriteriaPolicyInput,
    },
    domain::EvidenceGrade,
    ports::SystemClock,
    session::{Principal, SessionCredential, SessionError, SessionPort, SessionSummary},
};
use async_trait::async_trait;
use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use chrono::{NaiveDate, TimeZone};
use sha2::{Digest, Sha256};
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("required fixture variable missing: {name}"))
}

fn fixture() -> serde_json::Value {
    serde_json::from_str(&env("ASO_TEST_CRITERIA_FIXTURE")).expect("criteria fixture JSON invalid")
}

fn id(value: &serde_json::Value, key: &str) -> Uuid {
    Uuid::parse_str(value[key].as_str().expect("fixture UUID missing"))
        .expect("fixture UUID invalid")
}

fn context(value: &serde_json::Value, principal: Principal) -> ClinicalContext {
    ClinicalContext {
        identity_id: id(value, "identityId"),
        actor: ActorId(id(value, "actorId")),
        practice: PracticeId(id(value, "practiceId")),
        principal,
        expires_at: Utc::now() + chrono::Duration::hours(1),
    }
}

fn hash(requirement: &str) -> String {
    Sha256::digest(requirement.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn policy(
    id: Uuid,
    payer_id: Uuid,
    document_id: Uuid,
    number: &str,
    version: &str,
    effective_from: NaiveDate,
) -> CriteriaPolicyInput {
    CriteriaPolicyInput {
        id,
        payer_id,
        policy_type_key: "medical-policy".into(),
        name: format!("Synthetic criteria policy {version}"),
        policy_number: number.into(),
        version: version.into(),
        effective_from,
        effective_to: Some(NaiveDate::from_ymd_opt(2027, 1, 1).unwrap()),
        document_id,
    }
}

struct CriterionSpec<'a> {
    id: Uuid,
    payer_id: Uuid,
    policy_id: Uuid,
    document_id: Uuid,
    label: &'a str,
    requirement: &'a str,
    grade: EvidenceGrade,
    valid_from: NaiveDate,
    supersedes: Option<Uuid>,
}

fn criterion(spec: CriterionSpec<'_>) -> CriteriaCatalogInput {
    CriteriaCatalogInput {
        id: spec.id,
        ordinal: 1,
        label: spec.label.into(),
        requirement: spec.requirement.into(),
        evidence_grade: spec.grade,
        document_id: spec.document_id,
        source_page_number: 1,
        valid_from: spec.valid_from,
        valid_to: Some(NaiveDate::from_ymd_opt(2027, 1, 1).unwrap()),
        payer_id: spec.payer_id,
        policy_id: spec.policy_id,
        section: "3.2".into(),
        content_sha256: hash(spec.requirement),
        last_confirmed_at: Utc.with_ymd_and_hms(2026, 3, 1, 12, 0, 0).unwrap(),
        procedure_family: Some("lumbar-fusion".into()),
        is_mandatory: true,
        supersedes_criterion_id: spec.supersedes,
    }
}

fn command(
    command_id: Uuid,
    revision: &str,
    policy: CriteriaPolicyInput,
    criterion: CriteriaCatalogInput,
) -> ImportCriteriaCatalogCommand {
    ImportCriteriaCatalogCommand {
        command_id,
        expected_revisions: CriteriaCatalogExpectedRevisions {
            criteria_catalog_revision: revision.into(),
        },
        criteria: vec![criterion],
        policy,
    }
}

fn mark(name: &str) {
    println!("criteria_transaction_check: {name}");
}

struct FixtureSessions {
    admin: ClinicalContext,
    reader: ClinicalContext,
    foreign_reader: ClinicalContext,
}

impl FixtureSessions {
    fn session(context: &ClinicalContext, capabilities: Vec<String>) -> SessionSummary {
        SessionSummary {
            identity_id: context.identity_id,
            session_id: Uuid::new_v4(),
            user_id: context.actor.0,
            practice_id: context.practice.0,
            display_name: "Synthetic criteria actor".into(),
            principal: context.principal,
            capabilities,
            expires_at: context.expires_at,
            authorization_revision: "synthetic:web06-http".into(),
        }
    }
}

#[async_trait]
impl SessionPort for FixtureSessions {
    async fn resolve(
        &self,
        credential: &SessionCredential,
        practice: Option<Uuid>,
    ) -> Result<SessionSummary, SessionError> {
        let (context, capabilities) = match credential {
            SessionCredential::NativeToken(token) if token == "synthetic-web06-admin" => {
                (&self.admin, vec!["configure".into()])
            }
            SessionCredential::NativeToken(token) if token == "synthetic-web06-reader" => {
                (&self.reader, vec!["case:read".into()])
            }
            SessionCredential::NativeToken(token) if token == "synthetic-web06-foreign" => {
                (&self.foreign_reader, vec!["case:read".into()])
            }
            _ => return Err(SessionError::Unauthenticated),
        };
        if practice.is_some_and(|value| value != context.practice.0) {
            return Err(SessionError::PracticeDenied);
        }
        Ok(Self::session(context, capabilities))
    }
}

async fn response_json(response: axum::response::Response) -> serde_json::Value {
    let bytes = to_bytes(response.into_body(), 1024 * 1024)
        .await
        .expect("criteria HTTP body read failed");
    serde_json::from_slice(&bytes).expect("criteria HTTP body was not JSON")
}

fn get_request(uri: String, token: &str) -> Request<Body> {
    Request::builder()
        .uri(uri)
        .header("authorization", format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap()
}

fn post_request(uri: String, token: &str, command: &ImportCriteriaCatalogCommand) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(uri)
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(command).unwrap()))
        .unwrap()
}

#[tokio::test]
#[ignore = "requires scripts/test-web06-criteria-service.py disposable PostgreSQL fixture"]
async fn criteria_catalog_service_lifecycle() {
    let fixture = fixture();
    let admin = context(&fixture["admin"], Principal::User);
    let reader = context(&fixture["reader"], Principal::User);
    let foreign_reader = context(&fixture["foreignReader"], Principal::User);
    let service = context(&fixture["admin"], Principal::Service);
    let payer_id = id(&fixture, "payerId");
    let published_document = id(&fixture, "publishedDocumentId");
    let obtained_document = id(&fixture, "obtainedDocumentId");
    let correction_document = id(&fixture, "correctionDocumentId");
    let foreign_document = id(&fixture, "foreignDocumentId");

    let repository = Arc::new(
        PgGateRepository::connect(&env("ASO_TEST_CRITERIA_DATABASE_URL"))
            .await
            .expect("restricted criteria repository connection failed"),
    );
    let observer = PgPoolOptions::new()
        .max_connections(1)
        .connect(&env("ASO_TEST_CRITERIA_ADMIN_DATABASE_URL"))
        .await
        .expect("criteria observer connection failed");
    let services = AppServices {
        cases: repository.clone(),
        evidence: repository.clone(),
        criteria: repository.clone(),
        letters: repository.clone(),
        authority: repository.clone(),
        clock: Arc::new(SystemClock),
        sessions: Arc::new(FixtureSessions {
            admin: context(&fixture["admin"], Principal::User),
            reader: context(&fixture["reader"], Principal::User),
            foreign_reader: context(&fixture["foreignReader"], Principal::User),
        }),
    };
    let configure = vec!["configure".into()];
    let read = vec!["case:read".into()];

    let published_policy_id = Uuid::new_v4();
    let published_criterion_id = Uuid::new_v4();
    let published_requirement = "Six weeks of supervised therapy are documented.";
    let published = command(
        Uuid::new_v4(),
        "catalog:criteriaCatalogRevision:r0",
        policy(
            published_policy_id,
            payer_id,
            published_document,
            "SYN-WEB06-PUBLISHED",
            "2026.1",
            NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
        ),
        criterion(CriterionSpec {
            id: published_criterion_id,
            payer_id,
            policy_id: published_policy_id,
            document_id: published_document,
            label: "Supervised therapy",
            requirement: published_requirement,
            grade: EvidenceGrade::Published,
            valid_from: NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
            supersedes: None,
        }),
    );
    let mut wrong_namespace = published.clone();
    wrong_namespace.command_id = Uuid::new_v4();
    wrong_namespace.expected_revisions.criteria_catalog_revision =
        "attacker:criteriaCatalogRevision:r0".into();
    assert_eq!(
        services
            .import_criteria_catalog(&admin, &configure, &wrong_namespace)
            .await,
        Err(CriteriaCatalogError::Invalid)
    );
    let mut noncanonical_zero = published.clone();
    noncanonical_zero.command_id = Uuid::new_v4();
    noncanonical_zero
        .expected_revisions
        .criteria_catalog_revision = "catalog:criteriaCatalogRevision:r00".into();
    assert_eq!(
        services
            .import_criteria_catalog(&admin, &configure, &noncanonical_zero)
            .await,
        Err(CriteriaCatalogError::Invalid)
    );
    assert_eq!(
        services
            .import_criteria_catalog(&reader, &read, &published)
            .await,
        Err(CriteriaCatalogError::Denied)
    );
    assert_eq!(
        services
            .import_criteria_catalog(&service, &configure, &published)
            .await,
        Err(CriteriaCatalogError::Denied)
    );
    let published_result = services
        .import_criteria_catalog(&admin, &configure, &published)
        .await
        .expect("published import failed");
    assert_eq!(
        published_result.criteria_catalog_revision,
        "catalog:criteriaCatalogRevision:r1"
    );
    assert_eq!(published_result.criterion_ids, [published_criterion_id]);
    assert_eq!(
        services
            .import_criteria_catalog(&admin, &configure, &published)
            .await
            .expect("exact published retry failed"),
        published_result
    );
    assert_eq!(
        services
            .lookup_criteria_import_command(&admin, &configure, published.command_id)
            .await
            .expect("published lookup failed"),
        Some(published_result.clone())
    );
    let mut changed_retry = published.clone();
    changed_retry.criteria[0].requirement = "Changed retry payload.".into();
    changed_retry.criteria[0].content_sha256 = hash("Changed retry payload.");
    assert_eq!(
        services
            .import_criteria_catalog(&admin, &configure, &changed_retry)
            .await,
        Err(CriteriaCatalogError::CommandConflict)
    );
    mark("published_import_exact_retry_and_conflict");

    let obtained_policy_id = Uuid::new_v4();
    let obtained_criterion_id = Uuid::new_v4();
    let obtained_requirement = "Payer portal confirmation requires standing radiographs.";
    let obtained = command(
        Uuid::new_v4(),
        &published_result.criteria_catalog_revision,
        policy(
            obtained_policy_id,
            payer_id,
            obtained_document,
            "SYN-WEB06-OBTAINED",
            "2026.1",
            NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
        ),
        criterion(CriterionSpec {
            id: obtained_criterion_id,
            payer_id,
            policy_id: obtained_policy_id,
            document_id: obtained_document,
            label: "Standing radiographs",
            requirement: obtained_requirement,
            grade: EvidenceGrade::ObtainedByRequest,
            valid_from: NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
            supersedes: None,
        }),
    );
    let obtained_result = services
        .import_criteria_catalog(&admin, &configure, &obtained)
        .await
        .expect("obtained import failed");
    let local = services
        .list_criteria_catalog(&reader, &read, Some(payer_id))
        .await
        .expect("local catalog read failed");
    assert!(local.criteria.iter().any(|item| {
        item.id == published_criterion_id
            && item.practice_id.is_none()
            && item.evidence_grade == EvidenceGrade::Published
    }));
    assert!(local.criteria.iter().any(|item| {
        item.id == obtained_criterion_id
            && item.practice_id == Some(admin.practice.0)
            && item.evidence_grade == EvidenceGrade::ObtainedByRequest
    }));
    let foreign = services
        .list_criteria_catalog(&foreign_reader, &read, Some(payer_id))
        .await
        .expect("foreign catalog read failed");
    assert!(
        foreign
            .criteria
            .iter()
            .any(|item| item.id == published_criterion_id)
    );
    assert!(
        !foreign
            .criteria
            .iter()
            .any(|item| item.id == obtained_criterion_id)
    );
    assert_eq!(
        services
            .read_catalog_criterion(&foreign_reader, &read, obtained_criterion_id)
            .await,
        Err(CriteriaCatalogError::NotFound)
    );
    mark("published_visibility_and_obtained_tenant_scope");

    let cross_grade_published_id = Uuid::new_v4();
    let cross_grade_obtained_id = Uuid::new_v4();
    let foreign_obtained_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO aso.criteria (
           id,payer_id,practice_id,evidence_grade,policy_id,section,ordinal,
           document_id,source_page_number,label,requirement,content_sha256,
           validity,last_confirmed_at)
         VALUES
           ($1,$2,NULL,'published',$3,'3.2',20,$4,1,'Shared namespace label',
            'Six weeks of supervised therapy are documented.',
            digest(convert_to('Six weeks of supervised therapy are documented.','UTF8'),'sha256'),
            daterange(DATE '2026-01-01',DATE '2027-01-01','[)'),
            TIMESTAMPTZ '2026-03-01 12:00:00+00'),
           ($5,$2,$6,'obtained_by_request',NULL,'3.2',21,$7,1,'Shared namespace label',
            'Payer portal confirmation requires standing radiographs.',
            digest(convert_to('Payer portal confirmation requires standing radiographs.','UTF8'),'sha256'),
            daterange(DATE '2026-01-01',DATE '2027-01-01','[)'),
            TIMESTAMPTZ '2026-03-01 12:00:00+00'),
           ($8,$2,$9,'obtained_by_request',NULL,'3.2',22,$10,1,'Tenant namespace label',
            'The stale command must not commit.',
            digest(convert_to('The stale command must not commit.','UTF8'),'sha256'),
            daterange(DATE '2026-01-01',DATE '2027-01-01','[)'),
            TIMESTAMPTZ '2026-03-01 12:00:00+00')",
    )
    .bind(cross_grade_published_id)
    .bind(payer_id)
    .bind(published_policy_id)
    .bind(published_document)
    .bind(cross_grade_obtained_id)
    .bind(admin.practice.0)
    .bind(obtained_document)
    .bind(foreign_obtained_id)
    .bind(foreign_reader.practice.0)
    .bind(foreign_document)
    .execute(&observer)
    .await
    .expect("grade and tenant namespaces incorrectly overlap");
    let namespace_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM aso.criteria WHERE id IN ($1,$2,$3)")
            .bind(cross_grade_published_id)
            .bind(cross_grade_obtained_id)
            .bind(foreign_obtained_id)
            .fetch_one(&observer)
            .await
            .expect("criteria namespace count failed");
    assert_eq!(namespace_count, 3);

    let foreign_supersession_policy_id = Uuid::new_v4();
    let foreign_supersession = command(
        Uuid::new_v4(),
        &obtained_result.criteria_catalog_revision,
        policy(
            foreign_supersession_policy_id,
            payer_id,
            correction_document,
            "SYN-WEB06-FOREIGN-SUPERSESSION",
            "2026.1",
            NaiveDate::from_ymd_opt(2026, 7, 1).unwrap(),
        ),
        criterion(CriterionSpec {
            id: Uuid::new_v4(),
            payer_id,
            policy_id: foreign_supersession_policy_id,
            document_id: correction_document,
            label: "Tenant namespace label",
            requirement: "Twelve weeks of supervised therapy are documented.",
            grade: EvidenceGrade::ObtainedByRequest,
            valid_from: NaiveDate::from_ymd_opt(2026, 7, 1).unwrap(),
            supersedes: Some(foreign_obtained_id),
        }),
    );
    assert_eq!(
        services
            .import_criteria_catalog(&admin, &configure, &foreign_supersession)
            .await,
        Err(CriteriaCatalogError::InvalidProvenance)
    );
    mark("grade_tenant_namespaces_and_foreign_supersession_refusal");

    let wrong_source_date_policy_id = Uuid::new_v4();
    let wrong_source_date = command(
        Uuid::new_v4(),
        &obtained_result.criteria_catalog_revision,
        policy(
            wrong_source_date_policy_id,
            payer_id,
            published_document,
            "SYN-WEB06-WRONG-SOURCE-DATE",
            "2026.1",
            NaiveDate::from_ymd_opt(2026, 2, 1).unwrap(),
        ),
        criterion(CriterionSpec {
            id: Uuid::new_v4(),
            payer_id,
            policy_id: wrong_source_date_policy_id,
            document_id: published_document,
            label: "Wrong source date",
            requirement: published_requirement,
            grade: EvidenceGrade::Published,
            valid_from: NaiveDate::from_ymd_opt(2026, 2, 1).unwrap(),
            supersedes: None,
        }),
    );
    assert_eq!(
        services
            .import_criteria_catalog(&admin, &configure, &wrong_source_date)
            .await,
        Err(CriteriaCatalogError::InvalidProvenance)
    );
    mark("source_effective_date_is_bound_to_policy");

    let stale_policy_id = Uuid::new_v4();
    let stale = command(
        Uuid::new_v4(),
        "catalog:criteriaCatalogRevision:r1",
        policy(
            stale_policy_id,
            payer_id,
            correction_document,
            "SYN-WEB06-STALE",
            "2026.1",
            NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
        ),
        criterion(CriterionSpec {
            id: Uuid::new_v4(),
            payer_id,
            policy_id: stale_policy_id,
            document_id: correction_document,
            label: "Stale synthetic criterion",
            requirement: "The stale command must not commit.",
            grade: EvidenceGrade::Published,
            valid_from: NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
            supersedes: None,
        }),
    );
    assert_eq!(
        services
            .import_criteria_catalog(&admin, &configure, &stale)
            .await,
        Err(CriteriaCatalogError::RevisionConflict)
    );
    let mut laundered = stale.clone();
    laundered.command_id = Uuid::new_v4();
    laundered.expected_revisions.criteria_catalog_revision =
        obtained_result.criteria_catalog_revision.clone();
    laundered.criteria[0].evidence_grade = EvidenceGrade::DerivedObserved;
    assert_eq!(
        services
            .import_criteria_catalog(&admin, &configure, &laundered)
            .await,
        Err(CriteriaCatalogError::Invalid)
    );
    let mut foreign_source = stale;
    foreign_source.command_id = Uuid::new_v4();
    foreign_source.expected_revisions.criteria_catalog_revision =
        obtained_result.criteria_catalog_revision.clone();
    foreign_source.policy.document_id = foreign_document;
    foreign_source.criteria[0].document_id = foreign_document;
    assert_eq!(
        services
            .import_criteria_catalog(&admin, &configure, &foreign_source)
            .await,
        Err(CriteriaCatalogError::Denied)
    );
    mark("stale_grade_laundering_and_foreign_source_refusal");

    let correction_policy_id = Uuid::new_v4();
    let corrected_criterion_id = Uuid::new_v4();
    let corrected_requirement = "Twelve weeks of supervised therapy are documented.";
    let correction = command(
        Uuid::new_v4(),
        &obtained_result.criteria_catalog_revision,
        policy(
            correction_policy_id,
            payer_id,
            correction_document,
            "SYN-WEB06-PUBLISHED",
            "2026.2",
            NaiveDate::from_ymd_opt(2026, 7, 1).unwrap(),
        ),
        criterion(CriterionSpec {
            id: corrected_criterion_id,
            payer_id,
            policy_id: correction_policy_id,
            document_id: correction_document,
            label: "Supervised therapy",
            requirement: corrected_requirement,
            grade: EvidenceGrade::Published,
            valid_from: NaiveDate::from_ymd_opt(2026, 7, 1).unwrap(),
            supersedes: Some(published_criterion_id),
        }),
    );
    let correction_result = services
        .import_criteria_catalog(&admin, &configure, &correction)
        .await
        .expect("criteria correction failed");
    assert_eq!(
        correction_result.criteria_catalog_revision,
        "catalog:criteriaCatalogRevision:r3"
    );
    let original = services
        .read_catalog_criterion(&reader, &read, published_criterion_id)
        .await
        .expect("original criterion read failed");
    assert_eq!(original.requirement, published_requirement);
    assert_eq!(
        original.valid_to,
        Some(NaiveDate::from_ymd_opt(2026, 7, 1).unwrap())
    );
    assert_eq!(original.superseded_by, Some(corrected_criterion_id));
    let corrected = services
        .read_catalog_criterion(&reader, &read, corrected_criterion_id)
        .await
        .expect("corrected criterion read failed");
    assert_eq!(corrected.requirement, corrected_requirement);
    assert_eq!(corrected.superseded_by, None);
    mark("immutable_correction_by_supersession");

    let router = aso_server_axum::api_router(aso_server_axum::ServerState {
        services: Arc::new(services),
    });
    let home_query = format!("practiceId={}&payerId={payer_id}", admin.practice.0);
    let foreign_query = format!(
        "practiceId={}&payerId={payer_id}",
        foreign_reader.practice.0
    );

    let local_list = router
        .clone()
        .oneshot(get_request(
            format!("/api/criteria/catalog?{home_query}"),
            "synthetic-web06-reader",
        ))
        .await
        .unwrap();
    assert_eq!(local_list.status(), StatusCode::OK);
    assert_eq!(local_list.headers()["cache-control"], "no-store");
    let local_list = response_json(local_list).await;
    let local_ids = local_list["criteria"]
        .as_array()
        .unwrap()
        .iter()
        .map(|value| value["id"].as_str().unwrap())
        .collect::<Vec<_>>();
    assert!(local_ids.contains(&published_criterion_id.to_string().as_str()));
    assert!(local_ids.contains(&obtained_criterion_id.to_string().as_str()));

    let criterion_read = router
        .clone()
        .oneshot(get_request(
            format!(
                "/api/criteria/{corrected_criterion_id}?practiceId={}",
                reader.practice.0
            ),
            "synthetic-web06-reader",
        ))
        .await
        .unwrap();
    assert_eq!(criterion_read.status(), StatusCode::OK);
    assert_eq!(
        response_json(criterion_read).await["requirement"],
        corrected_requirement
    );

    let command_lookup = router
        .clone()
        .oneshot(get_request(
            format!(
                "/api/criteria/catalog/commands/{}?practiceId={}",
                published.command_id, admin.practice.0
            ),
            "synthetic-web06-admin",
        ))
        .await
        .unwrap();
    assert_eq!(command_lookup.status(), StatusCode::OK);
    assert_eq!(
        response_json(command_lookup).await["commandId"],
        published.command_id.to_string()
    );

    let exact_retry = router
        .clone()
        .oneshot(post_request(
            format!("/api/criteria/catalog?practiceId={}", admin.practice.0),
            "synthetic-web06-admin",
            &published,
        ))
        .await
        .unwrap();
    assert_eq!(exact_retry.status(), StatusCode::OK);
    assert_eq!(
        response_json(exact_retry).await["criteriaCatalogRevision"],
        published_result.criteria_catalog_revision
    );
    mark("mounted_http_service_parity");

    let foreign_list = router
        .clone()
        .oneshot(get_request(
            format!("/api/criteria/catalog?{foreign_query}"),
            "synthetic-web06-foreign",
        ))
        .await
        .unwrap();
    assert_eq!(foreign_list.status(), StatusCode::OK);
    let foreign_list = response_json(foreign_list).await;
    let foreign_ids = foreign_list["criteria"]
        .as_array()
        .unwrap()
        .iter()
        .map(|value| value["id"].as_str().unwrap())
        .collect::<Vec<_>>();
    assert!(foreign_ids.contains(&published_criterion_id.to_string().as_str()));
    assert!(!foreign_ids.contains(&obtained_criterion_id.to_string().as_str()));

    let foreign_obtained = router
        .clone()
        .oneshot(get_request(
            format!(
                "/api/criteria/{obtained_criterion_id}?practiceId={}",
                foreign_reader.practice.0
            ),
            "synthetic-web06-foreign",
        ))
        .await
        .unwrap();
    assert_eq!(foreign_obtained.status(), StatusCode::NOT_FOUND);
    assert_eq!(
        response_json(foreign_obtained).await["error"],
        "resource_not_found"
    );

    let mismatched_practice = router
        .clone()
        .oneshot(get_request(
            format!(
                "/api/criteria/catalog?practiceId={}",
                foreign_reader.practice.0
            ),
            "synthetic-web06-reader",
        ))
        .await
        .unwrap();
    assert_eq!(mismatched_practice.status(), StatusCode::FORBIDDEN);
    assert_eq!(
        response_json(mismatched_practice).await["error"],
        "action_forbidden"
    );

    let conflicting_retry = router
        .clone()
        .oneshot(post_request(
            format!("/api/criteria/catalog?practiceId={}", admin.practice.0),
            "synthetic-web06-admin",
            &changed_retry,
        ))
        .await
        .unwrap();
    assert_eq!(conflicting_retry.status(), StatusCode::CONFLICT);
    assert_eq!(
        response_json(conflicting_retry).await["error"],
        "command_conflict"
    );
    mark("mounted_http_tenant_scope_and_conflicting_retry");

    let mut grade_laundering = laundered;
    grade_laundering
        .expected_revisions
        .criteria_catalog_revision = correction_result.criteria_catalog_revision.clone();
    let grade_laundering = router
        .clone()
        .oneshot(post_request(
            format!("/api/criteria/catalog?practiceId={}", admin.practice.0),
            "synthetic-web06-admin",
            &grade_laundering,
        ))
        .await
        .unwrap();
    assert_eq!(grade_laundering.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        response_json(grade_laundering).await["error"],
        "invalid_request"
    );

    let overlap_policy_id = Uuid::new_v4();
    let overlap = command(
        Uuid::new_v4(),
        &correction_result.criteria_catalog_revision,
        policy(
            overlap_policy_id,
            payer_id,
            correction_document,
            "SYN-WEB06-OVERLAP",
            "2026.1",
            NaiveDate::from_ymd_opt(2026, 7, 1).unwrap(),
        ),
        criterion(CriterionSpec {
            id: Uuid::new_v4(),
            payer_id,
            policy_id: overlap_policy_id,
            document_id: correction_document,
            label: "Supervised therapy",
            requirement: corrected_requirement,
            grade: EvidenceGrade::Published,
            valid_from: NaiveDate::from_ymd_opt(2026, 8, 1).unwrap(),
            supersedes: None,
        }),
    );
    let overlap = router
        .clone()
        .oneshot(post_request(
            format!("/api/criteria/catalog?practiceId={}", admin.practice.0),
            "synthetic-web06-admin",
            &overlap,
        ))
        .await
        .unwrap();
    assert_eq!(overlap.status(), StatusCode::CONFLICT);
    assert_eq!(response_json(overlap).await["error"], "criteria_overlap");
    mark("mounted_http_overlap_and_grade_non_promotion");

    let audit_count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM aso.audit_events
         WHERE action='criteria_catalog.import' AND outcome='success'",
    )
    .fetch_one(&observer)
    .await
    .expect("criteria audit read failed");
    assert_eq!(audit_count, 3);
    let ledger_error = sqlx::query("UPDATE aso.criteria_catalog_commands SET payload=payload")
        .execute(&observer)
        .await
        .expect_err("criteria command ledger accepted an update");
    assert_eq!(
        ledger_error
            .as_database_error()
            .and_then(|error| error.code())
            .as_deref(),
        Some("23514")
    );
    observer.close().await;
    mark("audited_imports_and_immutable_command_ledger");
}
