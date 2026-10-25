// TJ-ARCH-MOB-001 compliant
// Strict JSON mapping for the frozen contract (camelCase on the wire). Any
// unknown discriminator or missing field throws; nothing defaults.
import 'package:patient_gpt/features/workspace/domain/agui_event.dart';
import 'package:patient_gpt/features/workspace/domain/patient_gpt_gateway.dart';
import 'package:patient_gpt/features/workspace/domain/workspace_entities.dart';

typedef Json = Map<String, Object?>;

abstract final class WireCodec {
  static Health health(Object? v) {
    final j = _obj(v, 'Health');
    return Health(status: _str(j, 'status'), version: _str(j, 'version'));
  }

  static Session session(Object? v) {
    final j = _obj(v, 'Session');
    final p = _obj(j['principal'], 'Principal');
    return Session(
      principal: Principal(
        id: _str(p, 'id'),
        displayName: _str(p, 'displayName'),
        role: _enum(PrincipalRole.values, _str(p, 'role'), (e) => e.wire),
        kind: _enum(PrincipalKind.values, _str(p, 'kind'), (e) => e.wire),
      ),
      practice: _str(j, 'practice'),
    );
  }

  static List<PatientSummary> patients(Object? v) =>
      _list(v, 'PatientSummary[]')
          .map((e) {
            final j = _obj(e, 'PatientSummary');
            return PatientSummary(
              id: _str(j, 'id'),
              displayName: _str(j, 'displayName'),
              payer: _str(j, 'payer'),
              caseIds: List.unmodifiable(
                _list(
                  j['caseIds'],
                  'caseIds',
                ).map((x) => _asStr(x, 'caseIds[]')),
              ),
            );
          })
          .toList(growable: false);

  static List<CaseSummary> cases(Object? v) => _list(v, 'CaseSummary[]')
      .map((e) {
        final j = _obj(e, 'CaseSummary');
        final due = j['due'];
        final t = _obj(j['tally'], 'CriteriaTally');
        return CaseSummary(
          id: _str(j, 'id'),
          patientId: _str(j, 'patientId'),
          procedure: _str(j, 'procedure'),
          payer: _str(j, 'payer'),
          closed: _bool(j, 'closed'),
          due: due == null
              ? null
              : () {
                  final d = _obj(due, 'due');
                  return CaseDue(
                    kind: _str(d, 'kind'),
                    date: _date(_str(d, 'date')),
                  );
                }(),
          tally: CriteriaTally(
            met: _int(t, 'met'),
            gap: _int(t, 'gap'),
            voidCount: _int(t, EvidenceState.voidState.wire),
          ),
        );
      })
      .toList(growable: false);

  static List<ConversationSummary> conversations(Object? v) =>
      _list(v, 'ConversationSummary[]')
          .map((e) {
            final j = _obj(e, 'ConversationSummary');
            final updated = DateTime.tryParse(_str(j, 'updatedAt'));
            if (updated == null) {
              throw const GatewayContractViolation('updatedAt is not RFC 3339');
            }
            return ConversationSummary(
              id: _str(j, 'id'),
              scope: scope(j['scope']),
              title: _str(j, 'title'),
              updatedAt: updated,
            );
          })
          .toList(growable: false);

  static ConversationScope scope(Object? v) {
    final j = _obj(v, 'ConversationScope');
    return switch (_str(j, 'kind')) {
      'all' => const AllPatientsScope(),
      'patient' => PatientScope(_str(j, 'patientId')),
      'case' => CaseScope(_str(j, 'patientId'), _str(j, 'caseId')),
      final k => throw GatewayContractViolation('unknown scope kind "$k"'),
    };
  }

  static Json scopeToJson(ConversationScope s) => switch (s) {
    AllPatientsScope() => {'kind': 'all'},
    PatientScope(:final patientId) => {
      'kind': 'patient',
      'patientId': patientId,
    },
    CaseScope(:final patientId, :final caseId) => {
      'kind': 'case',
      'patientId': patientId,
      'caseId': caseId,
    },
  };

  static Json runRequest(RunRequest r) => {
    'conversationId': r.conversationId,
    'scope': scopeToJson(r.scope),
    'message': r.message,
  };

  static AguiEvent aguiEvent(Object? v) {
    final j = _obj(v, 'AguiEvent');
    return switch (_str(j, 'type')) {
      'RUN_STARTED' => RunStarted(
        runId: _str(j, 'runId'),
        threadId: _str(j, 'threadId'),
      ),
      'TEXT_MESSAGE_START' => TextMessageStart(messageId: _str(j, 'messageId')),
      'TEXT_MESSAGE_CONTENT' => TextMessageContent(
        messageId: _str(j, 'messageId'),
        delta: _str(j, 'delta'),
      ),
      'TEXT_MESSAGE_END' => TextMessageEnd(messageId: _str(j, 'messageId')),
      'RUN_FINISHED' => RunFinished(
        runId: _str(j, 'runId'),
        threadId: _str(j, 'threadId'),
      ),
      'RUN_ERROR' => RunError(
        message: _str(j, 'message'),
        code: j['code'] == null ? null : _str(j, 'code'),
      ),
      final t => throw GatewayContractViolation('unknown AG-UI event "$t"'),
    };
  }

  // ── primitives ─────────────────────────────────────────────────────
  static Json _obj(Object? v, String what) {
    if (v is Map<String, Object?>) return v;
    throw GatewayContractViolation('$what is not an object');
  }

  static List<Object?> _list(Object? v, String what) {
    if (v is List<Object?>) return v;
    throw GatewayContractViolation('$what is not an array');
  }

  static String _str(Json j, String k) => _asStr(j[k], k);

  static String _asStr(Object? v, String k) {
    if (v is String) return v;
    throw GatewayContractViolation('$k is not a string');
  }

  static int _int(Json j, String k) {
    final v = j[k];
    if (v is int) return v;
    throw GatewayContractViolation('$k is not an integer');
  }

  static bool _bool(Json j, String k) {
    final v = j[k];
    if (v is bool) return v;
    throw GatewayContractViolation('$k is not a boolean');
  }

  static CalendarDate _date(String s) {
    final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(s);
    if (m == null) throw GatewayContractViolation('"$s" is not YYYY-MM-DD');
    return CalendarDate(
      int.parse(m.group(1)!),
      int.parse(m.group(2)!),
      int.parse(m.group(3)!),
    );
  }

  static T _enum<T>(List<T> values, String wire, String Function(T) wireOf) {
    for (final v in values) {
      if (wireOf(v) == wire) return v;
    }
    throw GatewayContractViolation('unknown value "$wire"');
  }
}
