// TJ-ARCH-MOB-001 compliant
// The band under the top bar (shell.js `renderStrip`): for a case its tally
// and deadline, for a patient what the record lists. Hidden for all patients.
import type { CaseSummary } from '../transport/dto'
import { dueText, isSoon } from '../../features/patients/domain/due-dates'
import { useCase, usePatient } from '../../features/patients/presentation/use-patient-directory'
import type { NavSelection } from './use-sidebar-nav'

export type ContextStrip =
  | { kind: 'none' }
  | { kind: 'patient'; caseCount: number; payer: string }
  | { kind: 'case'; record: CaseSummary; due: string | null; soon: boolean }

export function useContextStrip(selection: NavSelection): ContextStrip {
  const patient = usePatient(selection.patientId)
  const record = useCase(selection.caseId)
  if (selection.kind === 'case' && record) return { kind: 'case', record, due: dueText(record), soon: isSoon(record) }
  if (selection.kind === 'patient' && patient) {
    return { kind: 'patient', caseCount: patient.caseIds.length, payer: patient.payer }
  }
  return { kind: 'none' }
}
