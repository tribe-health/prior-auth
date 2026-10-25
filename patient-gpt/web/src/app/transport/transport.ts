// TJ-ARCH-MOB-001 compliant
// The one host transport interface. Every operation exists three times with
// the same name and DTOs: Axum route, Tauri command, FFI function.
import type {
  AguiEvent,
  CaseSummary,
  ConversationScope,
  ConversationSummary,
  Health,
  PatientSummary,
  RunRequest,
  Session,
} from './dto'

export type HostKind = 'web' | 'tauri'

export interface PatientGptTransport {
  readonly host: HostKind
  health(signal?: AbortSignal): Promise<Health>
  session(signal?: AbortSignal): Promise<Session>
  listPatients(signal?: AbortSignal): Promise<PatientSummary[]>
  listCases(patientId: string, signal?: AbortSignal): Promise<CaseSummary[]>
  listConversations(scope: ConversationScope, signal?: AbortSignal): Promise<ConversationSummary[]>
  /** Streams AG-UI events to `onEvent`; resolves when the stream ends. */
  startRun(request: RunRequest, onEvent: (event: AguiEvent) => void, signal?: AbortSignal): Promise<void>
}

/**
 * A transport call failed. `status` is the HTTP status where one exists; `code`
 * is the host's error code (`HostError::code()` and the route/command codes in
 * docs/plan/scaffold-contracts.md) where the host sent one.
 */
export class TransportError extends Error {
  readonly status: number | null
  readonly code: string | null
  constructor(message: string, status: number | null, code: string | null = null) {
    super(message)
    this.name = 'TransportError'
    this.status = status
    this.code = code
  }
}

/** The host's `{ code, message }` error body, or null when the value is not one. */
export function readHostError(value: unknown): { code: string; message: string } | null {
  if (typeof value !== 'object' || value === null) return null
  const { code, message } = value as Record<string, unknown>
  return typeof code === 'string' && typeof message === 'string' ? { code, message } : null
}

/** Query-string form of a scope: `all | patient:<id> | case:<patientId>:<caseId>`. */
export function scopeToQuery(scope: ConversationScope): string {
  switch (scope.kind) {
    case 'all':
      return 'all'
    case 'patient':
      return `patient:${scope.patientId}`
    case 'case':
      return `case:${scope.patientId}:${scope.caseId}`
  }
}
