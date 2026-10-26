// TJ-ARCH-MOB-001 compliant
import 'package:flutter/material.dart';
import 'package:genui/genui.dart';
import 'package:json_schema_builder/json_schema_builder.dart';

import 'package:patient_gpt/core/theme/pg_text.dart';
import 'package:patient_gpt/core/theme/pg_theme.dart';
import 'package:patient_gpt/core/theme/tokens.dart';
import 'package:patient_gpt/core/widgets/pg_pressable.dart';
import 'package:patient_gpt/features/a2ui/presentation/catalog/pg_foreground.dart';

/// Slider keeps the official widget builder (behaviour, data binding,
/// validation) and is restyled through a token theme.
CatalogItem pgSlider() => _restyled(BasicCatalogItems.slider);

/// Tabs on the official v0.9.1 schema (`tabs: [{title, child}]`), drawn as
/// the prototype's `.tab` (surfaces.css): `--s3` fill, `--fg` fill with
/// `--bg` text at weight 700 when selected. Material's TabBar cannot fill
/// unselected tabs, so this replaces the official builder; web draws the
/// same rule (web/src/features/a2ui/presentation/catalog/a2ui.css).
CatalogItem pgTabs() => CatalogItem(
  name: BasicCatalogItems.tabs.name,
  dataSchema: S.object(
    properties: {
      'tabs': S.list(
        items: S.object(
          properties: {
            'title': A2uiSchemas.stringReference(),
            'child': A2uiSchemas.componentReference(),
          },
          required: ['title', 'child'],
        ),
      ),
    },
    required: ['tabs'],
  ),
  widgetBuilder: (ctx) {
    final raw = (ctx.data as JsonMap)['tabs'];
    final tabs = raw is List ? raw.whereType<JsonMap>().toList() : <JsonMap>[];
    return _PgTabs(tabs: tabs, itemContext: ctx);
  },
);

class _PgTabs extends StatefulWidget {
  const _PgTabs({required this.tabs, required this.itemContext});

  final List<JsonMap> tabs;
  final CatalogItemContext itemContext;

  @override
  State<_PgTabs> createState() => _PgTabsState();
}

class _PgTabsState extends State<_PgTabs> {
  int _selected = 0;

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    final tabs = widget.tabs;
    if (tabs.isEmpty) return const SizedBox.shrink();
    final current = _selected.clamp(0, tabs.length - 1);
    final child = tabs[current]['child'];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      spacing: 10,
      children: [
        Wrap(
          spacing: 4,
          runSpacing: 4,
          children: [
            for (var i = 0; i < tabs.length; i++)
              BoundString(
                dataContext: widget.itemContext.dataContext,
                value: tabs[i]['title'],
                builder: (context, title) {
                  final selected = i == current;
                  return Semantics(
                    selected: selected,
                    child: PgPressable(
                      onTap: () => setState(() => _selected = i),
                      semanticLabel: title ?? '',
                      background: selected ? c.fg : c.s3,
                      hoverBackground: selected ? c.fg : c.s4,
                      foreground: selected ? c.bg : c.fg,
                      radius: PgRadius.r,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      builder: (context, fg) => Center(
                        widthFactor: 1,
                        child: Text(
                          title ?? '',
                          style: PgText.body(
                            size: PgSizes.meta,
                            weight: selected ? 700 : 600,
                            color: fg,
                            height: 1.2,
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
          ],
        ),
        if (child is String) widget.itemContext.buildChild(child),
      ],
    );
  }
}

CatalogItem _restyled(CatalogItem official) => CatalogItem(
  name: official.name,
  dataSchema: official.dataSchema,
  isImplicitlyFlexible: official.isImplicitlyFlexible,
  widgetBuilder: (ctx) => Builder(
    builder: (context) =>
        Theme(data: _surfaceTheme(context), child: official.widgetBuilder(ctx)),
  ),
);

ThemeData _surfaceTheme(BuildContext context) {
  final c = context.pg;
  final theme = Theme.of(context);
  return theme.copyWith(
    textTheme: theme.textTheme.copyWith(
      titleSmall: PgText.body(size: PgSizes.meta, weight: 700, color: c.fg2),
      bodyMedium: PgText.body(size: PgSizes.ui, color: c.fg),
    ),
    sliderTheme: SliderThemeData(
      activeTrackColor: c.primaryBg,
      inactiveTrackColor: c.s3,
      thumbColor: c.primaryBg,
      overlayColor: Colors.transparent,
      activeTickMarkColor: Colors.transparent,
      inactiveTickMarkColor: Colors.transparent,
      valueIndicatorColor: c.inv,
      valueIndicatorTextStyle: PgText.mono(color: c.invFg),
    ),
  );
}

/// Modal: the trigger is a `.btn.ghost`; the content opens in a bottom
/// sheet on --bg over the --scrim, with no elevation or shadow.
CatalogItem pgModal() => CatalogItem(
  name: BasicCatalogItems.modal.name,
  dataSchema: BasicCatalogItems.modal.dataSchema,
  widgetBuilder: (ctx) {
    final data = ctx.data as JsonMap;
    final trigger = data['trigger'];
    final content = data['content'];
    if (trigger is! String || content is! String) {
      throw ArgumentError('Modal needs trigger and content ids');
    }
    return Builder(
      builder: (context) {
        final c = context.pg;
        return Align(
          alignment: AlignmentDirectional.centerStart,
          widthFactor: 1,
          child: PgPressable(
            onTap: () => showModalBottomSheet<void>(
              context: ctx.buildContext,
              backgroundColor: c.bg,
              barrierColor: c.scrim,
              elevation: 0,
              shape: const RoundedRectangleBorder(
                borderRadius: BorderRadius.vertical(
                  top: Radius.circular(PgRadius.rLg),
                ),
              ),
              builder: (sheet) => SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: ctx.buildChild(content),
                ),
              ),
            ),
            background: c.s3,
            hoverBackground: c.s4,
            radius: PgRadius.r,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            builder: (context, fg) => PgA2uiForeground(
              color: fg,
              child: Center(widthFactor: 1, child: ctx.buildChild(trigger)),
            ),
          ),
        );
      },
    );
  },
);
