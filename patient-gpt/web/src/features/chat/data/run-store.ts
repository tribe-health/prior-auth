// TJ-ARCH-MOB-001 compliant
// Transient chat state: the messages of runs started in this session and the
// stream in flight. Durable conversation records are entity-graph entities
// (see features/conversations); this store is not a conversation database.
// It is the only layer that calls the host transport for runs.
import { create } from 'zustand'
import type { ConversationScope } from '../../../app/transport/dto'
import type { PatientGptTransport } from '../../../app/transport/transport'
import { recordConversation } from '../../conversations/data/conversation-entity'
import { applyAguiEvent, settleThread } from '../domain/apply-agui-event'
import { EMPTY_THREAD, type ChatThread } from '../domain/chat-message'

type RunStoreState = {
  threads: Record<string, ChatThread>
  /** Thread keys made on this device, resolved to the id the server assigned. */
  resolved: Record<string, string>
  /** The scope each thread was started in. */
  scopes: Record<string, ConversationScope>
}

type RunStoreActions = {
  send: (threadKey: string, scope: ConversationScope, text: string) => Promise<void>
  stop: (threadKey: string) => void
}

let transport: PatientGptTransport | null = null
const controllers = new Map<string, AbortController>()

export function configureRunStore(t: PatientGptTransport): void {
  transport = t
}

const TITLE_MAX = 60
function titleFrom(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > TITLE_MAX ? `${one.slice(0, TITLE_MAX - 1)}…` : one
}

export const useRunStore = create<RunStoreState & RunStoreActions>()((set, get) => {
  const update = (key: string, f: (t: ChatThread) => ChatThread) =>
    set((s) => ({ threads: { ...s.threads, [key]: f(s.threads[key] ?? EMPTY_THREAD) } }))

  return {
    threads: {},
    resolved: {},
    scopes: {},

    async send(threadKey, scope, text) {
      if (!transport) throw new Error('The run store has no host transport.')
      const host = transport
      const conversationId = threadKey.startsWith('local-') ? (get().resolved[threadKey] ?? null) : threadKey
      const controller = new AbortController()
      controllers.set(threadKey, controller)
      set((s) => (s.scopes[threadKey] ? s : { scopes: { ...s.scopes, [threadKey]: scope } }))
      update(threadKey, (t) => ({
        isRunning: true,
        end: null,
        messages: [
          ...t.messages,
          { id: crypto.randomUUID(), role: 'user', blocks: [{ type: 'text', text, isStreaming: false }], status: 'complete' },
        ],
      }))
      try {
        await host.startRun({ conversationId, scope, message: text }, (ev) => {
          if (ev.type === 'RUN_STARTED' && conversationId === null) {
            set((s) => ({ resolved: { ...s.resolved, [threadKey]: ev.threadId } }))
            void recordConversation({
              id: ev.threadId,
              scope,
              title: titleFrom(text),
              updatedAt: new Date().toISOString(),
            }).catch((err: unknown) => {
              // The run continues; only the local-lane copy of its summary failed.
              console.error('PatientGPT: the conversation could not be written to the local lane.', err)
            })
          }
          update(threadKey, (t) => applyAguiEvent(t, ev))
        }, controller.signal)
        update(threadKey, settleThread)
      } catch (err) {
        if (controller.signal.aborted) {
          update(threadKey, (t) => ({ ...settleThread(t), end: { kind: 'stopped' } }))
        } else {
          const message = err instanceof Error ? err.message : String(err)
          update(threadKey, (t) => ({ ...settleThread(t), end: { kind: 'failed', message } }))
        }
      } finally {
        controllers.delete(threadKey)
      }
    },

    stop(threadKey) {
      controllers.get(threadKey)?.abort()
    },
  }
})
