// TJ-ARCH-MOB-001 compliant
//! PatientGPT desktop binary. All wiring lives in the library.

// Release builds on Windows must not open a console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() -> std::process::ExitCode {
    patient_gpt_desktop::run()
}
