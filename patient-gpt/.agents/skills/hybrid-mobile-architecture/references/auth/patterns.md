# Authentication Patterns Reference
> Ory Kratos (self-hosted identity) · Supabase (managed Postgres + Auth)

## Trusted identity boundary

Decoded token payloads are not authorization evidence.

- `UntrustedTokenHints` may parse display-only values such as a suggested name
  while validation is pending. Never expose roles, tenant authority, or policy
  decisions through this type.
- `VerifiedSession` exists only after signature, issuer, audience, expiry, and
  revocation-aware JWKS or authoritative server validation.
- Derive tenant IDs and trusted role state on the backend from
  `VerifiedSession`. Never accept a caller-selected tenant.
- Service roles, administration endpoints, signing keys, and approval polling
  are backend-only.
- Consumer-specific role models belong in project policy overlays rather than
  the generic Builder.

Required negative tests cover forged, expired, wrong-issuer, wrong-audience,
revoked-key, and cross-tenant credentials.

## When to use which

| Scenario | Auth Strategy |
|---|---|
| Enterprise / SSO / custom identity flows | Ory Kratos |
| Rapid consumer app, Postgres + realtime | Supabase Auth |
| Enterprise app with managed DB needs | Kratos (identity) + Supabase (database) |
| Healthcare / high-compliance | Ory Kratos (self-hosted, audit trail) |

## Ory Kratos

### Architecture

Kratos handles: registration, login, account recovery, MFA, session management, identity verification.
Kratos does NOT handle: authorization (use Ory Keto or Supabase RLS).

**Self-hosted endpoints:**
- `KRATOS_PUBLIC_URL` — used by clients (Flutter, React)
- `KRATOS_ADMIN_URL` — used by backend services only, never exposed to clients

### Flutter integration

```dart
// features/auth/data/repositories/kratos_auth_repository.dart
import 'package:ory_client/ory_client.dart';

class KratosAuthRepository implements AuthRepository {
  final FrontendApi _api;

  KratosAuthRepository({required String publicUrl})
      : _api = FrontendApi(ApiClient(basePath: publicUrl));

  @override
  Future<Session> login({required String email, required String password}) async {
    // 1. Initialize flow
    final flow = await _api.createNativeLoginFlow();

    // 2. Submit credentials
    final response = await _api.updateLoginFlow(
      flow: flow.id,
      updateLoginFlowBody: UpdateLoginFlowBody(
        UpdateLoginFlowWithPasswordMethod(
          method: 'password',
          identifier: email,
          password: password,
        ),
      ),
    );

    // 3. Store session token securely
    await _secureStorage.write(key: 'session_token', value: response.sessionToken);
    return response.session!;
  }

  @override
  Future<void> logout() async {
    final token = await _secureStorage.read(key: 'session_token');
    if (token != null) {
      await _api.performNativeLogout(
        performNativeLogoutBody: PerformNativeLogoutBody(sessionToken: token),
      );
    }
    await _secureStorage.delete(key: 'session_token');
  }
}

// Riverpod provider
@riverpod
AuthRepository authRepository(Ref ref) =>
    KratosAuthRepository(publicUrl: AppConfig.kratosPublicUrl);

@riverpod
class AuthNotifier extends _$AuthNotifier {
  @override
  AuthState build() => const AuthState.unauthenticated();

  Future<void> login(String email, String password) async {
    state = const AuthState.loading();
    try {
      final session = await ref.read(authRepositoryProvider).login(
        email: email, password: password,
      );
      state = AuthState.authenticated(session: session);
    } catch (e) {
      state = AuthState.error(message: e.toString());
    }
  }
}
```

### React/Tauri integration

