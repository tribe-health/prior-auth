// TJ-ARCH-MOB-001 compliant
import 'package:flutter/material.dart';

import 'package:patient_gpt/core/theme/pg_text.dart';
import 'package:patient_gpt/core/theme/pg_theme.dart';
import 'package:patient_gpt/core/theme/tokens.dart';
import 'package:patient_gpt/core/widgets/pg_icon.dart';

sealed class PgMenuEntry {
  const PgMenuEntry();
}

final class PgMenuAction extends PgMenuEntry {
  const PgMenuAction({
    required this.icon,
    required this.label,
    required this.onSelect,
  });

  final PgIconName icon;
  final String label;
  final VoidCallback onSelect;
}

final class PgMenuNote extends PgMenuEntry {
  const PgMenuNote(this.text);

  final String text;
}

/// `.menu`: an inverse fill, since nothing lifts it off the page (no shadow).
/// Items: 44 high on touch, --inv-hover on hover, focus swaps to --inv-fg.
class PgMenu extends StatelessWidget {
  const PgMenu({
    required this.entries,
    required this.builder,
    required this.semanticLabel,
    super.key,
  });

  final List<PgMenuEntry> entries;
  final String semanticLabel;

  /// Builds the anchor; call `toggle` to open or close the menu.
  final Widget Function(BuildContext context, VoidCallback toggle, bool isOpen)
  builder;

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    return MenuAnchor(
      alignmentOffset: const Offset(0, 6),
      style: MenuStyle(
        backgroundColor: WidgetStatePropertyAll(c.inv),
        surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
        shadowColor: const WidgetStatePropertyAll(Colors.transparent),
        elevation: const WidgetStatePropertyAll(0),
        padding: const WidgetStatePropertyAll(EdgeInsets.all(6)),
        minimumSize: const WidgetStatePropertyAll(Size(248, 0)),
        maximumSize: const WidgetStatePropertyAll(Size(340, double.infinity)),
        shape: const WidgetStatePropertyAll(
          RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(PgRadius.rLg)),
          ),
        ),
        side: const WidgetStatePropertyAll(BorderSide.none),
      ),
      menuChildren: [for (final e in entries) _entry(context, e)],
      builder: (context, controller, _) => builder(
        context,
        () => controller.isOpen ? controller.close() : controller.open(),
        controller.isOpen,
      ),
    );
  }

  Widget _entry(BuildContext context, PgMenuEntry e) {
    final c = context.pg;
    return switch (e) {
      PgMenuNote(:final text) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        child: SizedBox(
          width: 236,
          child: Text(
            text,
            style: PgText.body(
              size: PgSizes.meta,
              color: c.invFg2,
              height: 1.5,
            ),
          ),
        ),
      ),
      PgMenuAction(:final icon, :final label, :final onSelect) =>
        MenuItemButton(
          onPressed: onSelect,
          style: ButtonStyle(
            minimumSize: const WidgetStatePropertyAll(Size(236, 44)),
            padding: const WidgetStatePropertyAll(
              EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            ),
            shape: const WidgetStatePropertyAll(
              RoundedRectangleBorder(
                borderRadius: BorderRadius.all(Radius.circular(PgRadius.r)),
              ),
            ),
            overlayColor: const WidgetStatePropertyAll(Colors.transparent),
            backgroundColor: WidgetStateProperty.resolveWith(
              (s) => s.contains(WidgetState.focused)
                  ? c.invFg
                  : s.contains(WidgetState.hovered)
                  ? c.invHover
                  : Colors.transparent,
            ),
            foregroundColor: WidgetStateProperty.resolveWith(
              (s) => s.contains(WidgetState.focused) ? c.inv : c.invFg,
            ),
            iconColor: WidgetStateProperty.resolveWith(
              (s) => s.contains(WidgetState.focused) ? c.inv : c.invFg2,
            ),
            textStyle: WidgetStatePropertyAll(
              PgText.body(size: PgSizes.ui, height: 1.4),
            ),
          ),
          leadingIcon: Builder(
            builder: (context) =>
                PgIcon(icon, color: IconTheme.of(context).color ?? c.invFg2),
          ),
          child: Padding(
            padding: const EdgeInsets.only(left: 4),
            child: Text(label),
          ),
        ),
    };
  }
}
