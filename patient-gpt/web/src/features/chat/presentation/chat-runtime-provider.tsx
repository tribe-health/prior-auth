// TJ-ARCH-MOB-001 compliant
import type { ReactNode } from 'react'
import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { ActiveThreadProvider, type ActiveThread } from './active-thread'
import { useChatRuntime } from './use-chat-runtime'

export function ChatRuntimeProvider({ active, children }: { active: ActiveThread; children: ReactNode }) {
  const runtime = useChatRuntime(active)
  return (
    <ActiveThreadProvider value={active}>
      <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
    </ActiveThreadProvider>
  )
}
