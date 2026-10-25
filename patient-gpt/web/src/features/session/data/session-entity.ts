// TJ-ARCH-MOB-001 compliant
import { registerEntityTransport } from '@prometheus-ags/entity-graph-react'
import type { Session } from '../../../app/transport/dto'
import { asEntityCall } from '../../../app/transport/entity-errors'
import type { PatientGptTransport } from '../../../app/transport/transport'

export const SESSION = 'Session'
/** The one session row is keyed by its principal. */
export type SessionEntity = Session & { id: string }

export function registerSessionEntity(transport: PatientGptTransport): void {
  registerEntityTransport<SessionEntity>(SESSION, {
    identify: (row) => row.id,
    authoritative: false,
    staleTime: 5 * 60_000,
    list: async (q) => {
      const s = await asEntityCall(() => transport.session(q.signal))
      return { rows: [{ ...s, id: s.principal.id }], total: 1 }
    },
  })
}
