// TJ-ARCH-MOB-001 compliant
import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'package:patient_gpt/core/config/api_config.dart';
import 'package:patient_gpt/core/config/transport_config.dart';
import 'package:patient_gpt/features/workspace/data/ffi_patient_gpt_gateway.dart';
import 'package:patient_gpt/features/workspace/data/http_patient_gpt_gateway.dart';
import 'package:patient_gpt/features/workspace/domain/patient_directory.dart';
import 'package:patient_gpt/features/workspace/domain/patient_gpt_gateway.dart';
import 'package:patient_gpt/features/workspace/domain/workspace_entities.dart';

part 'workspace_providers.g.dart';

/// Gateway failures are terminal results, not transient faults: Riverpod's
/// automatic retry would silently re-run the operation (and, once this is the
/// FFI gateway, re-enter Rust). Every gateway-backed provider opts out.
Duration? noRetry(int retryCount, Object error) => null;

/// The one transport binding, chosen by `PATIENTGPT_TRANSPORT`. The FFI
/// gateway needs `FfiPatientGptGateway.initialize()` to have run in `main`.
@Riverpod(keepAlive: true)
PatientGptGateway patientGptGateway(Ref ref) => switch (patientGptTransport) {
  PatientGptTransport.ffi => const FfiPatientGptGateway(),
  PatientGptTransport.http => HttpPatientGptGateway(
    baseUri: Uri.parse(patientGptApi),
  ),
};

@Riverpod(retry: noRetry)
Future<Session> session(Ref ref) =>
    ref.watch(patientGptGatewayProvider).session();

@Riverpod(retry: noRetry)
Future<PatientDirectory> patientDirectory(Ref ref) async {
  final gateway = ref.watch(patientGptGatewayProvider);
  final patients = await gateway.listPatients();
  final caseLists = await Future.wait(
    patients.map((p) => gateway.listCases(p.id)),
  );
  return PatientDirectory.build(patients, [for (final l in caseLists) ...l]);
}

@Riverpod(retry: noRetry)
Future<List<ConversationSummary>> conversations(
  Ref ref,
  ConversationScope scope,
) => ref.watch(patientGptGatewayProvider).listConversations(scope);
