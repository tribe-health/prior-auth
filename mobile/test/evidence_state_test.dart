import 'package:aso_mobile/core/model/evidence_state.dart';
import 'package:flutter_test/flutter_test.dart';

// Behaviour tests at the public surface, not coverage theatre. Three of them,
// each guarding a rule the product cannot survive losing.

void main() {
  test('three evidence states exist, and void is one of them', () {
    expect(EvidenceState.values, hasLength(3));
    expect(EvidenceState.values.map((s) => s.wire),
        containsAll(<String>['met', 'gap', 'void']));
  });

  test('gap and void ask for opposite actions', () {
    // The whole reason the distinction exists. If these ever read the same, a
    // coordinator is being told to argue a document that does not exist.
    expect(EvidenceState.gap.action, 'Argue it');
    expect(EvidenceState.voidState.action, 'Obtain it');
    expect(EvidenceState.gap.action, isNot(EvidenceState.voidState.action));
  });

  test('an unknown wire value fails loudly rather than defaulting', () {
    // A fourth state silently rendering as "met" would be a clinical error.
    expect(() => EvidenceState.fromWire('partial'), throwsArgumentError);
    expect(EvidenceState.fromWire('void'), EvidenceState.voidState);
  });

  test('counts index by state without losing void', () {
    const c = EvidenceCounts(met: 7, gap: 1, voidCount: 2);
    expect(c[EvidenceState.met], 7);
    expect(c[EvidenceState.gap], 1);
    expect(c[EvidenceState.voidState], 2);
  });
}
