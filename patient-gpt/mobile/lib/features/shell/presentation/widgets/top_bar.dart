// TJ-ARCH-MOB-001 compliant
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:patient_gpt/core/theme/pg_text.dart';
import 'package:patient_gpt/core/theme/pg_theme.dart';
import 'package:patient_gpt/core/widgets/pg_icon.dart';
import 'package:patient_gpt/core/widgets/pg_pressable.dart';
import 'package:patient_gpt/features/conversation/presentation/providers/thread_controller.dart';

/// `.topbar`: 52 high. Sidebar button (phone, or a collapsed sidebar), the
/// context control, and New chat.
class TopBar extends ConsumerWidget {
  const TopBar({required this.onOpenSidebar, super.key});

  /// Null when the sidebar is already in view.
  final VoidCallback? onOpenSidebar;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.pg;
    final open = onOpenSidebar;
    return SizedBox(
      height: 52,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6),
        child: Row(
          children: [
            if (open != null) ...[
              PgIconButton(
                label: 'Open sidebar',
                onTap: open,
                icon: (fg) => PgIcon(PgIconName.panel, color: fg),
              ),
              const SizedBox(width: 4),
            ],
            Expanded(
              child: Align(
                alignment: Alignment.centerLeft,
                // The context menu needs the patient and case views, which
                // this scaffold does not build yet; drawn disabled.
                child: PgPressable(
                  onTap: null,
                  semanticLabel: 'Context: all patients. Change context',
                  hoverBackground: c.s2,
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  builder: (context, fg) => Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Text(
                          'All patients',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: PgText.body(
                            weight: 700,
                            color: fg,
                            height: 1.4,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      PgIcon(PgIconName.chevDown, color: c.fg2, size: 16),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(width: 4),
            PgIconButton(
              label: 'New chat',
              onTap: () => ref.read(threadControllerProvider.notifier).reset(),
              icon: (fg) => PgIcon(PgIconName.edit, color: fg),
            ),
          ],
        ),
      ),
    );
  }
}
