// TJ-ARCH-MOB-001 compliant
//! Declares the app commands so each one is permission-gated: a command the
//! capability file does not grant cannot be invoked from the webview.

const COMMANDS: &[&str] = &[
    "health",
    "session",
    "list_patients",
    "list_cases",
    "list_conversations",
    "start_run",
];

fn main() {
    println!("cargo:rerun-if-changed=overlay");
    println!("cargo:rerun-if-changed=../../docs/design/brand/favicon.svg");
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("tauri-build failed");
}
