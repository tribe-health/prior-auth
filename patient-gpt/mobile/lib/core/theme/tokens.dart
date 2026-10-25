// GENERATED from assets/templates/design-tokens/tokens.toml by scripts/design-tokens/gen-design-tokens.mjs. DO NOT EDIT.
// ignore_for_file: constant_identifier_names

import 'package:flutter/animation.dart';

/// Colour roles, one instance per theme. Names match the prototype's CSS
/// custom properties (--fg-2 → fg2).
class PgColors {
  const PgColors({
    required this.bg,
    required this.s1,
    required this.s2,
    required this.s3,
    required this.s4,
    required this.canvas,
    required this.paper,
    required this.scrim,
    required this.fg,
    required this.fg2,
    required this.field,
    required this.fieldFg,
    required this.fieldPh,
    required this.fieldHover,
    required this.fieldDim,
    required this.fieldFocus,
    required this.primaryBg,
    required this.primaryFg,
    required this.primaryHover,
    required this.accent,
    required this.accentVivid,
    required this.focusBg,
    required this.focusFg,
    required this.inv,
    required this.invFg,
    required this.invFg2,
    required this.invHover,
    required this.invCurrent,
    required this.host,
    required this.hostRow,
    required this.cool,
    required this.coolFg,
    required this.coolSurface,
    required this.warmSurface,
    required this.select,
    required this.markUpper,
    required this.ok,
    required this.okSurface,
    required this.gap,
    required this.gapSurface,
    required this.voidState,
    required this.voidSurface,
  });

  final Color bg;
  final Color s1;
  final Color s2;
  final Color s3;
  final Color s4;
  final Color canvas;
  final Color paper;
  final Color scrim;
  final Color fg;
  final Color fg2;
  final Color field;
  final Color fieldFg;
  final Color fieldPh;
  final Color fieldHover;
  final Color fieldDim;
  final Color fieldFocus;
  final Color primaryBg;
  final Color primaryFg;
  final Color primaryHover;
  final Color accent;
  final Color accentVivid;
  final Color focusBg;
  final Color focusFg;
  final Color inv;
  final Color invFg;
  final Color invFg2;
  final Color invHover;
  final Color invCurrent;
  final Color host;
  final Color hostRow;
  final Color cool;
  final Color coolFg;
  final Color coolSurface;
  final Color warmSurface;
  final Color select;
  final Color markUpper;
  final Color ok;
  final Color okSurface;
  final Color gap;
  final Color gapSurface;
  final Color voidState;
  final Color voidSurface;

  static const light = PgColors(
    bg: Color(0xFFFFFFFF),
    s1: Color(0xFFF7F6F4),
    s2: Color(0xFFF1EFEC),
    s3: Color(0xFFE7E4E0),
    s4: Color(0xFFDAD6D1),
    canvas: Color(0xFFF1EFEC),
    paper: Color(0xFFFFFFFF),
    scrim: Color.fromRGBO(35, 31, 32, 0.55),
    fg: Color(0xFF231F20),
    fg2: Color(0xFF55565A),
    field: Color(0xFF1F4E79),
    fieldFg: Color(0xFFFFFFFF),
    fieldPh: Color(0xFFC8D6E2),
    fieldHover: Color(0xFF2D5F8E),
    fieldDim: Color(0xFF3F6A92),
    fieldFocus: Color(0xFF231F20),
    primaryBg: Color(0xFFA85417),
    primaryFg: Color(0xFFFFFFFF),
    primaryHover: Color(0xFF8F4712),
    accent: Color(0xFFA85417),
    accentVivid: Color(0xFFDF7C35),
    focusBg: Color(0xFF1F4E79),
    focusFg: Color(0xFFFFFFFF),
    inv: Color(0xFF231F20),
    invFg: Color(0xFFFFFFFF),
    invFg2: Color(0xFFD8D4D0),
    invHover: Color(0xFF3D3839),
    invCurrent: Color(0xFF55565A),
    host: Color(0xFFEDF3F7),
    hostRow: Color(0xFFFFFFFF),
    cool: Color(0xFF1F4E79),
    coolFg: Color(0xFFFFFFFF),
    coolSurface: Color(0xFFEDF3F7),
    warmSurface: Color(0xFFFBEFE6),
    select: Color(0xFFA7C5D6),
    markUpper: Color(0xFF6E6F71),
    ok: Color(0xFF1E6F4E),
    okSurface: Color(0xFFE7F3EC),
    gap: Color(0xFFA85417),
    gapSurface: Color(0xFFFBEFE6),
    voidState: Color(0xFF5B5F66),
    voidSurface: Color(0xFFEFEFF1),
  );

