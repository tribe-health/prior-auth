// TJ-ARCH-MOB-001 compliant
// Which surface actions this catalog wires. Two only: an `event` (reported to
// the app as an intent, then denied) and the `closeModal` function (local UI).
// Every other function call, `openUrl` included, renders as a labelled
// fallback instead of a working control. Labels match the Flutter shell.
export type ActionKind =
  | { kind: 'event' }
  | { kind: 'closeModal' }
  | { kind: 'unsupported'; label: string }

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function classifyAction(action: unknown): ActionKind {
  if (!isRec(action)) return { kind: 'unsupported', label: 'action without a definition' }
  if (isRec(action.event) && typeof action.event.name === 'string') return { kind: 'event' }
  if (isRec(action.functionCall) && typeof action.functionCall.call === 'string') {
    const call = action.functionCall.call
    return call === 'closeModal' ? { kind: 'closeModal' } : { kind: 'unsupported', label: `action "${call}"` }
  }
  return { kind: 'unsupported', label: 'action without an event' }
}
