// TJ-ARCH-MOB-001 compliant
import 'package:flutter/material.dart';

import 'package:patient_gpt/core/theme/pg_theme.dart';
import 'package:patient_gpt/core/theme/tokens.dart';

/// Builds a control's content in the foreground colour of its current state.
typedef PgContentBuilder = Widget Function(BuildContext context, Color fg);

/// The prototype's interactive primitive. Areas differ by fill only; there is
/// no ring, outline, ink or elevation. Keyboard focus is a fill swap
/// (`:focus-visible` → --focus-bg / --focus-fg), shown only in keyboard
/// highlight mode, as `:focus-visible` is. Hover applies on pointer devices.
class PgPressable extends StatefulWidget {
  const PgPressable({
    required this.builder,
    required this.onTap,
    this.semanticLabel,
    this.background,
    this.hoverBackground,
    this.foreground,
    this.focusBackground,
    this.focusForeground,
    this.radius = PgRadius.rLg,
    this.padding = EdgeInsets.zero,
    this.minHeight = 44,
    this.minWidth = 0,
    this.expanded,
    super.key,
  });

  final PgContentBuilder builder;

  /// Null renders the control disabled.
  final VoidCallback? onTap;
  final String? semanticLabel;
  final Color? background;
  final Color? hoverBackground;
  final Color? foreground;
  final Color? focusBackground;
  final Color? focusForeground;
  final double radius;
  final EdgeInsetsGeometry padding;
  final double minHeight;
  final double minWidth;

  /// Disclosure state for controls with `aria-expanded`.
  final bool? expanded;

  @override
  State<PgPressable> createState() => _PgPressableState();
}

class _PgPressableState extends State<PgPressable> {
  bool _focused = false;
  bool _hovered = false;

  void _activate() => widget.onTap?.call();

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    final enabled = widget.onTap != null;
    final fg = _focused
        ? (widget.focusForeground ?? c.focusFg)
        : (widget.foreground ?? c.fg);
    final bg = _focused
        ? (widget.focusBackground ?? c.focusBg)
        : (_hovered && enabled
              ? (widget.hoverBackground ?? widget.background)
              : widget.background);

    return Semantics(
      button: true,
      enabled: enabled,
      expanded: widget.expanded,
      label: widget.semanticLabel,
      excludeSemantics: widget.semanticLabel != null,
      child: FocusableActionDetector(
        enabled: enabled,
        onShowFocusHighlight: (v) => setState(() => _focused = v),
        onShowHoverHighlight: (v) => setState(() => _hovered = v),
        mouseCursor: enabled
            ? SystemMouseCursors.click
            : SystemMouseCursors.forbidden,
        actions: <Type, Action<Intent>>{
          ActivateIntent: CallbackAction<ActivateIntent>(
            onInvoke: (_) {
              _activate();
              return null;
            },
          ),
        },
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: enabled ? _activate : null,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: widget.minHeight,
              minWidth: widget.minWidth,
            ),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: bg,
                borderRadius: BorderRadius.circular(widget.radius),
              ),
              child: Padding(
                padding: widget.padding,
                child: widget.builder(context, fg),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// `.icon-btn` at coarse-pointer size: 44 by 44, --fg-2, --s3 on hover.
class PgIconButton extends StatelessWidget {
  const PgIconButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.color,
    this.background,
    this.hoverBackground,
    this.focusBackground,
    this.focusForeground,
    this.round = false,
    this.size = 44,
    this.iconSize = 20,
    super.key,
  });

  final Widget Function(Color fg) icon;
  final String label;
  final VoidCallback? onTap;
  final Color? color;
  final Color? background;
  final Color? hoverBackground;
  final Color? focusBackground;
  final Color? focusForeground;
  final bool round;
  final double size;
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    return SizedBox.square(
      dimension: size,
      child: PgPressable(
        onTap: onTap,
        semanticLabel: label,
        foreground: color ?? c.fg2,
        background: background,
        hoverBackground: hoverBackground ?? c.s3,
        focusBackground: focusBackground,
        focusForeground: focusForeground,
        radius: round ? size / 2 : PgRadius.rLg,
        minHeight: size,
        minWidth: size,
        builder: (context, fg) => Center(child: icon(fg)),
      ),
    );
  }
}
