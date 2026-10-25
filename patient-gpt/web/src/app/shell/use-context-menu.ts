// TJ-ARCH-MOB-001 compliant
// The top bar's context control (shell.js `renderCtx`).
import { useNavigate } from '@tanstack/react-router'
import type { MenuEntry } from '../../shared/ui/menu'
import {
  usePatient,
  usePatientCases,
  usePatientList,
} from '../../features/patients/presentation/use-patient-directory'
import type { NavSelection } from './use-sidebar-nav'

export function useContextMenu(selection: NavSelection) {
  const navigate = useNavigate()
  const patients = usePatientList()
  const patient = usePatient(selection.patientId)
  const cases = usePatientCases(selection.patientId)
  const name = patient?.displayName ?? (selection.patientId ? selection.patientId : null)

  if (!selection.patientId) {
    const entries: MenuEntry[] = [
      { kind: 'heading', text: 'Set context' },
      ...patients.map(
        (x): MenuEntry => ({
          kind: 'item',
          icon: 'user',
          label: x.displayName,
          sub: x.payer,
          onSelect: () => void navigate({ to: '/p/$patientId', params: { patientId: x.id } }),
        }),
      ),
    ]
    return { label: 'All patients', caseId: null, aria: 'Context: all patients. Change context', entries }
  }

  const pid = selection.patientId
  const caseEntries: MenuEntry[] =
    cases.status === 'ready'
      ? cases.cases.map((k) => ({
          kind: 'item',
          icon: 'doc',
          label: k.procedure,
          sub: k.id,
          current: k.id === selection.caseId,
          onSelect: () => void navigate({ to: '/c/$caseId', params: { caseId: k.id } }),
        }))
      : []
  const entries: MenuEntry[] = [
    { kind: 'heading', text: name ?? pid },
    {
      kind: 'item',
      icon: 'user',
      label: 'Whole patient',
      sub: 'Chart and every case',
      current: selection.kind === 'patient',
      onSelect: () => void navigate({ to: '/p/$patientId', params: { patientId: pid } }),
    },
    ...caseEntries,
    { kind: 'item', icon: 'queue', label: 'All patients', sub: 'Clear the context', onSelect: () => void navigate({ to: '/' }) },
  ]
  const aria = `Context: ${name ?? pid}${selection.caseId ? `, case ${selection.caseId}` : ', whole chart'}. Change context`
  return { label: name ?? pid, caseId: selection.caseId, aria, entries }
}
