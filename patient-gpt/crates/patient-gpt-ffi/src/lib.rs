// TJ-ARCH-MOB-001 compliant
//! flutter_rust_bridge surface for the PatientGPT mobile shell.
//!
//! `api` is the only module the codegen reads. `host_state` owns the one Tokio
//! runtime and the one `AppServices`; `convert` maps domain DTOs to the owned
//! FFI types. Every function here mirrors an Axum route in
//! `docs/plan/scaffold-contracts.md` and calls the same `AppServices` method.

pub mod api;
mod convert;
mod frb_generated;
mod host_state;
