//! Outbound adapters. `memory` lets a clean checkout run and be tested without
//! a database; a `postgres` module implementing the same ports lands beside it.
pub mod memory;
