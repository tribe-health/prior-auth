// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'router.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Routes mirror the prototype's: `/` home. `/p/<patient>`, `/c/<case>` and
/// `/chat/<id>` join under the same shell when those views are built.
/// "Where am I" lives in the router only.

@ProviderFor(router)
final routerProvider = RouterProvider._();

/// Routes mirror the prototype's: `/` home. `/p/<patient>`, `/c/<case>` and
/// `/chat/<id>` join under the same shell when those views are built.
/// "Where am I" lives in the router only.

final class RouterProvider
    extends $FunctionalProvider<GoRouter, GoRouter, GoRouter>
    with $Provider<GoRouter> {
  /// Routes mirror the prototype's: `/` home. `/p/<patient>`, `/c/<case>` and
  /// `/chat/<id>` join under the same shell when those views are built.
  /// "Where am I" lives in the router only.
  RouterProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'routerProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$routerHash();

  @$internal
  @override
  $ProviderElement<GoRouter> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  GoRouter create(Ref ref) {
    return router(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(GoRouter value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<GoRouter>(value),
    );
  }
}

String _$routerHash() => r'94e08e89e80ce6e2e3be4a0702d2d1e2fb692210';
