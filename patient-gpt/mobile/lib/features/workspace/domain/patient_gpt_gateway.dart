// TJ-ARCH-MOB-001 compliant
import 'package:patient_gpt/features/workspace/domain/agui_event.dart';
import 'package:patient_gpt/features/workspace/domain/workspace_entities.dart';

/// The six contract operations, named as the Axum routes, Tauri commands and
/// FFI functions name them. The HTTP implementation and the later
/// flutter_rust_bridge implementation both satisfy this interface, so
/// presentation code never knows which transport it is on.
///
/// Read-only by design: no shell writes clinical records, and the agent
/// cannot affirm, sign, submit or record an outcome.
abstract interface class PatientGptGateway {
  Future<Health> health();

  Future<Session> session();

  Future<List<PatientSummary>> listPatients();

  Future<List<CaseSummary>> listCases(String patientId);

  Future<List<ConversationSummary>> listConversations(ConversationScope scope);

  /// AG-UI events for one run. Cancelling the subscription abandons the run.
  Stream<AguiEvent> startRun(RunRequest request);
}

/// The service could not be reached or refused the request.
class GatewayUnavailable implements Exception {
  const GatewayUnavailable({
    required this.endpoint,
    required this.detail,
    this.code,
  });

  final String endpoint;
  final String detail;

  /// The host error code (`HostError::code()` or a transport code such as
  /// `invalid_scope`) when the service named one; null for socket failures.
  final String? code;

  @override
  String toString() => 'GatewayUnavailable($endpoint): $detail';
}

/// The service answered with something outside the frozen contract. Never
/// coerced into a plausible value: an unknown evidence state routes work to
/// the wrong person.
class GatewayContractViolation implements Exception {
  const GatewayContractViolation(this.detail);

  final String detail;

  @override
  String toString() => 'GatewayContractViolation: $detail';
}
