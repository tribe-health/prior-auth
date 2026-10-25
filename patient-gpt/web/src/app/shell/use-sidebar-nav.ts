// TJ-ARCH-MOB-001 compliant
// Sidebar view-model: expansion follows nav.js — the patient with the nearest
// deadline starts open, entering a patient or case context opens that patient,
// and a manual collapse then sticks.
import { useEffect, useRef } from 'react'
import { usePatientDirectory } from '../../features/patients/presentation/use-patient-directory'
import { useUiStore } from './ui-store'
import type { ShellRoute } from './use-shell-route'

export type NavSelection = {
  kind: 'all' | 'patient' | 'case'
  patientId: string | null
  caseId: string | null
  conversationId: string | null
}

export function selectionOf(route: ShellRoute): NavSelection {
  const scope = route.scope
  const conversationId = route.name === 'chat' ? route.conversationId : null
  if (!scope || scope.kind === 'all') return { kind: 'all', patientId: null, caseId: null, conversationId }
  if (scope.kind === 'patient') return { kind: 'patient', patientId: scope.patientId, caseId: null, conversationId }
  return { kind: 'case', patientId: scope.patientId, caseId: scope.caseId, conversationId }
}

export function useSidebarNav(selection: NavSelection) {
  const directory = usePatientDirectory()
  const expanded = useUiStore((s) => s.expanded)
  const toggle = useUiStore((s) => s.toggleExpanded)
  const expand = useUiStore((s) => s.expand)
  const seeded = useRef(false)

  const first = directory.status === 'ready' && directory.ordered ? (directory.rows[0] ?? null) : null
  useEffect(() => {
    if (seeded.current || !first || first.nearestDue === null) return
    seeded.current = true
    expand(first.patient.id)
  }, [first, expand])

  const contextKey = `${selection.kind}:${selection.caseId ?? selection.patientId ?? ''}`
  useEffect(() => {
    if (selection.patientId) expand(selection.patientId)
    // Only a change of context opens the patient; a later collapse sticks.
  }, [contextKey])

  return { directory, expanded, toggle }
}
