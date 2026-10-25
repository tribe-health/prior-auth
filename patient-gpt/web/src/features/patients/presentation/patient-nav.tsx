// TJ-ARCH-MOB-001 compliant
// Patients sit where ChatGPT's Projects sit (nav.js). A patient opens to show
// its Cases and the patient- or case-level History.
import { Link } from '@tanstack/react-router'
import { Icon } from '../../../shared/icons/icon'
import { HistoryList } from '../../conversations/presentation/history-list'
import { fmtDate } from '../domain/due-dates'
import { usePatientCases, type PatientRow } from './use-patient-directory'

export type PatientNavSelection = {
  kind: 'all' | 'patient' | 'case'
  patientId: string | null
  caseId: string | null
  conversationId: string | null
}

type Props = { row: PatientRow; selection: PatientNavSelection; open: boolean; onToggle: () => void }

function CaseRows({ patientId, caseSel, selection }: { patientId: string; caseSel: string | null; selection: PatientNavSelection }) {
  const cases = usePatientCases(patientId)
  if (cases.status === 'loading') return <p className="sb-empty">Loading cases.</p>
  if (cases.status === 'error') return <p className="sb-empty">Cases could not be loaded. {cases.message}</p>
  if (cases.cases.length === 0) return <p className="sb-empty">No cases for this patient.</p>
  return (
    <ul className="sb-cases">
      {cases.cases.map((c) => (
        <li key={c.id}>
          <Link
            className={caseSel === c.id ? 'sb-case is-ctx' : 'sb-case'}
            to="/c/$caseId"
            params={{ caseId: c.id }}
            aria-current={caseSel === c.id && !selection.conversationId ? 'page' : undefined}
          >
            <span className="sb-case-top od-row">
              <span className="od-fill od-truncate">{c.procedure}</span>
              {c.due ? <span className="sb-meta od-fixed od-nowrap">{fmtDate(c.due.date)}</span> : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function PatientNav({ row, selection, open, onToggle }: Props) {
  const p = row.patient
  const subId = `sb-sub-${p.id}`
  const inCtx = selection.patientId === p.id
  const caseSel = inCtx && selection.caseId ? selection.caseId : null
  return (
    <li>
      <div className="sb-row od-row">
        <button
          className="sb-chev od-fixed"
          type="button"
          aria-expanded={open}
          aria-controls={subId}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${p.displayName}`}
          onClick={onToggle}
        >
          <Icon name={open ? 'chevDown' : 'chevRight'} />
        </button>
        <Link
          className={inCtx ? 'sb-link od-row od-fill is-ctx' : 'sb-link od-row od-fill'}
          to="/p/$patientId"
          params={{ patientId: p.id }}
          aria-current={inCtx && selection.kind === 'patient' && !selection.conversationId ? 'page' : undefined}
        >
          <span className="od-fill od-truncate">{p.displayName}</span>
          {row.nearestDue ? <span className="sb-due od-fixed od-nowrap">{fmtDate(row.nearestDue)}</span> : null}
        </Link>
      </div>
      {/* Cases load for every patient: the list's order and deadlines need them. */}
      <div className="sb-sub" id={subId} hidden={!open}>
        <p className="sb-sublabel">Cases</p>
        <CaseRows patientId={p.id} caseSel={caseSel} selection={selection} />
        <p className="sb-sublabel">{caseSel ? `Case history · ${caseSel.slice(-4)}` : 'Patient history'}</p>
        {open ? (
          caseSel ? (
            <HistoryList
              scope={{ kind: 'case', patientId: p.id, caseId: caseSel }}
              selectedId={selection.conversationId}
              empty="No chats on this case yet."
              variant="nested"
            />
          ) : (
            <HistoryList
              scope={{ kind: 'patient', patientId: p.id }}
              selectedId={selection.conversationId}
              empty="No patient-level chats yet."
              variant="nested"
            />
          )
        ) : null}
      </div>
    </li>
  )
}
