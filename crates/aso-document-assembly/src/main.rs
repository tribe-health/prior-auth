//! Binary entry point. Configuration is environment only:
//!
//! - `ASO_DA_BIND`          socket to listen on, default `127.0.0.1:8091`
//! - `ASO_DA_PACKAGES_DIR`  template packages root, default: the crate's `templates/`
//! - `ASO_DA_PACKAGE_MANIFEST` frozen package/kind manifest, required
//! - `ASO_TASK_HOST_URL` trusted task host, required
//! - `ASO_ASSEMBLY_TOKEN` or `ASO_ASSEMBLY_TOKEN_FILE` internal credential, exactly one
//! - `ASO_AGENT_PUBLIC_URL` advertised A2A URL base and MCP host
//! - `ASO_WEB_PUBLIC_URL` browser origin used for MCP App source review
//! - `ASO_AGENT_ALLOWED_ORIGINS` comma-separated exact browser origins
//! - `ASO_MCP_APP_HTML` optional bundled MCP App renderer
//! - `RUST_LOG` tracing filter, default `info`
//!
//! The service binds to loopback by default. It is reached through Flint Gate
//! (Cedar PDP/PEP, deny-is-final) or from the host process on the same
//! machine; it is never exposed to a browser directly.

use std::net::SocketAddr;
use std::sync::Arc;

use aso_document_assembly::packages::{Catalog, seed_root};
use aso_document_assembly::{AgentState, router};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let packages_dir = std::env::var("ASO_DA_PACKAGES_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| seed_root());
    let catalog = Catalog::load(&packages_dir)?;
    let manifest_path = std::env::var("ASO_DA_PACKAGE_MANIFEST")
        .map_err(|_| "ASO_DA_PACKAGE_MANIFEST is required")?;
    validate_package_manifest(&catalog, &std::fs::read_to_string(manifest_path)?)?;
    tracing::info!(packages = catalog.packages.len(), kinds = catalog.kinds.len(), root = %packages_dir.display(), "template catalog loaded");
    for p in catalog.packages.values() {
        tracing::info!(package = %p.name, digest = %p.digest(), files = p.files.len(), "package");
    }

    let bind: SocketAddr = std::env::var("ASO_DA_BIND")
        .unwrap_or_else(|_| "127.0.0.1:8091".into())
        .parse()?;
    let assembly_token = load_assembly_token(
        std::env::var("ASO_ASSEMBLY_TOKEN").ok(),
        std::env::var("ASO_ASSEMBLY_TOKEN_FILE").ok(),
    )?;
    let task_host_url =
        std::env::var("ASO_TASK_HOST_URL").map_err(|_| "ASO_TASK_HOST_URL is required")?;
    let public_url =
        std::env::var("ASO_AGENT_PUBLIC_URL").unwrap_or_else(|_| format!("http://{bind}"));
    let web_public_url = std::env::var("ASO_WEB_PUBLIC_URL")
        .ok()
        .map(|value| validate_web_public_url(&value))
        .transpose()?
        .map(Arc::from);
    let allowed_origins = std::env::var("ASO_AGENT_ALLOWED_ORIGINS")
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .collect();
    let mcp_app_html = std::env::var("ASO_MCP_APP_HTML")
        .ok()
        .map(std::fs::read_to_string)
        .transpose()?
        .map(Arc::from);
    let app = router(AgentState {
        catalog: Arc::new(catalog),
        task_host: aso_document_assembly::task_host::TaskHost::new(&task_host_url)?,
        assembly_token: Arc::from(assembly_token),
        public_url: Arc::from(public_url),
        web_public_url,
        allowed_origins: Arc::new(allowed_origins),
        mcp_app_html,
    });
    let listener = tokio::net::TcpListener::bind(bind).await?;
    tracing::info!(%bind, "document-assembly agent listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown())
        .await?;
    Ok(())
}

fn validate_web_public_url(value: &str) -> Result<String, &'static str> {
    let mut url = reqwest::Url::parse(value).map_err(|_| "invalid ASO_WEB_PUBLIC_URL")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !matches!(url.path(), "" | "/")
    {
        return Err("invalid ASO_WEB_PUBLIC_URL");
    }
    url.set_path("");
    Ok(url.as_str().trim_end_matches('/').to_owned())
}

