// TJ-ARCH-MOB-001 compliant
import 'package:flutter/widgets.dart';
import 'package:genui/genui.dart';

/// Names an action this catalog will not wire, or null when it is one of
/// the two it does: an `event` (reported to the app as an intent) or the
/// `closeModal` function. Every other function call, `openUrl` included,
/// renders as a labelled fallback instead of a working control.
String? unsupportedAction(Object? action) {
  if (action is! Map) return 'action without a definition';
  if (action['event'] case {'name': final String _}) return null;
  if (action['functionCall'] case {'call': final String call}) {
    return call == 'closeModal' ? null : 'action "$call"';
  }
  return 'action without an event';
}

/// Runs an action that [unsupportedAction] accepted. An event is resolved
/// against the data model and dispatched; the surface's action delegate
/// decides what happens next (in this build: it is reported and denied).
Future<void> runA2uiAction(CatalogItemContext ctx, JsonMap action) async {
  if (action['event'] case {'name': final String name} && final event) {
    final contextDefinition = event['context'];
    final resolved = await resolveContext(
      ctx.dataContext,
      contextDefinition is JsonMap ? contextDefinition : null,
    );
    ctx.dispatchEvent(
      UserActionEvent(name: name, sourceComponentId: ctx.id, context: resolved),
    );
    return;
  }
  if (action['functionCall'] case {'call': 'closeModal'}) {
    final context = ctx.buildContext;
    if (context.mounted) Navigator.of(context).maybePop();
  }
}
