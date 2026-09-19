//! Outbound adapters. Production routes use verified external authority;
//! memory adapters exist only as focused test fixtures.
pub mod document_generation;
pub mod document_processor;
pub mod document_store;
pub mod gate;
pub mod generation_mcp;
pub mod kratos_proxy;
#[cfg(test)]
pub mod memory;
pub mod session;
#[cfg(test)]
pub mod unavailable;
