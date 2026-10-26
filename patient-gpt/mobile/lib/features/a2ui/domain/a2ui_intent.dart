// TJ-ARCH-MOB-001 compliant

/// The registered catalog this build renders (docs/plan/pem-adoption-plan.md).
const String patientGptCatalogId = 'urn:patientgpt:a2ui:catalog:basic:v1';

/// What the app decided about a surface action. There is no "applied": no
/// action in this build writes a record.
enum A2uiDecision { denied }

/// A surface action, reported to the app as an intent. The surface asked;
/// the app recorded the request and its decision. Nothing else happened.
class A2uiIntent {
  const A2uiIntent({
    required this.surfaceId,
    required this.name,
    required this.sourceComponentId,
    required this.context,
    required this.decision,
    required this.reason,
  });

  final String surfaceId;
  final String name;
  final String sourceComponentId;
  final Map<String, Object?> context;
  final A2uiDecision decision;
  final String reason;
}

/// Default deny. No action is allowlisted: an agent-rendered surface can
/// ask, but it cannot affirm, sign, submit, record an outcome or write any
/// record. Clinical actions belong to the trusted host, never to a surface.
/// Allowing an action later is a clinical-authority change, not a UI one.
abstract final class A2uiActionPolicy {
  static A2uiIntent evaluate({
    required String surfaceId,
    required String name,
    required String sourceComponentId,
    required Map<String, Object?> context,
  }) => A2uiIntent(
    surfaceId: surfaceId,
    name: name,
    sourceComponentId: sourceComponentId,
    context: Map.unmodifiable(context),
    decision: A2uiDecision.denied,
    reason: 'Not allowlisted. Reported to the app; nothing was applied.',
  );
}
