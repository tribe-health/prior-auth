// TJ-ARCH-MOB-001 compliant
// Pure reducer: one AG-UI event applied to a thread, returning a new thread.
import type { AguiEvent, ContentBlock } from '../../../app/transport/dto'
import type { ChatMessage, ChatThread } from './chat-message'

function mapMessage(thread: ChatThread, id: string, f: (m: ChatMessage) => ChatMessage): ChatThread {
  return { ...thread, messages: thread.messages.map((m) => (m.id === id ? f(m) : m)) }
}

function appendText(blocks: ContentBlock[], delta: string): ContentBlock[] {
  const last = blocks[blocks.length - 1]
  if (last && last.type === 'text') return [...blocks.slice(0, -1), { ...last, text: last.text + delta }]
  return [...blocks, { type: 'text', text: delta, isStreaming: true }]
}

function endStreaming(blocks: ContentBlock[]): ContentBlock[] {
  return blocks.map((b) => (b.type === 'text' || b.type === 'thinking' ? { ...b, isStreaming: false } : b))
}

export function applyAguiEvent(thread: ChatThread, ev: AguiEvent): ChatThread {
  switch (ev.type) {
    case 'RUN_STARTED':
      return { ...thread, isRunning: true, end: null }
    case 'TEXT_MESSAGE_START':
      return {
        ...thread,
        messages: [...thread.messages, { id: ev.messageId, role: 'assistant', blocks: [], status: 'running' }],
      }
    case 'TEXT_MESSAGE_CONTENT':
      return mapMessage(thread, ev.messageId, (m) => ({ ...m, blocks: appendText(m.blocks, ev.delta) }))
    case 'TEXT_MESSAGE_END':
      return mapMessage(thread, ev.messageId, (m) => ({ ...m, blocks: endStreaming(m.blocks), status: 'complete' }))
    case 'RUN_FINISHED':
      return { ...thread, isRunning: false }
    case 'RUN_ERROR':
      return { ...thread, isRunning: false, end: { kind: 'failed', message: ev.message } }
  }
}

/** Closes every message still streaming, used when a run is stopped or fails. */
export function settleThread(thread: ChatThread): ChatThread {
  return {
    ...thread,
    isRunning: false,
    messages: thread.messages.map((m) =>
      m.status === 'running' ? { ...m, blocks: endStreaming(m.blocks), status: 'incomplete' } : m,
    ),
  }
}
