// TJ-ARCH-MOB-001 compliant
import 'dart:async';

import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'package:patient_gpt/features/conversation/domain/thread_state.dart';
import 'package:patient_gpt/features/workspace/domain/agui_event.dart';
import 'package:patient_gpt/features/workspace/domain/patient_gpt_gateway.dart';
import 'package:patient_gpt/features/workspace/domain/workspace_entities.dart';
import 'package:patient_gpt/features/workspace/presentation/providers/workspace_providers.dart';

part 'thread_controller.g.dart';

/// The conversation in view, scoped to all patients (the home view). It
/// renders what the runtime streams and decides nothing itself: there is no
/// application-side agent loop.
@Riverpod(keepAlive: true)
class ThreadController extends _$ThreadController {
  StreamSubscription<AguiEvent>? _run;

  @override
  ThreadState build() {
    ref.onDispose(() => _run?.cancel());
    return const ThreadState();
  }

  void send(String message) {
    final text = message.trim();
    if (text.isEmpty || state.busy) return;
    state = state.copyWith(
      turns: [
        ...state.turns,
        ThreadTurn(userText: text),
      ],
    );
    final stream = ref
        .read(patientGptGatewayProvider)
        .startRun(
          RunRequest(
            conversationId: state.threadId,
            scope: const AllPatientsScope(),
            message: text,
          ),
        );
    _run = stream.listen(
      _apply,
      onError: (Object e) => _finish(TurnStatus.failed, failure: _describe(e)),
      onDone: () {
        if (state.busy) _finish(TurnStatus.done);
      },
      cancelOnError: true,
    );
  }

  void stop() {
    if (!state.busy) return;
    unawaited(_run?.cancel());
    _run = null;
    _finish(TurnStatus.stopped);
  }

  /// "New chat": abandons any run and clears the view.
  void reset() {
    unawaited(_run?.cancel());
    _run = null;
    state = const ThreadState();
  }

  void _apply(AguiEvent e) {
    switch (e) {
      case RunStarted(:final threadId):
        state = state.copyWith(threadId: threadId);
      case TextMessageStart():
        break;
      case TextMessageContent(:final delta):
        _updateLast((t) => t.copyWith(agentText: t.agentText + delta));
      case TextMessageEnd():
        break;
      case RunFinished():
        _finish(TurnStatus.done);
      case RunError(:final message):
        _finish(TurnStatus.failed, failure: message);
    }
  }

  void _finish(TurnStatus status, {String? failure}) {
    _updateLast((t) => t.copyWith(status: status, failure: failure));
  }

  void _updateLast(ThreadTurn Function(ThreadTurn) f) {
    if (state.turns.isEmpty) return;
    final turns = [...state.turns];
    turns[turns.length - 1] = f(turns.last);
    state = state.copyWith(turns: turns);
  }

  static String _describe(Object e) => switch (e) {
    GatewayUnavailable(:final endpoint) =>
      'The PatientGPT service did not answer at $endpoint. '
          'The message was not sent.',
    GatewayContractViolation(:final detail) =>
      'The service replied outside the agreed contract: $detail.',
    _ => 'The run stopped: $e',
  };
}
