// TJ-ARCH-MOB-001 compliant
import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'package:patient_gpt/app/app_shell.dart';
import 'package:patient_gpt/features/home/presentation/home_view.dart';

part 'router.g.dart';

/// Routes mirror the prototype's: `/` home. `/p/<patient>`, `/c/<case>` and
/// `/chat/<id>` join under the same shell when those views are built.
/// "Where am I" lives in the router only.
@Riverpod(keepAlive: true)
GoRouter router(Ref ref) {
  final router = GoRouter(
    initialLocation: '/',
    routes: [
      ShellRoute(
        builder: (context, state, child) => AppShell(child: child),
        routes: [
          GoRoute(path: '/', builder: (context, state) => const HomeView()),
        ],
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
}
