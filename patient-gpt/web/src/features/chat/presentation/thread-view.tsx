// TJ-ARCH-MOB-001 compliant
// The conversation column (thread.css). Assistant UI walks the messages; each
// assistant part is a ContentBlock carried as a `content-block` data part.
import {
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  type DataMessagePartProps,
  type TextMessagePartProps,
} from '@assistant-ui/react'
import type { ContentBlock } from '../../../app/transport/dto'
import { A2uiDevSlot } from '../../a2ui/presentation/a2ui-dev-slot'
import { useActiveThread } from './active-thread'
import { ContentBlockView } from './content-block-view'
import { CONTENT_BLOCK_PART, useRunEnd } from './use-chat-runtime'

function UserText({ text }: TextMessagePartProps) {
  return <p className="bubble">{text}</p>
}

function UserMessage() {
  return (
    <article className="msg user" aria-label="You">
      <MessagePrimitive.Parts components={{ Text: UserText }} />
    </article>
  )
}

function BlockPart({ data }: DataMessagePartProps<ContentBlock>) {
  return <ContentBlockView block={data} />
}

const PART_COMPONENTS = { data: { by_name: { [CONTENT_BLOCK_PART]: BlockPart } } }

function AssistantMessage() {
  const running = useAuiState((s) => s.message.status?.type === 'running')
  return (
    <article className="msg agent" aria-label="Assistant" aria-busy={running ? 'true' : undefined}>
      <div className="msg-body">
        <MessagePrimitive.Parts components={PART_COMPONENTS} />
      </div>
    </article>
  )
}

const MESSAGE_COMPONENTS = { UserMessage, AssistantMessage }

function RunEndNote() {
  const end = useRunEnd(useActiveThread())
  if (!end) return null
  switch (end.kind) {
    case 'stopped':
      return <p className="stopped">Stopped. Nothing after this point was applied.</p>
    case 'failed':
      return <p className="stopped">The run did not finish. {end.message}</p>
  }
}

function NothingLoaded() {
  const empty = useAuiState((s) => s.thread.messages.length === 0)
  return empty ? <p className="stopped">The messages of this conversation are not loaded in this build.</p> : null
}

export function ThreadView({ title }: { title: string }) {
  return (
    <div className="thread-wrap">
      <h1 className="sr-only">{title}</h1>
      <div className="thread">
        <ThreadPrimitive.Messages components={MESSAGE_COMPONENTS} />
        <RunEndNote />
        <NothingLoaded />
        <A2uiDevSlot />
      </div>
    </div>
  )
}
