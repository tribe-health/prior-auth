// TJ-ARCH-MOB-001 compliant
import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'package:patient_gpt/features/a2ui/domain/a2ui_intent.dart';

part 'a2ui_providers.g.dart';

/// Surface actions the app has been told about, newest last. A record of
/// requests and decisions; nothing here is applied to the graph.
@Riverpod(keepAlive: true)
class A2uiIntentLog extends _$A2uiIntentLog {
  static const int _limit = 20;

  @override
  List<A2uiIntent> build() => const [];

  void report(A2uiIntent intent) {
    final next = [...state, intent];
    state = List.unmodifiable(
      next.length > _limit ? next.sublist(next.length - _limit) : next,
    );
  }
}

/// Debug builds only: whether the sample surface is open in the thread.
@riverpod
class A2uiSampleOpen extends _$A2uiSampleOpen {
  @override
  bool build() => false;

  void toggle() => state = !state;
}
