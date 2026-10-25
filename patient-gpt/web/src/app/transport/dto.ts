// TJ-ARCH-MOB-001 compliant
// Wire DTOs, mirrored from docs/plan/scaffold-contracts.md and
// crates/patient-gpt-domain. A change here is a change to every surface.

export type Health = { status: 'ok'; version: string }

export type PrincipalRole = 'surgeon' | 'coordinator' | 'administrator'
export type PrincipalKind = 'human' | 'delegated_agent'
export type Principal = { id: string; displayName: string; role: PrincipalRole; kind: PrincipalKind }
export type Session = { principal: Principal; practice: string }

export type PatientSummary = { id: string; displayName: string; payer: string; caseIds: string[] }

/** Never collapsed into two states, never a boolean. */
export type EvidenceState = 'met' | 'gap' | 'void'
export type CriteriaTally = { met: number; gap: number; void: number }
export type CaseDue = { kind: string; date: string }
export type CaseSummary = {
  id: string
  patientId: string
  procedure: string
  payer: string
  closed: boolean
  due: CaseDue | null
  tally: CriteriaTally
}

export type ConversationScope =
  | { kind: 'all' }
  | { kind: 'patient'; patientId: string }
  | { kind: 'case'; patientId: string; caseId: string }

export type ConversationSummary = { id: string; scope: ConversationScope; title: string; updatedAt: string }

export type Citation = { documentId: string; documentTitle: string; page: number; date: string }

export type RunRequest = { conversationId: string | null; scope: ConversationScope; message: string }

export type ToolStatus = 'pending' | 'running' | 'complete' | 'failed'

/** The 11-variant ContentBlock union (`type` discriminator, camelCase). */
export type ContentBlock =
  | { type: 'text'; text: string; isStreaming: boolean }
  | { type: 'thinking'; text: string; isStreaming: boolean }
  | { type: 'code'; language: string; code: string; filename: string | null }
  | { type: 'citation'; text: string; sources: Citation[] }
  | { type: 'memory'; memoryType: string; key: string; value: string }
  | { type: 'toolUse'; toolUseId: string; toolName: string; input: unknown; status: ToolStatus }
  | { type: 'toolResult'; toolUseId: string; output: string; isError: boolean }
  | { type: 'skill'; skillName: string; status: ToolStatus; outputSummary: string | null }
  | { type: 'artifact'; artifactId: string; kind: string; title: string }
  | { type: 'image'; url: string; alt: string; width: number; height: number }
  | { type: 'divider' }

/** AG-UI scaffold subset. */
export type AguiEvent =
  | { type: 'RUN_STARTED'; runId: string; threadId: string }
  | { type: 'TEXT_MESSAGE_START'; messageId: string; role: 'assistant' }
  | { type: 'TEXT_MESSAGE_CONTENT'; messageId: string; delta: string }
  | { type: 'TEXT_MESSAGE_END'; messageId: string }
  | { type: 'RUN_FINISHED'; runId: string; threadId: string }
  | { type: 'RUN_ERROR'; message: string; code: string | null }
