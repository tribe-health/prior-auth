// TJ-ARCH-MOB-001 compliant
// Browser host: the Axum routes in docs/plan/scaffold-contracts.md.
import { parseAguiEvent } from './agui-parse'
import { readEventStream } from './sse-parser'
import { readHostError, scopeToQuery, TransportError, type PatientGptTransport } from './transport'
import type { CaseSummary, ConversationSummary, Health, PatientSummary, Session } from './dto'

const DEFAULT_BASE = '/api'

export function createHttpTransport(base: string = import.meta.env.VITE_PATIENTGPT_API ?? DEFAULT_BASE): PatientGptTransport {
  const root = base.replace(/\/+$/, '')

  async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
    const res = await request(`${root}${path}`, { headers: { accept: 'application/json' }, signal: signal ?? null })
    return (await res.json()) as T
  }

  return {
    host: 'web',
    health: (signal) => getJson<Health>('/health', signal),
    session: (signal) => getJson<Session>('/session', signal),
    listPatients: (signal) => getJson<PatientSummary[]>('/patients', signal),
    listCases: (patientId, signal) =>
      getJson<CaseSummary[]>(`/patients/${encodeURIComponent(patientId)}/cases`, signal),
    listConversations: (scope, signal) =>
      getJson<ConversationSummary[]>(`/conversations?scope=${encodeURIComponent(scopeToQuery(scope))}`, signal),
    async startRun(body, onEvent, signal) {
      const res = await request(`${root}/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal: signal ?? null,
      })
      if (!res.body) throw new TransportError('The run response had no body.', res.status)
      await readEventStream(res.body, (data) => onEvent(parseAguiEvent(JSON.parse(data))))
    },
  }
}

async function request(url: string, init: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, { ...init, credentials: 'same-origin' })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new TransportError('The PatientGPT server did not answer.', null)
  }
  if (!res.ok) {
    const host = readHostError(await res.json().catch(() => null))
    const message = host ? `The PatientGPT server answered ${res.status}: ${host.message}` : `The PatientGPT server answered ${res.status}.`
    throw new TransportError(message, res.status, host?.code ?? null)
  }
  return res
}
