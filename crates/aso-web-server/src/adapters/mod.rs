//! Outbound adapters. Production routes use verified external authority;
//! memory adapters exist only as focused test fixtures.
pub mod gate;
#[cfg(test)]
pub mod memory;
pub mod session;
pub mod unavailable;
