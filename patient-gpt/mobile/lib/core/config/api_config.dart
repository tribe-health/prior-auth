// TJ-ARCH-MOB-001 compliant

/// Base URL of the Axum service. Set at build time:
/// `--dart-define=PATIENTGPT_API=http://10.0.2.2:8787` on the Android
/// emulator, whose loopback is not the host's.
const String patientGptApi = String.fromEnvironment(
  'PATIENTGPT_API',
  defaultValue: 'http://127.0.0.1:8787',
);
