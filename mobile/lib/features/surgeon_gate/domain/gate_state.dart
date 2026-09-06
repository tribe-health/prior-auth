/// Mirrors `aso_host::domain::GateState`. The all-four rule lives in the Rust
/// core; this type lets the UI render what is outstanding without inventing a
/// second definition of "affirmed".
enum GateAffirmationKind {
  policy('policy', 'Controlling policy',
      'This is the policy and version that governs this request on the date of service.'),
  section('section', 'Criterion section',
      'This is the section of that policy the request must satisfy.'),
  pathway('pathway', 'Surgical pathway',
      'This is the operation I intend to perform.'),
  plan('plan', 'Operative plan',
      'The described levels, approach and extent match my operative plan.');

  const GateAffirmationKind(this.wire, this.label, this.prompt);

  final String wire;
  final String label;
  final String prompt;

  static GateAffirmationKind fromWire(String v) =>
      values.firstWhere((k) => k.wire == v);
}

class GateState {
  const GateState({required this.affirmed, required this.outstanding});

  final bool affirmed;
  final List<GateAffirmationKind> outstanding;

  factory GateState.fromJson(Map<String, dynamic> json) => GateState(
        affirmed: json['affirmed'] as bool,
        outstanding: (json['outstanding'] as List<dynamic>)
            .map((v) => GateAffirmationKind.fromWire(v as String))
            .toList(),
      );
}
