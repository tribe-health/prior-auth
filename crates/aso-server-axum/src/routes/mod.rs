//! Feature-based route modules. One module per capability surface; a module
//! owns its DTOs so a change to the case shape cannot silently alter letters.
pub mod cases;
pub mod evidence;
pub mod gate;
pub mod health;
pub mod letters;
