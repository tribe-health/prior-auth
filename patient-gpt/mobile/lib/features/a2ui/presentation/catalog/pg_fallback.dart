// TJ-ARCH-MOB-001 compliant
import 'package:flutter/widgets.dart';

import 'package:patient_gpt/core/theme/pg_text.dart';
import 'package:patient_gpt/core/theme/pg_theme.dart';
import 'package:patient_gpt/core/theme/tokens.dart';

/// Fail-closed stand-in for a component or action this catalog does not
/// render. It names what was skipped and renders nothing of it.
class PgA2uiFallback extends StatelessWidget {
  const PgA2uiFallback({required this.name, super.key});

  final String name;

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    final text = 'Not rendered in this build: $name';
    return Semantics(
      label: text,
      excludeSemantics: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: c.s2,
          borderRadius: BorderRadius.circular(PgRadius.r),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          child: Text(text, style: PgText.mono(color: c.fg2)),
        ),
      ),
    );
  }
}
