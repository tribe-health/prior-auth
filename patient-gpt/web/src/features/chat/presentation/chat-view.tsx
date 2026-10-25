// TJ-ARCH-MOB-001 compliant
import { useActiveThread } from './active-thread'
import { ThreadView } from './thread-view'

export function ChatView({ title }: { title: string | null }) {
  const active = useActiveThread()
  if (!active.canCompose) {
    return (
      <div className="thread-wrap">
        <h1 className="sr-only">Conversation</h1>
        <p className="stopped">This conversation is not in the lists loaded on this device.</p>
      </div>
    )
  }
  return <ThreadView title={title ?? 'Conversation'} />
}
