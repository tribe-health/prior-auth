/// Three evidence states, never two.
///
/// [gap] and [voidState] call for OPPOSITE actions: a gap is a chart that says
/// no and must be argued; a void is a chart that is silent and must be
/// obtained. Collapsing them sends the wrong person to do the wrong job.
///
/// `void` is a Dart keyword, so the enum member is named [voidState] and the
/// wire value stays `void` — the JSON contract is shared with Rust and TypeScript
/// and must not drift to accommodate one language's grammar.
enum EvidenceState {
  met('met', 'Met', 'Cite it'),
  gap('gap', 'Not met', 'Argue it'),
  voidState('void', 'Not documented', 'Obtain it');

  const EvidenceState(this.wire, this.label, this.action);

  /// The value on the wire. Matches `evidence_states.key` in the schema.
  final String wire;

  /// What a clinician calls this state.
  final String label;

  /// What the state asks a human to do — the reason the distinction exists.
  final String action;

  static EvidenceState fromWire(String value) => values.firstWhere(
        (s) => s.wire == value,
        // An unknown state is a contract break, not a default. Failing loudly
        // beats rendering a fourth state as "met".
        orElse: () => throw ArgumentError('unknown evidence state: $value'),
      );
}

/// Counts behind the dashboard tiles.
class EvidenceCounts {
  const EvidenceCounts({required this.met, required this.gap, required this.voidCount});

  final int met;
  final int gap;
  final int voidCount;

  factory EvidenceCounts.fromJson(Map<String, dynamic> json) => EvidenceCounts(
        met: json['met'] as int,
        gap: json['gap'] as int,
        voidCount: json['void'] as int,
      );

  int operator [](EvidenceState state) => switch (state) {
        EvidenceState.met => met,
        EvidenceState.gap => gap,
        EvidenceState.voidState => voidCount,
      };
}
