//! A2UI surface descriptors.
//!
//! A plugin does not ship widgets and does not import a UI framework. It
//! provides a declarative surface descriptor — a registered component name
//! plus props — and the shell materialises it natively on whichever client
//! the person happens to be using. This agent may emit only the surfaces
//! listed in [`ALLOWED_SURFACES`]. The privileged blocks (affirmation, signing)
//! are refused here by name, so a descriptor that looks like the affirmation
//! dialog cannot originate from a composer.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Surfaces this agent is allowed to describe.
pub const ALLOWED_SURFACES: &[&str] = &[
    "DraftPreviewBlock",
    "QaFindingsBlock",
    "ClaimsManifestBlock",
    "HaltMemoBlock",
];

/// Surfaces no composer may ever describe. Kept as a list, not derived, so a
/// reviewer can read the refusal without reading the allowlist.
pub const PRIVILEGED_SURFACES: &[&str] = &["AffirmationBlock", "SigningBlock", "SubmissionBlock"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SurfaceDescriptor {
    /// Registered component name.
    pub surface: String,
    /// Versioned props schema identifier, e.g. `aso.draft_preview.v1`.
    pub schema: String,
    /// Slot the shell should place the surface in.
    pub slot: String,
    pub props: Value,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SurfaceRefused {
    #[error("surface `{0}` is privileged and cannot be described by a composer agent")]
    Privileged(String),
    #[error("surface `{0}` is not a registered component")]
    Unregistered(String),
}

/// Build a descriptor, refusing anything outside the allowlist.
pub fn describe(
    surface: &str,
    schema: &str,
    slot: &str,
    props: Value,
) -> Result<SurfaceDescriptor, SurfaceRefused> {
    if PRIVILEGED_SURFACES.contains(&surface) {
        return Err(SurfaceRefused::Privileged(surface.to_string()));
    }
    if !ALLOWED_SURFACES.contains(&surface) {
        return Err(SurfaceRefused::Unregistered(surface.to_string()));
    }
    Ok(SurfaceDescriptor {
        surface: surface.to_string(),
        schema: schema.to_string(),
        slot: slot.to_string(),
        props,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowed_surfaces_describe_and_privileged_ones_are_refused_by_name() {
        assert!(
            describe(
                "DraftPreviewBlock",
                "aso.draft_preview.v1",
                "main",
                Value::Null
            )
            .is_ok()
        );
        assert_eq!(
            describe(
                "AffirmationBlock",
                "aso.affirmation.v1",
                "main",
                Value::Null
            )
            .unwrap_err(),
            SurfaceRefused::Privileged("AffirmationBlock".into())
        );
        assert_eq!(
            describe("AnythingElse", "x", "main", Value::Null).unwrap_err(),
            SurfaceRefused::Unregistered("AnythingElse".into())
        );
    }
}
