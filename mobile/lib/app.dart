import 'package:flutter/material.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/tokens.dart';

class AsoApp extends StatelessWidget {
  const AsoApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Prior Authorization Workbench',
        theme: buildTheme(Brightness.light),
        darkTheme: buildTheme(Brightness.dark),
        // Follow the system rather than defaulting to dark. Both themes are
        // styled deliberately; neither is an afterthought.
        themeMode: ThemeMode.system,
        home: const AppShell(),
      );
}

/// Top-level destinations live in a bottom bar on EVERY platform, and switch
/// to a rail by WINDOW WIDTH — never by operating system. A `Platform.isIOS`
/// check in navigation code is the bug this rule exists to prevent.
class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  // One destination list. Two lists drift.
  static const _destinations = [
    (icon: Icons.inbox_outlined, selected: Icons.inbox, label: 'Cases'),
    (icon: Icons.description_outlined, selected: Icons.description, label: 'Evidence'),
    (icon: Icons.verified_outlined, selected: Icons.verified, label: 'Gate'),
    (icon: Icons.settings_outlined, selected: Icons.settings, label: 'Settings'),
  ];

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= AppLayout.breakpointSm;
    final body = Center(child: Text(_destinations[_index].label));

    if (wide) {
      return Scaffold(
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: _index,
              onDestinationSelected: (i) => setState(() => _index = i),
              labelType: NavigationRailLabelType.all,
              destinations: [
                for (final d in _destinations)
                  NavigationRailDestination(
                    icon: Icon(d.icon),
                    selectedIcon: Icon(d.selected),
                    label: Text(d.label),
                  ),
              ],
            ),
            Expanded(child: body),
          ],
        ),
      );
    }

    return Scaffold(
      body: body,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          for (final d in _destinations)
            NavigationDestination(
              icon: Icon(d.icon),
              selectedIcon: Icon(d.selected),
              label: d.label,
            ),
        ],
      ),
    );
  }
}
