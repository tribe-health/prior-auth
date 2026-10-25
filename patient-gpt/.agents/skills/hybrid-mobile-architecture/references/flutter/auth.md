# Flutter Auth Reference
> flutter_secure_storage · Riverpod 3.3 · Ory Kratos · Supabase · GoRouter guards

## Auth provider tree (main.dart)

```dart
// Wire the auth implementation via ProviderScope overrides
void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Supabase (if using)
  await Supabase.initialize(
    url: const String.fromEnvironment('SUPABASE_URL'),
    anonKey: const String.fromEnvironment('SUPABASE_ANON_KEY'),
  );

  runApp(ProviderScope(
    overrides: [
      // Swap the abstract interface for the concrete impl
      authRepositoryProvider.overrideWithValue(
        SupabaseAuthRepository(),
        // OR: KratosAuthRepository(publicUrl: 'https://kratos.your-domain.com'),
      ),
    ],
    child: const AppRoot(),
  ));
}
```

## GoRouter auth guard (complete)

```dart
// lib/app/router.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../features/auth/presentation/providers/auth_provider.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authNotifier = ref.watch(authNotifierProvider.notifier);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: GoRouterRefreshStream(
      ref.watch(authNotifierProvider.stream),
    ),
    redirect: (context, state) {
      final authState = ref.read(authNotifierProvider);
      final isAuthenticated = authState is AuthStateAuthenticated;
      final isOnLoginPage  = state.matchedLocation == '/login';

      if (!isAuthenticated && !isOnLoginPage) return '/login';
      if ( isAuthenticated &&  isOnLoginPage) return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      ShellRoute(
        builder: (_, __, child) => AppShell(child: child),
        routes: [
          GoRoute(path: '/',     builder: (_, __) => const HomeScreen()),
          GoRoute(path: '/chat', builder: (_, __) => const ChatScreen()),
          GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen()),
        ],
      ),
    ],
  );
});

// Helper: make Riverpod stream listenable for GoRouter
class GoRouterRefreshStream extends ChangeNotifier {
  GoRouterRefreshStream(Stream<dynamic> stream) {
    notifyListeners();
    _sub = stream.listen((_) => notifyListeners());
  }
  late final StreamSubscription _sub;
  @override void dispose() { _sub.cancel(); super.dispose(); }
}
```

## Secure token storage

```dart
// lib/core/storage/secure_storage.dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
part 'secure_storage.g.dart';

@riverpod
FlutterSecureStorage secureStorage(Ref ref) => const FlutterSecureStorage(
  aOptions: AndroidOptions(encryptedSharedPreferences: true),
  iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
);

// Usage in repositories:
// await ref.read(secureStorageProvider).write(key: 'session_token', value: token);
// final token = await ref.read(secureStorageProvider).read(key: 'session_token');
```

## Session persistence across app restarts

```dart
// In AuthNotifier.build():
@override
AuthState build() {
  // Async startup check
  Future.microtask(_restoreSession);
  return const AuthState.loading();
}

Future<void> _restoreSession() async {
  try {
    final token = await ref.read(secureStorageProvider)
        .read(key: 'session_token');
    if (token == null) { state = const AuthState.unauthenticated(); return; }
    // Validate session with backend (Kratos or Supabase)
    final user = await ref.read(authRepositoryProvider).currentUser();
    state = user != null
        ? AuthState.authenticated(user: user)
        : const AuthState.unauthenticated();
  } catch (_) {
    state = const AuthState.unauthenticated();
  }
}
```

## Login screen (shadcn_flutter)

```dart
// lib/features/auth/presentation/screens/login_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart';
import '../providers/auth_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email    = TextEditingController();
  final _password = TextEditingController();

  @override
  void dispose() { _email.dispose(); _password.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authNotifierProvider);
    final isLoading = authState is AuthStateLoading;

    ref.listen(authNotifierProvider, (prev, next) {
      if (next is AuthStateError) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(next.message), backgroundColor: Colors.red),
        );
      }
    });

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ShadCard(
            width: 360,
            padding: const EdgeInsets.all(28),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text('Sign in', style: Theme.of(context).textTheme.titleLarge),
              const Gap(24),
              ShadInput(
                controller: _email,
                placeholder: const Text('Email'),
                keyboardType: TextInputType.emailAddress,
              ),
              const Gap(12),
              ShadInput.password(
                controller: _password,
                placeholder: const Text('Password'),
              ),
              const Gap(20),
              ShadButton(
                width: double.infinity,
                onPressed: isLoading ? null : () {
                  ref.read(authNotifierProvider.notifier)
                      .signIn(_email.text, _password.text);
                },
                child: isLoading
                    ? const SizedBox.square(
                        dimension: 16,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Sign in'),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
```

## Ory Kratos — native flow reference

