// TJ-ARCH-MOB-001 compliant
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:patient_gpt/app/patient_gpt_app.dart';
import 'package:patient_gpt/core/config/transport_config.dart';
import 'package:patient_gpt/features/workspace/data/ffi_patient_gpt_gateway.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Throws on an unknown PATIENTGPT_TRANSPORT before anything renders.
  final transport = patientGptTransport;
  if (transport == PatientGptTransport.ffi) {
    await FfiPatientGptGateway.initialize();
  }
  if (kDebugMode) {
    debugPrint(
      'PatientGPT transport: ${transport.name} (${transport.endpoint})',
    );
  }
  runApp(const ProviderScope(child: PatientGptApp()));
}
