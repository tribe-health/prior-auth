// TJ-ARCH-MOB-001 compliant
//! Shell configuration. The UAR mode is explicit: an unset or unknown value
//! fails startup, the same contract as `patient-gpt-server`.

use patient_gpt_uar::UarMode;

pub const UAR_MODE_ENV: &str = "PATIENTGPT_UAR_MODE";

pub fn uar_mode() -> Result<UarMode, String> {
    let raw = std::env::var(UAR_MODE_ENV).map_err(|_| {
        format!("{UAR_MODE_ENV} is not set; expected `deterministic` or `service:<url>`")
    })?;
    raw.parse().map_err(|err| format!("{UAR_MODE_ENV}: {err}"))
}
