# Tauri + React 19 Patterns Reference
> Tauri 2.10+ · React 19 · Vite 8 · Zustand 5 · Prometheus Entity Management 4.0.2 · TanStack Router/Table · shadcn/ui · Tailwind 4

## Package versions (package.json — current March 2026)

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-shell": "^2.0.0",
    "@tauri-apps/plugin-store": "^2.0.0",
    "zustand": "^5.0.0",
    "@prometheus-ags/entity-graph-react": "4.0.2",
    "@tanstack/react-router": "^1.0.0",
    "@tanstack/react-table": "^8.0.0",
    "@tanstack/react-virtual": "^3.0.0",
    "tailwindcss": "^4.0.0",
    "@shadcn/ui": "latest",
    "lucide-react": "^0.400.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.0.0",
    "react-markdown": "^9.0.0",
    "@codemirror/view": "^6.0.0",
    "@codemirror/lang-javascript": "^6.0.0",
    "@sandpack/react": "^2.0.0",
    "framer-motion": "^11.0.0",
    "@assistant-ui/react": "^0.14.27",
    "immer": "^10.0.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.10.3",
    "vite": "^8.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.4.0",
    "@types/react": "^19.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0"
  }
}
```

## Feature-based clean architecture

```
src/
  app/
    router.tsx              # TanStack Router root
    entityRuntime.ts        # Entity transports and graph runtime registration
    providers.tsx           # App provider tree
  core/
    types/                  # Shared TypeScript types
    errors/                 # AppError types
    utils/                  # Pure utility functions
    theme/                  # Design tokens, CSS variables
  features/
    <feature-name>/
      api/                  # Tauri invoke() wrappers (called only from stores)
      stores/               # Zustand stores (client-side state)
      entities/             # Prometheus Entity Management hooks/transports
      hooks/                # Composed hooks (what components use)
      components/           # Feature UI components
      types.ts              # Feature-specific types
  shared/
    components/             # Shared shadcn/ui based components
    hooks/                  # Shared hooks
    stores/                 # Global stores (auth, settings, chat)
  bridge/
    a2ui/                   # A2UI TypeScript event types + content driver
    agui/                   # AG-UI Zustand store
  main.tsx
```

## State management — the strict layer contract

```
Component → Hook → Store → [Rust IPC invoke() / external API]
```

**Components** import only hooks. Never `useXxxStore` directly in components.
**Hooks** compose from stores and Prometheus Entity Management hooks. Never call `invoke()` in hooks.
**Stores** call `invoke()` / `emit()` and manage all side effects.

`@prometheus-ags/entity-graph-react` 4.0.2 is the maintained normalized server/async/entity-state layer. Do not add TanStack Query. Register transports once at the store/runtime boundary, read entities through `useEntities` / `useEntityQuery` / `useEntity`, and perform graph-aware writes through `useEntityMutation`.

For chat, Assistant UI owns thread/composer/thread-list behavior and Shadcn UI owns general interaction primitives. Conversation, message, block, citation, attachment, draft, and append-only protocol-event entities are normalized by Prometheus Entity Management. PGlite persists them in the browser; typed Tauri commands persist the same logical model in pglite-oxide. Zustand may assemble an in-flight stream and track selection/drafts, but it is not the durable conversation database. All chat surfaces follow Flat 2.0: no visible borders, divider lines, or layout shadows; adjacent regions differ by background color.

### Zustand store pattern (client-side state)

```typescript
// features/chat/stores/chatStore.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';
import { listen } from '@tauri-apps/api/event';
import type { ContentBlock, Message } from '../types';

interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  activeRunId: string | null;
}

interface ChatActions {
  streamBlock: (params: StreamBlockParams) => void;
  finalizeMessage: (messageId: string, usage?: MessageUsage) => void;
  sendMessage: (text: string) => Promise<void>;
}

export const useChatStore = create<ChatState & ChatActions>()(
  subscribeWithSelector(
    immer((set, get) => ({
      messages: [],
      isStreaming: false,
      activeRunId: null,

      streamBlock: ({ messageId, blockIndex, block }) =>
        set((state) => {
          const msg = state.messages.find((m) => m.id === messageId);
          if (!msg) return;
          if (blockIndex !== undefined && blockIndex < msg.content.length) {
            msg.content[blockIndex] = block;
          } else {
            msg.content.push(block);
          }
        }),

      finalizeMessage: (messageId, usage) =>
        set((state) => {
          const msg = state.messages.find((m) => m.id === messageId);
          if (msg) { msg.isStreaming = false; msg.usage = usage; }
          state.isStreaming = false;
        }),

      sendMessage: async (text) => {
        set({ isStreaming: true });
        // Store calls invoke() directly — never a component or hook
        await invoke('stream_agent_a2ui', {
          userMessage: text,
          history: get().messages.map(/* ... */),
        });
      },
    }))
  )
);
```

### Prometheus Entity Management hook (server-side / async entity state)

```typescript
// features/memory/entities/useMemories.ts
import {
  useEntities,
  useEntityMutation,
} from '@prometheus-ags/prometheus-entity-management';
import { memoryApi } from '../api/memoryApi';

