// TJ-ARCH-MOB-001 compliant
import 'package:flutter/painting.dart';

import 'package:patient_gpt/core/theme/tokens.dart';

/// Text styles for the three bundled variable families.
///
/// The fonts are variable (`wght` axis), so the weight is carried both as a
/// [FontWeight] and as a [FontVariation]; without the variation the engine
/// renders the default instance whatever [FontWeight] says.
abstract final class PgText {
  static TextStyle body({
    double size = PgSizes.body,
    int weight = 400,
    Color? color,
    double height = 1.6,
  }) => _style(PgFonts.body, size, weight, color, height, null);

  static TextStyle display({
    required double size,
    int weight = 600,
    Color? color,
    double height = 1.15,
  }) => _style(PgFonts.display, size, weight, color, height, -0.01 * size);

  static TextStyle mono({
    double size = PgSizes.mono,
    int weight = 400,
    Color? color,
    double height = 1.5,
    double? letterSpacingEm,
  }) => _style(
    PgFonts.mono,
    size,
    weight,
    color,
    height,
    letterSpacingEm == null ? null : letterSpacingEm * size,
  );

  static TextStyle _style(
    String family,
    double size,
    int weight,
    Color? color,
    double height,
    double? letterSpacing,
  ) {
    return TextStyle(
      fontFamily: family,
      fontSize: size,
      fontWeight: _weight(weight),
      fontVariations: [FontVariation.weight(weight.toDouble())],
      color: color,
      height: height,
      letterSpacing: letterSpacing,
    );
  }

  static FontWeight _weight(int w) => switch (w) {
    <= 100 => FontWeight.w100,
    <= 200 => FontWeight.w200,
    <= 300 => FontWeight.w300,
    <= 400 => FontWeight.w400,
    <= 500 => FontWeight.w500,
    <= 600 => FontWeight.w600,
    <= 700 => FontWeight.w700,
    <= 800 => FontWeight.w800,
    _ => FontWeight.w900,
  };
}
