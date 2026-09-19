//! Template packages: versioned templates as data, identified by digest.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// A named set of templates. The digest covers every file's name and source,
/// so any change to any file — used by the root or not — is a new package.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TemplatePackage {
    pub name: String,
    /// Template name (path inside the package) to source.
    pub files: BTreeMap<String, String>,
}

impl TemplatePackage {
    pub fn new(name: impl Into<String>, files: BTreeMap<String, String>) -> Self {
        Self {
            name: name.into(),
            files,
        }
    }

    /// `sha256:<hex>` over the package contents.
    pub fn digest(&self) -> String {
        package_digest(&self.files)
    }

    pub fn contains(&self, template: &str) -> bool {
        self.files.contains_key(template)
    }
}

/// Deterministic digest over a template map: name, NUL, source, NUL, in
/// `BTreeMap` (sorted) order.
pub fn package_digest(files: &BTreeMap<String, String>) -> String {
    let mut h = Sha256::new();
    for (name, src) in files {
        h.update(name.as_bytes());
        h.update([0u8]);
        h.update(src.as_bytes());
        h.update([0u8]);
    }
    format!("sha256:{}", hex(&h.finalize()))
}

pub(crate) fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn digest_is_order_independent_and_content_sensitive() {
        let mut a = BTreeMap::new();
        a.insert("b.j2".to_string(), "two".to_string());
        a.insert("a.j2".to_string(), "one".to_string());
        let mut b = BTreeMap::new();
        b.insert("a.j2".to_string(), "one".to_string());
        b.insert("b.j2".to_string(), "two".to_string());
        assert_eq!(package_digest(&a), package_digest(&b));
        b.insert("c.j2".to_string(), "unused".to_string());
        assert_ne!(
            package_digest(&a),
            package_digest(&b),
            "an unused file still changes the package"
        );
        assert!(package_digest(&a).starts_with("sha256:"));
    }
}
