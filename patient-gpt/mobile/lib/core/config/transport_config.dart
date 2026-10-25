// TJ-ARCH-MOB-001 compliant
import 'package:patient_gpt/core/config/api_config.dart';

/// How the app reaches the shared Rust core. Set at build time:
/// `--dart-define=PATIENTGPT_TRANSPORT=ffi|http`. Default `ffi`.
enum PatientGptTransport {
  /// In-process `crates/patient-gpt-ffi` through flutter_rust_bridge.
  ffi,

  /// The Axum service at [patientGptApi].
  http;

  /// Unknown values are rejected, never mapped to a plausible transport: a
  /// silent fallback to HTTP would send requests to whatever listens there.
  static PatientGptTransport parse(String raw) => switch (raw) {
    'ffi' => ffi,
    'http' => http,
    _ => throw StateError(
      'PATIENTGPT_TRANSPORT must be "ffi" or "http", got "$raw"',
    ),
  };

  /// Where requests go, as shown in error states.
  String get endpoint => switch (this) {
    ffi => 'ffi:patient-gpt-ffi',
    http => patientGptApi,
  };
}

const String _rawTransport = String.fromEnvironment(
  'PATIENTGPT_TRANSPORT',
  defaultValue: 'ffi',
);

/// Parsed on first read. `main()` reads it before `runApp`, so an unknown
/// value stops the app at startup.
final PatientGptTransport patientGptTransport = PatientGptTransport.parse(
  _rawTransport,
);
