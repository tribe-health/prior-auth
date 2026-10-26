// TJ-ARCH-MOB-001 compliant
import 'package:flutter/widgets.dart';
import 'package:genui/genui.dart';

import 'package:patient_gpt/core/theme/pg_text.dart';
import 'package:patient_gpt/core/theme/pg_theme.dart';
import 'package:patient_gpt/core/theme/tokens.dart';
import 'package:patient_gpt/core/widgets/pg_icon.dart';
import 'package:patient_gpt/features/a2ui/presentation/catalog/pg_fallback.dart';
import 'package:patient_gpt/features/a2ui/presentation/catalog/pg_foreground.dart';

/// Text: `thread.css` prose. Headings in Playfair, body in Mulish, caption
/// in JetBrains Mono. Rendered as plain text: Markdown is not interpreted,
/// so a surface cannot carry a link (navigation is app-owned).
CatalogItem pgText() => CatalogItem(
  name: BasicCatalogItems.text.name,
  dataSchema: BasicCatalogItems.text.dataSchema,
  widgetBuilder: (ctx) {
    final data = ctx.data as JsonMap;
    final variant = data['variant'];
    return BoundString(
      dataContext: ctx.dataContext,
      value: data['text'],
      builder: (context, value) {
        final c = context.pg;
        final text = value ?? '';
        // Inside a filled control: the `.btn` label, in its foreground.
        if (PgA2uiForeground.maybeOf(context) case final fg?) {
          return Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: PgText.body(
              size: PgSizes.ui,
              weight: 700,
              color: fg,
              height: 1.2,
            ),
          );
        }
        return switch (variant) {
          'h1' || 'h2' => Semantics(
            header: true,
            child: Text(
              text,
              style: PgText.display(size: PgSizes.titleMin, color: c.fg),
            ),
          ),
          'h3' || 'h4' => Semantics(
            header: true,
            child: Text(
              text,
              style: PgText.display(size: 20, color: c.fg, height: 1.25),
            ),
          ),
          'h5' => Semantics(
            header: true,
            child: Text(
              text,
              style: PgText.body(weight: 700, color: c.fg, height: 1.4),
            ),
          ),
          'caption' => Text(text, style: PgText.mono(color: c.fg2)),
          _ => Text(text, style: PgText.body(color: c.fg)),
        };
      },
    );
  },
);

/// Official icon names mapped onto the prototype's icon set (ui.js) where
/// the meaning matches. Any other name renders the labelled fallback.
/// Same set as web (web/src/features/a2ui/presentation/catalog/pg-controls.tsx).
const Map<String, PgIconName> _iconNames = {
  'add': PgIconName.plus,
  'check': PgIconName.check,
  'close': PgIconName.x,
  'edit': PgIconName.edit,
  'folder': PgIconName.folder,
  'lock': PgIconName.lock,
  'search': PgIconName.search,
};

CatalogItem pgIcon() => CatalogItem(
  name: BasicCatalogItems.icon.name,
  dataSchema: BasicCatalogItems.icon.dataSchema,
  widgetBuilder: (ctx) => BoundString(
    dataContext: ctx.dataContext,
    value: (ctx.data as JsonMap)['name'],
    builder: (context, name) => switch (_iconNames[name]) {
      final icon? => PgIcon(
        icon,
        color: PgA2uiForeground.maybeOf(context) ?? context.pg.fg2,
      ),
      null => PgA2uiFallback(name: 'Icon "${name ?? ''}"'),
    },
  ),
);
