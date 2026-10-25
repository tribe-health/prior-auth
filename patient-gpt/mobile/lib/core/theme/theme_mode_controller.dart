// TJ-ARCH-MOB-001 compliant
import 'package:flutter/material.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'theme_mode_controller.g.dart';

/// Follows the system setting until the user picks a theme from the account
/// menu, as the prototype does. The choice is held for the session only: no
/// mobile store has been decided, so nothing is persisted.
@Riverpod(keepAlive: true)
class ThemeModeController extends _$ThemeModeController {
  @override
  ThemeMode build() => ThemeMode.system;

  /// Switches away from the brightness currently on screen.
  void toggleFrom(Brightness current) {
    state = current == Brightness.dark ? ThemeMode.light : ThemeMode.dark;
  }
}
