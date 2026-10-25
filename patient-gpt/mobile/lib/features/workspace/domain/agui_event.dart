// TJ-ARCH-MOB-001 compliant
// AG-UI scaffold subset from docs/plan/scaffold-contracts.md. Switches over
// [AguiEvent] are exhaustive with no default arm.

sealed class AguiEvent {
  const AguiEvent();
}

final class RunStarted extends AguiEvent {
  const RunStarted({required this.runId, required this.threadId});

  final String runId;
  final String threadId;
}

final class TextMessageStart extends AguiEvent {
  const TextMessageStart({required this.messageId});

  /// The contract fixes `role` to `assistant`.
  final String messageId;
}

final class TextMessageContent extends AguiEvent {
  const TextMessageContent({required this.messageId, required this.delta});

  final String messageId;
  final String delta;
}

final class TextMessageEnd extends AguiEvent {
  const TextMessageEnd({required this.messageId});

  final String messageId;
}

final class RunFinished extends AguiEvent {
  const RunFinished({required this.runId, required this.threadId});

  final String runId;
  final String threadId;
}

final class RunError extends AguiEvent {
  const RunError({required this.message, required this.code});

  final String message;
  final String? code;
}
