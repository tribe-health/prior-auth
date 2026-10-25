// TJ-ARCH-MOB-001 compliant
import 'package:patient_gpt/features/workspace/domain/workspace_entities.dart';

/// Patients and cases keyed by id, with ordered id lists for the views. Each
/// view joins the record at render time; lists never hold copies.
class PatientDirectory {
  PatientDirectory._(
    this.patients,
    this.cases,
    this.patientOrder,
    this.dueNextOrder,
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

    final patientOrder = patients.keys.toList()
      ..sort((a, b) {
        final da = _nearestDue(patients[a]!, cases);
        final db = _nearestDue(patients[b]!, cases);
        final byDue = _compareDue(da, db);
        return byDue != 0
            ? byDue
            : patients[a]!.displayName.compareTo(patients[b]!.displayName);
      });

    final dueNextOrder = cases.values.where((c) => !c.closed).toList()
      ..sort((a, b) => _compareDue(a.due?.date, b.due?.date));

    return PatientDirectory._(
      Map.unmodifiable(patients),
      Map.unmodifiable(cases),
      List.unmodifiable(patientOrder),
      List.unmodifiable(dueNextOrder.map((c) => c.id)),
    );
  }

  final Map<String, PatientSummary> patients;
  final Map<String, CaseSummary> cases;
  final List<String> patientOrder;
  final List<String> dueNextOrder;

  CalendarDate? nearestDue(String patientId) {
    final p = patients[patientId];
    return p == null ? null : _nearestDue(p, cases);
  }

  /// The patient whose open case is due first starts expanded in the sidebar.
  String? get firstDuePatientId {
    if (dueNextOrder.isEmpty) return null;
    return cases[dueNextOrder.first]?.patientId;
  }

  static CalendarDate? _nearestDue(
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
