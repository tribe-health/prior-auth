# Tauri + React Testing Reference — features-first
> Vitest · React Testing Library · **inline/file snapshots** · MSW at the HTTP boundary only

> **Read CLAUDE.md "Testing: features first, tests later" — it overrides any global TDD /
> 80%-coverage rule.** Build the feature, get it clean under `tsc --noEmit` + ESLint, run it
> once in `tauri dev`, *then* add a few boundary + snapshot tests.

## Principles (binding)

- **Features first. Code first. Test later.** No tests until the feature is complete,
  type-checks, and has been exercised once end-to-end.
- **No mocks of internal code.** Do not mock your own stores, hooks, or components. The
  business logic lives in **`gen_ui_core` (Rust)**, not in TS — there is little internal TS
  logic to unit-test, and mocking the store you're testing proves nothing.
- **Fake only at the real boundary.** The real IO boundaries are Tauri `invoke()` (desktop)
  and HTTP (Supabase/Electric on web). Stub `invoke` / use **MSW** for those; everything above
  stays real. Remember the layer contract: `invoke()`/`listen()` live **only** in Zustand
  stores, so a store test stubbing `invoke` is testing the real boundary correctly.
- **Test USEFUL COMBINATIONS a user can observe:** a hook returns the derived data a component
  renders; a store folds a stream of Rust events into the right state. Not private reducers.
- **Prefer snapshots** (`toMatchInlineSnapshot` / `toMatchSnapshot`) for state-shape and
  rendered-output assertions — a behavior change costs `vitest -u`, not a test rewrite.
- **Budget: 3–5 behavior/snapshot tests per completed feature.** Coverage % is not a goal;
  there is no coverage threshold in the Vitest config.
- **Keep the layer-contract tests** below — they are cheap static guards, not behavior mocks.
- **If a test fails twice and you cannot fix it, STOP** and report. Never `.skip`, delete, or
  edit a failing test to force green without approval.

## Dev-dependencies

```jsonc
// package.json
"devDependencies": {
  "vitest": "^2.1.0",
  "@testing-library/react": "^16.0.0",
  "@testing-library/user-event": "^14.5.0",
  "msw": "^2.4.0"        // fake at the HTTP boundary only
  // NOTE: no per-feature mock libraries for internal code. Stub invoke / use MSW at IO edges.
}
```

## Boundary test: a store folds a Rust event stream (snapshot)

The store is the only layer allowed to touch `invoke`/`listen`, so stub the Tauri boundary and
feed it Rust-shaped events. The store's folding logic is real; nothing internal is mocked.

```typescript
// src/features/chat/stores/chatStore.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useChatStore } from './chatStore'

beforeEach(() => {
  useChatStore.setState({ messages: [], isStreaming: false, activeRunId: null })
})

describe('chatStore folds A2UI events', () => {
  it('folds text deltas into a single final block', () => {
    useChatStore.setState({
      messages: [{ id: 'm1', role: 'assistant', content: [], timestamp: '' }],
    })
    const { applyEvent } = useChatStore.getState()

    // Rust-shaped events at the boundary — the fold is the real code under test.
    applyEvent({ type: 'textDelta', index: 0, delta: 'Hello ', isFinal: false })
    applyEvent({ type: 'textDelta', index: 0, delta: 'world',  isFinal: true })

    // Snapshot the resulting content shape; changes cost `vitest -u`.
    expect(useChatStore.getState().messages[0].content).toMatchInlineSnapshot()
  })
})
```

## Boundary test: a hook returns what a component renders

Stub `invoke` (the IO edge) and assert the derived data the hook exposes. The store and hook
composition are real.

```typescript
// src/features/memory/hooks/useMemory.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { useMemory } from './useMemory'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() })) // the real IO boundary

describe('useMemory', () => {
  it('filters memories by query', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockResolvedValue([
      { key: 'note-1', value: 'Flutter patterns', memoryType: 'semantic', namespace: 'default' },
      { key: 'note-2', value: 'Rust patterns',    memoryType: 'semantic', namespace: 'default' },
    ])
    const { result } = renderHook(() => useMemory('Flutter'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.memories).toHaveLength(1)
    expect(result.current.memories[0].key).toBe('note-1')
  })
})
```

## Static guard: layer-contract enforcement (keep — not a mock)

These assert the architecture, not behavior. They are cheap and catch layer violations at
test time (components importing stores, or calling `invoke` directly).

```typescript
// src/features/chat/components/MessageBubble.contract.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('layer contract: MessageBubble', () => {
  const src = readFileSync('src/features/chat/components/MessageBubble.tsx', 'utf-8')
  it('does not import stores directly', () => {
    expect(src).not.toMatch(/from ['"].*stores\/.*Store/)
  })
  it('does not call invoke()', () => {
    expect(src).not.toMatch(/invoke\(/)
  })
})
```

## Running tests

```bash
# Inner loop is the type-checker + lint + `tauri dev`, NOT the test runner
npx tsc --noEmit && npx eslint src/

# Behavior + snapshot tests (once a feature is complete)
npm test
npm test -- src/features/chat/stores/chatStore.test.ts   # single file
npx vitest -u                                             # accept snapshot changes
```

No coverage threshold is configured, and none should be added — completion is "feature works
in `tauri dev` + a few boundary/snapshot tests", not a percentage.
