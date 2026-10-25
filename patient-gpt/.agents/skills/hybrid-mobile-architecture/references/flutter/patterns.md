# Flutter Patterns Reference
> Flutter beta channel (latest) · **Riverpod 3.3** · flutter_rust_bridge 2.12+

## Dependency versions (always use latest)

```yaml
# pubspec.yaml (current as of July 2026)
dependencies:
  flutter_riverpod: ^3.3.2
  riverpod_annotation: ^4.0.3
  freezed_annotation: ^2.4.4
  json_annotation: ^4.9.0
  flutter_rust_bridge: ^2.12.0
  riverpod_sqflite: ^0.2.0     # offline provider-cache persistence (Riverpod 3)
  shadcn_flutter: ^0.1.6       # shadcn/ui equivalent for Flutter
  go_router: ^15.0.0           # routing
  markdown_widget: ^2.3.2+6
  flutter_highlight: ^0.7.0
  google_fonts: ^6.2.1
  flutter_animate: ^4.5.0
  gap: ^3.0.1
  uuid: ^4.5.1

dev_dependencies:
  build_runner: ^2.4.13
  freezed: ^2.5.7
  json_serializable: ^6.8.0
  riverpod_generator: ^4.0.4
  custom_lint: ^0.7.5
  riverpod_lint: ^4.0.0
  flutter_lints: ^4.0.0
```

## Riverpod 3 migration notes (from the repo's old 2.6 references)

Riverpod 3 is a mostly-mechanical migration, but a few changes are load-bearing for this
architecture:

- **Unified `Ref`** — the typed `FooRef` parameters are gone; every provider/notifier takes a
  plain `Ref`. Notifier supertypes are fused: no more `AutoDisposeAsyncNotifier` — use
  `AsyncNotifier` (auto-dispose is the default for codegen providers).
- **`AsyncValue` is now sealed**; errors surface wrapped in `ProviderException`.
- **`ref.mounted` guard** exists — check it after every `await` inside a notifier before
  touching state. Providers now **pause** when their widgets are not visible.
- **Automatic retry is ON by default** (200ms → 6.4s backoff). This is the one that bites FFI
  providers — see the next section.
- New sanctioned APIs: the **Mutations API** for send/submit flows, and `riverpod_sqflite`
  for offline provider-cache persistence.

## Feature-based clean architecture

```
lib/
  app/
    router.dart              # GoRouter configuration
    providers.dart           # App-level providers
  core/
    theme/                   # Design tokens, ThemeData
    errors/                  # AppError, Failure types
    network/                 # HTTP client setup (delegates to Rust)
    extensions/
  features/
    <feature-name>/
      data/
        repositories/        # Implements domain interfaces
        datasources/         # Remote (Rust FFI) + local
        models/              # DTOs, JSON serialization
      domain/
        entities/            # Core business objects (freezed)
        repositories/        # Abstract interfaces
        usecases/            # Single-responsibility use cases
      presentation/
        providers/           # @riverpod annotated providers
        screens/             # Screen widgets
        widgets/             # Feature-specific widgets
  shared/
    widgets/                 # Shared UI components
    providers/               # Shared providers
  bridge/
    a2ui/                    # A2UI event types + content driver
    agui/                    # AG-UI provider
    rust_bridge_provider.dart
    generated_api.dart       # flutter_rust_bridge codegen output
  main.dart
```

## Riverpod patterns

### Provider declaration (always use codegen)

```dart
// ✓ Correct: codegen annotation
@riverpod
class ChatNotifier extends _$ChatNotifier {
  @override
  ChatState build() => const ChatState.initial();

  Future<void> sendMessage(String text) async { ... }
}

// ✗ Wrong: manual declaration
final chatProvider = StateNotifierProvider<ChatNotifier, ChatState>(
  (ref) => ChatNotifier(),
);
```

### Async streaming provider

```dart
// Stream from Rust via StreamSink → Dart Stream
@riverpod
Stream<A2uiEvent> agentStream(Ref ref, AgentRequest request) {
  // Cancel stream subscription on provider disposal
  ref.onDispose(() { /* cleanup */ });
  return streamAgentA2ui(request); // from bridge/rust_bridge_provider.dart
}
```

### Provider composition (dependency injection)

```dart
@riverpod
class MessageRepository extends _$MessageRepository {
  @override
  MessageRepositoryImpl build() {
    // Inject dependencies from other providers
    final db = ref.watch(surrealDbProvider);
    return MessageRepositoryImpl(db: db);
  }
}
```

### FFI providers MUST opt out of automatic retry (CRITICAL)

