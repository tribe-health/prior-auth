// TJ-ARCH-MOB-001 compliant
// Trust boundary: events arrive as untyped JSON from the host. Anything that is
// not one of the six scaffold events is refused loudly, never dropped.
import type { AguiEvent } from './dto'

export class UnknownAguiEventError extends Error {
  constructor(readonly received: string) {
    super(`The run stream sent an event this build does not recognize: ${received}`)
    this.name = 'UnknownAguiEventError'
  }
}

function str(o: Record<string, unknown>, key: string): string {
  const v = o[key]
  if (typeof v !== 'string') throw new UnknownAguiEventError(`${String(o['type'])} without ${key}`)
  return v
}

export function parseAguiEvent(raw: unknown): AguiEvent {
  if (typeof raw !== 'object' || raw === null) throw new UnknownAguiEventError(typeof raw)
  const o = raw as Record<string, unknown>
  switch (o['type']) {
    case 'RUN_STARTED':
      return { type: 'RUN_STARTED', runId: str(o, 'runId'), threadId: str(o, 'threadId') }
    case 'TEXT_MESSAGE_START':
      return { type: 'TEXT_MESSAGE_START', messageId: str(o, 'messageId'), role: 'assistant' }
    case 'TEXT_MESSAGE_CONTENT':
      return { type: 'TEXT_MESSAGE_CONTENT', messageId: str(o, 'messageId'), delta: str(o, 'delta') }
    case 'TEXT_MESSAGE_END':
      return { type: 'TEXT_MESSAGE_END', messageId: str(o, 'messageId') }
    case 'RUN_FINISHED':
      return { type: 'RUN_FINISHED', runId: str(o, 'runId'), threadId: str(o, 'threadId') }
    case 'RUN_ERROR':
      return { type: 'RUN_ERROR', message: str(o, 'message'), code: typeof o['code'] === 'string' ? o['code'] : null }
    default:
      throw new UnknownAguiEventError(String(o['type']))
  }
}
