// TJ-ARCH-MOB-001 compliant
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'sidebar_expansion.g.dart';

/// Which patients the user has opened or collapsed in the sidebar. Transient
/// view state. A patient with no entry falls back to the default: the patient
/// whose open case is due first starts open.
@Riverpod(keepAlive: true)
class SidebarExpansion extends _$SidebarExpansion {
  @override
  Map<String, bool> build() => const {};

  void toggle(String patientId, {required bool isOpen}) {
    state = {...state, patientId: !isOpen};
  }
}
