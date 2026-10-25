// TJ-ARCH-MOB-001 compliant
import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

import 'package:patient_gpt/core/theme/pg_theme.dart';

/// The "Spine in conversation" sweep as the sidebar draws it
/// (patient-chat.html `.mark`): upper stroke in --mark-upper, lower in
/// --accent-vivid. Colours come from the active theme's tokens.
class BrandMark extends StatelessWidget {
  const BrandMark({this.size = 28, super.key});

  final double size;

  static String _hex(Color c) =>
      '#${(c.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    final svg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
        '<g transform="rotate(-13 256 256) translate(0 18)">'
        '<path fill="${_hex(c.markUpper)}" d="M80 250C172 186 300 154 432 162'
        'C306 126 176 148 80 208C64 218 64 240 80 250Z"/>'
        '<path fill="${_hex(c.accentVivid)}" d="M80 308C176 266 306 234 432 240'
        'C448 250 448 274 432 284C306 278 176 312 80 330C66 324 66 314 80 308Z"/>'
        '</g></svg>';
    return ExcludeSemantics(
      child: SvgPicture.string(svg, width: size, height: size),
    );
  }
}
