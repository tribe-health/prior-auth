// TJ-ARCH-MOB-001 compliant
//! Shell-independent application core for PatientGPT.
//!
//! Axum, Tauri commands and the Flutter FFI all call the same [`AppServices`].
//! This crate defines the ports; adapters live in `patient-gpt-storage`,
//! `patient-gpt-uar`, and (for the scaffold) the synthetic [`fixture`].

pub mod clock;
pub mod error;
pub mod fixture;
pub mod ports;
pub mod services;

pub use error::HostError;
pub use ports::{AguiStream, ClinicalReadPort, ConversationStore, UarRuntimeFacade};
pub use services::AppServices;
