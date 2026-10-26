// TJ-ARCH-MOB-001 compliant
import 'package:patient_gpt/features/workspace/domain/workspace_entities.dart';

/// The order the views list patients and cases in, as ids only. Each view
/// joins the record from the entity graph at render time; this holds no
/// copies of a record, only ids and the dates derived from them.
class PatientDirectory {
  PatientDirectory._(
    this.patientOrder,
    this.dueNextOrder,
    this._nearestDue,
    this.firstDuePatientId,
  );

  /// Orders as the prototype does (data.js `openCases`, `nearestDue`):
  /// patients by nearest open deadline then name; open cases by deadline,
  /// undated last.
  factory PatientDirectory.build(
    List<PatientSummary> patientList,
    List<CaseSummary> caseList,
  ) {
    final patients = {for (final p in patientList) p.id: p};
    final cases = {for (final c in caseList) c.id: c};
    final nearest = {
      for (final p in patientList) p.id: _nearestDueOf(p, cases),
    };

    final patientOrder = patients.keys.toList()
      ..sort((a, b) {
        final byDue = _compareDue(nearest[a], nearest[b]);
        return byDue != 0
            ? byDue
            : patients[a]!.displayName.compareTo(patients[b]!.displayName);
      });

    final dueNext = cases.values.where((c) => !c.closed).toList()
      ..sort((a, b) => _compareDue(a.due?.date, b.due?.date));

    return PatientDirectory._(
      List.unmodifiable(patientOrder),
      List.unmodifiable(dueNext.map((c) => c.id)),
      Map.unmodifiable(nearest),
      dueNext.isEmpty ? null : dueNext.first.patientId,
    );
  }

  final List<String> patientOrder;
  final List<String> dueNextOrder;
  final Map<String, CalendarDate?> _nearestDue;

  /// The patient whose open case is due first starts expanded in the sidebar.
  final String? firstDuePatientId;

  CalendarDate? nearestDue(String patientId) => _nearestDue[patientId];

  static CalendarDate? _nearestDueOf(
    PatientSummary p,
    Map<String, CaseSummary> cases,
  ) {
    CalendarDate? best;
    for (final id in p.caseIds) {
      final c = cases[id];
      final d = c?.due?.date;
      if (c == null || c.closed || d == null) continue;
      if (best == null || d.compareTo(best) < 0) best = d;
    }
    return best;
  }

  static int _compareDue(CalendarDate? a, CalendarDate? b) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return a.compareTo(b);
  }
}
