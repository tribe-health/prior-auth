// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sidebar_expansion.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Which patients the user has opened or collapsed in the sidebar. Transient
/// view state. A patient with no entry falls back to the default: the patient
/// whose open case is due first starts open.

@ProviderFor(SidebarExpansion)
final sidebarExpansionProvider = SidebarExpansionProvider._();

/// Which patients the user has opened or collapsed in the sidebar. Transient
/// view state. A patient with no entry falls back to the default: the patient
/// whose open case is due first starts open.
final class SidebarExpansionProvider
    extends $NotifierProvider<SidebarExpansion, Map<String, bool>> {
  /// Which patients the user has opened or collapsed in the sidebar. Transient
  /// view state. A patient with no entry falls back to the default: the patient
  /// whose open case is due first starts open.
  SidebarExpansionProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'sidebarExpansionProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$sidebarExpansionHash();

  @$internal
  @override
  SidebarExpansion create() => SidebarExpansion();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(Map<String, bool> value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<Map<String, bool>>(value),
    );
  }
}

String _$sidebarExpansionHash() => r'90744d6965a6702fdbf7ef212d110a30542df2ac';

/// Which patients the user has opened or collapsed in the sidebar. Transient
/// view state. A patient with no entry falls back to the default: the patient
/// whose open case is due first starts open.

abstract class _$SidebarExpansion extends $Notifier<Map<String, bool>> {
  Map<String, bool> build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<Map<String, bool>, Map<String, bool>>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<Map<String, bool>, Map<String, bool>>,
              Map<String, bool>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}