```typescript
// features/auth/stores/kratosStore.ts
import { invoke } from '@tauri-apps/api/core';

// Kratos API calls go through Rust gen_ui_core (handles TLS + session storage)
// OR directly via fetch() from the store (not components, not hooks)

export const useKratosStore = create<KratosState & KratosActions>()((set, get) => ({
  session: null,
  isAuthenticated: false,

  login: async (email: string, password: string) => {
    // Option A: through Rust backend (recommended for session token security)
    const session = await invoke<KratosSession>('kratos_login', { email, password });

    // Option B: direct fetch from store (acceptable for public clients)
    // const flow = await fetch(`${KRATOS_PUBLIC_URL}/self-service/login/api`).then(r => r.json());
    // const session = await fetch(`${KRATOS_PUBLIC_URL}/self-service/login`, { method: 'POST', ... });

    set({ session, isAuthenticated: true });
  },

  logout: async () => {
    await invoke('kratos_logout');
    set({ session: null, isAuthenticated: false });
  },
}));

// TanStack Router auth guard
const authRoute = createRoute({
  beforeLoad: () => {
    if (!useKratosStore.getState().isAuthenticated) {
      throw redirect({ to: '/login' });
    }
  },
});
```

## Supabase

### Architecture

Supabase provides: Postgres database, realtime subscriptions, edge functions, Storage, Auth.
For KnowMe and consumer apps, Supabase Auth (JWT-based) is sufficient.
For enterprise, prefer Kratos (identity) + Supabase (database only, bypass Supabase Auth).

### Flutter integration

```dart
// Initialize in main()
await Supabase.initialize(
  url: AppConfig.supabaseUrl,
  anonKey: AppConfig.supabaseAnonKey,
);

// Riverpod provider
@riverpod
SupabaseClient supabase(Ref ref) => Supabase.instance.client;

// Auth state stream provider
@riverpod
Stream<AuthState> authState(Ref ref) =>
    ref.watch(supabaseProvider).auth.onAuthStateChange;

// Auth notifier
@riverpod
class SupabaseAuthNotifier extends _$SupabaseAuthNotifier {
  @override
  AuthUser? build() => ref.watch(supabaseProvider).auth.currentUser;

  Future<void> signIn(String email, String password) async {
    final response = await ref.read(supabaseProvider).auth.signInWithPassword(
      email: email, password: password,
    );
    state = response.user;
  }

  Future<void> signUp(String email, String password) async {
    final response = await ref.read(supabaseProvider).auth.signUp(
      email: email, password: password,
    );
    state = response.user;
  }

  Future<void> signOut() async {
    await ref.read(supabaseProvider).auth.signOut();
    state = null;
  }
}
```

### React/Tauri integration

```typescript
// features/auth/stores/supabaseStore.ts
import { createClient } from '@supabase/supabase-js';
import {
  makeRestTransport,
  registerEntityTransport,
  useEntities,
} from '@prometheus-ags/prometheus-entity-management';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

registerEntityTransport('UserProfile', makeRestTransport({ supabase, table: 'profiles' }));

export const useAuthStore = create<AuthState & AuthActions>()((set) => ({
  user: null,
  session: null,

  initialize: () => {
    // Listen for auth state changes
    supabase.auth.onAuthStateChange((event, session) => {
      set({ session, user: session?.user ?? null });
    });
  },

  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    set({ session: data.session, user: data.user });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },
}));

// Prometheus Entity Management 3.x for normalized Supabase entity state.
// Register the Supabase transport once during app startup.
export function useUserProfile(userId: string) {
  const profiles = useEntities<UserProfile>('UserProfile', {
    enabled: !!userId,
  })
  return { ...profiles, data: profiles.items.find((profile) => profile.id === userId) ?? null }
}
```

### RLS policies (Supabase best practice)

Always enable RLS on every table. Never expose service_role key to clients.

```sql
-- Enable RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Users can only read their own messages
CREATE POLICY "Users can view own messages"
  ON messages FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own messages
CREATE POLICY "Users can insert own messages"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

## Combining Kratos + Supabase

When using Kratos for identity and Supabase for database:

1. Kratos issues a session token after authentication
2. Your backend exchanges the Kratos session for a Supabase JWT with the correct claims
3. The client uses the Supabase JWT for all database operations
4. RLS policies check the JWT claims

```dart
// In gen_ui_core Rust — exchange Kratos session for Supabase JWT
// This keeps the service role key server-side only
pub async fn exchange_kratos_for_supabase(
    kratos_session_token: &str,
) -> Result<String> {
    // Verify Kratos session via admin API
    // Mint a Supabase JWT with user claims
    // Return the Supabase JWT to the client
}
```
