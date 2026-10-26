// TJ-ARCH-MOB-001 compliant
import 'package:patient_gpt/features/workspace/domain/patient_gpt_gateway.dart';
import 'package:patient_gpt/features/workspace/domain/workspace_entities.dart';

/// Entity type names registered with the app's `EntityGraph`.
abstract final class EntityTypes {
  static const String session = 'Session';
  static const String patient = 'Patient';
  static const String caseSummary = 'Case';
  static const String conversation = 'Conversation';
}

/// The session is a singleton record; this is its graph id.
const String currentSessionId = 'current';

/// Canonical graph rows for the four workspace entities, and back.
///
/// Decoders are static so their tear-offs are equal across calls: provider
/// families are keyed by them. A row that does not decode throws
/// [GatewayContractViolation]; an unknown role, kind or scope is never
/// coerced into a plausible value.
abstract final class GraphCodec {
  static Map<String, Object?> encodeSession(Session s) => {
    'id': currentSessionId,
    'principalId': s.principal.id,
    'displayName': s.principal.displayName,
    'role': s.principal.role.wire,
    'kind': s.principal.kind.wire,
    'practice': s.practice,
  };

  static Session session(Map<String, Object?> row) => Session(
    principal: Principal(
      id: _str(row, 'principalId'),
      displayName: _str(row, 'displayName'),
      role: _enum(PrincipalRole.values, (r) => r.wire, row, 'role'),
      kind: _enum(PrincipalKind.values, (k) => k.wire, row, 'kind'),
    ),
    practice: _str(row, 'practice'),
  );

  static Map<String, Object?> encodePatient(PatientSummary p) => {
    'id': p.id,
    'displayName': p.displayName,
    'payer': p.payer,
    'caseIds': List<String>.unmodifiable(p.caseIds),
  };

  static PatientSummary patient(Map<String, Object?> row) => PatientSummary(
    id: _str(row, 'id'),
    displayName: _str(row, 'displayName'),
    payer: _str(row, 'payer'),
    caseIds: List.unmodifiable(_list(row, 'caseIds').cast<String>()),
  );

  static Map<String, Object?> encodeCase(CaseSummary c) => {
    'id': c.id,
    'patientId': c.patientId,
    'procedure': c.procedure,
    'payer': c.payer,
    'closed': c.closed,
    'dueKind': c.due?.kind,
    'dueDate': switch (c.due) {
      null => null,
      final d => _formatDate(d.date),
    },
    'met': c.tally.met,
    'gap': c.tally.gap,
    'void': c.tally.voidCount,
  };

  static CaseSummary caseSummary(Map<String, Object?> row) => CaseSummary(
    id: _str(row, 'id'),
    patientId: _str(row, 'patientId'),
    procedure: _str(row, 'procedure'),
    payer: _str(row, 'payer'),
    closed: row['closed'] is bool
        ? row['closed']! as bool
        : throw const GatewayContractViolation('case row has no closed flag'),
    due: switch ((row['dueKind'], row['dueDate'])) {
      (null, null) => null,
      (final String kind, final String date) => CaseDue(
        kind: kind,
        date: parseCalendarDate(date),
      ),
      _ => throw const GatewayContractViolation('case row has a partial due'),
    },
    tally: CriteriaTally(
      met: _int(row, 'met'),
      gap: _int(row, 'gap'),
      voidCount: _int(row, 'void'),
    ),
  );

  static Map<String, Object?> encodeConversation(ConversationSummary c) => {
    'id': c.id,
    'scope': c.scope.query,
    'title': c.title,
    'updatedAt': c.updatedAt.toUtc().toIso8601String(),
  };

  static ConversationSummary conversation(Map<String, Object?> row) =>
      ConversationSummary(
        id: _str(row, 'id'),
        scope: parseConversationScope(_str(row, 'scope')),
        title: _str(row, 'title'),
        updatedAt: switch (DateTime.tryParse(_str(row, 'updatedAt'))) {
          null => throw const GatewayContractViolation(
            'conversation row updatedAt is not RFC 3339',
          ),
          final t => t,
        },
      );

  static String _str(Map<String, Object?> row, String key) =>
      switch (row[key]) {
        final String v => v,
        _ => throw GatewayContractViolation('graph row has no string "$key"'),
      };

  static int _int(Map<String, Object?> row, String key) => switch (row[key]) {
    final int v => v,
    _ => throw GatewayContractViolation('graph row has no integer "$key"'),
  };

  static List<Object?> _list(Map<String, Object?> row, String key) =>
      switch (row[key]) {
        final List<Object?> v => v,
        _ => throw GatewayContractViolation('graph row has no list "$key"'),
      };

  static T _enum<T>(
    List<T> values,
    String Function(T) wire,
    Map<String, Object?> row,
    String key,
  ) {
    final v = _str(row, key);
    for (final value in values) {
      if (wire(value) == v) return value;
    }
    throw GatewayContractViolation('unknown $key "$v"');
  }

  static String _formatDate(CalendarDate d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}

/// `all`, `patient:<id>`, `case:<patientId>:<caseId>`; anything else throws.
ConversationScope parseConversationScope(String query) =>
    switch (query.split(':')) {
      ['all'] => const AllPatientsScope(),
      ['patient', final p] when p.isNotEmpty => PatientScope(p),
      ['case', final p, final c] when p.isNotEmpty && c.isNotEmpty => CaseScope(
        p,
        c,
      ),
      _ => throw GatewayContractViolation('unknown scope "$query"'),
    };

CalendarDate parseCalendarDate(String s) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(s);
  if (m == null) throw GatewayContractViolation('"$s" is not YYYY-MM-DD');
  return CalendarDate(
    int.parse(m.group(1)!),
    int.parse(m.group(2)!),
    int.parse(m.group(3)!),
  );
}
