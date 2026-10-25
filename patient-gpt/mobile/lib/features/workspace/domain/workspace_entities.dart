// TJ-ARCH-MOB-001 compliant
// Frozen DTOs from docs/plan/scaffold-contracts.md. Pure Dart: no Flutter,
// no transport. Wire names are mapped in the data layer.

class Health {
  const Health({required this.status, required this.version});

  final String status;
  final String version;
}

enum PrincipalRole {
  surgeon('surgeon', 'Surgeon'),
  coordinator('coordinator', 'Coordinator'),
  administrator('administrator', 'Administrator');

  const PrincipalRole(this.wire, this.label);

  final String wire;
  final String label;
}

/// A delegated agent is a different principal from the human it acts for and
/// inherits none of that human's clinical authority.
enum PrincipalKind {
  human('human'),
  delegatedAgent('delegated_agent');

  const PrincipalKind(this.wire);

  final String wire;
}

class Principal {
  const Principal({
    required this.id,
    required this.displayName,
    required this.role,
    required this.kind,
  });

  final String id;
  final String displayName;
  final PrincipalRole role;
  final PrincipalKind kind;
}

class Session {
  const Session({required this.principal, required this.practice});

  final Principal principal;
  final String practice;
}

class PatientSummary {
  const PatientSummary({
    required this.id,
    required this.displayName,
    required this.payer,
    required this.caseIds,
  });

  final String id;
  final String displayName;
  final String payer;
  final List<String> caseIds;
}

/// Three states, never collapsed and never a boolean. A gap is argued by a
/// surgeon; a void is obtained by a coordinator. `void` is reserved in Dart,
/// so the member is [voidState]; the wire value stays `"void"`.
enum EvidenceState {
  met('met'),
  gap('gap'),
  voidState('void');

  const EvidenceState(this.wire);

  final String wire;
}

class CriteriaTally {
  const CriteriaTally({
    required this.met,
    required this.gap,
    required this.voidCount,
  });

  final int met;
  final int gap;
  final int voidCount;

  int countOf(EvidenceState state) => switch (state) {
    EvidenceState.met => met,
    EvidenceState.gap => gap,
    EvidenceState.voidState => voidCount,
  };
}

/// A calendar date as the contract sends it (YYYY-MM-DD), without a zone.
class CalendarDate implements Comparable<CalendarDate> {
  const CalendarDate(this.year, this.month, this.day);

  final int year;
  final int month;
  final int day;

  @override
  int compareTo(CalendarDate other) =>
      (year - other.year) * 10000 +
      (month - other.month) * 100 +
      (day - other.day);

  /// Whole days from [from] to this date.
  int daysFrom(CalendarDate from) => DateTime.utc(
    year,
    month,
    day,
  ).difference(DateTime.utc(from.year, from.month, from.day)).inDays;

  static CalendarDate fromDateTime(DateTime t) =>
      CalendarDate(t.year, t.month, t.day);
}

class CaseDue {
  const CaseDue({required this.kind, required this.date});

  final String kind;
  final CalendarDate date;
}

class CaseSummary {
  const CaseSummary({
    required this.id,
    required this.patientId,
    required this.procedure,
    required this.payer,
    required this.closed,
    required this.due,
    required this.tally,
  });

  final String id;
  final String patientId;
  final String procedure;
  final String payer;
  final bool closed;
  final CaseDue? due;
  final CriteriaTally tally;
}

/// Equality is by [query], so a scope can key a provider family.
sealed class ConversationScope {
  const ConversationScope();

  /// Query-string form: `all`, `patient:<id>`, `case:<patientId>:<caseId>`.
  String get query;

  @override
  bool operator ==(Object other) =>
      other is ConversationScope && other.query == query;

  @override
  int get hashCode => query.hashCode;
}

final class AllPatientsScope extends ConversationScope {
  const AllPatientsScope();

  @override
  String get query => 'all';
}

final class PatientScope extends ConversationScope {
  const PatientScope(this.patientId);

  final String patientId;

  @override
  String get query => 'patient:$patientId';
}

final class CaseScope extends ConversationScope {
  const CaseScope(this.patientId, this.caseId);

  final String patientId;
  final String caseId;

  @override
  String get query => 'case:$patientId:$caseId';
}

class ConversationSummary {
  const ConversationSummary({
    required this.id,
    required this.scope,
    required this.title,
    required this.updatedAt,
  });

  final String id;
  final ConversationScope scope;
  final String title;
  final DateTime updatedAt;
}

/// Every generated assertion carries document, page and date.
class Citation {
  const Citation({
    required this.documentId,
    required this.documentTitle,
    required this.page,
    required this.date,
  });

  final String documentId;
  final String documentTitle;
  final int page;
  final CalendarDate date;
}

class RunRequest {
  const RunRequest({
    required this.conversationId,
    required this.scope,
    required this.message,
  });

  final String? conversationId;
  final ConversationScope scope;
  final String message;
}
