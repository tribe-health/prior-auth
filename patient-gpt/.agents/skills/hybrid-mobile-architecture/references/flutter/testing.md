# Flutter Testing Reference — features-first
> `flutter_test` · **golden tests (VGV workflow)** · `ProviderContainer` boundary tests · no internal mocks

> **Read CLAUDE.md "Testing: features first, tests later" — it overrides any global TDD /
> 80%-coverage rule.** Build the feature, get it clean under `flutter analyze`, run it once on
> device/simulator (hot-reload verify loop), *then* add a few boundary + golden tests.

## Principles (binding)

- **Features first. Code first. Test later.** No tests until the feature is complete, passes
  `flutter analyze`, and has been exercised once end-to-end.
- **No mocks of internal code.** Do not mock your own repositories, notifiers, or services.
  The canonical data path (Widget → `@riverpod` provider → repository → **FFI → gen_ui_core**)
  is the thing under test; override providers at the edge instead of mocking the middle.
- **Fakes only at the real boundary.** The real IO boundary in a Flutter surface is the FFI
  call into `gen_ui_core`. Override the FFI-backed provider with a small fake that returns
  canned Rust-shaped data. Everything above it stays real.
- **Test USEFUL COMBINATIONS a user can observe:** a screen renders the right ContentBlocks
  for a given event stream; a notifier folds a stream into the right state. Not private helper
  methods.
- **Prefer golden tests** for anything visual (ContentBlock widgets, chat surfaces) — pixels
  in, golden out. A change costs `flutter test --update-goldens`, not a widget-tree rewrite.
  Follow the VGV golden-test workflow (see `references/ui-skills.md`).
- **Budget: 3–5 behavior/golden tests per completed feature.** Coverage % is not a goal.
- **If a test fails twice and you cannot fix it, STOP** and report. Never delete, `skip`, or
  edit a failing test to force green without approval.

## Dev-dependencies

```yaml
dev_dependencies:
  flutter_test:
    sdk: flutter
  build_runner: ^2.4.13
  # golden helpers (VGV-style) — pick ONE:
  alchemist: ^0.12.0        # deterministic goldens across CI/host
  # NOTE: no mockito, no mocktail, no riverpod_test-with-mocks. We do not mock internal code.
```

## Boundary test: a notifier folds an FFI stream (no internal mocks)

Override only the FFI-backed provider at the edge with a fake stream; the `ChatNotifier`,
`A2uiContentDriver`, and ContentBlock folding are all real.

```dart
// test/features/chat/chat_flow_test.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

// A fake ONLY at the FFI edge — returns Rust-shaped events, mocks nothing internal.
Stream<A2uiEvent> _fakeAgentStream(AgentRequest _) async* {
  yield const A2uiEvent.textDelta(index: 0, delta: 'Hello ', isFinal: false);
  yield const A2uiEvent.textDelta(index: 0, delta: 'world',  isFinal: true);
  yield const A2uiEvent.runFinished(runId: 'run-1');
}

void main() {
  test('chat notifier folds a text stream into one final text block', () async {
    final container = ProviderContainer(overrides: [
      // Override the FFI provider — the real boundary — not the notifier.
      agentStreamProvider.overrideWith((ref, req) => _fakeAgentStream(req)),
    ]);
    addTearDown(container.dispose);

    await container.read(chatNotifierProvider.notifier)
        .sendMessage('hi');

    final state = container.read(chatNotifierProvider);
    final blocks = state.messages.last.content;
    expect(blocks, hasLength(1));
    expect(blocks.first, isA<TextBlock>());
    expect((blocks.first as TextBlock).text, 'Hello world');
  });
}
```

## Golden test: a ContentBlock widget (pixels in, golden out)

```dart
// test/features/chat/widgets/thinking_block_golden_test.dart
import 'package:alchemist/alchemist.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  goldenTest(
    'ThinkingBlock renders reasoning',
    fileName: 'thinking_block',
    builder: () => GoldenTestGroup(children: [
      GoldenTestScenario(
        name: 'streaming',
        child: const ThinkingBlockWidget(thinking: 'Test reasoning', isStreaming: true),
      ),
      GoldenTestScenario(
        name: 'final',
        child: const ThinkingBlockWidget(thinking: 'Test reasoning', isStreaming: false),
      ),
    ]),
  );
}
```

## Screen test: exhaustiveness of the ContentBlock switch

The Dart compiler already enforces that every `ContentBlock` variant has a case (missing one
is a compile error — the layer contract). A single screen test confirms the wiring renders,
without asserting on private markup:

```dart
testWidgets('ChatScreen renders each ContentBlock variant', (tester) async {
  await tester.pumpWidget(ProviderScope(
    overrides: [
      // Seed the notifier's state via the FFI-edge override, not a mock repository.
      chatNotifierProvider.overrideWith(() => _seededChatNotifier(oneOfEachBlock)),
    ],
    child: const MaterialApp(home: ChatScreen()),
  ));
  await tester.pumpAndSettle();
  // Observable behavior: no unhandled-variant error, all block widgets mounted.
  expect(find.byType(TextBlockWidget), findsWidgets);
  expect(tester.takeException(), isNull);
});
```

## Running tests

```bash
# Inner loop is the analyzer + hot-reload verify, NOT the test runner
flutter analyze

# Behavior + golden tests (once a feature is complete)
flutter test
flutter test test/features/chat/chat_flow_test.dart   # single file
flutter test --update-goldens                          # accept golden changes
```

No coverage command and no coverage gate — completion is "feature works end-to-end + a few
boundary/golden tests", not a percentage.
