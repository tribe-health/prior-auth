// TJ-ARCH-MOB-001 compliant
import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'package:patient_gpt/core/theme/pg_theme.dart';
import 'package:patient_gpt/core/theme/tokens.dart';
import 'package:patient_gpt/features/conversation/presentation/widgets/composer.dart';
import 'package:patient_gpt/features/shell/presentation/widgets/sidebar.dart';
import 'package:patient_gpt/features/shell/presentation/widgets/top_bar.dart';

/// The app shell from shell.css. Below 768 wide the sidebar is a drawer,
/// min(86%, 320) over the --scrim, and the composer docks at the bottom.
/// From 768 the sidebar sits beside the page at 268 and can collapse.
/// The split is by window width, never by platform.
class AppShell extends StatefulWidget {
  const AppShell({required this.child, super.key});

  final Widget child;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  final _scaffold = GlobalKey<ScaffoldState>();
  bool _wideSidebarOpen = true;

  @override
  Widget build(BuildContext context) {
    final c = context.pg;
    final width = MediaQuery.sizeOf(context).width;
    final wide = width >= PgBreakpoint.phone;

    final main = ColoredBox(
      color: c.bg,
      child: Column(
        children: [
          SafeArea(
            bottom: false,
            left: !wide || !_wideSidebarOpen,
            child: TopBar(
              onOpenSidebar: wide
                  ? (_wideSidebarOpen
                        ? null
                        : () => setState(() => _wideSidebarOpen = true))
                  : () => _scaffold.currentState?.openDrawer(),
            ),
          ),
          Expanded(child: widget.child),
          const ComposerDock(),
        ],
      ),
    );

    if (wide) {
      return Scaffold(
        key: _scaffold,
        body: Row(
          children: [
            if (_wideSidebarOpen)
              SizedBox(
                width: PgLayout.sbW,
                child: Sidebar(
                  onClose: () => setState(() => _wideSidebarOpen = false),
                ),
              ),
            Expanded(child: main),
          ],
        ),
      );
    }

    return Scaffold(
      key: _scaffold,
      drawer: Drawer(
        width: math.min(width * 0.86, 320),
        child: Sidebar(onClose: () => _scaffold.currentState?.closeDrawer()),
      ),
      body: main,
    );
  }
}
