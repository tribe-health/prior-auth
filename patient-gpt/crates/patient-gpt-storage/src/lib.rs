// TJ-ARCH-MOB-001 compliant
//! `ConversationStore` adapters.
//!
//! Intent-level API only: callers see `list`, `get` and `put`. No query
//! language leaves this crate. Clinical records are never stored here.

mod memory;
#[cfg(feature = "surreal")]
mod surreal;

pub use memory::InMemoryConversationStore;
#[cfg(feature = "surreal")]
pub use surreal::SurrealConversationStore;
