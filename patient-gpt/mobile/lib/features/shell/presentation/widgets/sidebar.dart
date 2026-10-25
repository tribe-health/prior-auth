// TJ-ARCH-MOB-001 compliant
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:patient_gpt/core/format/pg_dates.dart';
import 'package:patient_gpt/core/theme/pg_text.dart';
import 'package:patient_gpt/core/theme/pg_theme.dart';
import 'package:patient_gpt/core/theme/theme_mode_controller.dart';
import 'package:patient_gpt/core/theme/tokens.dart';
import 'package:patient_gpt/core/widgets/brand_mark.dart';
import 'package:patient_gpt/core/widgets/pg_icon.dart';
import 'package:patient_gpt/core/widgets/pg_menu.dart';
import 'package:patient_gpt/core/widgets/pg_pressable.dart';
import 'package:patient_gpt/features/conversation/presentation/providers/thread_controller.dart';
import 'package:patient_gpt/features/shell/presentation/providers/sidebar_expansion.dart';
import 'package:patient_gpt/features/workspace/domain/patient_directory.dart';
import 'package:patient_gpt/features/workspace/domain/workspace_entities.dart';
import 'package:patient_gpt/features/workspace/presentation/providers/workspace_providers.dart';

/// The sidebar of patient-chat.html: brand, workspace nav, Patients (each
/// opening to Cases and Patient history), History, and the account footer.
/// Fill --s1, padding 8, no rules between regions.
class Sidebar extends ConsumerWidget {
  const Sidebar({required this.onClose, super.key});

  /// Closes the drawer (phone) or collapses the sidebar (wide).
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.pg;
    return ColoredBox(
      color: c.s1,
      child: SafeArea(
        right: false,
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _Head(onClose: onClose),
              const SizedBox(height: 8),
              _NavItem(
                icon: PgIconName.edit,
                label: 'New chat',
                onTap: () {
                  ref.read(threadControllerProvider.notifier).reset();
                  onClose();
                },
              ),
              const SizedBox(height: 2),
              // Search is not built in this scaffold; drawn disabled.
              const _NavItem(
                icon: PgIconName.search,
                label: 'Search',
                onTap: null,
              ),
              const SizedBox(height: 12),
              const Expanded(child: _Lists()),
              const SizedBox(height: 8),
              const _Foot(),
            ],
          ),
        ),
      ),
    );
  }
}

class _Head extends StatelessWidget {
  const _Head({required this.onClose});

  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    return SizedBox(
      height: 44,
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              header: true,
              label: 'PatientGPT, Advanced Spine & Orthopedics',
              excludeSemantics: true,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: Row(
                  children: [
                    const BrandMark(),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        'PatientGPT',
                        overflow: TextOverflow.ellipsis,
                        maxLines: 1,
                        style: PgText.body(
                          size: PgSizes.ui,
                          weight: 700,
                          color: c.fg,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(width: 4),
          PgIconButton(
            label: 'Close sidebar',
            onTap: onClose,
            icon: (fg) => PgIcon(PgIconName.panel, color: fg),
          ),
        ],
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({required this.icon, required this.label, this.onTap});

  final PgIconName icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    return PgPressable(
      onTap: onTap,
      hoverBackground: c.s2,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      builder: (context, fg) => Row(
        children: [
          PgIcon(icon, color: onTap == null ? c.fg2 : fg),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: PgText.body(
                size: PgSizes.ui,
                color: onTap == null ? c.fg2 : fg,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      header: true,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 4, 10, 6),
        child: Text(
          text,
          style: PgText.body(
            size: PgSizes.meta,
            weight: 700,
            color: context.pg.fg2,
            height: 1.4,
          ),
        ),
      ),
    );
  }
}

class _SubLabel extends StatelessWidget {
  const _SubLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 2),
      child: Text(
        text.toUpperCase(),
        style: PgText.mono(color: context.pg.fg2, letterSpacingEm: 0.06),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 4, 10, 6),
      child: Text(
        text,
        style: PgText.body(
          size: PgSizes.meta,
          color: context.pg.fg2,
          height: 1.5,
        ),
      ),
    );
  }
}

class _Lists extends ConsumerWidget {
  const _Lists();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final directory = ref.watch(patientDirectoryProvider);
    final history = ref.watch(conversationsProvider(const AllPatientsScope()));
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        const _Label('Patients'),
        ...switch (directory) {
          AsyncData(:final value) => [
            for (final id in value.patientOrder)
              _PatientNode(directory: value, patientId: id),
          ],
          AsyncError() => const [
            _Empty('Patients could not be loaded from the service.'),
          ],
          AsyncLoading() => const <Widget>[],
        },
        const SizedBox(height: 16),
        const _Label('History'),
        ...switch (history) {
          AsyncData(:final value) when value.isEmpty => const [
            _Empty('Chats with no patient selected appear here.'),
          ],
          AsyncData(:final value) => [
            for (final conv in value) _HistoryRow(conversation: conv),
          ],
          AsyncError() => const [
            _Empty('History could not be loaded from the service.'),
          ],
          AsyncLoading() => const <Widget>[],
        },
        const SizedBox(height: 16),
      ],
    );
  }
}

/// A patient row: disclosure chevron, then the patient's name and nearest
/// deadline. Opening it shows Cases and Patient history.
class _PatientNode extends ConsumerWidget {
  const _PatientNode({required this.directory, required this.patientId});

