// TJ-ARCH-MOB-001 compliant
// The sidebar's patient list. Patients come from the Patient list; their order
// joins the Case entities already in the graph at render time (nearest open
// deadline first, then name), the order the prototype's nav.js uses.
import { useMemo } from 'react'
import { useEntities, useGraphStore } from '@prometheus-ags/entity-graph-react'
import type { CaseSummary, PatientSummary } from '../../../app/transport/dto'
import { CASE, PATIENT, casesOfPatient } from '../data/patient-entities'
import { dueText, isSoon, nearestDue } from '../domain/due-dates'

export type PatientRow = { patient: PatientSummary; nearestDue: string | null }

export type PatientDirectory =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; rows: PatientRow[]; ordered: boolean }

const NO_CASES: Record<string, Record<string, unknown>> = {}

export function usePatientDirectory(): PatientDirectory {
  const { items, isLoading, error } = useEntities<PatientSummary>(PATIENT)
  const caseBucket = useGraphStore((s) => s.entities[CASE] ?? NO_CASES)
  // The order is final only once every listed case is in the graph; until then a
  // patient whose cases are still loading sorts last.
  const ordered = items.every((p) => p.caseIds.every((id) => id in caseBucket))
  const rows = useMemo(() => {
    const byPatient = new Map<string, CaseSummary[]>()
    for (const raw of Object.values(caseBucket)) {
      const c = raw as CaseSummary
      byPatient.set(c.patientId, [...(byPatient.get(c.patientId) ?? []), c])
    }
    return items
      .map((p) => ({ patient: p, nearestDue: nearestDue(byPatient.get(p.id) ?? []) }))
      .toSorted(
        (a, b) =>
          (a.nearestDue ?? '9999').localeCompare(b.nearestDue ?? '9999') ||
          a.patient.displayName.localeCompare(b.patient.displayName),
      )
  }, [items, caseBucket])
  if (items.length > 0) return { status: 'ready', rows, ordered }
  if (error) return { status: 'error', message: error.message }
  if (isLoading) return { status: 'loading' }
  return { status: 'ready', rows, ordered }
}

export type PatientCases =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; cases: CaseSummary[] }

export function usePatientCases(patientId: string | null): PatientCases {
  const { items, isLoading, error } = useEntities<CaseSummary>(CASE, {
    filter: casesOfPatient(patientId ?? ''),
    enabled: patientId !== null,
  })
  if (items.length > 0) return { status: 'ready', cases: items }
  if (error) return { status: 'error', message: error.message }
  if (isLoading) return { status: 'loading' }
  return { status: 'ready', cases: items }
}

export function usePatient(patientId: string | null): PatientSummary | null {
  return useGraphStore((s) => (patientId ? ((s.entities[PATIENT]?.[patientId] as PatientSummary | undefined) ?? null) : null))
}

export function useCase(caseId: string | null): CaseSummary | null {
  return useGraphStore((s) => (caseId ? ((s.entities[CASE]?.[caseId] as CaseSummary | undefined) ?? null) : null))
}

/** All patients, for the context menu. */
export function usePatientList(): PatientSummary[] {
  return useEntities<PatientSummary>(PATIENT).items
}

export type DueRow = { record: CaseSummary; patientName: string; due: string | null; soon: boolean }

/** Open cases across patients, nearest deadline first (D.openCases), joined to their patient. */
export function useOpenCases(): DueRow[] {
  const caseBucket = useGraphStore((s) => s.entities[CASE] ?? NO_CASES)
  const patientBucket = useGraphStore((s) => s.entities[PATIENT] ?? NO_CASES)
  return useMemo(
    () =>
      Object.values(caseBucket)
        .map((raw) => raw as CaseSummary)
        .filter((c) => !c.closed)
        .toSorted((a, b) => (a.due?.date ?? '9999').localeCompare(b.due?.date ?? '9999'))
        .map((c) => ({
          record: c,
          patientName: (patientBucket[c.patientId] as PatientSummary | undefined)?.displayName ?? c.patientId,
          due: dueText(c),
          soon: isSoon(c),
        })),
    [caseBucket, patientBucket],
  )
}
