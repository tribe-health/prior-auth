# Goals

- Inference works on desktop (Tauri) and mobile (iOS, Android) through a local chat model and a local embedder even when UAR is not configured; local inference is the floor, not a fallback afterthought
- Install the local chat model and local embedder using the KnowMe pattern (/Users/gqadonis/Projects/know-me/know-me-system) as inspiration: device-appropriate engine, acquisition, integrity check, and runtime selection
- Decide the desktop topology through the KBD cycle: UAR embedded as a library, UAR as a sidecar, or a PatientGPT Axum host crate as the sidecar that embeds UAR as a library and routes AG-UI calls to UAR or to desktop-only handlers (settings and other non-agent functions)
- iOS always embeds UAR; cloud connects to a running UAR service by URL, with the Rust Axum + React 19 host doing the same routing job as the desktop host crate (same code, platform-specific operation)
- The local model drives the AI onboarding that sets up the decentralized deployment; it is not used for agentic clinical work
- Evidence: local integration runs on desktop and on iOS simulator and Android emulator showing a streamed local-model reply and an embedding, with UAR absent; UAR path shown separately once configured
