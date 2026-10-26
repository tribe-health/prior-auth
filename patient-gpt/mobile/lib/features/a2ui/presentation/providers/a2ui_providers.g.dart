// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'a2ui_providers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Surface actions the app has been told about, newest last. A record of
/// requests and decisions; nothing here is applied to the graph.

@ProviderFor(A2uiIntentLog)
final a2uiIntentLogProvider = A2uiIntentLogProvider._();

/// Surface actions the app has been told about, newest last. A record of
/// requests and decisions; nothing here is applied to the graph.
final class A2uiIntentLogProvider
    extends $NotifierProvider<A2uiIntentLog, List<A2uiIntent>> {
  /// Surface actions the app has been told about, newest last. A record of
  /// requests and decisions; nothing here is applied to the graph.
  A2uiIntentLogProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'a2uiIntentLogProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$a2uiIntentLogHash();

  @$internal
  @override
  A2uiIntentLog create() => A2uiIntentLog();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(List<A2uiIntent> value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<List<A2uiIntent>>(value),
    );
  }
}

String _$a2uiIntentLogHash() => r'd6cf568e26417c08723df80b164781e2982e45c3';

/// Surface actions the app has been told about, newest last. A record of
/// requests and decisions; nothing here is applied to the graph.

abstract class _$A2uiIntentLog extends $Notifier<List<A2uiIntent>> {
  List<A2uiIntent> build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<List<A2uiIntent>, List<A2uiIntent>>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<List<A2uiIntent>, List<A2uiIntent>>,
              List<A2uiIntent>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}

/// Debug builds only: whether the sample surface is open in the thread.

@ProviderFor(A2uiSampleOpen)
final a2uiSampleOpenProvider = A2uiSampleOpenProvider._();

/// Debug builds only: whether the sample surface is open in the thread.
final class A2uiSampleOpenProvider
    extends $NotifierProvider<A2uiSampleOpen, bool> {
  /// Debug builds only: whether the sample surface is open in the thread.
  A2uiSampleOpenProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'a2uiSampleOpenProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$a2uiSampleOpenHash();

  @$internal
  @override
  A2uiSampleOpen create() => A2uiSampleOpen();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(bool value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<bool>(value),
    );
  }
}

String _$a2uiSampleOpenHash() => r'd8d4fba14039fdb0f18534fda5f8f191928a9a86';

/// Debug builds only: whether the sample surface is open in the thread.

abstract class _$A2uiSampleOpen extends $Notifier<bool> {
  bool build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<bool, bool>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<bool, bool>,
              bool,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}
