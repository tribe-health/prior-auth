//! Explicit deployment operation. Ordinary server startup never reads migration
//! credentials or runs DDL. The existing ASO schema is a prerequisite.

use sqlx::{
    PgPool, SqlStr,
    migrate::{Migration, MigrationSource, MigrationType, Migrator},
    postgres::PgPoolOptions,
};
use std::{future::Future, pin::Pin};

#[derive(Debug)]
struct ServerMigrations;

#[derive(Debug)]
struct PublicationBoundaryMigrations;

fn local_publication_boundary_migration() -> Migration {
    Migration::new(
        2026090600,
        "local publication boundary".into(),
        MigrationType::Simple,
        SqlStr::from_static(include_str!(
            "../../../migrations/server/2026090600_local_publication_boundary.sql"
        )),
        false,
    )
}

fn publication_ddl_serialization_migration() -> Migration {
    Migration::new(
        2026090607,
        "publication DDL serialization".into(),
        MigrationType::Simple,
        SqlStr::from_static(include_str!(
            "../../../migrations/server/2026090607_publication_ddl_serialization.sql"
        )),
        false,
    )
}

impl MigrationSource<'static> for PublicationBoundaryMigrations {
    fn resolve(
        self,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<Migration>, sqlx::error::BoxDynError>> + Send>>
    {
        Box::pin(async {
            Ok(vec![
                local_publication_boundary_migration(),
                publication_ddl_serialization_migration(),
            ])
        })
    }
}

impl MigrationSource<'static> for ServerMigrations {
    fn resolve(
        self,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<Migration>, sqlx::error::BoxDynError>> + Send>>
    {
        Box::pin(async {
            Ok(vec![
                local_publication_boundary_migration(),
                Migration::new(
                    2026090601,
                    "durable gate".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090601_durable_gate.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090602,
                    "durable signing".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090602_durable_signing.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090603,
                    "durable evidence reassessment".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090603_durable_reassessment.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090604,
                    "immutable approved source documents".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090604_immutable_approved_sources.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090605,
                    "clinical revision and publication guards".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090605_clinical_revision_guards.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090606,
                    "clinical truncate guards".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090606_clinical_truncate_guards.sql"
                    )),
                    false,
                ),
                publication_ddl_serialization_migration(),
                Migration::new(
                    2026090608,
                    "approval QA serialization".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090608_approval_qa_serialization.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090609,
                    "durable session authority".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090609_durable_session_authority.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090610,
                    "session logout executor".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090610_session_logout_executor.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090611,
                    "Gate authority event reader".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090611_gate_authority_event_reader.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090612,
                    "Gate authority function boundary".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090612_gate_authority_function_boundary.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090613,
                    "Restore session reader execute".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090613_restore_session_reader_execute.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090614,
                    "durable attributed annotations".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090614_durable_annotations.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090615,
                    "annotation gateway policy".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090615_annotation_gateway_policy.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090616,
                    "authorized document source".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090616_authorized_document_source.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090617,
                    "durable case commands".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090617_durable_case_commands.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090618,
                    "administering entity resolution schema".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090618_administering_entity_resolution_schema.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090619,
                    "administering entity resolution commands".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090619_administering_entity_resolution_commands.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090620,
                    "document upload schema".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090620_document_upload_schema.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090621,
                    "document processing".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090621_document_processing.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090622,
                    "document status projection".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090622_document_status_projection.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090623,
                    "case document revision read".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090623_case_document_revision_read.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090624,
                    "criteria catalog".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090624_criteria_catalog.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090625,
                    "criteria catalog commands".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090625_criteria_catalog_commands.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090626,
                    "criteria catalog repair".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090626_criteria_catalog_repair.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090627,
                    "criteria selection".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090627_criteria_selection.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090628,
                    "evidence assembly".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090628_evidence_assembly.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090629,
                    "letter workflow".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090629_letter_workflow.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090630,
                    "criteria catalog helper execution".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090630_criteria_catalog_helper_execution.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090631,
                    "queued document payload".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090631_queued_document_payload.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090632,
                    "document processor queue".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090632_document_processor_queue.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090633,
                    "gate policy helper execution".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090633_gate_policy_helper_execution.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090634,
                    "letter claim attribution".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090634_letter_claim_attribution.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090635,
                    "signing retrieval helper execution".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090635_signing_retrieval_helper_execution.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090636,
                    "denial appeal workflow".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090636_denial_appeal_workflow.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090637,
                    "criteria catalog revision variable".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090637_criteria_catalog_revision_variable.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090638,
                    "document generation tasks".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090638_document_generation_tasks.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090639,
                    "authorized letter assembly read".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090639_letter_assembly_read.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090640,
                    "determination response mode confirmation".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090640_determination_response_mode.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090641,
                    "submission packet workflow".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090641_submission_packet_workflow.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090642,
                    "signed letter case progress".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090642_signed_letter_case_progress.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090643,
                    "submission and case progress repairs".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090643_submission_and_case_progress_repairs.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090644,
                    "signing target owner".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090644_signing_target_owner.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090645,
                    "signing current letter columns".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090645_signing_current_letter_columns.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090646,
                    "document task status projection".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090646_document_task_status_projection.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090647,
                    "determination case progress".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090647_determination_case_progress.sql"
                    )),
                    false,
                ),
                Migration::new(
                    2026090648,
                    "case display labels".into(),
                    MigrationType::Simple,
                    SqlStr::from_static(include_str!(
                        "../../../migrations/server/2026090648_case_display_labels.sql"
                    )),
                    false,
                ),
            ])
        })
    }
}

