// TJ-ARCH-MOB-001 compliant

enum TurnStatus { streaming, done, stopped, failed }

/// One user message and the assistant reply it produced, assembled from
/// AG-UI events. Text arrives only through TEXT_MESSAGE_CONTENT deltas.
class ThreadTurn {
  const ThreadTurn({
    required this.userText,
    this.agentText = '',
    this.status = TurnStatus.streaming,
    this.failure,
  });

  final String userText;
  final String agentText;
  final TurnStatus status;

  /// Set when the run could not start or ended with RUN_ERROR.
  final String? failure;

  ThreadTurn copyWith({
    String? agentText,
    TurnStatus? status,
    String? failure,
  }) => ThreadTurn(
    userText: userText,
    agentText: agentText ?? this.agentText,
    status: status ?? this.status,
    failure: failure ?? this.failure,
  );
}

class ThreadState {
  const ThreadState({this.threadId, this.turns = const []});

  /// From RUN_STARTED; sent back as `conversationId` on the next run.
  final String? threadId;
  final List<ThreadTurn> turns;

  bool get busy =>
      turns.isNotEmpty && turns.last.status == TurnStatus.streaming;

  ThreadState copyWith({String? threadId, List<ThreadTurn>? turns}) =>
      ThreadState(
        threadId: threadId ?? this.threadId,
        turns: turns ?? this.turns,
      );
}
