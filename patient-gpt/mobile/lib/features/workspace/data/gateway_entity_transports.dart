// TJ-ARCH-MOB-001 compliant
import 'package:entity_graph_flutter/entity_graph_flutter.dart';

import 'package:patient_gpt/core/config/transport_config.dart';
import 'package:patient_gpt/features/workspace/data/graph_codec.dart';
import 'package:patient_gpt/features/workspace/domain/patient_gpt_gateway.dart';
import 'package:patient_gpt/features/workspace/domain/workspace_entities.dart';

/// One registry for the app's graph: an [EntityTransport] per workspace
/// entity, each reading through the same [PatientGptGateway] (FFI or HTTP,
/// chosen by `PATIENTGPT_TRANSPORT`).
///
/// Read-only by design. No transport implements create, update or delete,
/// so the package's defaults throw [UnimplementedError], which maps to
/// [TerminalError]: a write attempt fails once and is never retried.
EntityTransportRegistry patientGptTransports(PatientGptGateway gateway) =>
    EntityTransportRegistry()
      ..register<Session>(EntityTypes.session, SessionTransport(gateway))
      ..register<PatientSummary>(EntityTypes.patient, PatientTransport(gateway))
      ..register<CaseSummary>(EntityTypes.caseSummary, CaseTransport(gateway))
      ..register<ConversationSummary>(
        EntityTypes.conversation,
        ConversationTransport(gateway),
      );

/// Host codes (docs/plan/scaffold-contracts.md) that a retry cannot change.
/// The same set the web shell treats as terminal.
const Set<String> terminalHostCodes = {
  'invalid_input',
  'not_found',
  'not_implemented',
  'invalid_scope',
  'missing_scope',
  'invalid_run_request',
};

/// Maps a gateway failure onto the graph's typed errors. The message keeps
/// where the call went and what came back, because the home view shows it.
EntityGraphError toGraphError(Object error) => switch (error) {
  EntityGraphError() => error,
  GatewayUnavailable(:final code, :final endpoint, :final detail)
      when code != null && terminalHostCodes.contains(code) =>
    TerminalError('$endpoint · $detail'),
  GatewayUnavailable(:final endpoint, :final detail) => TransientError(
    '$endpoint · $detail',
  ),
  GatewayContractViolation(:final detail) => TransientError(
    '${patientGptTransport.endpoint} · '
    'The reply did not match the contract: $detail',
  ),
  _ => toEntityGraphError(error),
};

Future<T> _guard<T>(Future<T> Function() body) async {
  try {
    return await body();
  } on GatewayUnavailable catch (e) {
    throw toGraphError(e);
  } on GatewayContractViolation catch (e) {
    throw toGraphError(e);
  }
}

/// The value of an `eq` filter on [field], or null when the query has none.
String? _eqFilter(ListQuery query, String field) {
  for (final f in query.filter ?? const <FilterClause>[]) {
    if (f.field == field && f.op == FilterOperator.eq && f.value is String) {
      return f.value! as String;
    }
  }
  return null;
}

abstract class _ReadOnlyTransport<T extends Object> extends EntityTransport<T> {
  const _ReadOnlyTransport(this.gateway);

  final PatientGptGateway gateway;

  /// The graph is not the authority; the shared Rust host is.
  @override
  bool get authoritative => false;

  @override
  Duration? get staleTime => const Duration(seconds: 30);
}

final class SessionTransport extends _ReadOnlyTransport<Session> {
  const SessionTransport(super.gateway);

  @override
  String identify(Session row) => currentSessionId;

  @override
  Map<String, Object?> toGraph(Session row) => GraphCodec.encodeSession(row);

  @override
  Future<ListResult<Session>> list(ListQuery query) => _guard(() async {
    final s = await gateway.session();
    return ListResult(rows: [s], total: 1);
  });

  @override
  Future<Session?> get(String id) => _guard(
    () async => id == currentSessionId ? await gateway.session() : null,
  );
}

final class PatientTransport extends _ReadOnlyTransport<PatientSummary> {
  const PatientTransport(super.gateway);

  @override
  String identify(PatientSummary row) => row.id;

  @override
  Map<String, Object?> toGraph(PatientSummary row) =>
      GraphCodec.encodePatient(row);

  @override
  Future<ListResult<PatientSummary>> list(ListQuery query) => _guard(() async {
    final patients = await gateway.listPatients();
    return ListResult(rows: patients, total: patients.length);
  });
}

/// With a `patientId` filter, that patient's cases; without one, every
/// patient's cases (the home view's "Due next" spans all patients).
final class CaseTransport extends _ReadOnlyTransport<CaseSummary> {
  const CaseTransport(super.gateway);

  @override
  String identify(CaseSummary row) => row.id;

  @override
  Map<String, Object?> toGraph(CaseSummary row) => GraphCodec.encodeCase(row);

  @override
  Future<ListResult<CaseSummary>> list(ListQuery query) => _guard(() async {
    final patientId = _eqFilter(query, 'patientId');
    final List<CaseSummary> cases;
    if (patientId != null) {
      cases = await gateway.listCases(patientId);
    } else {
      final patients = await gateway.listPatients();
      final lists = await Future.wait(
        patients.map((p) => gateway.listCases(p.id)),
      );
      cases = [for (final l in lists) ...l];
    }
    return ListResult(rows: cases, total: cases.length);
  });
}

/// Requires a `scope` filter: the contract has no unscoped listing.
final class ConversationTransport
    extends _ReadOnlyTransport<ConversationSummary> {
  const ConversationTransport(super.gateway);

  @override
  String identify(ConversationSummary row) => row.id;

  @override
  Map<String, Object?> toGraph(ConversationSummary row) =>
      GraphCodec.encodeConversation(row);

  @override
  Future<ListResult<ConversationSummary>> list(ListQuery query) =>
      _guard(() async {
        final scope = _eqFilter(query, 'scope');
        if (scope == null) {
          throw const TerminalError('Conversation list needs a scope filter');
        }
        final rows = await gateway.listConversations(
          parseConversationScope(scope),
        );
        return ListResult(rows: rows, total: rows.length);
      });
}
