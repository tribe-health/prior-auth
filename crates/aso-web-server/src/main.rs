//! Thin web binary: configuration, assets, deployment adapters. All behaviour
//! lives in `aso-host`; this file only chooses how to expose it.
//!
//! Asset serving has two modes and the env prefix is derived from the app
//! name, never hardcoded to a product string:
//!   ASO_WEB_ROOT   serve from this directory at runtime (external mode)
//!   unset          fall back to the embedded bundle
//! An invalid directory is rejected at readiness rather than 404-ing per file.

use std::{net::SocketAddr, str::FromStr, sync::Arc};

use aso_host::{AppServices, ports};
use aso_server_axum::{ServerState, api_router};
use sqlx::postgres::PgConnectOptions;
use tower_http::{services::ServeDir, trace::TraceLayer};

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
    let repository = Arc::new(
        adapters::gate::PgGateRepository::connect_with_document_store(
            &gate_database_url,
            document_store,
        )
        .await?,
    );
    let services = AppServices {
        cases: repository.clone(),
        evidence: repository.clone(),
        criteria: repository.clone(),
        letters: repository.clone(),
        authority: repository,
        clock: Arc::new(ports::SystemClock),
        sessions: session_runtime.sessions,
    };

    let state = ServerState {
        services: Arc::new(services),
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
    let result = axum::serve(listener, app).await;
    if let Some(task) = recovery_task {
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
