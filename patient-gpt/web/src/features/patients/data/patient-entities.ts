// TJ-ARCH-MOB-001 compliant
// Patients and cases are clinical records owned by the server. They live in
// the entity graph for this session only and are never written to any shell store.
import { registerEntityTransport, type FilterSpec } from '@prometheus-ags/entity-graph-react'
import type { CaseSummary, PatientSummary } from '../../../app/transport/dto'
import { asEntityCall } from '../../../app/transport/entity-errors'
import type { PatientGptTransport } from '../../../app/transport/transport'

export const PATIENT = 'Patient'
export const CASE = 'Case'

export function casesOfPatient(patientId: string): FilterSpec {
  return [{ field: 'patientId', op: 'eq', value: patientId }]
}

function patientIdOf(filter: FilterSpec | null | undefined): string {
  const clause = Array.isArray(filter) ? filter.find((c) => c.field === 'patientId' && c.op === 'eq') : undefined
  if (!clause || typeof clause.value !== 'string') throw new Error('Case lists are always scoped to one patient.')
  return clause.value
}

export function registerPatientEntities(transport: PatientGptTransport): void {
  registerEntityTransport<PatientSummary>(PATIENT, {
    identify: (row) => row.id,
    authoritative: false,
    list: async (q) => {
      const rows = await asEntityCall(() => transport.listPatients(q.signal))
      return { rows, total: rows.length }
    },
  })
  registerEntityTransport<CaseSummary>(CASE, {
    identify: (row) => row.id,
    authoritative: false,
    list: async (q) => {
      const patientId = patientIdOf(q.filter)
      const rows = await asEntityCall(() => transport.listCases(patientId, q.signal))
      return { rows, total: rows.length }
    },
  })
}
