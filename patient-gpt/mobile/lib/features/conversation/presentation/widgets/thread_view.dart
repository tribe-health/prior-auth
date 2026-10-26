// TJ-ARCH-MOB-001 compliant
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'package:patient_gpt/core/theme/pg_text.dart';
import 'package:patient_gpt/core/theme/pg_theme.dart';
import 'package:patient_gpt/core/theme/tokens.dart';
import 'package:patient_gpt/features/a2ui/presentation/widgets/debug_a2ui_sample.dart';
import 'package:patient_gpt/features/conversation/domain/thread_state.dart';

/// `.thread`: user bubbles on the right (--s2, radius 18), assistant prose on
/// the left with a block caret while streaming. Gap 20 between messages.
class ThreadView extends StatelessWidget {
  const ThreadView({required this.state, super.key});

  final ThreadState state;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 16, 14, 24),
      children: [
        for (final t in state.turns) ...[
          _UserMessage(text: t.userText),
          const SizedBox(height: 20),
          _AgentMessage(turn: t),
          const SizedBox(height: 20),
        ],
        // The runtime emits no A2UI yet; debug builds can open the sample
        // surface here, where a run's surface would render.
        if (kDebugMode) const DebugA2uiSample(),
      ],
    );
  }
}

class _UserMessage extends StatelessWidget {
  const _UserMessage({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    return Align(
      alignment: Alignment.centerRight,
      child: FractionallySizedBox(
        widthFactor: 0.88,
        alignment: Alignment.centerRight,
        child: Align(
          alignment: Alignment.centerRight,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: c.s2,
              borderRadius: BorderRadius.circular(PgRadius.rBubble),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Text(text, style: PgText.body(color: c.fg)),
            ),
          ),
        ),
      ),
    );
  }
}

class _AgentMessage extends StatelessWidget {
  const _AgentMessage({required this.turn});

  final ThreadTurn turn;

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    final streaming = turn.status == TurnStatus.streaming;
    final note = switch (turn.status) {
      TurnStatus.streaming || TurnStatus.done => null,
      TurnStatus.stopped => 'Stopped.',
      TurnStatus.failed => turn.failure,
    };
    return Semantics(
      liveRegion: streaming,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (turn.agentText.isNotEmpty || streaming)
            Text.rich(
              TextSpan(
                text: turn.agentText,
                style: PgText.body(color: c.fg),
                children: [
                  if (streaming)
                    WidgetSpan(
                      alignment: PlaceholderAlignment.middle,
                      child: Padding(
                        padding: const EdgeInsets.only(left: 2),
                        child: SizedBox(
                          width: 7,
                          height: 16,
                          child: ColoredBox(color: c.accent),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          if (note != null) ...[
            const SizedBox(height: 12),
            Text(
              note,
              style: PgText.body(size: PgSizes.meta, color: c.fg2, height: 1.5),
            ),
          ],
        ],
      ),
    );
  }
}
