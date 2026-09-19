//! Feature-based route modules. One module per capability surface; a module
//! owns its DTOs so a change to the case shape cannot silently alter letters.
pub mod administering_entity;
pub mod annotations;
pub mod cases;
pub mod criteria;
pub mod criteria_selection;
pub mod documents;
pub mod evidence;
pub mod gate;
pub mod health;
pub mod letters;
pub mod sources;
