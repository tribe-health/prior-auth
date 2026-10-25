// TJ-ARCH-MOB-001 compliant
//! The main window and its branded title bar.
//!
//! The title bar is a shell overlay (`overlay/`), injected as an
//! initialization script so `web/` stays the one shared React application.
//! macOS keeps its native traffic lights over the bar (`TitleBarStyle::Overlay`);
//! Windows and Linux drop native decorations and the overlay draws minimize,
//! maximize/restore and close.

use tauri::{App, AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const MAIN_LABEL: &str = "main";

const TITLE: &str = "PatientGPT";
const SCRIPT: &str = include_str!("../overlay/titlebar.js");
const STYLE: &str = include_str!("../overlay/titlebar.css");
/// The favicon cut: the brand board's form for the window title bar.
const FAVICON: &str = include_str!("../../../docs/design/brand/favicon.svg");

#[cfg(target_os = "macos")]
const PLATFORM: &str = "macos";
#[cfg(target_os = "windows")]
const PLATFORM: &str = "windows";
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
const PLATFORM: &str = "linux";

pub fn build_main(app: &App) -> tauri::Result<()> {
    let builder = WebviewWindowBuilder::new(app, MAIN_LABEL, WebviewUrl::default())
        .title(TITLE)
        .inner_size(1280.0, 820.0)
        .min_inner_size(720.0, 520.0)
        .initialization_script(titlebar_script());
    platform_chrome(builder).build()?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn platform_chrome<'a>(
    builder: WebviewWindowBuilder<'a, tauri::Wry, App>,
) -> WebviewWindowBuilder<'a, tauri::Wry, App> {
    builder
        .decorations(true)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        // Centres the native lights on the 40px overlay bar.
        .traffic_light_position(tauri::LogicalPosition::new(14.0, 20.0))
}

#[cfg(not(target_os = "macos"))]
fn platform_chrome<'a>(
    builder: WebviewWindowBuilder<'a, tauri::Wry, App>,
) -> WebviewWindowBuilder<'a, tauri::Wry, App> {
    builder.decorations(false)
}

pub fn focus_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_LABEL) else {
        return;
    };
    if let Err(err) = window.unminimize().and_then(|()| window.set_focus()) {
        tracing::warn!("cannot focus the running window: {err}");
    }
}

fn titlebar_script() -> String {
    let shell = serde_json::json!({ "platform": PLATFORM, "style": STYLE, "favicon": FAVICON });
    format!("{SCRIPT}({shell});\n")
}