async fn reject_unsafe_local_publications(pool: &PgPool) -> Result<(), Box<dyn std::error::Error>> {
    let unsafe_publication: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT FROM pg_catalog.pg_publication WHERE puballtables)
          OR EXISTS (
            SELECT FROM pg_catalog.pg_publication_namespace pn
            JOIN pg_catalog.pg_namespace n ON n.oid = pn.pnnspid
            WHERE n.nspname = 'aso'
          )
          OR EXISTS (
            SELECT FROM pg_catalog.pg_publication_rel pr
            JOIN pg_catalog.pg_class c ON c.oid = pr.prrelid
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname IN (
                    'gate_commands',
                    'letter_sign_commands',
                    'evidence_reassessment_commands'
                    ,'annotation_commands'
                    ,'annotation_revisions'
                    ,'case_commands'
                    ,'document_upload_staging'
                    ,'document_upload_commands'
                    ,'document_processor_grants'
                    ,'document_pages'
                    ,'document_processing_commands'
                    ,'determination_commands'
                    ,'document_generation_tasks'
                    ,'document_generation_events'
                    ,'synthetic_generation_cases'
                    ,'submission_commands'
                  )
               OR (
                 position('Privacy: local' in COALESCE(
                   pg_catalog.obj_description(c.oid, 'pg_class'), '')) > 0
                 AND position('excluded from replication' in COALESCE(
                   pg_catalog.obj_description(c.oid, 'pg_class'), '')) > 0
               )
          )
          OR EXISTS (
            SELECT FROM pg_catalog.pg_publication_namespace pn
            JOIN pg_catalog.pg_class c ON c.relnamespace = pn.pnnspid
            WHERE c.relname IN (
                    'gate_commands',
                    'letter_sign_commands',
                    'evidence_reassessment_commands'
                    ,'annotation_commands'
                    ,'annotation_revisions'
                    ,'case_commands'
                    ,'document_upload_staging'
                    ,'document_upload_commands'
                    ,'document_processor_grants'
                    ,'document_pages'
                    ,'document_processing_commands'
                    ,'determination_commands'
                    ,'document_generation_tasks'
                    ,'document_generation_events'
                    ,'synthetic_generation_cases'
                    ,'submission_commands'
                  )
               OR (
                 position('Privacy: local' in COALESCE(
                   pg_catalog.obj_description(c.oid, 'pg_class'), '')) > 0
                 AND position('excluded from replication' in COALESCE(
                   pg_catalog.obj_description(c.oid, 'pg_class'), '')) > 0
               )
          )",
    )
    .fetch_one(pool)
    .await
    .map_err(|_| "server migration publication preflight failed")?;
    if unsafe_publication {
        return Err(
            "server migration requires explicit-table publications that exclude local command ledgers; repair the publication, verify that local command data was not replicated, and rerun"
                .into(),
        );
    }
    Ok(())
}

pub async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let url = std::env::var("ASO_MIGRATION_DATABASE_URL")
        .map_err(|_| "ASO_MIGRATION_DATABASE_URL is required for --migrate-server")?;
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .map_err(|_| "server migration connection failed")?;
    // All server migrations commit separately. Refuse an already unsafe
    // publication, then install both publication-boundary migrations before
    // any local command table can commit. ignore_missing permits this focused
    // pass to repair databases that have already applied migrations 0601-0606.
    reject_unsafe_local_publications(&pool).await?;
    let mut boundary = Migrator::new(PublicationBoundaryMigrations).await?;
    boundary.set_ignore_missing(true);
    if let Err(error) = boundary.run(&pool).await {
        pool.close().await;
        return match error {
            sqlx::migrate::MigrateError::VersionMismatch(_) => {
                Err("server migration checksum mismatch: applied SQL was modified".into())
            }
            _ => Err("server migration failed; database unchanged for the failed migration".into()),
        };
    }
    // SQLx takes its migration lock, validates SHA-384 checksums, and commits
    // each migration and its ledger entry in one transaction.
    let result = Migrator::new(ServerMigrations).await?.run(&pool).await;
    if result.is_ok()
        && let Err(error) = reject_unsafe_local_publications(&pool).await
    {
        pool.close().await;
        return Err(error);
    }
    pool.close().await;
    match result {
        Ok(()) => {
            println!("server migrations applied and checksums verified");
            Ok(())
        }
        Err(sqlx::migrate::MigrateError::VersionMismatch(_)) => {
            Err("server migration checksum mismatch: applied SQL was modified".into())
        }
        // SQL errors can contain record values. Keep deployment output generic.
        Err(_) => {
            Err("server migration failed; database unchanged for the failed migration".into())
        }
    }
}
