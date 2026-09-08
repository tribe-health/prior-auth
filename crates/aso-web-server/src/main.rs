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
    kratos_url: Option<String>,
) -> Result<(String, String, String), &'static str> {
    match (session_database_url, gate_database_url, kratos_url) {
        (Some(session), Some(gate), Some(kratos)) => Ok((session, gate, kratos)),
        _ => Err(
            "mounted API requires ASO_DATABASE_URL, ASO_GATE_DATABASE_URL and ASO_KRATOS_PUBLIC_URL",
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

    let (session_database_url, gate_database_url, kratos_url) =
        require_mounted_clinical_configuration(
            std::env::var("ASO_DATABASE_URL").ok(),
            std::env::var("ASO_GATE_DATABASE_URL").ok(),
            std::env::var("ASO_KRATOS_PUBLIC_URL").ok(),
        )?;
    require_same_database(&session_database_url, &gate_database_url)?;
    let sessions = adapters::session::configured_sessions(
        Some(session_database_url),
        Some(kratos_url),
        std::env::var("ASO_ALLOW_INSECURE_KRATOS").as_deref() == Ok("true"),
    )
    .await?;

    // Clinical writes use separate restricted credentials; they never borrow
    // migration credentials or silently widen the session-reader role. The
    // mounted router never falls back to process-local clinical state.
    let repository = Arc::new(
        adapters::gate::PgGateRepository::connect(&gate_database_url).await?,
    );
    let services = AppServices {
        cases: repository.clone(),
        evidence: repository.clone(),
        criteria: Arc::new(adapters::unavailable::UnavailableCriteriaRepository),
        letters: repository.clone(),
        authority: repository,
        clock: Arc::new(ports::SystemClock),
        sessions,
    };

    let state = ServerState {
        services: Arc::new(services),
    };
    let mut app = api_router(state).layer(TraceLayer::new_for_http());

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
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    tracing::info!(%addr, "listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
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
        let kratos = "https://identity.example.test".to_owned();
        assert_eq!(
            require_mounted_clinical_configuration(
                Some(session.clone()),
                Some(gate.clone()),
                Some(kratos.clone()),
            ),
            Ok((session.clone(), gate.clone(), kratos.clone())),
        );
        for configuration in [
            (None, Some(gate.clone()), Some(kratos.clone())),
            (Some(session.clone()), None, Some(kratos.clone())),
            (Some(session.clone()), Some(gate.clone()), None),
            (None, None, None),
        ] {
            assert!(
                require_mounted_clinical_configuration(
                    configuration.0,
                    configuration.1,
                    configuration.2,
                )
                .is_err()
            );
        }
    }
}
