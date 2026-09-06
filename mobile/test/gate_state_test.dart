import 'package:aso_mobile/features/surgeon_gate/domain/gate_state.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('the gate has exactly four affirmations', () {
    expect(GateAffirmationKind.values, hasLength(4));
  });

  test('parses the server shape, preserving what is outstanding', () {
    final s = GateState.fromJson({
      'affirmed': false,
      'outstanding': ['pathway', 'plan'],
    });
    expect(s.affirmed, isFalse);
    expect(s.outstanding,
        [GateAffirmationKind.pathway, GateAffirmationKind.plan]);
  });

  test('every kind carries the prompt a surgeon actually reads', () {
    for (final k in GateAffirmationKind.values) {
      expect(k.prompt, isNotEmpty);
      expect(k.label, isNotEmpty);
    }
  });
}
