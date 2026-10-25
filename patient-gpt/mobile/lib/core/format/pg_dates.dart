// TJ-ARCH-MOB-001 compliant
// Date wording from docs/design/patient-chat/ui.js (fmtDate, dueLabel,
// dueText), measured against the device's current date.
import 'package:patient_gpt/features/workspace/domain/workspace_entities.dart';

abstract final class PgDates {
  static const _months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', //
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  static CalendarDate today() => CalendarDate.fromDateTime(DateTime.now());

  /// `Oct 3`
  static String short(CalendarDate d) => '${_months[d.month - 1]} ${d.day}';

  /// `today`, `tomorrow`, `in 4 days`, `yesterday`, `3 days ago`
  static String relative(CalendarDate d, CalendarDate today) {
    final n = d.daysFrom(today);
    if (n == 0) return 'today';
    if (n == 1) return 'tomorrow';
    if (n > 1) return 'in $n days';
    if (n == -1) return 'yesterday';
    return '${-n} days ago';
  }

  /// `<kind> Oct 3 · in 4 days`
  static String dueText(CaseDue due, CalendarDate today) =>
      '${due.kind} ${short(due.date)} · ${relative(due.date, today)}';

  /// The prototype marks a deadline within a day in the accent.
  static bool isSoon(CaseDue due, CalendarDate today) =>
      due.date.daysFrom(today) <= 1;

  /// History rows: `Today`, `Yesterday`, else `Oct 3`.
  static String historyWhen(DateTime updatedAt, CalendarDate today) {
    final d = CalendarDate.fromDateTime(updatedAt.toLocal());
    final n = today.daysFrom(d);
    if (n == 0) return 'Today';
    if (n == 1) return 'Yesterday';
    return short(d);
  }
}
