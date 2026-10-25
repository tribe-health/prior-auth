// TJ-ARCH-MOB-001 compliant
import { useEntities } from '@prometheus-ags/entity-graph-react'
import { SESSION, type SessionEntity } from '../data/session-entity'
import { greetingName, initials, roleLabel } from '../domain/greeting-name'

export type SessionView =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; name: string; greetingName: string; initials: string; role: string; isDelegatedAgent: boolean }

export function useSession(): SessionView {
  const { items, error } = useEntities<SessionEntity>(SESSION)
  const s = items[0]
  if (s) {
    const p = s.principal
    return {
      status: 'ready',
      name: p.displayName,
      greetingName: greetingName(p.displayName),
      initials: initials(p.displayName),
      role: roleLabel(p.role),
      isDelegatedAgent: p.kind === 'delegated_agent',
    }
  }
  if (error) return { status: 'error', message: error.message }
  return { status: 'loading' }
}