export function useMemoryEntities(search: string) {
  const list = useEntities<MemoryRecord>('Memory', {
    search,
    enabled: search.length > 2,
  });
  const write = useEntityMutation<MemoryWriteParams, MemoryRecord, MemoryRecord>({
    type: 'Memory',
    mutate: memoryApi.write,
    normalize: (record) => ({ id: record.id, data: record }),
  });
  return { ...list, writeMemory: write.mutate, writeState: write.state };
}
```

### Feature hook (composing store + query — what components use)

```typescript
// features/memory/hooks/useMemory.ts
// ✓ Components import ONLY this hook — never stores or entity modules directly

import { useMemoryEntities } from '../entities/useMemories';
import { useChatStore } from '../../chat/stores/chatStore';

export function useMemory(query: string) {
  const { items: memories, isLoading, writeMemory, writeState } = useMemoryEntities(query);
  // Access chat store state needed for memory context
  const activeRunId = useChatStore((s) => s.activeRunId);

  return {
    memories,
    isLoading,
    writeMemory,
    isWriting: writeState.isPending,
    hasContext: activeRunId !== null,
  };
}
```

### Component using hook (never imports store)

```typescript
// features/memory/components/MemorySearchPanel.tsx
// ✓ Imports only the hook

import { useMemory } from '../hooks/useMemory';

export function MemorySearchPanel() {
  const [query, setQuery] = useState('');
  const { memories, isLoading, writeMemory } = useMemory(query);

  return (
    <div className="space-y-2">
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search memory..." />
      {isLoading ? <Spinner /> : memories.map((m) => <MemoryCard key={m.key} memory={m} />)}
    </div>
  );
}
```

## TanStack Router with auth guard

```typescript
// app/router.tsx
import { createRouter, createRoute, redirect } from '@tanstack/react-router';

const rootRoute = createRootRouteWithContext<{ auth: AuthStore }>()({
  component: RootLayout,
});

const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'protected',
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) throw redirect({ to: '/login' });
  },
});

const chatRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/chat',
  component: ChatScreen,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([protectedRoute.addChildren([chatRoute])]),
  context: { auth: undefined! }, // injected via RouterProvider
});
```

## shadcn/ui setup and usage

```bash
# Initialize shadcn/ui (run during scaffold)
npx shadcn@latest init
# Select: Tailwind 4, CSS variables, dark mode: class
```

```typescript
// Use shadcn primitives directly
import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/components/ui/dialog';
import { Card, CardContent, CardHeader } from '@/shared/components/ui/card';
import { ScrollArea } from '@/shared/components/ui/scroll-area';

// For AI-specific components, use assistant-ui
import { ThreadPrimitive, MessagePrimitive } from '@assistant-ui/react';
```

## Tauri IPC patterns (stores only)

```typescript
// Correct: invoke() in store action
sendMessage: async (text) => {
  await invoke('stream_agent_a2ui', { userMessage: text });
}

// Correct: listen() in store setup (call in app init)
export function initEventListeners() {
  listen<FrbA2uiEvent>('a2ui_event', ({ payload }) => {
    const event = A2uiEvent.fromFrb(payload);
    useChatStore.getState().applyA2uiEvent(event);
  });
}

// Wrong: invoke() in component
function ChatInput() {
  const onClick = () => invoke('send'); // ✗ Never this
}

// Wrong: invoke() in hook
function useChat() {
  const send = () => invoke('send'); // ✗ Never this
}
```

## Zustand + Tauri plugin store (persistence)

```typescript
import { createStore } from '@tauri-apps/plugin-store';
import { persist } from 'zustand/middleware';

