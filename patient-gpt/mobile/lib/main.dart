// TJ-ARCH-MOB-001 compliant
import 'package:entity_graph_flutter/entity_graph_flutter.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:patient_gpt/app/patient_gpt_app.dart';
import 'package:patient_gpt/core/config/transport_config.dart';
import 'package:patient_gpt/features/workspace/data/ffi_patient_gpt_gateway.dart';
import 'package:patient_gpt/features/workspace/presentation/providers/workspace_providers.dart';

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
  runApp(
    ProviderScope(
      overrides: [
        // One graph for the app; its transports read through the gateway
        // that PATIENTGPT_TRANSPORT selected.
        entityGraphProvider.overrideWithValue(EntityGraph()),
        entityTransportRegistryProvider.overrideWith(
          (ref) => ref.watch(patientGptEntityTransportsProvider),
        ),
      ],
      child: const PatientGptApp(),
    ),
  );
}
