import 'package:flutter/material.dart';

import 'tokens.dart';

/// Builds ThemeData from the generated [AppTokens]. Widgets read roles from
/// the theme, never a raw `Color(0xFF…)` at a call site — that is what keeps
/// light and dark in step and lets a rebrand be one regenerated file.
ThemeData buildTheme(Brightness brightness) {
  final t = brightness == Brightness.dark ? AppTokens.dark : AppTokens.light;

  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    scaffoldBackgroundColor: t.canvas,
    colorScheme: ColorScheme(
      brightness: brightness,
      primary: t.accent,
      onPrimary: t.canvas,
      secondary: t.cool,
      onSecondary: t.canvas,
      surface: t.surface,
      onSurface: t.text,
      error: t.destructive,
      onError: t.canvas,
    ),
    extensions: [AppTokensExtension(t)],
    // Flat 2.0: no borders, no layout shadows. Adjacent regions differ by
    // background value alone, which is why the surface ramp has four steps.
    cardTheme: CardThemeData(
      color: t.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppShape.radiusLg),
      ),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: t.canvas,
      foregroundColor: t.text,
      elevation: 0,
      scrolledUnderElevation: 0,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: t.surface,
      indicatorColor: t.accentTint,
      elevation: 0,
    ),
  );
}

/// Exposes the full token set to widgets, since ColorScheme cannot carry the
/// clinical status roles.
@immutable
class AppTokensExtension extends ThemeExtension<AppTokensExtension> {
  const AppTokensExtension(this.tokens);

  final AppTokens tokens;

  @override
  AppTokensExtension copyWith({AppTokens? tokens}) =>
      AppTokensExtension(tokens ?? this.tokens);

  @override
  AppTokensExtension lerp(ThemeExtension<AppTokensExtension>? other, double t) =>
      t < 0.5 ? this : (other as AppTokensExtension? ?? this);
}

extension AppTokensContext on BuildContext {
  AppTokens get tokens =>
      Theme.of(this).extension<AppTokensExtension>()!.tokens;
}
