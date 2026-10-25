// TJ-ARCH-MOB-001 compliant
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the PatientGPT Axum API. Defaults to `/api`. */
  readonly VITE_PATIENTGPT_API?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
