// TJ-ARCH-MOB-001 compliant
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:patient_gpt/core/config/transport_config.dart';
import 'package:patient_gpt/core/format/pg_dates.dart';
import 'package:patient_gpt/core/theme/pg_text.dart';
import 'package:patient_gpt/core/theme/pg_theme.dart';
import 'package:patient_gpt/core/theme/tokens.dart';
import 'package:patient_gpt/core/widgets/pg_pressable.dart';
import 'package:patient_gpt/features/conversation/presentation/providers/thread_controller.dart';
import 'package:patient_gpt/features/conversation/presentation/widgets/thread_view.dart';
import 'package:patient_gpt/features/workspace/domain/patient_directory.dart';
import 'package:patient_gpt/features/workspace/domain/patient_gpt_gateway.dart';
import 'package:patient_gpt/features/workspace/domain/workspace_entities.dart';
import 'package:patient_gpt/features/workspace/presentation/providers/workspace_providers.dart';

/// Home, all patients in scope: the greeting and "Due next". Once a message
/// is sent the conversation replaces it.
class HomeView extends ConsumerWidget {
  const HomeView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final thread = ref.watch(threadControllerProvider);
    if (thread.turns.isNotEmpty) return ThreadView(state: thread);

    final session = ref.watch(sessionProvider);
    final directory = ref.watch(patientDirectoryProvider);
    final failure = session.error ?? directory.error;
    if (failure != null) return _Unreachable(error: failure);

    final width = MediaQuery.sizeOf(context).width;
    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 40, 14, 24),
      children: [
        if (session.value case final s?) _Greeting(session: s, width: width),
        if (directory.value case final d?) ...[
          const SizedBox(height: 24),
          _DueNext(directory: d),
        ],
      ],
    );
  }
}

/// `--fs-greeting: clamp(1.75rem, 1.2rem + 2vw, 2.4rem)`, Playfair 600,
/// centred. The surgeon is addressed by honorific and surname.
class _Greeting extends StatelessWidget {
  const _Greeting({required this.session, required this.width});

  final Session session;
  final double width;

  @override
  Widget build(BuildContext context) {
    final size = (19.2 + 0.02 * width).clamp(
      PgSizes.greetingMin,
      PgSizes.greetingMax,
    );
    return Semantics(
      header: true,
      child: Text(
        'Which case first, ${addressOf(session.principal.displayName)}?',
        textAlign: TextAlign.center,
        style: PgText.display(size: size, color: context.pg.fg),
      ),
    );
  }
}

/// `Dr. K. James` → `Dr. James`. A name without an honorific is used whole.
String addressOf(String displayName) {
  final parts = displayName
      .split(RegExp(r'\s+'))
      .where((w) => w.isNotEmpty)
      .toList();
  if (parts.length > 1 && parts.first.endsWith('.') && parts.first.length > 2) {
    return '${parts.first} ${parts.last}';
  }
  return displayName;
}

class _DueNext extends StatelessWidget {
  const _DueNext({required this.directory});

  final PatientDirectory directory;

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    final today = PgDates.today();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child: Text(
            'Due next',
            style: PgText.body(
              size: PgSizes.ui,
              weight: 700,
              color: c.fg2,
              height: 1.4,
            ),
          ),
        ),
        const SizedBox(height: 8),
        for (final id in directory.dueNextOrder)
          if (directory.cases[id] case final k?)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: _QueueRow(
                patientName: directory.patients[k.patientId]?.displayName ?? '',
                summary: k,
                today: today,
              ),
            ),
      ],
    );
  }
}

/// `.q-row` at phone width: one column on --s1, radius 8.
class _QueueRow extends StatelessWidget {
  const _QueueRow({
    required this.patientName,
    required this.summary,
    required this.today,
  });

  final String patientName;
  final CaseSummary summary;
  final CalendarDate today;

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    final due = summary.due;
    final soon = due != null && PgDates.isSoon(due, today);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: c.s1,
        borderRadius: BorderRadius.circular(PgRadius.rLg),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(patientName, style: PgText.body(weight: 700, color: c.fg)),
            Text(
              summary.procedure,
              style: PgText.body(size: PgSizes.ui, color: c.fg2, height: 1.5),
            ),
            if (due != null) ...[
              const SizedBox(height: 4),
              Text(
                PgDates.dueText(due, today),
                style: PgText.mono(
                  color: soon ? c.accent : c.fg2,
                  weight: soon ? 500 : 400,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// The service is down or answered outside the contract. Says so plainly,
/// with the address it tried; shows no stand-in data.
class _Unreachable extends ConsumerWidget {
  const _Unreachable({required this.error});

  final Object error;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.pg;
    final detail = switch (error) {
      GatewayUnavailable(:final detail) => detail,
      GatewayContractViolation(:final detail) =>
        'The reply did not match the contract: $detail',
      _ => '$error',
    };
    final where = switch (error) {
      GatewayUnavailable(:final endpoint) => endpoint,
      _ => patientGptTransport.endpoint,
    };
    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 40, 14, 24),
      children: [
        Semantics(
          header: true,
          child: Text(
            'PatientGPT cannot reach its service.',
            textAlign: TextAlign.center,
            style: PgText.display(size: PgSizes.titleMin, color: c.fg),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'No patients or cases are shown. Nothing was read from the chart.',
          textAlign: TextAlign.center,
          style: PgText.body(size: PgSizes.ui, color: c.fg2, height: 1.5),
        ),
        const SizedBox(height: 16),
        Text(
          '$where · $detail',
          textAlign: TextAlign.center,
          style: PgText.mono(color: c.fg2),
        ),
        const SizedBox(height: 20),
        Center(
          child: PgPressable(
            onTap: () {
              ref
                ..invalidate(sessionProvider)
                ..invalidate(patientDirectoryProvider)
                ..invalidate(conversationsProvider);
            },
            background: c.s3,
            hoverBackground: c.s4,
            radius: PgRadius.r,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            builder: (context, fg) => Center(
              widthFactor: 1,
              child: Text(
                'Try again',
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
      ],
    );
  }
}
