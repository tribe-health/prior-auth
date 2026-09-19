//! Thin web binary: configuration, assets, deployment adapters. All behaviour
//! lives in `aso-host`; this file only chooses how to expose it.
//!
//! Asset serving has two modes and the env prefix is derived from the app
//! name, never hardcoded to a product string:
//!   ASO_WEB_ROOT   serve from this directory at runtime (external mode)
//!   unset          fall back to the embedded bundle
//! An invalid directory is rejected at readiness rather than 404-ing per file.

use std::{net::SocketAddr, str::FromStr, sync::Arc};

use aso_host::{
    AppServices,
    affirmation::ClinicalContext,
    document_processing::{AUTHORIZED_DOCUMENT_JOB_GRANT, ProcessCaseDocumentCommand},
    domain::{ActorId, PracticeId},
    ports,
    session::Principal,
};
use aso_server_axum::{ServerState, api_router};
use chrono::{Duration as ChronoDuration, Utc};
use sqlx::postgres::PgConnectOptions;
use tokio::time::{Duration, sleep};
use tower_http::{services::ServeDir, trace::TraceLayer};
use uuid::Uuid;

mod adapters;
mod migrations;

fn configured_document_store(
    root: Option<String>,
) -> Result<Arc<dyn adapters::document_store::DocumentStore>, &'static str> {
    match root {
        Some(root) => Ok(Arc::new(adapters::document_store::LocalDocumentStore::new(
            root,
        )?)),
        None => Ok(Arc::new(adapters::document_store::UnavailableDocumentStore)),
    }
}

/// Only the synthetic inference route is currently qualified for deployment.
/// Production patient-data inference remains disabled without a separate provider.
fn configured_generation(
    repository: adapters::gate::PgGateRepository,
) -> Result<adapters::gate::PgGateRepository, Box<dyn std::error::Error>> {
    use aso_host::document_generation::{GenerationPolicy, InferenceRoute, ProviderQualification};
    let Some(route) = std::env::var("ASO_GENERATION_ROUTE").ok() else {
        return Ok(repository);
    };
    if route != "synthetic" {
        return Err("production inference is disabled pending provider qualification".into());
    }
    let manifest_path = std::env::var("ASO_DA_PACKAGE_MANIFEST")
        .map_err(|_| "ASO_DA_PACKAGE_MANIFEST is required for document generation")?;
    let manifest: serde_json::Value = serde_json::from_slice(&std::fs::read(manifest_path)?)?;
    let digest = manifest
        .get("templateDigest")
        .and_then(serde_json::Value::as_str)
        .filter(|value| {
            value.len() == 71
                && value.starts_with("sha256:")
                && value[7..].bytes().all(|byte| byte.is_ascii_hexdigit())
        })
        .ok_or("assembly manifest digest is invalid")?;
    if manifest
        .get("schemaVersion")
        .and_then(serde_json::Value::as_u64)
        != Some(1)
        || manifest.get("package").and_then(serde_json::Value::as_str) != Some("aso-prior-auth")
    {
        return Err("assembly manifest schema or package is invalid".into());
    }
    let assembly_url =
        std::env::var("ASO_ASSEMBLY_URL").map_err(|_| "ASO_ASSEMBLY_URL is required")?;
    let assembly_secret = generation_secret("ASO_ASSEMBLY_TOKEN", "ASO_ASSEMBLY_TOKEN_FILE")?;
    let liter_url = std::env::var("ASO_LITER_SYNTHETIC_URL")
        .map_err(|_| "ASO_LITER_SYNTHETIC_URL is required")?;
    let liter_secret =
        generation_secret("ASO_LITER_SYNTHETIC_KEY", "ASO_LITER_SYNTHETIC_KEY_FILE")?;
    let model = std::env::var("QWEN_TOKEN_PLAN_MODEL").unwrap_or_else(|_| "qwen3.8-max".into());
    let inference = adapters::document_generation::LiterDocumentInference::new(
        &liter_url,
        &liter_secret,
        &model,
        digest,
    )?;
    let assembler =
        adapters::document_generation::HttpDocumentAssembler::new(&assembly_url, &assembly_secret)?;
    Ok(repository.with_document_generation(
        Arc::new(inference),
        Arc::new(assembler),
        GenerationPolicy {
            route: InferenceRoute::SyntheticDemo,
            qualification: ProviderQualification::default(),
            package_digest: digest.to_owned(),
        },
    ))
}