```dart
// lib/features/auth/data/repositories/kratos_auth_repository.dart
// Requires: http: ^1.2.0, flutter_secure_storage, ory_client (optional)
import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../domain/entities/auth_user.dart';
import '../../domain/repositories/auth_repository.dart';

class KratosAuthRepository implements AuthRepository {
  final String publicUrl;
  final http.Client _http;
  final FlutterSecureStorage _storage;
  final StreamController<AuthState> _authState =
      StreamController<AuthState>.broadcast();
  static const _tokenKey = 'kratos_session_token';

  KratosAuthRepository({
    required this.publicUrl,
    http.Client? httpClient,
  }) : _http   = httpClient ?? http.Client(),
       _storage = const FlutterSecureStorage();

  // ── Login ─────────────────────────────────────────────────────────────

  @override
  Future<AuthUser> signIn({
    required String email,
    required String password,
  }) async {
    // Step 1: Initialize native login flow
    final flowRes = await _http.get(
      Uri.parse('$publicUrl/self-service/login/api'),
      headers: {'Accept': 'application/json'},
    );
    if (flowRes.statusCode != 200) {
      throw Exception('Failed to create login flow: ${flowRes.statusCode}');
    }
    final flow = jsonDecode(flowRes.body) as Map<String, dynamic>;
    final flowId = flow['id'] as String;

    // Step 2: Submit password credentials
    final submitRes = await _http.post(
      Uri.parse('$publicUrl/self-service/login?flow=$flowId'),
      headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
      body: jsonEncode({
        'method':     'password',
        'identifier': email,
        'password':   password,
      }),
    );
    if (submitRes.statusCode != 200) {
      final err = jsonDecode(submitRes.body);
      throw Exception(err['error']?['message'] ?? 'Login failed');
    }
    final session = jsonDecode(submitRes.body) as Map<String, dynamic>;

    // Step 3: Persist session token
    final token = session['session_token'] as String?;
    if (token != null) {
      await _storage.write(key: _tokenKey, value: token);
    }

    final identity = session['session']['identity'] as Map<String, dynamic>;
    final user = AuthUser(
      id:    identity['id'] as String,
      email: (identity['traits'] as Map)['email'] as String? ?? email,
    );
    _authState.add(AuthState.authenticated(user: user));
    return user;
  }

  // ── Registration ──────────────────────────────────────────────────────

  @override
  Future<AuthUser> signUp({
    required String email,
    required String password,
  }) async {
    final flowRes = await _http.get(
      Uri.parse('$publicUrl/self-service/registration/api'),
      headers: {'Accept': 'application/json'},
    );
    final flow   = jsonDecode(flowRes.body) as Map<String, dynamic>;
    final flowId = flow['id'] as String;

    final submitRes = await _http.post(
      Uri.parse('$publicUrl/self-service/registration?flow=$flowId'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'method':   'password',
        'password': password,
        'traits':   {'email': email},
      }),
    );
    if (submitRes.statusCode != 200) {
      final err = jsonDecode(submitRes.body);
      throw Exception(err['error']?['message'] ?? 'Registration failed');
    }
    final data = jsonDecode(submitRes.body) as Map<String, dynamic>;
    final identity = data['identity'] as Map<String, dynamic>;
    return AuthUser(
      id:    identity['id'] as String,
      email: (identity['traits'] as Map)['email'] as String? ?? email,
    );
  }

  // ── Logout ────────────────────────────────────────────────────────────

  @override
  Future<void> signOut() async {
    final token = await _storage.read(key: _tokenKey);
    if (token != null) {
      await _http.delete(
        Uri.parse('$publicUrl/self-service/logout/api'),
        headers: {'X-Session-Token': token, 'Accept': 'application/json'},
      );
    }
    await _storage.delete(key: _tokenKey);
    _authState.add(const AuthState.unauthenticated());
  }

  // ── Current user ──────────────────────────────────────────────────────

  @override
  Future<AuthUser?> currentUser() async {
    final token = await _storage.read(key: _tokenKey);
    if (token == null) return null;
    final res = await _http.get(
      Uri.parse('$publicUrl/sessions/whoami'),
      headers: {'X-Session-Token': token, 'Accept': 'application/json'},
    );
    if (res.statusCode != 200) {
      await _storage.delete(key: _tokenKey);
      return null;
    }
    final session  = jsonDecode(res.body) as Map<String, dynamic>;
    final identity = session['identity'] as Map<String, dynamic>;
    return AuthUser(
      id:    identity['id'] as String,
      email: (identity['traits'] as Map)['email'] as String? ?? '',
    );
  }

  @override
  Stream<AuthState> get authStateChanges => _authState.stream;

  Future<void> dispose() => _authState.close();
}
```

## Multi-factor auth (Kratos TOTP flow)

```dart
// After password login, check if MFA is required:
if (submitRes.statusCode == 422) {
  final redirect = jsonDecode(submitRes.body);
  if (redirect['redirect_browser_to'] != null) {
    // TOTP / WebAuthn second factor required
    // Navigate to MFA screen with the redirect URL
    throw MfaRequiredException(redirectUrl: redirect['redirect_browser_to']);
  }
}
```

## Error handling patterns

```dart
// Domain error types
@freezed
class AuthFailure with _$AuthFailure {
  const factory AuthFailure.invalidCredentials()     = InvalidCredentials;
  const factory AuthFailure.networkError()           = NetworkError;
  const factory AuthFailure.sessionExpired()         = SessionExpired;
  const factory AuthFailure.mfaRequired({required String flowId}) = MfaRequired;
  const factory AuthFailure.unknown({required String message})    = UnknownFailure;
}

// In AuthNotifier, catch typed failures:
try {
  final user = await repo.signIn(email: email, password: password);
  state = AuthState.authenticated(user: user);
} on AuthFailure catch (f) {
  state = AuthState.error(failure: f);
} catch (e) {
  state = AuthState.error(failure: AuthFailure.unknown(message: e.toString()));
}
```
