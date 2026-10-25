// TJ-ARCH-MOB-001 compliant
// Non-persistent local lane for the Tauri host until its storage commands
// exist. The desktop lane belongs to embedded SurrealDB behind the Rust
// ConversationStore port; the webview must not grow a second desktop store.
import type { ConversationSummary } from '../../../app/transport/dto'
import { scopeKey } from '../domain/scope'
import type { LocalLaneStore } from './local-lane-store'

export function createMemoryLocalLane(): LocalLaneStore {
  let conversations = new Map<string, ConversationSummary>()
  let drafts = new Map<string, string>()
  return {
    kind: 'memory',
    async listConversations(key) {
      return [...conversations.values()]
        .filter((c) => scopeKey(c.scope) === key)
        .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },
    async putConversations(rows) {
      const next = new Map(conversations)
      for (const r of rows) next.set(r.id, r)
      conversations = next
    },
    async readDraft(key) {
      return drafts.get(key) ?? ''
    },
    async writeDraft(key, body) {
      const next = new Map(drafts)
      if (body === '') next.delete(key)
      else next.set(key, body)
      drafts = next
    },
  }
}
