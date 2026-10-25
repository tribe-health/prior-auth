// TJ-ARCH-MOB-001 compliant
import { useEntities, useGraphStore } from '@prometheus-ags/entity-graph-react'
import type { ConversationScope } from '../../../app/transport/dto'
import { CONVERSATION, conversationsInScope, type ConversationEntity } from '../data/conversation-entity'

export type ConversationList =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: ConversationEntity[] }

export function useConversations(scope: ConversationScope, enabled = true): ConversationList {
  const { items, isLoading, error } = useEntities<ConversationEntity>(CONVERSATION, {
    filter: conversationsInScope(scope),
    enabled,
  })
  if (items.length > 0) return { status: 'ready', items }
  if (error) return { status: 'error', message: error.message }
  if (isLoading) return { status: 'loading' }
  return { status: 'ready', items }
}

export function useConversation(id: string | null): ConversationEntity | null {
  return useGraphStore((s) =>
    id ? ((s.entities[CONVERSATION]?.[id] as ConversationEntity | undefined) ?? null) : null,
  )
}
