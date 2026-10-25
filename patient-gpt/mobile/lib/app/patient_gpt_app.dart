// TJ-ARCH-MOB-001 compliant
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:patient_gpt/app/router.dart';
import 'package:patient_gpt/core/theme/pg_theme.dart';
import 'package:patient_gpt/core/theme/theme_mode_controller.dart';
import 'package:patient_gpt/core/theme/tokens.dart';

class PatientGptApp extends ConsumerWidget {
  const PatientGptApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'PatientGPT',
      debugShowCheckedModeBanner: false,
      themeMode: ref.watch(themeModeControllerProvider),
      theme: buildPgTheme(PgColors.light, Brightness.light),
      darkTheme: buildPgTheme(PgColors.dark, Brightness.dark),
      themeAnimationDuration: Duration.zero,
      routerConfig: ref.watch(routerProvider),
      builder: (context, child) {
        final dark = Theme.of(context).brightness == Brightness.dark;
        return AnnotatedRegion<SystemUiOverlayStyle>(
          value: dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
  }
}