fn generation_secret(variable: &str, file_variable: &str) -> Result<String, &'static str> {
    let secret = match (
        std::env::var(variable).ok(),
        std::env::var(file_variable).ok(),
    ) {
        (Some(secret), None) => secret,
        (None, Some(path)) => std::fs::read_to_string(path)
            .map_err(|_| "document generation secret file unavailable")?,
        _ => {
            return Err("configure exactly one source for each document generation service secret");
        }
    };
    let secret = secret.trim_end_matches(['\r', '\n']).to_owned();
    if secret.is_empty() || secret.bytes().any(|byte| byte.is_ascii_whitespace()) {
        return Err("document generation service secret is invalid");
    }
    Ok(secret)
}

fn database_target(url: &str) -> Result<(String, u16, String), &'static str> {
    let options = PgConnectOptions::from_str(url).map_err(|_| "database URL is invalid")?;
    let database = options
        .get_database()
        .ok_or("database URL must name a database")?;
    Ok((
        options.get_host().to_ascii_lowercase(),
        options.get_port(),
        database.to_owned(),
    ))
}

fn require_mounted_clinical_configuration(
    session_database_url: Option<String>,
    gate_database_url: Option<String>,
    authority_database_url: Option<String>,
    kratos_public_url: Option<String>,
    kratos_admin_url: Option<String>,
) -> Result<(String, String, String, String, String), &'static str> {
    match (
        session_database_url,
        gate_database_url,
        authority_database_url,
        kratos_public_url,
        kratos_admin_url,
    ) {
        (Some(session), Some(gate), Some(authority), Some(public), Some(admin)) => {
            Ok((session, gate, authority, public, admin))
        }
        _ => Err(
            "mounted API requires ASO_DATABASE_URL, ASO_GATE_DATABASE_URL, ASO_SESSION_AUTHORITY_DATABASE_URL, ASO_KRATOS_PUBLIC_URL and ASO_KRATOS_ADMIN_URL",
        ),
    }
}

fn require_same_database(session_url: &str, gate_url: &str) -> Result<(), &'static str> {
    if database_target(session_url)? != database_target(gate_url)? {
        return Err("session and gate database URLs must name the same host, port and database");
    }
    Ok(())
}

#[derive(Clone, Copy)]
struct DocumentProcessorIdentity {
    identity_id: Uuid,
    actor_id: Uuid,
    practice_id: Uuid,
}

fn configured_document_processor() -> Result<Option<DocumentProcessorIdentity>, &'static str> {
    let values = (
        std::env::var("ASO_DOCUMENT_PROCESSOR_IDENTITY_ID").ok(),
        std::env::var("ASO_DOCUMENT_PROCESSOR_ACTOR_ID").ok(),
        std::env::var("ASO_DOCUMENT_PROCESSOR_PRACTICE_ID").ok(),
    );
    match values {
        (None, None, None) => Ok(None),
        (Some(identity), Some(actor), Some(practice)) => Ok(Some(DocumentProcessorIdentity {
            identity_id: identity
                .parse()
                .map_err(|_| "document processor identity ID is invalid")?,
            actor_id: actor
                .parse()
                .map_err(|_| "document processor actor ID is invalid")?,
            practice_id: practice
                .parse()
                .map_err(|_| "document processor practice ID is invalid")?,
        })),
        _ => {
            Err("document processor identity, actor, and practice IDs must be configured together")
        }
    }
}

