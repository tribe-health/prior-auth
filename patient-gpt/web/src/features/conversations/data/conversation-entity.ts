// TJ-ARCH-MOB-001 compliant
// Conversation summaries: the server list merged with the local-lane
// projection (PGlite in the browser). Rows created by a run on this device
// are written to the local lane first, so they survive a reload and a server
// that is not running. Lists hold ids; every view re-joins the same record.
import {
  graphStore,
  registerEntityTransport,
  serializeKey,
  type FilterSpec,
} from '@prometheus-ags/entity-graph-react'
import type { ConversationScope, ConversationSummary } from '../../../app/transport/dto'
import { asEntityCall } from '../../../app/transport/entity-errors'
import type { PatientGptTransport } from '../../../app/transport/transport'
import { parseScopeKey } from '../domain/parse-scope'
import { scopeKey } from '../domain/scope'
import type { LocalLaneStore } from './local-lane-store'

export const CONVERSATION = 'Conversation'
export type ConversationEntity = ConversationSummary & { scopeKey: string }

export function conversationsInScope(scope: ConversationScope): FilterSpec {
  return [{ field: 'scopeKey', op: 'eq', value: scopeKey(scope) }]
}

/** Must equal the key `useEntities` derives for `{ filter }` alone. */
function listKey(scope: ConversationScope): string {
  return serializeKey([
    CONVERSATION,
    { filter: conversationsInScope(scope), sort: undefined, search: undefined, limit: undefined, cursor: undefined },
  ])
}

function toEntity(c: ConversationSummary): ConversationEntity {
  return { ...c, scopeKey: scopeKey(c.scope) }
}

function scopeOf(filter: FilterSpec | null | undefined): ConversationScope {
  const clause = Array.isArray(filter) ? filter.find((c) => c.field === 'scopeKey' && c.op === 'eq') : undefined
  if (!clause || typeof clause.value !== 'string') throw new Error('Conversation lists are always scoped.')
  return parseScopeKey(clause.value)
}

let lane: LocalLaneStore | null = null

export function registerConversationEntity(transport: PatientGptTransport, localLane: LocalLaneStore): void {
  lane = localLane
  registerEntityTransport<ConversationEntity>(CONVERSATION, {
    identify: (row) => row.id,
    authoritative: false,
    list: async (q) => {
      const scope = scopeOf(q.filter)
      const local = await localLane.listConversations(scopeKey(scope))
      let remote: ConversationSummary[]
      try {
        remote = await asEntityCall(() => transport.listConversations(scope, q.signal))
      } catch (err) {
        // A server that does not answer still leaves this device's own
        // conversations listed; with nothing local, the error is shown.
        if (local.length === 0) throw err
        remote = []
      }
      await localLane.putConversations(remote)
      const merged = new Map<string, ConversationSummary>()
      for (const c of local) merged.set(c.id, c)
      for (const c of remote) merged.set(c.id, c)
      const rows = [...merged.values()]
        .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(toEntity)
      return { rows, total: rows.length }
    },
  })
}

/** Records a conversation started on this device and places it first in its scope's list. */
export async function recordConversation(c: ConversationSummary): Promise<void> {
  const store = graphStore.getState()
  store.upsertEntity(CONVERSATION, c.id, toEntity(c))
  const key = listKey(c.scope)
  const existing = store.lists[key]
  if (existing) {
    const ids = [c.id, ...existing.ids.filter((id) => id !== c.id)]
    store.setListResult(key, ids, { total: ids.length })
  }
  if (!lane) throw new Error('The local lane is not configured.')
  await lane.putConversations([c])
}
