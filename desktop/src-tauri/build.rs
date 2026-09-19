const COMMANDS: &[&str] = &[
    "current_session",
    "logout",
    "gate_state",
    "affirm_gate",
    "remove_gate",
    "lookup_gate_command",
    "signing_target",
    "sign_letter",
    "lookup_sign_letter_command",
    "reassess_evidence",
    "lookup_reassessment_command",
    "save_annotation",
    "lookup_annotation_command",
    "document_source",
    "claim_replica_owner",
    "publish_replica_projection",
    "release_replica_owner",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to build the constrained Tauri command manifest");
}
