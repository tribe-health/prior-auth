// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'thread_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The conversation in view, scoped to all patients (the home view). It
/// renders what the runtime streams and decides nothing itself: there is no
/// application-side agent loop.

@ProviderFor(ThreadController)
final threadControllerProvider = ThreadControllerProvider._();

/// The conversation in view, scoped to all patients (the home view). It
/// renders what the runtime streams and decides nothing itself: there is no
/// application-side agent loop.
final class ThreadControllerProvider
    extends $NotifierProvider<ThreadController, ThreadState> {
  /// The conversation in view, scoped to all patients (the home view). It
  /// renders what the runtime streams and decides nothing itself: there is no
  /// application-side agent loop.
  ThreadControllerProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'threadControllerProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$threadControllerHash();

  @$internal
  @override
  ThreadController create() => ThreadController();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ThreadState value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ThreadState>(value),
    );
  }
}

String _$threadControllerHash() => r'af5dfdffa4084f49c8b167e5772e8f2ff3b0fd42';

/// The conversation in view, scoped to all patients (the home view). It
/// renders what the runtime streams and decides nothing itself: there is no
/// application-side agent loop.

abstract class _$ThreadController extends $Notifier<ThreadState> {
  ThreadState build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<ThreadState, ThreadState>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<ThreadState, ThreadState>,
              ThreadState,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}
