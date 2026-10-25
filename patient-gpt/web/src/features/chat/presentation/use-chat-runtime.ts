// TJ-ARCH-MOB-001 compliant
// Binds Assistant UI to the run store through an external-store runtime.
// Assistant UI owns composer and thread behaviour; the run store owns the
// stream; ContentBlocks travel as `data-content-block` parts.
import { useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  useExternalStoreRuntime,
  type AppendMessage,
  type AssistantRuntime,
  type ThreadMessageLike,
} from '@assistant-ui/react'
import { useUiStore } from '../../../app/shell/ui-store'
import { scopeKey } from '../../conversations/domain/scope'
import { useRunStore } from '../data/run-store'
import { EMPTY_THREAD, type ChatMessage } from '../domain/chat-message'
import type { ActiveThread } from './active-thread'

export const CONTENT_BLOCK_PART = 'content-block'

function convertMessage(m: ChatMessage): ThreadMessageLike {
  if (m.role === 'user') {
    const text = m.blocks.map((b) => (b.type === 'text' ? b.text : '')).join('')
    return { id: m.id, role: 'user', content: text }
  }
  return {
    id: m.id,
    role: 'assistant',
    content: m.blocks.map((b) => ({ type: `data-${CONTENT_BLOCK_PART}` as const, data: b })),
    status:
      m.status === 'running'
        ? { type: 'running' }
        : m.status === 'complete'
          ? { type: 'complete', reason: 'stop' }
          : { type: 'incomplete', reason: 'cancelled' },
  }
}

function textOf(message: AppendMessage): string {
  return message.content
    .map((p) => (p.type === 'text' ? p.text : ''))
    .join('')
    .trim()
}

/** The run-store key for the active view: a draft key on pages, the local key behind a chat id. */
function useThreadKey(active: ActiveThread): string {
  const sk = scopeKey(active.scope)
  const draftKey = useUiStore((s) => s.draftKeys[sk])
  const draftKeyFor = useUiStore((s) => s.draftKeyFor)
  const localForChat = useRunStore((s) => {
    if (active.conversationId === null) return null
    if (s.threads[active.conversationId]) return active.conversationId
    const hit = Object.entries(s.resolved).find(([, id]) => id === active.conversationId)
    return hit ? hit[0] : null
  })
  useEffect(() => {
    if (active.view === 'page' && !draftKey) draftKeyFor(sk)
  }, [active.view, draftKey, draftKeyFor, sk])
  if (active.view === 'chat' && active.conversationId) return localForChat ?? active.conversationId
  return draftKey ?? ''
}

export function useChatRuntime(active: ActiveThread): AssistantRuntime {
  const navigate = useNavigate()
  const threadKey = useThreadKey(active)
  const thread = useRunStore((s) => s.threads[threadKey] ?? EMPTY_THREAD)
  const resolvedId = useRunStore((s) => s.resolved[threadKey] ?? null)
  const send = useRunStore((s) => s.send)
  const stop = useRunStore((s) => s.stop)
  const rotateDraftKey = useUiStore((s) => s.rotateDraftKey)

  // A conversation started on this device moves to the id the server assigned.
  useEffect(() => {
    if (active.view === 'chat' && resolvedId && active.conversationId !== resolvedId) {
      void navigate({ to: '/chat/$conversationId', params: { conversationId: resolvedId }, replace: true })
    }
  }, [active.view, active.conversationId, resolvedId, navigate])

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const text = textOf(message)
      if (!text || !threadKey) return
      if (active.view === 'page') {
        rotateDraftKey(scopeKey(active.scope))
        void navigate({ to: '/chat/$conversationId', params: { conversationId: threadKey } })
      }
      await send(threadKey, active.scope, text)
    },
    [active.view, active.scope, threadKey, rotateDraftKey, navigate, send],
  )

  const onCancel = useCallback(async () => stop(threadKey), [stop, threadKey])

  const adapter = useMemo(
    () => ({ messages: thread.messages, isRunning: thread.isRunning, convertMessage, onNew, onCancel }),
    [thread.messages, thread.isRunning, onNew, onCancel],
  )
  return useExternalStoreRuntime(adapter)
}

export function useRunEnd(active: ActiveThread) {
  const threadKey = useThreadKey(active)
  return useRunStore((s) => (s.threads[threadKey] ?? EMPTY_THREAD).end)
}

/** The scope a conversation started on this device was started in, by local key or server id. */
export function useLocalThreadScope(conversationId: string | null) {
  return useRunStore((s) => {
    if (!conversationId) return null
    if (s.scopes[conversationId]) return s.scopes[conversationId]
    const hit = Object.entries(s.resolved).find(([, id]) => id === conversationId)
    return hit ? (s.scopes[hit[0]] ?? null) : null
  })
}
