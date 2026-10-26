// TJ-ARCH-MOB-001 compliant
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:genui/genui.dart';

import 'package:patient_gpt/core/theme/pg_text.dart';
import 'package:patient_gpt/core/theme/pg_theme.dart';
import 'package:patient_gpt/core/theme/tokens.dart';
import 'package:patient_gpt/features/a2ui/data/a2ui_wire.dart';
import 'package:patient_gpt/features/a2ui/domain/a2ui_intent.dart';
import 'package:patient_gpt/features/a2ui/presentation/catalog/patient_gpt_catalog.dart';
import 'package:patient_gpt/features/a2ui/presentation/providers/a2ui_providers.dart';

/// Renders A2UI v0.9.1 messages (JSON lines) through GenUI's
/// [SurfaceController] over the PatientGPT catalog.
///
/// The controller is the renderer's engine for this one stream and lives
/// with the widget that shows it, as GenUI intends. Surface actions go to
/// [_DenyingActionDelegate]: they are reported to the app as intents and
/// never reach the controller, the graph or the runtime.
class PatientGptA2uiSurface extends ConsumerStatefulWidget {
  const PatientGptA2uiSurface({required this.source, super.key});

  final String source;

  @override
  ConsumerState<PatientGptA2uiSurface> createState() => _SurfaceState();
}

class _SurfaceState extends ConsumerState<PatientGptA2uiSurface> {
  SurfaceController? _controller;
  A2uiTransportAdapter? _transport;
  final List<StreamSubscription<Object?>> _subs = [];
  List<String> _surfaceIds = const [];
  String? _failure;

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void didUpdateWidget(PatientGptA2uiSurface old) {
    super.didUpdateWidget(old);
    if (old.source != widget.source) {
      _stop();
      _start();
    }
  }

  void _start() {
    final controller = SurfaceController(catalogs: [buildPatientGptCatalog()]);
    final transport = A2uiTransportAdapter();
    _controller = controller;
    _transport = transport;
    _subs
      ..add(
        transport.incomingMessages.listen(
          controller.handleMessage,
          onError: _fail,
        ),
      )
      ..add(
        controller.surfaceUpdates.listen((_) {
          if (!mounted) return;
          setState(
            () => _surfaceIds = List.unmodifiable(controller.activeSurfaceIds),
          );
        }, onError: _fail),
      )
      // Only errors reach onSubmit: the action delegate consumes every user
      // action first. Errors are logged; the fallback is already on screen.
      ..add(
        controller.onSubmit.listen((m) {
          if (kDebugMode) debugPrint('A2UI report: ${m.parts}');
        }),
      );
    final String lines;
    try {
      lines = toGenuiLines(widget.source);
    } on FormatException catch (error) {
      _fail(error);
      return;
    }
    transport.addChunk('$lines\n');
  }

  void _fail(Object error, [StackTrace? stack]) {
    if (kDebugMode) debugPrint('A2UI surface rejected: $error');
    if (!mounted) return;
    setState(() {
      _surfaceIds = const [];
      _failure =
          'This surface was not rendered. Its messages did not '
          'match the A2UI contract.';
    });
  }

  void _stop() {
    for (final s in _subs) {
      unawaited(s.cancel());
    }
    _subs.clear();
    _transport?.dispose();
    _controller?.dispose();
    _transport = null;
    _controller = null;
    _surfaceIds = const [];
    _failure = null;
  }

  @override
  void dispose() {
    _stop();
    super.dispose();
  }

  void _report(A2uiIntent intent) =>
      ref.read(a2uiIntentLogProvider.notifier).report(intent);

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    if (_failure case final failure?) {
      return Text(
        failure,
        style: PgText.body(size: PgSizes.meta, color: c.fg2, height: 1.5),
      );
    }
    final controller = _controller;
    if (controller == null || _surfaceIds.isEmpty) {
      return const SizedBox.shrink();
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final id in _surfaceIds)
          Semantics(
            container: true,
            label: 'Agent-generated interface',
            child: Surface(
              key: ValueKey(id),
              surfaceContext: controller.contextFor(id),
              actionDelegate: _DenyingActionDelegate(_report),
            ),
          ),
      ],
    );
  }
}

/// Default deny: every user action is evaluated by [A2uiActionPolicy],
/// reported, and marked handled so GenUI never forwards it.
class _DenyingActionDelegate implements ActionDelegate {
  const _DenyingActionDelegate(this.onIntent);

  final void Function(A2uiIntent intent) onIntent;

  @override
  bool handleEvent(
    BuildContext context,
    UiEvent event,
    SurfaceContext genUiContext,
    Widget Function(SurfaceDefinition, Catalog, String, DataContext)
    buildWidget,
  ) {
    if (!event.isUserAction) return true;
    final action = UserActionEvent.fromMap(event.toMap());
    onIntent(
      A2uiActionPolicy.evaluate(
        surfaceId: genUiContext.surfaceId,
        name: action.name,
        sourceComponentId: action.sourceComponentId,
        context: Map<String, Object?>.from(action.context),
      ),
    );
    return true;
  }
}
