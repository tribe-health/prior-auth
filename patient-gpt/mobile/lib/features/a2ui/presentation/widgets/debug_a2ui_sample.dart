// TJ-ARCH-MOB-001 compliant
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:patient_gpt/core/theme/pg_text.dart';
import 'package:patient_gpt/core/theme/pg_theme.dart';
import 'package:patient_gpt/core/theme/tokens.dart';
import 'package:patient_gpt/core/widgets/pg_pressable.dart';
import 'package:patient_gpt/features/a2ui/data/sample_surface.dart';
import 'package:patient_gpt/features/a2ui/presentation/providers/a2ui_providers.dart';
import 'package:patient_gpt/features/a2ui/presentation/widgets/patient_gpt_a2ui_surface.dart';

/// Debug builds only: a control in the thread that opens the sample A2UI
/// surface, and the intents its actions reported. Renders nothing in a
/// release or profile build; `kDebugMode` is a compile-time constant, so the
/// sample is tree-shaken out of release.
class DebugA2uiSample extends ConsumerWidget {
  const DebugA2uiSample({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!kDebugMode) return const SizedBox.shrink();
    final c = context.pg;
    final open = ref.watch(a2uiSampleOpenProvider);
    final intents = ref.watch(a2uiIntentLogProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: PgPressable(
            onTap: () => ref.read(a2uiSampleOpenProvider.notifier).toggle(),
            expanded: open,
            background: c.s2,
            hoverBackground: c.s3,
            radius: PgRadius.r,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            builder: (context, fg) => Center(
              widthFactor: 1,
              child: Text(
                open
                    ? 'Hide A2UI sample (debug build)'
                    : 'Show A2UI sample (debug build)',
                style: PgText.body(
                  size: PgSizes.ui,
                  weight: 700,
                  color: fg,
                  height: 1.2,
                ),
              ),
            ),
          ),
        ),
        if (open) ...[
          const SizedBox(height: 12),
          PatientGptA2uiSurface(source: a2uiSampleSource),
          const SizedBox(height: 12),
          Semantics(
            liveRegion: true,
            child: Text(
              intents.isEmpty
                  ? 'No surface actions reported yet.'
                  : 'Reported to the app, not applied: '
                        '${intents.last.name}. ${intents.last.reason}',
              style: PgText.body(size: PgSizes.meta, color: c.fg2, height: 1.5),
            ),
          ),
        ],
      ],
    );
  }
}
