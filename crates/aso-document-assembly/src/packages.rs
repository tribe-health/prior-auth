//! Template packages and kinds, loaded from disk at startup.
//!
//! Layout under the packages root:
//!
//! ```text
//! <root>/<package>/package.json        manifest: name + the kinds it serves
//! <root>/<package>/templates/**/*.j2   template files, keyed by path under templates/
//! ```
//!
//! Loading is the only file I/O in this crate, and it happens once, before
//! the router exists. A request never touches the filesystem.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use clinical_docs::{DocumentKind, KindRegistry, TemplatePackage};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    name: String,
    kinds: Vec<DocumentKind>,
}

#[derive(Debug, Default, Clone)]
pub struct Catalog {
    pub packages: BTreeMap<String, TemplatePackage>,
    pub kinds: KindRegistry,
}

#[derive(Debug, thiserror::Error)]
pub enum LoadError {
    #[error("packages root {0} is not a directory")]
    NotADirectory(PathBuf),
    #[error("io error at {path}: {source}")]
    Io {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("manifest {path} is invalid: {source}")]
    Manifest {
        path: PathBuf,
        source: serde_json::Error,
    },
    #[error("manifest {0} declares name `{1}` but lives in directory `{2}`")]
    NameMismatch(PathBuf, String, String),
    #[error("kind `{0}` in package `{1}` names root `{2}`, which the package does not contain")]
    MissingRoot(String, String, String),
    #[error("kind `{0}` in package `{1}` claims package `{2}`")]
    KindPackageMismatch(String, String, String),
}

impl Catalog {
    pub fn load(root: &Path) -> Result<Self, LoadError> {
        if !root.is_dir() {
            return Err(LoadError::NotADirectory(root.to_path_buf()));
        }
        let mut catalog = Catalog::default();
        let mut dirs: Vec<PathBuf> = std::fs::read_dir(root)
            .map_err(|source| LoadError::Io {
                path: root.to_path_buf(),
                source,
            })?
            .filter_map(Result::ok)
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .collect();
        dirs.sort();
        for dir in dirs {
            let manifest_path = dir.join("package.json");
            if !manifest_path.is_file() {
                continue;
            }
            let raw = std::fs::read_to_string(&manifest_path).map_err(|source| LoadError::Io {
                path: manifest_path.clone(),
                source,
            })?;
            let manifest: Manifest =
                serde_json::from_str(&raw).map_err(|source| LoadError::Manifest {
                    path: manifest_path.clone(),
                    source,
                })?;
            let dir_name = dir
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_string();
            if manifest.name != dir_name {
                return Err(LoadError::NameMismatch(
                    manifest_path,
                    manifest.name,
                    dir_name,
                ));
            }
            let mut files = BTreeMap::new();
            collect_templates(&dir.join("templates"), Path::new(""), &mut files)?;
            let package = TemplatePackage::new(manifest.name.clone(), files);
            for kind in manifest.kinds {
                if kind.template_package != manifest.name {
                    return Err(LoadError::KindPackageMismatch(
                        kind.key,
                        manifest.name,
                        kind.template_package,
                    ));
                }
                if !package.contains(&kind.root) {
                    return Err(LoadError::MissingRoot(kind.key, manifest.name, kind.root));
                }
                catalog.kinds.register(kind);
            }
            catalog.packages.insert(manifest.name, package);
        }
        Ok(catalog)
    }

    pub fn package_for(&self, kind: &DocumentKind) -> Option<&TemplatePackage> {
        self.packages.get(&kind.template_package)
    }
}

fn collect_templates(
    base: &Path,
    rel: &Path,
    out: &mut BTreeMap<String, String>,
) -> Result<(), LoadError> {
    let dir = base.join(rel);
    if !dir.is_dir() {
        return Ok(());
    }
    let mut entries: Vec<PathBuf> = std::fs::read_dir(&dir)
        .map_err(|source| LoadError::Io {
            path: dir.clone(),
            source,
        })?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .collect();
    entries.sort();
    for path in entries {
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();
        let child = rel.join(name);
        if path.is_dir() {
            collect_templates(base, &child, out)?;
        } else if name.ends_with(".j2") {
            let src = std::fs::read_to_string(&path).map_err(|source| LoadError::Io {
                path: path.clone(),
                source,
            })?;
            // Package keys always use `/`, whatever the host separator.
            let key = child
                .components()
                .map(|c| c.as_os_str().to_string_lossy())
                .collect::<Vec<_>>()
                .join("/");
            out.insert(key, src);
        }
    }
    Ok(())
}

/// The seed package shipped with this crate, resolved relative to the crate
/// so tests and the binary's default agree.
pub fn seed_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("templates")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_seed_catalog_loads_with_its_kinds_and_roots_present() {
        let c = Catalog::load(&seed_root()).unwrap();
        let pkg = c.packages.get("aso-prior-auth").expect("seed package");
        assert!(pkg.digest().starts_with("sha256:"));
        for key in ["pa.initial_request", "pa.denial_response", "pa.halt_memo"] {
            let k = c.kinds.get(key).unwrap_or_else(|| panic!("kind {key}"));
            assert!(pkg.contains(&k.root), "{key} root {}", k.root);
        }
    }

    #[test]
    fn a_missing_root_is_a_load_error_not_a_render_error() {
        let tmp = std::env::temp_dir().join(format!("aso-da-{}", uuid::Uuid::new_v4()));
        let pkg = tmp.join("broken");
        std::fs::create_dir_all(pkg.join("templates")).unwrap();
        std::fs::write(
            pkg.join("package.json"),
            r#"{"name":"broken","kinds":[{"key":"x.y","version":1,"class":"internal_work_product","templatePackage":"broken","root":"nope.md.j2","qaChecks":[]}]}"#,
        )
        .unwrap();
        let err = Catalog::load(&tmp).unwrap_err();
        assert!(matches!(err, LoadError::MissingRoot(..)), "{err}");
        std::fs::remove_dir_all(&tmp).unwrap();
    }
}