  final PatientDirectory directory;
  final String patientId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.pg;
    final p = directory.patients[patientId];
    if (p == null) return const SizedBox.shrink();
    final overrides = ref.watch(sidebarExpansionProvider);
    final isOpen =
        overrides[patientId] ?? patientId == directory.firstDuePatientId;
    final due = directory.nearestDue(patientId);

    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              SizedBox(
                width: 28,
                height: 44,
                child: PgPressable(
                  semanticLabel:
                      '${isOpen ? 'Collapse' : 'Expand'} '
                      '${p.displayName}',
                  expanded: isOpen,
                  foreground: c.fg2,
                  hoverBackground: c.s2,
                  onTap: () => ref
                      .read(sidebarExpansionProvider.notifier)
                      .toggle(patientId, isOpen: isOpen),
                  builder: (context, fg) => Center(
                    child: PgIcon(
                      isOpen ? PgIconName.chevDown : PgIconName.chevRight,
                      color: fg,
                      size: 16,
                    ),
                  ),
                ),
              ),
              Expanded(
                child: _Row(
                  padding: const EdgeInsets.fromLTRB(4, 0, 10, 0),
                  children: [
                    Expanded(child: _ellipsis(p.displayName, c.fg)),
                    if (due != null) ...[
                      const SizedBox(width: 8),
                      Text(
                        PgDates.short(due),
                        style: PgText.mono(color: c.fg2),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          if (isOpen) _PatientSub(directory: directory, patient: p),
        ],
      ),
    );
  }
}

class _PatientSub extends ConsumerWidget {
  const _PatientSub({required this.directory, required this.patient});

  final PatientDirectory directory;
  final PatientSummary patient;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.pg;
    final history = ref.watch(conversationsProvider(PatientScope(patient.id)));
    return Padding(
      padding: const EdgeInsets.only(left: 28, bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _SubLabel('Cases'),
          for (final id in patient.caseIds)
            if (directory.cases[id] case final k?)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: _Row(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 7,
                  ),
                  children: [
                    Expanded(child: _ellipsis(k.procedure, c.fg)),
                    if (k.due case final d?) ...[
                      const SizedBox(width: 8),
                      Text(
                        PgDates.short(d.date),
                        style: PgText.mono(color: c.fg2),
                      ),
                    ],
                  ],
                ),
              ),
          const _SubLabel('Patient history'),
          ...switch (history) {
            AsyncData(:final value) when value.isEmpty => const [
              _Empty('No patient-level chats yet.'),
            ],
            AsyncData(:final value) => [
              for (final conv in value) _HistoryRow(conversation: conv),
            ],
            AsyncError() => const [
              _Empty('History could not be loaded from the service.'),
            ],
            AsyncLoading() => const <Widget>[],
          },
        ],
      ),
    );
  }
}

class _HistoryRow extends StatelessWidget {
  const _HistoryRow({required this.conversation});

  final ConversationSummary conversation;

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: _Row(
        padding: const EdgeInsets.symmetric(horizontal: 10),
        children: [
          Expanded(child: _ellipsis(conversation.title, c.fg)),
          const SizedBox(width: 8),
          Text(
            PgDates.historyWhen(conversation.updatedAt, PgDates.today()),
            style: PgText.mono(color: c.fg2),
          ),
        ],
      ),
    );
  }
}

/// A sidebar row at touch height. Rows whose destination view is not built
/// in this scaffold are drawn without an affordance rather than as dead
/// buttons.
class _Row extends StatelessWidget {
  const _Row({required this.children, required this.padding});

  final List<Widget> children;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 44),
      child: Padding(
        padding: padding,
        child: Row(children: children),
      ),
    );
  }
}

Widget _ellipsis(String text, Color color) => Text(
  text,
  maxLines: 1,
  overflow: TextOverflow.ellipsis,
  style: PgText.body(size: PgSizes.ui, color: color, height: 1.4),
);

class _Foot extends ConsumerWidget {
  const _Foot();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.pg;
    final session = ref.watch(sessionProvider);
    final principal = session.value?.principal;
    if (principal == null) return const SizedBox(height: 44);
    final brightness = Theme.of(context).brightness;
    final dark = brightness == Brightness.dark;
    final name = principal.displayName;
    final role = principal.role.label;

    return PgMenu(
      semanticLabel: 'Account',
      entries: [
        PgMenuAction(
          icon: dark ? PgIconName.sun : PgIconName.moon,
          label: dark ? 'Switch to light theme' : 'Switch to dark theme',
          onSelect: () => ref
              .read(themeModeControllerProvider.notifier)
              .toggleFrom(brightness),
        ),
        PgMenuNote(
          'Signed in as $name, ${role.toLowerCase()}. '
          'Synthetic demo data only.',
        ),
      ],
      builder: (context, toggle, isOpen) => PgPressable(
        semanticLabel: 'Account: $name, ${role.toLowerCase()}',
        expanded: isOpen,
        hoverBackground: c.s2,
        onTap: toggle,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        builder: (context, fg) => Row(
          children: [
            Container(
              width: 28,
              height: 28,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: c.field, shape: BoxShape.circle),
              child: Text(
                initialsOf(name),
                style: PgText.body(
                  size: PgSizes.mono,
                  weight: 700,
                  color: c.fieldFg,
                  height: 1,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    name,
                    style: PgText.body(
                      size: PgSizes.ui,
                      weight: 700,
                      color: fg,
                      height: 1.4,
                    ),
                  ),
                  Text(
                    role,
                    style: PgText.body(
                      size: PgSizes.meta,
                      color: fg == c.fg ? c.fg2 : fg,
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// `Dr. K. James` → `KJ`: the initials of the name without its honorific.
String initialsOf(String displayName) {
  final parts = displayName
      .split(RegExp(r'\s+'))
      .where((w) => w.isNotEmpty)
      .toList();
  if (parts.length > 1 && parts.first.endsWith('.') && parts.first.length > 2) {
    parts.removeAt(0);
  }
  return parts.map((w) => w[0].toUpperCase()).take(2).join();
}
