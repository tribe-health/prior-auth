// TJ-ARCH-MOB-001 compliant
// What the chat is in the context of right now: the route decides, and every
// chat component reads it from here rather than from the router itself.
import { createContext, use, type ReactNode } from 'react'
import type { ConversationScope } from '../../../app/transport/dto'

export type ActiveThread = {
  /** `page` for home, patient and case views; `chat` for an opened conversation. */
  view: 'page' | 'chat'
  scope: ConversationScope
  /** The route's conversation id on a chat view. */
  conversationId: string | null
  /** False while the scope is not known yet; nothing may be sent without one. */
  canCompose: boolean
}

const ActiveThreadContext = createContext<ActiveThread | null>(null)

export function ActiveThreadProvider({ value, children }: { value: ActiveThread; children: ReactNode }) {
  return <ActiveThreadContext value={value}>{children}</ActiveThreadContext>
}

export function useActiveThread(): ActiveThread {
  const v = use(ActiveThreadContext)
  if (!v) throw new Error('useActiveThread must be used inside ActiveThreadProvider.')
  return v
}