async fn run_document_processor(
    identity: DocumentProcessorIdentity,
    repository: Arc<adapters::gate::PgGateRepository>,
    services: Arc<AppServices>,
) {
    loop {
        let context = ClinicalContext {
            identity_id: identity.identity_id,
            actor: ActorId(identity.actor_id),
            practice: PracticeId(identity.practice_id),
            principal: Principal::Service,
            expires_at: Utc::now() + ChronoDuration::minutes(5),
        };
        match repository.next_queued_document_job(&context).await {
            Ok(Some((case_id, document_id, document_set_revision))) => {
                let command = ProcessCaseDocumentCommand {
                    command_id: Uuid::new_v4(),
                    case_id,
                    document_id,
                    expected_document_set_revision: document_set_revision,
                };
                let grants = [AUTHORIZED_DOCUMENT_JOB_GRANT.to_owned()];
                match services
                    .process_case_document(&context, &grants, &command)
                    .await
                {
                    Ok(result) => tracing::info!(
                        case_id = %case_id,
                        document_id = %document_id,
                        status = ?result.status,
                        "case document processing completed"
                    ),
                    Err(error) => tracing::warn!(
                        case_id = %case_id,
                        document_id = %document_id,
                        error = ?error,
                        "case document processing failed"
                    ),
                }
            }
            Ok(None) => sleep(Duration::from_millis(500)).await,
            Err(error) => {
                tracing::warn!(error = ?error, "document processor queue unavailable");
                sleep(Duration::from_secs(2)).await;
            }
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,aso_web_server=debug".into()),
        )
        .init();

    if std::env::args().nth(1).as_deref() == Some("--migrate-server") {
        return migrations::run().await;
    }

    let (
        session_database_url,
        gate_database_url,
        authority_database_url,
        kratos_public_url,
        kratos_admin_url,
    ) = require_mounted_clinical_configuration(
        std::env::var("ASO_DATABASE_URL").ok(),
        std::env::var("ASO_GATE_DATABASE_URL").ok(),
        std::env::var("ASO_SESSION_AUTHORITY_DATABASE_URL").ok(),
        std::env::var("ASO_KRATOS_PUBLIC_URL").ok(),
        std::env::var("ASO_KRATOS_ADMIN_URL").ok(),
    )?;
    require_same_database(&session_database_url, &gate_database_url)?;
    require_same_database(&session_database_url, &authority_database_url)?;
    let kratos_proxy = adapters::kratos_proxy::router(&kratos_public_url)?;
    let session_runtime = adapters::session::configured_sessions(
        Some(session_database_url),
        Some(authority_database_url),
        Some(kratos_public_url),
        Some(kratos_admin_url),
        std::env::var("ASO_ALLOW_INSECURE_KRATOS").as_deref() == Ok("true"),
    )
    .await?;
    // Optional external read-only tool servers are negotiated at startup and
    // retained for the process lifetime. A missing registry keeps all model
    // retrieval on the authoritative local snapshot.
    let _generation_mcp = adapters::generation_mcp::ConfiguredMcpClients::load_optional(
        std::env::var("ASO_GENERATION_MCP_SERVERS").ok(),
    )
    .await?;

    // Clinical writes use separate restricted credentials; they never borrow
    // migration credentials or silently widen the session-reader role. The
    // mounted router never falls back to process-local clinical state.
    let document_store_root = std::env::var("ASO_DOCUMENT_STORE_ROOT").ok();
    let document_store = configured_document_store(document_store_root.clone())?;
    if let Some(root) = document_store_root {
        tracing::info!(%root, "document source store enabled");
    } else {
        tracing::info!("document source store unavailable; source reads fail closed");
    }
    let repository = Arc::new(configured_generation(
        adapters::gate::PgGateRepository::connect_with_document_store(
            &gate_database_url,
            document_store,
        )
        .await?,
    )?);
    let processor_repository = repository.clone();
    let services = AppServices {
        cases: repository.clone(),
        evidence: repository.clone(),
        criteria: repository.clone(),
        letters: repository.clone(),
        authority: repository,
        clock: Arc::new(ports::SystemClock),
        sessions: session_runtime.sessions,
    };

    let services = Arc::new(services);
    let state = ServerState {
        services: services.clone(),
    };
    let mut app = api_router(state)
        .merge(kratos_proxy)
        .layer(TraceLayer::new_for_http());

    if let Ok(root) = std::env::var("ASO_WEB_ROOT") {
        let path = std::path::PathBuf::from(&root);
        if !path.is_dir() {
            return Err(format!("ASO_WEB_ROOT is not a directory: {root}").into());
        }
        tracing::info!(%root, "serving web assets from disk");
        app = app.fallback_service(ServeDir::new(path).append_index_html_on_directories(true));
    } else {
        tracing::info!("no ASO_WEB_ROOT set — API only");
    }

    let port: u16 = std::env::var("ASO_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8787);
    let bind_address = std::env::var("ASO_BIND_ADDRESS")
        .unwrap_or_else(|_| "127.0.0.1".to_owned())
        .parse()?;
    let addr = SocketAddr::new(bind_address, port);
    tracing::info!(%addr, "listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    let recovery_task = session_runtime
        .logout_recovery
        .map(|coordinator| tokio::spawn(adapters::session::run_logout_recovery(coordinator)));
    let document_processor_task = configured_document_processor()?.map(|identity| {
        tracing::info!(practice_id = %identity.practice_id, "document processor enabled");
        tokio::spawn(run_document_processor(
            identity,
            processor_repository,
            services,
        ))
    });
    let result = axum::serve(listener, app).await;
    if let Some(task) = recovery_task {
        task.abort();
    }
    if let Some(task) = document_processor_task {
        task.abort();
    }
    result?;
    Ok(())
}

#[cfg(test)]
mod deployment_tests {
    use super::*;

    #[test]
    fn separate_restricted_credentials_must_name_one_database() {
        assert_eq!(
            require_same_database(
                "postgres://session:synthetic@db:5432/aso",
                "postgres://gate:synthetic@db/aso",
            ),
            Ok(()),
        );
        for gate in [
            "postgres://gate:synthetic@other:5432/aso",
            "postgres://gate:synthetic@db:5433/aso",
            "postgres://gate:synthetic@db:5432/foreign",
        ] {
            assert!(
                require_same_database("postgres://session:synthetic@db:5432/aso", gate).is_err()
            );
        }
        assert!(require_same_database("not-a-url", "postgres://gate:synthetic@db/aso").is_err());
    }

    #[test]
    fn mounted_api_requires_every_authoritative_dependency() {
        let session = "postgres://session:synthetic@db:5432/aso".to_owned();
        let gate = "postgres://gate:synthetic@db:5432/aso".to_owned();
        let authority = "postgres://authority:synthetic@db:5432/aso".to_owned();
        let kratos_public = "https://identity.example.test".to_owned();
        let kratos_admin = "https://identity-admin.example.test".to_owned();
        assert_eq!(
            require_mounted_clinical_configuration(
                Some(session.clone()),
                Some(gate.clone()),
                Some(authority.clone()),
                Some(kratos_public.clone()),
                Some(kratos_admin.clone()),
            ),
            Ok((
                session.clone(),
                gate.clone(),
                authority.clone(),
                kratos_public.clone(),
                kratos_admin.clone(),
            )),
        );
        for configuration in [
            (
                None,
                Some(gate.clone()),
                Some(authority.clone()),
                Some(kratos_public.clone()),
                Some(kratos_admin.clone()),
            ),
            (
                Some(session.clone()),
                None,
                Some(authority.clone()),
                Some(kratos_public.clone()),
                Some(kratos_admin.clone()),
            ),
            (
                Some(session.clone()),
                Some(gate.clone()),
                None,
                Some(kratos_public.clone()),
                Some(kratos_admin.clone()),
            ),
            (
                Some(session.clone()),
                Some(gate.clone()),
                Some(authority.clone()),
                None,
                Some(kratos_admin.clone()),
            ),
            (
                Some(session.clone()),
                Some(gate.clone()),
                Some(authority.clone()),
                Some(kratos_public.clone()),
                None,
            ),
            (None, None, None, None, None),
        ] {
            assert!(
                require_mounted_clinical_configuration(
                    configuration.0,
                    configuration.1,
                    configuration.2,
                    configuration.3,
                    configuration.4,
                )
                .is_err()
            );
        }
    }

    #[test]
    fn configured_document_store_refuses_an_invalid_root() {
        assert!(
            configured_document_store(Some(
                "/a/synthetic/document/store/that/does/not/exist".into()
            ))
            .is_err()
        );
        assert!(configured_document_store(None).is_ok());
    }
}
