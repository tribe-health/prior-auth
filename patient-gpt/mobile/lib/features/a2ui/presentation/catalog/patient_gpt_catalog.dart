// TJ-ARCH-MOB-001 compliant
import 'package:flutter/widgets.dart';
import 'package:genui/genui.dart';

import 'package:patient_gpt/features/a2ui/domain/a2ui_intent.dart';
import 'package:patient_gpt/features/a2ui/presentation/catalog/pg_button_item.dart';
import 'package:patient_gpt/features/a2ui/presentation/catalog/pg_fallback.dart';
import 'package:patient_gpt/features/a2ui/presentation/catalog/pg_field_items.dart';
import 'package:patient_gpt/features/a2ui/presentation/catalog/pg_layout_items.dart';
import 'package:patient_gpt/features/a2ui/presentation/catalog/pg_official_items.dart';
import 'package:patient_gpt/features/a2ui/presentation/catalog/pg_text_items.dart';

/// The PatientGPT basic catalog, `urn:patientgpt:a2ui:catalog:basic:v1`.
///
/// Fifteen official basic components, each keeping its official name and
/// data schema and rendered by a PatientGPT widget. Image, Video and
/// AudioPlayer are not in it (no media in this build), and the `openUrl`
/// function is removed (navigation is app-owned). Clinical components are
/// not here: they belong to the UAR-registered catalog.
Catalog buildPatientGptCatalog() => PatientGptCatalog(
  Catalog(
    [
      pgText(),
      pgRow(),
      pgColumn(),
      pgList(),
      pgCard(),
      pgDivider(),
      pgButton(),
      pgTextField(),
      pgCheckBox(),
      pgChoicePicker(),
      pgDateTimeInput(),
      pgIcon(),
      pgTabs(),
      pgModal(),
      pgSlider(),
    ],
    functions: [
      for (final f in BasicFunctions.all)
        if (f.name != BasicFunctions.openUrlFunction.name) f,
    ],
    catalogId: patientGptCatalogId,
  ),
);

/// Delegates to the inner catalog, except that a component it does not
/// hold, or one whose builder throws, renders the labelled fallback instead
/// of GenUI's error card. Unknown components fail closed and say so.
@immutable
final class PatientGptCatalog implements Catalog {
  const PatientGptCatalog(this._inner);

  final Catalog _inner;

  @override
  Iterable<CatalogItem> get items => _inner.items;

  @override
  Iterable<ClientFunction> get functions => _inner.functions;

  @override
  String? get catalogId => _inner.catalogId;

  @override
  List<String> get catalogIdAliases => _inner.catalogIdAliases;

  @override
  List<String> get systemPromptFragments => _inner.systemPromptFragments;

  /// The id is always set, so the inline-catalog synthesis never applies.
  @override
  String get effectiveCatalogId => patientGptCatalogId;

  @override
  bool matchesId(String id) =>
      id == effectiveCatalogId || catalogIdAliases.contains(id);

  @override
  Widget buildWidget(CatalogItemContext itemContext) {
    final type = itemContext.type;
    if (!items.any((i) => i.name == type)) {
      return PgA2uiFallback(name: type);
    }
    try {
      return _inner.buildWidget(itemContext);
    } on Object catch (error, stack) {
      itemContext.reportError(error, stack);
      return PgA2uiFallback(name: '$type ${itemContext.id}');
    }
  }

  @override
  Catalog copyWith({
    List<CatalogItem>? newItems,
    List<ClientFunction>? newFunctions,
    String? catalogId,
    List<String>? catalogIdAliases,
    List<String>? systemPromptFragments,
  }) => PatientGptCatalog(
    _inner.copyWith(
      newItems: newItems,
      newFunctions: newFunctions,
      catalogId: catalogId,
      catalogIdAliases: catalogIdAliases,
      systemPromptFragments: systemPromptFragments,
    ),
  );

  @override
  Catalog copyWithout({
    Iterable<CatalogItem>? itemsToRemove,
    Iterable<ClientFunction>? functionsToRemove,
    String? catalogId,
    List<String>? catalogIdAliases,
    List<String>? systemPromptFragments,
  }) => PatientGptCatalog(
    _inner.copyWithout(
      itemsToRemove: itemsToRemove,
      functionsToRemove: functionsToRemove,
      catalogId: catalogId,
      catalogIdAliases: catalogIdAliases,
      systemPromptFragments: systemPromptFragments,
    ),
  );

  @override
  JsonMap toCapabilitiesJson() => _inner.toCapabilitiesJson();

  // Types are inferred from Catalog: json_schema_builder is not a direct
  // dependency of this app.
  @override
  get definition => _inner.definition;

  @override
  get fullSchema => _inner.fullSchema;
}
