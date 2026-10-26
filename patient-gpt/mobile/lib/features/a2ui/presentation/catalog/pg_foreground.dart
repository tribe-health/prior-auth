// TJ-ARCH-MOB-001 compliant
import 'package:flutter/widgets.dart';

/// Set by a filled control (Button, Modal trigger) so the child components
/// it builds, usually a Text, take the control's foreground colour and the
/// `.btn` label style instead of page prose.
class PgA2uiForeground extends InheritedWidget {
  const PgA2uiForeground({
    required this.color,
    required super.child,
    super.key,
  });

  final Color color;

  static Color? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<PgA2uiForeground>()?.color;

  @override
  bool updateShouldNotify(PgA2uiForeground oldWidget) =>
      color != oldWidget.color;
}