async fn shutdown() {
    let _ = tokio::signal::ctrl_c().await;
    tracing::info!("shutdown requested");
}

fn load_assembly_token(
    value: Option<String>,
    file: Option<String>,
) -> Result<String, &'static str> {
    let raw = match (value, file) {
        (Some(value), None) => value,
        (None, Some(path)) => {
            std::fs::read_to_string(path).map_err(|_| "assembly token file unavailable")?
        }
        _ => return Err("configure exactly one assembly token source"),
    };
    let token = raw.trim_end_matches(['\r', '\n']);
    if token.is_empty() || token.bytes().any(|byte| byte.is_ascii_whitespace()) {
        return Err("invalid assembly token configuration");
    }
    Ok(token.to_owned())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FrozenManifest {
    schema_version: u32,
    package: String,
    template_digest: String,
    kinds: Vec<FrozenKind>,
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FrozenKind {
    key: String,
    version: u32,
    class: String,
    root: String,
    template_package: String,
    template_digest: String,
}
fn validate_package_manifest(catalog: &Catalog, raw: &str) -> Result<(), &'static str> {
    let manifest: FrozenManifest =
        serde_json::from_str(raw).map_err(|_| "invalid frozen package manifest")?;
    if manifest.schema_version != 1 || manifest.kinds.is_empty() {
        return Err("unsupported frozen package manifest");
    }
    let package = catalog
        .packages
        .get(&manifest.package)
        .ok_or("frozen package is missing")?;
    if package.digest() != manifest.template_digest {
        return Err("frozen package digest mismatch");
    }
    let actual: Vec<_> = catalog
        .kinds
        .iter()
        .filter(|kind| kind.template_package == manifest.package)
        .collect();
    let keys: std::collections::BTreeSet<_> = manifest
        .kinds
        .iter()
        .map(|kind| (&kind.key, kind.version))
        .collect();
    if actual.len() != manifest.kinds.len() || keys.len() != manifest.kinds.len() {
        return Err("frozen kind set mismatch");
    }
    for frozen in manifest.kinds {
        let matched = actual.iter().any(|kind| {
            kind.key == frozen.key
                && kind.version == frozen.version
                && kind.root == frozen.root
                && kind.template_package == frozen.template_package
                && serde_json::to_value(kind.class).ok()
                    == Some(serde_json::Value::String(frozen.class.clone()))
        });
        if !matched
            || frozen.template_package != manifest.package
            || frozen.template_digest != manifest.template_digest
        {
            return Err("frozen kind mismatch");
        }
    }
    Ok(())
}
#[cfg(test)]
mod startup_tests {
    use super::*;
    #[test]
    fn frozen_package_manifest_accepts_exact_catalog_and_refuses_drift() {
        let catalog = Catalog::load(&seed_root()).unwrap();
        let raw = include_str!(
            "../../../docs/architecture/fixtures/web-case-to-letter/assembly-package-manifest.json"
        );
        assert!(validate_package_manifest(&catalog, raw).is_ok());
        let original: serde_json::Value = serde_json::from_str(raw).unwrap();
        for field in ["root", "key", "class", "templatePackage", "templateDigest"] {
            let mut altered = original.clone();
            altered["kinds"][0][field] = serde_json::json!("changed");
            assert!(
                validate_package_manifest(&catalog, &altered.to_string()).is_err(),
                "{field}"
            );
        }
        let mut altered = original;
        altered["templateDigest"] = serde_json::json!("sha256:changed");
        assert!(validate_package_manifest(&catalog, &altered.to_string()).is_err());
    }
    #[test]
    fn assembly_secret_configuration_refuses_ambiguity_and_whitespace() {
        assert_eq!(
            load_assembly_token(Some("synthetic-token\r\n".into()), None).unwrap(),
            "synthetic-token"
        );
        assert!(load_assembly_token(Some("synthetic".into()), Some("ignored".into())).is_err());
        assert!(load_assembly_token(None, None).is_err());
        assert!(load_assembly_token(Some("bad token".into()), None).is_err());
        assert!(load_assembly_token(Some("\n".into()), None).is_err());
    }
}
