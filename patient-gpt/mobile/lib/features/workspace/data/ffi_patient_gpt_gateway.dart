// TJ-ARCH-MOB-001 compliant
import 'package:patient_gpt/bridge/generated/api/patient_gpt.dart' as ffi;
import 'package:patient_gpt/bridge/generated/frb_generated.dart';
import 'package:patient_gpt/features/workspace/domain/agui_event.dart';
import 'package:patient_gpt/features/workspace/domain/patient_gpt_gateway.dart';
import 'package:patient_gpt/features/workspace/domain/workspace_entities.dart';

/// [PatientGptGateway] over `crates/patient-gpt-ffi`, the same
/// `patient_gpt_host::AppServices` the Axum routes call. Errors carry the
/// Rust `HostError::code()` and message; unknown or missing values throw.
class FfiPatientGptGateway implements PatientGptGateway {
  const FfiPatientGptGateway();

  static const String endpoint = 'ffi:patient-gpt-ffi';

  /// The scaffold has no governed UAR service, so the deterministic runtime
  /// is named here explicitly. The Rust side has no default mode.
  static const String _uarMode = 'deterministic';

  /// Loads the native library and builds AppServices once. Call before
  /// `runApp`; calling again after a hot restart is a no-op in Rust.
  static Future<void> initialize() async {
    await RustLib.init();
    try {
      ffi.init(uarMode: _uarMode);
    } on ffi.FfiError catch (e) {
      throw _unavailable('init', e);
    }
  }

  static GatewayUnavailable _unavailable(String op, ffi.FfiError e) =>
      GatewayUnavailable(
        endpoint: '$endpoint/$op',
        detail: '${e.code}: ${e.message}',
        code: e.code,
      );

  static Future<T> _call<T>(String op, Future<T> Function() body) async {
    try {
      return await body();
    } on ffi.FfiError catch (e) {
      throw _unavailable(op, e);
    }
  }

  @override
  Future<Health> health() => _call('health', () async {
    final h = await ffi.health();
    return Health(status: h.status, version: h.version);
  });

  @override
  Future<Session> session() => _call('session', () async {
    final s = await ffi.session();
    final p = s.principal;
    return Session(
      principal: Principal(
        id: p.id,
        displayName: p.displayName,
        role: switch (p.role) {
          ffi.FfiRole.surgeon => PrincipalRole.surgeon,
          ffi.FfiRole.coordinator => PrincipalRole.coordinator,
          ffi.FfiRole.administrator => PrincipalRole.administrator,
        },
        kind: switch (p.kind) {
          ffi.FfiPrincipalKind.human => PrincipalKind.human,
          ffi.FfiPrincipalKind.delegatedAgent => PrincipalKind.delegatedAgent,
        },
      ),
      practice: s.practice,
    );
  });

  @override
  Future<List<PatientSummary>> listPatients() =>
      _call('list_patients', () async {
        final patients = await ffi.listPatients();
        return [
          for (final p in patients)
            PatientSummary(
              id: p.id,
              displayName: p.displayName,
              payer: p.payer,
              caseIds: List.unmodifiable(p.caseIds),
            ),
        ];
      });

  @override
  Future<List<CaseSummary>> listCases(String patientId) =>
      _call('list_cases', () async {
        final cases = await ffi.listCases(patientId: patientId);
        return [
          for (final c in cases)
            CaseSummary(
              id: c.id,
              patientId: c.patientId,
              procedure: c.procedure,
              payer: c.payer,
              closed: c.closed,
              due: switch (c.due) {
                null => null,
                final d => CaseDue(kind: d.kind, date: _date(d.date)),
              },
              tally: CriteriaTally(
                met: c.tally.met,
                gap: c.tally.gap,
                voidCount: c.tally.voidCount,
              ),
            ),
        ];
      });

  @override
  Future<List<ConversationSummary>> listConversations(
    ConversationScope scope,
  ) => _call('list_conversations', () async {
    final conversations = await ffi.listConversations(scope: scope.query);
    return [
      for (final c in conversations)
        ConversationSummary(
          id: c.id,
          scope: _scope(c.scope),
          title: c.title,
          updatedAt: switch (DateTime.tryParse(c.updatedAt)) {
            null => throw const GatewayContractViolation(
              'updatedAt is not RFC 3339',
            ),
            final t => t,
          },
        ),
    ];
  });

  /// Events arrive as the Rust run produces them. Cancelling the
  /// subscription closes the sink, and the Rust side abandons the run.
  @override
  Stream<AguiEvent> startRun(RunRequest request) async* {
    final events = ffi.startRun(
      request: ffi.FfiRunRequest(
        conversationId: request.conversationId,
        scope: request.scope.query,
        message: request.message,
      ),
    );
    try {
      await for (final e in events) {
        yield _event(e);
      }
    } on ffi.FfiError catch (e) {
      throw _unavailable('start_run', e);
    }
  }

  static AguiEvent _event(ffi.FfiAguiEvent e) {
    String need(String? v, String field) =>
        v ?? (throw GatewayContractViolation('${e.kind.name} has no $field'));
    return switch (e.kind) {
      ffi.FfiAguiEventKind.runStarted => RunStarted(
        runId: need(e.runId, 'runId'),
        threadId: need(e.threadId, 'threadId'),
      ),
      ffi.FfiAguiEventKind.textMessageStart => switch (need(e.role, 'role')) {
        'assistant' => TextMessageStart(
          messageId: need(e.messageId, 'messageId'),
        ),
        final r => throw GatewayContractViolation('unknown role "$r"'),
      },
      ffi.FfiAguiEventKind.textMessageContent => TextMessageContent(
        messageId: need(e.messageId, 'messageId'),
        delta: need(e.delta, 'delta'),
      ),
      ffi.FfiAguiEventKind.textMessageEnd => TextMessageEnd(
        messageId: need(e.messageId, 'messageId'),
      ),
      ffi.FfiAguiEventKind.runFinished => RunFinished(
        runId: need(e.runId, 'runId'),
        threadId: need(e.threadId, 'threadId'),
      ),
      ffi.FfiAguiEventKind.runError => RunError(
        message: need(e.message, 'message'),
        code: e.code,
      ),
    };
  }

  static ConversationScope _scope(String query) => switch (query.split(':')) {
    ['all'] => const AllPatientsScope(),
    ['patient', final p] when p.isNotEmpty => PatientScope(p),
    ['case', final p, final c] when p.isNotEmpty && c.isNotEmpty => CaseScope(
      p,
      c,
    ),
    _ => throw GatewayContractViolation('unknown scope "$query"'),
  };

  static CalendarDate _date(String s) {
    final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(s);
    if (m == null) throw GatewayContractViolation('"$s" is not YYYY-MM-DD');
    return CalendarDate(
      int.parse(m.group(1)!),
      int.parse(m.group(2)!),
      int.parse(m.group(3)!),
    );
  }
}