// Persist settings across app restarts via Tauri Store plugin
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      model: 'claude-opus-4-5',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'app-settings',
      storage: createTauriStorage(), // custom storage adapter using @tauri-apps/plugin-store
    }
  )
);
```

## Rust-side state extension (Tauri Zustand plugin)

When Rust state must be reflected in React (e.g., inference progress, connection status):

```rust
// Rust: emit state updates via Tauri event
app.emit("rust_state_update", json!({
    "type": "inference_progress",
    "tokens_generated": count,
    "model_id": model_id,
}))?;
```

```typescript
// TypeScript: sync to Zustand store
listen<RustStateUpdate>('rust_state_update', ({ payload }) => {
  useInferenceStore.getState().applyUpdate(payload);
});
```

## ContentBlock TypeScript types

```typescript
// bridge/a2ui/types.ts
export type ContentBlock =
  | { type: 'text'; text: string; isStreaming: boolean }
  | { type: 'thinking'; thinking: string; isStreaming: boolean; defaultExpanded?: boolean }
  | { type: 'code'; code: string; language: string; filename?: string }
  | { type: 'citation'; text: string; sources: CitationSource[] }
  | { type: 'memory'; content: string; memoryType: MemoryType; key: string; isNew: boolean; namespace?: string }
  | { type: 'toolUse'; toolUseId: string; toolName: string; input: Record<string, unknown>; status: ToolStatus; serverName?: string }
  | { type: 'toolResult'; toolUseId: string; toolName: string; content: unknown; isError: boolean; executionTime?: number }
  | { type: 'skill'; skillId: string; skillName: string; parameters: Record<string, unknown>; status: SkillStatus; outputSummary?: string; toolCallIds?: string[] }
  | { type: 'artifact'; artifactId: string; artifactType: ArtifactType; title: string; contentJson: string; language?: string }
  | { type: 'image'; source: string; altText?: string }
  | { type: 'divider' };

// Exhaustive render dispatch — TypeScript enforces all cases
export function renderBlock(block: ContentBlock): React.ReactNode {
  switch (block.type) {
    case 'text':       return <StreamingText {...block} />;
    case 'thinking':   return <ThinkingBlock {...block} />;
    case 'code':       return <CodeBlock {...block} />;
    case 'citation':   return <CitationBlock {...block} />;
    case 'memory':     return <MemoryBlock {...block} />;
    case 'toolUse':    return <ToolUseBlock {...block} />;
    case 'toolResult': return <ToolResultBlock {...block} />;
    case 'skill':      return <SkillBlock {...block} />;
    case 'artifact':   return <ArtifactBlock {...block} />; // Sandpack inside
    case 'image':      return <ImageBlock {...block} />;
    case 'divider':    return <Divider />;
    // TypeScript will error if any case is missing
  }
}
```

## Navigation placement — mobile web / PWA (C-113)

The React bundle serves Tauri desktop **and** mobile-web/PWA, where it runs on iOS and
Android browsers. The rule:

**One convention: bottom navigation at phone width, rail above it. No platform
detection.**

### Why not adapt to the detected platform

1. **Nothing to adapt to.** iOS and Android converge on bottom placement for top-level
   destinations at phone width — Apple's HIG puts the tab bar at the **bottom** for
   "top-level sections"; M3 says navigation bars are "**always placed at the bottom**"
   for "top-level destinations". One bottom bar satisfies both. Android's top tabs are a
   different component for a different purpose ("navigation for distinct pages and tabs
   for related content within a page"), not a rival placement.
2. **No authority backs the alternative.** web.dev's PWA
   [App design](https://web.dev/learn/pwa/app-design) chapter — the closest candidate —
   doesn't address navigation placement at all. Its only platform-adaptation advice is
   cosmetic and internally inconsistent (icons platform-*agnostic*, fonts
   platform-*native*).
3. **Detection is unreliable.** OS detection on the web is UA-sniffing, and Client Hints
   deliberately reduce that signal. Adaptive nav means shipping and testing two nav trees
   keyed off a fragile input, for no guidance-backed benefit.

### Branch on width, never on OS

Both platforms abandon bottom placement as windows widen (Apple → top tab bar/sidebar on
iPad; M3 → `NavigationRail`). That's a **form-factor** split, and it's the only one:

```css
/* index.css — make `sm:` mean M3's compact→medium boundary, not Tailwind's 640px.
   https://m3.material.io/foundations/layout/applying-layout/window-size-classes */
@theme { --breakpoint-sm: 600px; }
```

```tsx
// One destinations list, two chromes. Never a platform check.
<nav aria-label="Main (rail)"   className="hidden sm:flex …">…</nav>
<main>{children}</main>
<nav aria-label="Main (bottom bar)" className="flex sm:hidden …">…</nav>
```

Label the two navs distinctly — only one is visible, but two identically-named "Main"
landmarks are ambiguous to a screen reader.

### PWA specifics

- `pb-[env(safe-area-inset-bottom)]` on the bottom bar, or it sits under the iOS home
  indicator when installed.
- Derive the active destination from the router
  (`useRouterState({ select: s => s.location.pathname })`), don't mirror it into a store —
  that's a second source of truth for "where am I".
- Exact-match the index route (`path === '/' ? pathname === '/' : pathname.startsWith(path)`),
  or `/` lights up on every route.

### Layer contract

The shell is a component that reads the router's own hooks — it needs no store. Keep one
destinations list (see the PoC's `src/app/navigation.ts`) so a destination can't drift
between the bar and the rail.