Riverpod 3 retries a failed provider automatically (200ms → 6.4s backoff). For providers that
call into `gen_ui_core` over the FFI boundary, a Rust **domain error** (e.g. "model not
found", "auth rejected") is a real, terminal result — not a transient failure. If retry is
left on, Riverpod silently re-invokes the FFI call, re-running the whole Rust operation. Every
FFI-backed provider must disable retry:

```dart
// ✓ Correct: opt out of retry on FFI-backed providers.
// Return null from retry to make failures terminal.
@Riverpod(retry: _noRetry)
Future<AgentReply> agentReply(Ref ref, AgentRequest req) async {
  return await streamAgentOnce(req); // gen_ui_core FFI call
}

Duration? _noRetry(int retryCount, Object error) => null;
```

Apply this to any provider whose body reaches `gen_ui_core`. UI-only providers may keep the
default retry. This rule ships in the scaffold templates.

### autoDispose for streaming providers

```dart
// Codegen providers are auto-dispose by default in Riverpod 3.
// Still cancel the underlying subscription on disposal.
@riverpod
Stream<String> inferenceStream(Ref ref, InferenceRequest req) async* {
  final sub = localGenerate(req).listen(null);
  ref.onDispose(sub.cancel);
  yield* localGenerate(req);
}
```

### Mutations API for send/submit flows

Use the Riverpod 3 **Mutations API** for imperative send/submit actions (chat send, form
submit) instead of hand-rolled loading booleans — it gives a first-class pending/error/success
state the UI can render:

```dart
// Declare a mutation alongside the notifier
final sendMessage = Mutation<void>();

// In the widget: run it and read its state
final sendState = ref.watch(sendMessage);
ElevatedButton(
  onPressed: sendState.isPending
      ? null
      : () => sendMessage.run(ref, (tsx) async {
            // guarded FFI send; terminal on Rust domain error
            await tsx.get(chatNotifierProvider.notifier).sendMessage(text);
          }),
  child: sendState.isPending ? const CircularProgressIndicator() : const Text('Send'),
);
```

### Watch vs read patterns

```dart
// In build() or widget build context: use watch (reactive)
final state = ref.watch(chatNotifierProvider);

// In callbacks / event handlers: use read (not reactive)
void onTap() {
  ref.read(chatNotifierProvider.notifier).sendMessage(text);
}
```

## ContentBlock integration (Riverpod side)

The `ChatNotifier.streamBlock()` folding pattern survives the Riverpod 3 migration with one
edit: guard with `ref.mounted` after every `await`, because the provider can pause/dispose
while a stream is in flight.

```dart
// ChatNotifier owns all ContentBlock mutations
@riverpod
class ChatNotifier extends _$ChatNotifier {
  @override
  ChatState build() => const ChatState.initial();

  // A2uiContentDriver calls these (sync — no await, safe):
  void streamBlock({
    required String messageId,
    int? blockIndex,
    required ContentBlock block,
  }) { ... }

  void finalizeMessage(String messageId, {MessageUsage? usage}) { ... }

  // When folding an async stream, re-check ref.mounted after each await:
  Future<void> foldStream(Stream<A2uiEvent> stream) async {
    await for (final ev in stream) {
      if (!ref.mounted) return; // provider paused/disposed — stop touching state
      _apply(ev);
    }
  }
}
```

## shadcn_flutter component patterns

```dart
import 'package:shadcn_flutter/shadcn_flutter.dart';

// Use ShadcnApp instead of MaterialApp
ShadcnApp(
  theme: ShadcnThemeData(
    colorScheme: ShadcnColorScheme.dark(),
    radius: BorderRadius.circular(8),
  ),
  home: const AppShell(),
)

// Button
ShadButton(
  onPressed: () {},
  child: const Text('Send'),
)

// Card
ShadCard(
  child: Column(children: [...]),
)

// Dialog (for HITL confirmations)
showShadDialog(
  context: context,
  builder: (context) => ShadDialog(
    title: const Text('Confirm action'),
    actions: [
      ShadButton(child: const Text('Confirm'), onPressed: confirm),
    ],
  ),
);
```

## gen_ui_core FFI wiring

### Initialization (main.dart)

```dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Initialize Rust runtime before runApp
  await initRustBridge(dataDir: (await getApplicationDocumentsDirectory()).path);
  // The bundled local model requires no credential. Optional cloud providers
  // are configured later through the Rust provider-admin intent surface, which
  // stores secret material in platform secure storage.
  runApp(const ProviderScope(child: App()));
}
```

### Connecting A2UI stream to ContentDriver

```dart
// In ChatNotifier or a dedicated StreamingNotifier
final _driver = <String, A2uiContentDriver>{};

Future<void> _connectStream(String messageId, Stream<A2uiEvent> stream) {
  final driver = A2uiContentDriver(
    messageId: messageId,
    onBlock: streamBlock,
    onFinalize: finalizeMessage,
  )..connect(stream);
  _driver[messageId] = driver;
  ref.onDispose(() => driver.dispose());
}
```

## GoRouter with auth guard

```dart
final router = GoRouter(
  redirect: (context, state) {
    final isAuthenticated = ref.read(authStateProvider).isAuthenticated;
    final isLoginRoute = state.matchedLocation == '/login';
    if (!isAuthenticated && !isLoginRoute) return '/login';
    if (isAuthenticated && isLoginRoute) return '/';
    return null;
  },
  routes: [
    GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
    GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
    ShellRoute(builder: (_, __, child) => AppShell(child: child), routes: [
      GoRoute(path: '/chat', builder: (_, __) => const ChatScreen()),
    ]),
  ],
);
```

## Ory Kratos integration (Flutter)

See `references/auth/patterns.md` for full patterns. Minimal bootstrap:

```dart
// Kratos native SDK integration
// Use kratos_dart_client (auto-generated from OpenAPI)
final kratosApi = FrontendApi(ApiClient(basePath: kratosPublicUrl));

// Get login flow
final flow = await kratosApi.createNativeLoginFlow();

// Submit credentials
await kratosApi.updateLoginFlow(
  flow: flow.id,
  updateLoginFlowBody: UpdateLoginFlowBody(
    UpdateLoginFlowWithPasswordMethod(
      method: 'password',
      identifier: email,
      password: password,
    ),
  ),
);
```

## Supabase integration (Flutter)

```dart
// Initialize in main()
await Supabase.initialize(url: supabaseUrl, anonKey: anonKey);

// Riverpod provider
@riverpod
SupabaseClient supabase(Ref ref) => Supabase.instance.client;

// Auth state provider
@riverpod
Stream<AuthState> authState(Ref ref) =>
    ref.watch(supabaseProvider).auth.onAuthStateChange;
```

## Navigation placement (C-113)

**Top-level destinations go in a bottom `NavigationBar`.** Not a top tab bar.

This is not a stylistic preference and it is not a per-platform branch — it is what
both platforms' own guidance says:

- **iOS HIG** ([Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)):
  a tab bar "lets people navigate between **top-level sections**" and "floats above
  content at the **bottom of the screen**". Top-placed tab bars on iPhone aren't
  discouraged — they're never contemplated. The HIG's explicit prohibition is about
  *purpose*: "Use a tab bar to support navigation, not to provide actions."
- **Material 3** ([Navigation bar](https://m3.material.io/components/navigation-bar/guidelines)):
  navigation bars are "**always placed at the bottom**", carry "**three to five**"
  destinations, and "should be used for **top-level destinations**".

### The trap: M3 tabs are not navigation

Android has a top tabs component, which makes it *look* like the platforms disagree.
They don't. M3 draws the line by purpose, not placement
([Tabs](https://m3.material.io/components/tabs/guidelines)):

> Use navigation for distinct pages and **tabs for related content within a page**.

M3's own illustration puts tabs *inside* a navigation-bar destination. So:

- App-level destinations (Chat, Notes, Memory) → bottom `NavigationBar`. Both platforms.
- Switching content *within* one destination → `TabBar` under the app bar. Android idiom;
  on iOS prefer a segmented control.

M3 also says <3 destinations → use tabs instead of a nav bar, and >5 → tabs or a rail.

### Where the platform check goes: nowhere

There is no platform check. One bottom `NavigationBar` satisfies HIG and M3
simultaneously, so `Platform.isIOS` in navigation code is a smell — it implies a
divergence that doesn't exist at phone width, and it's a branch nobody tests both sides
of.

### What DOES change: form factor, not OS

Both platforms abandon bottom placement as the window widens — Apple moves the tab bar
to the top on iPad; M3 swaps the bar for a `NavigationRail`. Branch on **width**, never
on OS:

```dart
// Scope the switch to layout, not platform.
final useRail = MediaQuery.sizeOf(context).width >= 600; // M3 compact→medium
```

### Layer contract

Navigation state belongs to the router, not a Riverpod provider. `GoRouter`'s
`ShellRoute` owns the shell; the selected index is *derived* from
`GoRouterState.of(context).matchedLocation` rather than stored — two sources of truth
for "where am I" is how the bar and the route drift apart. Keep one destinations list
so labels, icons, and paths cannot disagree (see the PoC's `lib/app/router.dart`).
