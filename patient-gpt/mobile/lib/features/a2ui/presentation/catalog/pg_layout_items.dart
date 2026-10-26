// TJ-ARCH-MOB-001 compliant
import 'package:flutter/widgets.dart';
import 'package:genui/genui.dart';

import 'package:patient_gpt/core/theme/pg_theme.dart';
import 'package:patient_gpt/core/theme/tokens.dart';

/// `--od-gap` rhythm for surface layout (thread.css and surfaces.css use 8
/// between stacked items).
const double _gap = 8;

/// Row, Column, List: the official names, schemas and child/template
/// semantics, with the prototype's gap. Layout only; no fill.
CatalogItem pgRow() => CatalogItem(
  name: BasicCatalogItems.row.name,
  dataSchema: BasicCatalogItems.row.dataSchema,
  widgetBuilder: (ctx) => _flex(ctx, Axis.horizontal, scroll: false),
);

CatalogItem pgColumn() => CatalogItem(
  name: BasicCatalogItems.column.name,
  dataSchema: BasicCatalogItems.column.dataSchema,
  widgetBuilder: (ctx) => _flex(ctx, Axis.vertical, scroll: false),
);

CatalogItem pgList() => CatalogItem(
  name: BasicCatalogItems.list.name,
  dataSchema: BasicCatalogItems.list.dataSchema,
  isImplicitlyFlexible: true,
  widgetBuilder: (ctx) {
    final data = ctx.data as JsonMap;
    final axis = data['direction'] == 'horizontal'
        ? Axis.horizontal
        : Axis.vertical;
    return _flex(ctx, axis, scroll: true);
  },
);

/// Card: a `surfaces.css` surface. `--s1` fill, `--r-lg`, no border or
/// shadow.
CatalogItem pgCard() => CatalogItem(
  name: BasicCatalogItems.card.name,
  dataSchema: BasicCatalogItems.card.dataSchema,
  widgetBuilder: (ctx) {
    final child = (ctx.data as JsonMap)['child'];
    if (child is! String) throw ArgumentError('Card needs a child id');
    return Builder(
      builder: (context) => DecoratedBox(
        decoration: BoxDecoration(
          color: context.pg.s1,
          borderRadius: BorderRadius.circular(PgRadius.rLg),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: ctx.buildChild(child),
        ),
      ),
    );
  },
);

/// Divider: Flat 2.0 has no rules, so separation is space alone.
CatalogItem pgDivider() => CatalogItem(
  name: BasicCatalogItems.divider.name,
  dataSchema: BasicCatalogItems.divider.dataSchema,
  widgetBuilder: (ctx) => (ctx.data as JsonMap)['axis'] == 'vertical'
      ? const SizedBox(width: 16)
      : const SizedBox(height: 16),
);

MainAxisAlignment _main(Object? v) => switch (v) {
  'center' => MainAxisAlignment.center,
  'end' => MainAxisAlignment.end,
  'spaceBetween' => MainAxisAlignment.spaceBetween,
  'spaceAround' => MainAxisAlignment.spaceAround,
  'spaceEvenly' => MainAxisAlignment.spaceEvenly,
  _ => MainAxisAlignment.start,
};

CrossAxisAlignment _cross(Object? v) => switch (v) {
  'center' => CrossAxisAlignment.center,
  'end' => CrossAxisAlignment.end,
  'stretch' => CrossAxisAlignment.stretch,
  _ => CrossAxisAlignment.start,
};

bool _flexes(CatalogItemContext ctx, String id) {
  final component = ctx.getComponent(id);
  return component?.properties['weight'] is int ||
      (ctx.getCatalogItem(component?.type ?? '')?.isImplicitlyFlexible ??
          false);
}

Widget _weighted(
  CatalogItemContext ctx,
  String id,
  DataContext dataContext, {
  Key? key,
}) {
  final component = ctx.getComponent(id);
  final explicit = component?.properties['weight'];
  final implicit =
      ctx.getCatalogItem(component?.type ?? '')?.isImplicitlyFlexible ?? false;
  final weight = explicit is int ? explicit : (implicit ? 1 : null);
  return buildWeightedChild(
    componentId: id,
    dataContext: dataContext,
    buildChild: ctx.buildChild,
    weight: weight,
    flexFit: explicit is int ? FlexFit.tight : FlexFit.loose,
    key: key,
  );
}

Widget _flex(CatalogItemContext ctx, Axis axis, {required bool scroll}) {
  final data = ctx.data as JsonMap;
  Widget lay(List<Widget> children) {
    final flex = Flex(
      direction: axis,
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: scroll
          ? MainAxisAlignment.start
          : _main(data['justify']),
      crossAxisAlignment: _cross(data['align']),
      spacing: _gap,
      children: children,
    );
    return scroll
        ? SingleChildScrollView(scrollDirection: axis, child: flex)
        : flex;
  }

  return ComponentChildrenBuilder(
    childrenData: data['children'],
    dataContext: ctx.dataContext,
    buildChild: ctx.buildChild,
    getComponent: ctx.getComponent,
    explicitListBuilder: (ids, buildChild, getComponent, dataContext) {
      // A Row with no weighted or flexible child wraps at phone width, as
      // the prototype's action rows do, instead of overflowing.
      if (axis == Axis.horizontal &&
          !scroll &&
          !ids.any((id) => _flexes(ctx, id))) {
        return Wrap(
          spacing: _gap,
          runSpacing: _gap,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [for (final id in ids) buildChild(id, dataContext)],
        );
      }
      return lay([
        for (final id in ids)
          scroll
              ? buildChild(id, dataContext)
              : _weighted(ctx, id, dataContext),
      ]);
    },
    templateListWidgetBuilder: (context, value, componentId, path) {
      final List<String> keys = switch (value) {
        final List<Object?> l => [for (var i = 0; i < l.length; i++) '$i'],
        final Map<Object?, Object?> m => [for (final k in m.keys) '$k'],
        _ => const [],
      };
      return lay([
        for (final k in keys)
          scroll
              ? KeyedSubtree(
                  key: ValueKey(k),
                  child: ctx.buildChild(
                    componentId,
                    ctx.dataContext.nested(DataPath('$path/$k')),
                  ),
                )
              : _weighted(
                  ctx,
                  componentId,
                  ctx.dataContext.nested(DataPath('$path/$k')),
                  key: ValueKey(k),
                ),
      ]);
    },
  );
}
