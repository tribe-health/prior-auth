// TJ-ARCH-MOB-001 compliant
import type { ContentBlock } from '../../../app/transport/dto'

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  blocks: ContentBlock[]
  status: 'running' | 'complete' | 'incomplete'
}

/** How a run ended, when it did not finish normally. */
export type RunEnd = { kind: 'stopped' } | { kind: 'failed'; message: string }

export type ChatThread = {
  messages: ChatMessage[]
  isRunning: boolean
  end: RunEnd | null
}

export const EMPTY_THREAD: ChatThread = { messages: [], isRunning: false, end: null }
