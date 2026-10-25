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

@ProviderFor(session)
final sessionProvider = SessionProvider._();

final class SessionProvider
    extends $FunctionalProvider<AsyncValue<Session>, Session, FutureOr<Session>>
    with $FutureModifier<Session>, $FutureProvider<Session> {
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
  $FutureProviderElement<Session> $createElement($ProviderPointer pointer) =>
      $FutureProviderElement(pointer);

  @override
  FutureOr<Session> create(Ref ref) {
    return session(ref);
  }
}

String _$sessionHash() => r'f80e36240dbe86363ed984b0fa5a9d3df535ec76';

@ProviderFor(patientDirectory)
final patientDirectoryProvider = PatientDirectoryProvider._();

final class PatientDirectoryProvider
    extends
        $FunctionalProvider<
          AsyncValue<PatientDirectory>,
          PatientDirectory,
          FutureOr<PatientDirectory>
        >
    with $FutureModifier<PatientDirectory>, $FutureProvider<PatientDirectory> {
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

String _$patientDirectoryHash() => r'1dfac3a5356727d98ff825ffe7d3d573edf3427a';

@ProviderFor(conversations)
final conversationsProvider = ConversationsFamily._();

final class ConversationsProvider
    extends
        $FunctionalProvider<
          AsyncValue<List<ConversationSummary>>,
          List<ConversationSummary>,
          FutureOr<List<ConversationSummary>>
        >
    with
        $FutureModifier<List<ConversationSummary>>,
        $FutureProvider<List<ConversationSummary>> {
  ConversationsProvider._({
    required ConversationsFamily super.from,
    required ConversationScope super.argument,
  }) : super(
         retry: noRetry,
         name: r'conversationsProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$conversationsHash();

  @override
  String toString() {
    return r'conversationsProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  $FutureProviderElement<List<ConversationSummary>> $createElement(
    $ProviderPointer pointer,
  ) => $FutureProviderElement(pointer);

  @override
  FutureOr<List<ConversationSummary>> create(Ref ref) {
    final argument = this.argument as ConversationScope;
    return conversations(ref, argument);
  }

  @override
  bool operator ==(Object other) {
    return other is ConversationsProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$conversationsHash() => r'e216692b713e7e62fc28f15d2cb17e85e3de434b';

final class ConversationsFamily extends $Family
    with
        $FunctionalFamilyOverride<
          FutureOr<List<ConversationSummary>>,
          ConversationScope
        > {
  ConversationsFamily._()
    : super(
        retry: noRetry,
        name: r'conversationsProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  ConversationsProvider call(ConversationScope scope) =>
      ConversationsProvider._(argument: scope, from: this);

  @override
  String toString() => r'conversationsProvider';
}
