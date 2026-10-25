// TJ-ARCH-MOB-001 compliant
import 'package:flutter/material.dart';

import 'package:patient_gpt/core/theme/pg_text.dart';
import 'package:patient_gpt/core/theme/tokens.dart';

/// Carries the generated [PgColors] for the active theme. Widgets read colour
/// roles from here, never from literals.
@immutable
class PgTheme extends ThemeExtension<PgTheme> {
  const PgTheme(this.colors);

  final PgColors colors;

  @override
  PgTheme copyWith({PgColors? colors}) => PgTheme(colors ?? this.colors);

  /// Colour roles switch whole: the prototype swaps a class on `<html>`, it
  /// does not interpolate between themes.
  @override
  PgTheme lerp(covariant PgTheme? other, double t) =>
      t < 0.5 ? this : (other ?? this);
}

extension PgThemeContext on BuildContext {
  PgColors get pg {
    final ext = Theme.of(this).extension<PgTheme>();
    if (ext == null) {
      throw StateError('PgTheme is missing from ThemeData.extensions.');
    }
    return ext.colors;
  }
}

/// Flat 2.0: no elevation, shadows, dividers, outlines, splashes or ink.
ThemeData buildPgTheme(PgColors c, Brightness brightness) {
  final scheme = ColorScheme(
    brightness: brightness,
    primary: c.primaryBg,
    onPrimary: c.primaryFg,
    secondary: c.field,
    onSecondary: c.fieldFg,
    error: c.accent,
    onError: c.primaryFg,
    surface: c.bg,
    onSurface: c.fg,
  );
  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: c.bg,
    canvasColor: c.bg,
    fontFamily: PgFonts.body,
    textTheme: TextTheme(bodyMedium: PgText.body(color: c.fg)),
    splashFactory: NoSplash.splashFactory,
    splashColor: Colors.transparent,
    highlightColor: Colors.transparent,
    hoverColor: Colors.transparent,
    focusColor: Colors.transparent,
    shadowColor: Colors.transparent,
    dividerColor: Colors.transparent,
    dividerTheme: const DividerThemeData(
      color: Colors.transparent,
      thickness: 0,
      space: 0,
    ),
    drawerTheme: DrawerThemeData(
      backgroundColor: c.s1,
      scrimColor: c.scrim,
      elevation: 0,
      shadowColor: Colors.transparent,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(),
      endShape: const RoundedRectangleBorder(),
    ),
    textSelectionTheme: TextSelectionThemeData(
      cursorColor: c.accent,
      selectionColor: c.select,
      selectionHandleColor: c.accent,
    ),
    scrollbarTheme: ScrollbarThemeData(
      thumbColor: WidgetStatePropertyAll(c.s3),
    ),
    extensions: [PgTheme(c)],
  );
}
