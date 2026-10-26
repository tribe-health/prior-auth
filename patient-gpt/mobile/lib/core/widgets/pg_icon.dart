// TJ-ARCH-MOB-001 compliant
import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// The prototype's one outline icon family (docs/design/patient-chat/ui.js):
/// 20px grid, 1.5px stroke, round caps. Paths are copied verbatim.
enum PgIconName {
  plus('<path d="M10 4v12M4 10h12"/>'),
  search('<circle cx="9" cy="9" r="5.5"/><path d="M13.2 13.2 17 17"/>'),
  edit(
    '<path d="M4 16h3l8.5-8.5a2.1 2.1 0 0 0-3-3L4 13v3z"/>'
    '<path d="M11.5 5.5l3 3"/>',
  ),
  panel('<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M8 4v12"/>'),
  chevDown('<path d="M5 8l5 5 5-5"/>'),
  chevRight('<path d="M8 5l5 5-5 5"/>'),
  up('<path d="M10 16V4M5 9l5-5 5 5"/>'),
  stop(
    '<rect x="5.5" y="5.5" width="9" height="9" rx="1.5" fill="currentColor"/>',
  ),
  x('<path d="M5 5l10 10M15 5L5 15"/>'),
  check('<path d="M4.5 10.5l3.5 3.5 7.5-8"/>'),
  lock(
    '<rect x="5" y="9" width="10" height="7.5" rx="1.5"/>'
    '<path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>',
  ),
  folder(
    '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H8l2 2h5.5A1.5 1.5 0 0 1 17 8.5v6'
    'a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z"/>',
  ),
  sun(
    '<circle cx="10" cy="10" r="3.2"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2'
    'M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4'
    'M13.9 6.1l1.4-1.4"/>',
  ),
  moon('<path d="M16 11.5A6.5 6.5 0 1 1 8.5 4a5 5 0 0 0 7.5 7.5z"/>');

  const PgIconName(this.paths);

  final String paths;

  String get svg =>
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" '
      'fill="none" stroke="currentColor" stroke-width="1.5" '
      'stroke-linecap="round" stroke-linejoin="round">$paths</svg>';
}

class PgIcon extends StatelessWidget {
  const PgIcon(this.name, {required this.color, this.size = 20, super.key});

  final PgIconName name;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: SvgPicture.string(
        name.svg,
        width: size,
        height: size,
        colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
      ),
    );
  }
}
