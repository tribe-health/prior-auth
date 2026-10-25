// TJ-ARCH-MOB-001 compliant
import type { ConversationScope } from '../../../app/transport/dto'
import { scopeToQuery } from '../../../app/transport/transport'

export const ALL_SCOPE: ConversationScope = { kind: 'all' }

/** Stable key for a scope; the same string the API takes as `?scope=`. */
export const scopeKey = scopeToQuery

export function sameScope(a: ConversationScope, b: ConversationScope): boolean {
  return scopeKey(a) === scopeKey(b)
}
