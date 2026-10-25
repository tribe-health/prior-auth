// TJ-ARCH-MOB-001 compliant
// The local lane: records with privacy class `local` that never leave this
// device. It holds the conversation list projection and composer drafts only.
// Clinical records (patients, cases, criteria) are never written here.
import type { ConversationSummary } from '../../../app/transport/dto'

export interface LocalLaneStore {
  readonly kind: 'pglite' | 'memory'
  listConversations(scopeKey: string): Promise<ConversationSummary[]>
  putConversations(rows: ConversationSummary[]): Promise<void>
  readDraft(scopeKey: string): Promise<string>
  writeDraft(scopeKey: string, body: string): Promise<void>
}