  static const dark = PgColors(
    bg: Color(0xFF14181C),
    s1: Color(0xFF1C2126),
    s2: Color(0xFF252B31),
    s3: Color(0xFF2E353C),
    s4: Color(0xFF3A424A),
    canvas: Color(0xFF1C2126),
    paper: Color(0xFF14181C),
    scrim: Color.fromRGBO(0, 0, 0, 0.7),
    fg: Color(0xFFEDF0F2),
    fg2: Color(0xFFB4BFC7),
    field: Color(0xFF8FB9D0),
    fieldFg: Color(0xFF14181C),
    fieldPh: Color(0xFF2F3E49),
    fieldHover: Color(0xFF7AA6BE),
    fieldDim: Color(0xFFA9C9DA),
    fieldFocus: Color(0xFFFFFFFF),
    primaryBg: Color(0xFFF0955A),
    primaryFg: Color(0xFF14181C),
    primaryHover: Color(0xFFF7AC7B),
    accent: Color(0xFFF0955A),
    accentVivid: Color(0xFFF0955A),
    focusBg: Color(0xFFEDF0F2),
    focusFg: Color(0xFF14181C),
    inv: Color(0xFFEDF0F2),
    invFg: Color(0xFF14181C),
    invFg2: Color(0xFF3A444C),
    invHover: Color(0xFFD5DADE),
    invCurrent: Color(0xFFC2C9CE),
    host: Color(0xFF182430),
    hostRow: Color(0xFF14181C),
    cool: Color(0xFF8FB9D0),
    coolFg: Color(0xFF14181C),
    coolSurface: Color(0xFF182430),
    warmSurface: Color(0xFF2E2119),
    select: Color(0xFF2F4A5C),
    markUpper: Color(0xFFC7CDD2),
    ok: Color(0xFF6FD1A0),
    okSurface: Color(0xFF152620),
    gap: Color(0xFFF0955A),
    gapSurface: Color(0xFF2E2119),
    voidState: Color(0xFFA9B3BB),
    voidSurface: Color(0xFF232830),
  );
}

class PgFonts {
  static const String display = 'Playfair Display';
  static const String body = 'Mulish';
  static const String mono = 'JetBrains Mono';
}

/// Logical pixels; 1rem = 16.
class PgSizes {
  static const double greetingMin = 28;
  static const double greetingMax = 38.4;
  static const double titleMin = 24;
  static const double titleMax = 29.6;
  static const double body = 16;
  static const double ui = 14;
  static const double meta = 13;
  static const double mono = 12;
}

class PgRadius {
  static const double r = 5;
  static const double rLg = 8;
  static const double rComposer = 24;
  static const double rBubble = 18;
}

class PgLayout {
  static const double sbW = 268;
  static const double col = 768;
  static const double filesW = 360;
}

class PgBreakpoint {
  static const double phone = 768;
  static const double wide = 1100;
}

class PgMotion {
  static const Curve ease = Cubic(0.23, 1, 0.32, 1);
  static const Duration enter = Duration(milliseconds: 200);
  static const Duration exit = Duration(milliseconds: 140);
}
