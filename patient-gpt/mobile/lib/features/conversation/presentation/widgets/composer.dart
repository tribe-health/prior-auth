// TJ-ARCH-MOB-001 compliant
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:patient_gpt/core/theme/pg_text.dart';
import 'package:patient_gpt/core/theme/pg_theme.dart';
import 'package:patient_gpt/core/theme/tokens.dart';
import 'package:patient_gpt/core/widgets/pg_icon.dart';
import 'package:patient_gpt/core/widgets/pg_menu.dart';
import 'package:patient_gpt/core/widgets/pg_pressable.dart';
import 'package:patient_gpt/features/conversation/presentation/providers/thread_controller.dart';

/// Suggested prompts for the all-patients scope (flows.js `promptsFor`).
const _globalPrompts = [
  'What’s due this week?',
  'What’s waiting on me?',
  'Who is missing a lab result?',
];

/// The dock: suggested prompts, the navy composer (radius 24), and the
/// disclaimer. Docked at the bottom on phones, above the safe area.
class ComposerDock extends ConsumerStatefulWidget {
  const ComposerDock({super.key});

  @override
  ConsumerState<ComposerDock> createState() => _ComposerDockState();
}

class _ComposerDockState extends ConsumerState<ComposerDock> {
  final _input = TextEditingController();
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _input.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _send() {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    _input.clear();
    ref.read(threadControllerProvider.notifier).send(text);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    final busy = ref.watch(threadControllerProvider.select((s) => s.busy));
    final bottom = MediaQuery.paddingOf(context).bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(10, 0, 10, 10 + bottom),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: PgLayout.col),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (!busy) ...[
                _Chips(
                  onPick: (label) =>
                      ref.read(threadControllerProvider.notifier).send(label),
                ),
                const SizedBox(height: 8),
              ],
              _field(c, busy),
              const SizedBox(height: 8),
              Text(
                'Synthetic demo data. The assistant drafts and cites. '
                'The surgeon decides.',
                textAlign: TextAlign.center,
                style: PgText.body(
                  size: PgSizes.mono,
                  color: c.fg2,
                  height: 1.5,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _field(PgColors c, bool busy) {
    final focused = _focus.hasFocus;
    return AnimatedContainer(
      duration: PgMotion.enter,
      curve: PgMotion.ease,
      padding: const EdgeInsets.fromLTRB(14, 10, 10, 8),
      decoration: BoxDecoration(
        color: focused ? c.fieldFocus : c.field,
        borderRadius: BorderRadius.circular(PgRadius.rComposer),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            label: 'Message',
            textField: true,
            child: TextField(
              controller: _input,
              focusNode: _focus,
              minLines: 1,
              maxLines: 6,
              keyboardType: TextInputType.multiline,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _send(),
              onChanged: (_) => setState(() {}),
              cursorColor: c.fieldFg,
              style: PgText.body(color: c.fieldFg, height: 1.5),
              decoration: InputDecoration(
                isCollapsed: true,
                contentPadding: const EdgeInsets.fromLTRB(6, 6, 6, 2),
                border: InputBorder.none,
                hintText: 'Ask about any patient or case',
                hintStyle: PgText.body(color: c.fieldPh, height: 1.5),
              ),
            ),
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              PgMenu(
                semanticLabel: 'Attach',
                entries: const [
                  PgMenuNote(
                    'Set a case as the context to attach a chart document.',
                  ),
                ],
                builder: (context, toggle, isOpen) => PgIconButton(
                  label: 'Attach a chart document',
                  round: true,
                  color: c.fieldFg,
                  hoverBackground: c.fieldHover,
                  focusBackground: c.fieldFg,
                  focusForeground: c.field,
                  onTap: toggle,
                  icon: (fg) => PgIcon(PgIconName.plus, color: fg),
                ),
              ),
              const Spacer(),
              _sendButton(c, busy),
            ],
          ),
        ],
      ),
    );
  }

  Widget _sendButton(PgColors c, bool busy) {
    final canSend = busy || _input.text.trim().isNotEmpty;
    return PgIconButton(
      label: busy ? 'Stop the assistant' : 'Send message',
      round: true,
      color: canSend ? c.field : c.fieldPh,
      background: canSend ? c.fieldFg : c.fieldDim,
      hoverBackground: canSend ? c.fieldFg : c.fieldDim,
      focusBackground: c.primaryBg,
      focusForeground: c.primaryFg,
      onTap: !canSend
          ? null
          : busy
          ? () => ref.read(threadControllerProvider.notifier).stop()
          : _send,
      icon: (fg) => PgIcon(busy ? PgIconName.stop : PgIconName.up, color: fg),
    );
  }
}

class _Chips extends StatelessWidget {
  const _Chips({required this.onPick});

  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    return Semantics(
      container: true,
      label: 'Suggested prompts',
      child: SizedBox(
        height: 44,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: _globalPrompts.length,
          separatorBuilder: (_, _) => const SizedBox(width: 8),
          itemBuilder: (context, i) => PgPressable(
            onTap: () => onPick(_globalPrompts[i]),
            background: c.s2,
            hoverBackground: c.s3,
            radius: 22,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            builder: (context, fg) => Center(
              child: Text(
                _globalPrompts[i],
                style: PgText.body(size: PgSizes.ui, color: fg, height: 1.2),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
