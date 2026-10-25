// TJ-ARCH-MOB-001 compliant
// Desktop host: Tauri commands with the contract's names. `@tauri-apps/api` is
// loaded with a dynamic import, so a browser build never evaluates it.
// Argument names match desktop/src-tauri/src/commands.rs: list_cases
// (`patientId`), list_conversations (`scope`, the tagged object) and start_run
// (`request`, `onEvent` channel). Commands reject with `{ code, message }`.
import { parseAguiEvent } from './agui-parse'
import { readHostError, TransportError, type PatientGptTransport } from './transport'
import type { CaseSummary, ConversationSummary, Health, PatientSummary, Session } from './dto'

type TauriCore = typeof import('@tauri-apps/api/core')

let core: Promise<TauriCore> | null = null
function tauri(): Promise<TauriCore> {
  core ??= import('@tauri-apps/api/core')
  return core
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await tauri()
  try {
    return await invoke<T>(command, args)
  } catch (err) {
    const host = readHostError(err)
    if (host) throw new TransportError(`The desktop host refused ${command}: ${host.message}`, null, host.code)
    const detail = err instanceof Error ? err.message : typeof err === 'string' ? err : 'no detail was given'
    throw new TransportError(`The desktop host refused ${command}: ${detail}`, null)
  }
}

export function createTauriTransport(): PatientGptTransport {
  return {
    host: 'tauri',
    health: () => call<Health>('health'),
    session: () => call<Session>('session'),
    listPatients: () => call<PatientSummary[]>('list_patients'),
    listCases: (patientId) => call<CaseSummary[]>('list_cases', { patientId }),
    listConversations: (scope) => call<ConversationSummary[]>('list_conversations', { scope }),
    async startRun(request, onEvent) {
      const { Channel } = await tauri()
      const channel = new Channel<unknown>()
      channel.onmessage = (raw) => onEvent(parseAguiEvent(raw))
      await call<void>('start_run', { request, onEvent: channel })
    },
  }
}
