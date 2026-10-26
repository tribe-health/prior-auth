// TJ-ARCH-MOB-001 compliant
import 'package:entity_graph_flutter/entity_graph_flutter.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'package:patient_gpt/core/config/api_config.dart';
import 'package:patient_gpt/core/config/transport_config.dart';
import 'package:patient_gpt/features/workspace/data/ffi_patient_gpt_gateway.dart';
import 'package:patient_gpt/features/workspace/data/gateway_entity_transports.dart';
import 'package:patient_gpt/features/workspace/data/graph_codec.dart';
import 'package:patient_gpt/features/workspace/data/http_patient_gpt_gateway.dart';
import 'package:patient_gpt/features/workspace/domain/patient_directory.dart';
import 'package:patient_gpt/features/workspace/domain/patient_gpt_gateway.dart';
import 'package:patient_gpt/features/workspace/domain/workspace_entities.dart';

part 'workspace_providers.g.dart';

/// Derived providers re-throw what the graph providers already settled; a
/// retry here would only repeat that. The graph providers carry the
/// package's bounded policy: TerminalError never retries, TransientError at
/// most twice.
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

/// The transports the app's `EntityGraph` reads through. `main` overrides
/// the package's `entityTransportRegistryProvider` with this.
@Riverpod(keepAlive: true)
EntityTransportRegistry patientGptEntityTransports(Ref ref) =>
    patientGptTransports(ref.watch(patientGptGatewayProvider));

// ── graph views: lists hold ids, rows are joined from the graph ─────────

final sessionEntityProvider = entityProvider<Session>(
  type: EntityTypes.session,
  id: currentSessionId,
  fromGraph: GraphCodec.session,
  subscribe: false,
);

final patientListProvider = entityListProvider<PatientSummary>(
  type: EntityTypes.patient,
  queryKey: 'patients:all',
  fromGraph: GraphCodec.patient,
  subscribe: false,
);

final caseListProvider = entityListProvider<CaseSummary>(
  type: EntityTypes.caseSummary,
  queryKey: 'cases:all',
  fromGraph: GraphCodec.caseSummary,
  subscribe: false,
);

EntityListProvider<ConversationSummary> conversationListProvider(
  ConversationScope scope,
) => entityListProvider<ConversationSummary>(
  type: EntityTypes.conversation,
  queryKey: 'conversations:${scope.query}',
  fromGraph: GraphCodec.conversation,
  query: ListQuery(
    filter: [
      FilterClause(field: 'scope', op: FilterOperator.eq, value: scope.query),
    ],
  ),
  subscribe: false,
);

/// Joins one record already in the graph; never fetches. Rebuilds when the
/// graph changes that record.
EntityProvider<PatientSummary> patientRecordProvider(String id) =>
    entityProvider<PatientSummary>(
      type: EntityTypes.patient,
      id: id,
      fromGraph: GraphCodec.patient,
      enabled: false,
      subscribe: false,
    );

EntityProvider<CaseSummary> caseRecordProvider(String id) =>
    entityProvider<CaseSummary>(
      type: EntityTypes.caseSummary,
      id: id,
      fromGraph: GraphCodec.caseSummary,
      enabled: false,
      subscribe: false,
    );

EntityProvider<ConversationSummary> conversationRecordProvider(String id) =>
    entityProvider<ConversationSummary>(
      type: EntityTypes.conversation,
      id: id,
      fromGraph: GraphCodec.conversation,
      enabled: false,
      subscribe: false,
    );

/// The session principal, or null until the graph holds it.
@Riverpod(retry: noRetry)
Future<Session?> session(Ref ref) async =>
    (await ref.watch(sessionEntityProvider.future)).entity;

/// Patient and case order for the sidebar and "Due next", as ids.
@Riverpod(retry: noRetry)
Future<PatientDirectory> patientDirectory(Ref ref) async {
  final patients = await ref.watch(patientListProvider.future);
  final cases = await ref.watch(caseListProvider.future);
  return PatientDirectory.build(patients.items, cases.items);
}
