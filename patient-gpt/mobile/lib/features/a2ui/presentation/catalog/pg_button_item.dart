// TJ-ARCH-MOB-001 compliant
import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:genui/genui.dart';

import 'package:patient_gpt/core/theme/pg_theme.dart';
import 'package:patient_gpt/core/theme/tokens.dart';
import 'package:patient_gpt/core/widgets/pg_pressable.dart';
import 'package:patient_gpt/features/a2ui/presentation/catalog/pg_actions.dart';
import 'package:patient_gpt/features/a2ui/presentation/catalog/pg_fallback.dart';
import 'package:patient_gpt/features/a2ui/presentation/catalog/pg_foreground.dart';

/// Button: `.btn.primary` for `primary`, `.btn.ghost` otherwise, and a
/// fill-less button for `borderless`. Focus is the fill swap PgPressable
/// draws. Failing `checks` disable it, as `.btn:disabled`.
CatalogItem pgButton() => CatalogItem(
  name: BasicCatalogItems.button.name,
  dataSchema: BasicCatalogItems.button.dataSchema,
  widgetBuilder: (ctx) {
    final data = ctx.data as JsonMap;
    final action = data['action'];
    if (unsupportedAction(action) case final skipped?) {
      return PgA2uiFallback(name: 'Button $skipped');
    }
    final child = data['child'];
    if (child is! String) throw ArgumentError('Button needs a child id');
    final checks = (data['checks'] as List?)?.cast<JsonMap>();
    return StreamBuilder<String?>(
      stream: ValidationHelper.validateStream(checks, ctx.dataContext),
      builder: (context, snapshot) => _PgButton(
        variant: data['variant'] as String?,
        enabled: snapshot.data == null,
        onTap: () => unawaited(runA2uiAction(ctx, action! as JsonMap)),
        child: ctx.buildChild(child),
      ),
    );
  },
);

class _PgButton extends StatelessWidget {
  const _PgButton({
    required this.variant,
    required this.enabled,
    required this.onTap,
    required this.child,
  });

  final String? variant;
  final bool enabled;
  final VoidCallback onTap;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    final (bg, hover, fg) = switch (variant) {
      _ when !enabled => (c.s3, c.s3, c.fg2),
      'primary' => (c.primaryBg, c.primaryHover, c.primaryFg),
      'borderless' => (null, c.s2, c.fg),
      _ => (c.s3, c.s4, c.fg),
    };
    return Align(
      alignment: AlignmentDirectional.centerStart,
      widthFactor: 1,
      child: PgPressable(
        onTap: enabled ? onTap : null,
        background: bg,
        hoverBackground: hover,
        foreground: fg,
        radius: PgRadius.r,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        builder: (context, current) => PgA2uiForeground(
          color: current,
          child: Center(widthFactor: 1, child: child),
        ),
      ),
    );
  }
}
