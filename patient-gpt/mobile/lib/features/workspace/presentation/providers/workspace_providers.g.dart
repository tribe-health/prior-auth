// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'workspace_providers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The one transport binding, chosen by `PATIENTGPT_TRANSPORT`. The FFI
/// gateway needs `FfiPatientGptGateway.initialize()` to have run in `main`.

@ProviderFor(patientGptGateway)
final patientGptGatewayProvider = PatientGptGatewayProvider._();

/// The one transport binding, chosen by `PATIENTGPT_TRANSPORT`. The FFI
/// gateway needs `FfiPatientGptGateway.initialize()` to have run in `main`.

final class PatientGptGatewayProvider
    extends
        $FunctionalProvider<
          PatientGptGateway,
          PatientGptGateway,
          PatientGptGateway
        >
    with $Provider<PatientGptGateway> {
  /// The one transport binding, chosen by `PATIENTGPT_TRANSPORT`. The FFI
  /// gateway needs `FfiPatientGptGateway.initialize()` to have run in `main`.
  PatientGptGatewayProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'patientGptGatewayProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$patientGptGatewayHash();

  @$internal
  @override
  $ProviderElement<PatientGptGateway> $createElement(
    $ProviderPointer pointer,
  ) => $ProviderElement(pointer);

  @override
  PatientGptGateway create(Ref ref) {
    return patientGptGateway(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(PatientGptGateway value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<PatientGptGateway>(value),
    );
  }
}

String _$patientGptGatewayHash() => r'221a8a986d8f03b37e1199c29c05218333ef21cc';

/// The transports the app's `EntityGraph` reads through. `main` overrides
/// the package's `entityTransportRegistryProvider` with this.

@ProviderFor(patientGptEntityTransports)
final patientGptEntityTransportsProvider =
    PatientGptEntityTransportsProvider._();

/// The transports the app's `EntityGraph` reads through. `main` overrides
/// the package's `entityTransportRegistryProvider` with this.

final class PatientGptEntityTransportsProvider
    extends
        $FunctionalProvider<
          EntityTransportRegistry,
          EntityTransportRegistry,
          EntityTransportRegistry
        >
    with $Provider<EntityTransportRegistry> {
  /// The transports the app's `EntityGraph` reads through. `main` overrides
  /// the package's `entityTransportRegistryProvider` with this.
  PatientGptEntityTransportsProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'patientGptEntityTransportsProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$patientGptEntityTransportsHash();

  @$internal
  @override
  $ProviderElement<EntityTransportRegistry> $createElement(
    $ProviderPointer pointer,
  ) => $ProviderElement(pointer);

  @override
  EntityTransportRegistry create(Ref ref) {
    return patientGptEntityTransports(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(EntityTransportRegistry value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<EntityTransportRegistry>(value),
    );
  }
}

String _$patientGptEntityTransportsHash() =>
    r'7945c691ffbb9f8d3c49691af9cc30e959efa0c8';

/// The session principal, or null until the graph holds it.

@ProviderFor(session)
final sessionProvider = SessionProvider._();

/// The session principal, or null until the graph holds it.

final class SessionProvider
    extends
        $FunctionalProvider<AsyncValue<Session?>, Session?, FutureOr<Session?>>
    with $FutureModifier<Session?>, $FutureProvider<Session?> {
  /// The session principal, or null until the graph holds it.
  SessionProvider._()
    : super(
        from: null,
        argument: null,
        retry: noRetry,
        name: r'sessionProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$sessionHash();

  @$internal
  @override
  $FutureProviderElement<Session?> $createElement($ProviderPointer pointer) =>
      $FutureProviderElement(pointer);

  @override
  FutureOr<Session?> create(Ref ref) {
    return session(ref);
  }
}

String _$sessionHash() => r'ab42c9967b10cf6d9629b0dee936612a9ab968bb';

/// Patient and case order for the sidebar and "Due next", as ids.

@ProviderFor(patientDirectory)
final patientDirectoryProvider = PatientDirectoryProvider._();

/// Patient and case order for the sidebar and "Due next", as ids.

final class PatientDirectoryProvider
    extends
        $FunctionalProvider<
          AsyncValue<PatientDirectory>,
          PatientDirectory,
          FutureOr<PatientDirectory>
        >
    with $FutureModifier<PatientDirectory>, $FutureProvider<PatientDirectory> {
  /// Patient and case order for the sidebar and "Due next", as ids.
  PatientDirectoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: noRetry,
        name: r'patientDirectoryProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$patientDirectoryHash();

  @$internal
  @override
  $FutureProviderElement<PatientDirectory> $createElement(
    $ProviderPointer pointer,
  ) => $FutureProviderElement(pointer);

  @override
  FutureOr<PatientDirectory> create(Ref ref) {
    return patientDirectory(ref);
  }
}

String _$patientDirectoryHash() => r'c2396319b137ae77c28bca5e575aba9a4156c20c';
