// TJ-ARCH-MOB-001 compliant
// A new chat in the context of the whole patient (shell.js `patientView`),
// limited to what the scaffold contract carries.
import { Link } from '@tanstack/react-router'
import { useDocumentTitle } from '../../../shared/dom/use-document-title'
import { ComposerSlot } from '../../chat/presentation/composer-placement'
import { fmtDate } from '../domain/due-dates'
import { usePatient, usePatientCases } from './use-patient-directory'

function CaseRows({ patientId }: { patientId: string }) {
  const cases = usePatientCases(patientId)
  if (cases.status === 'loading') return <p className="sec-note">Loading cases.</p>
  if (cases.status === 'error') return <p className="sec-note">Cases could not be loaded. {cases.message}</p>
  return (
    <ul className="rows">
      {cases.cases.map((c) => (
        <li key={c.id}>
          <Link className="row" to="/c/$caseId" params={{ caseId: c.id }}>
            <span className="od-field">
              <span className="row-title">{c.procedure}</span>
              <span className="row-sub">{c.id}</span>
            </span>
            <span className="row-side od-nowrap">{c.due ? `${c.due.kind} ${fmtDate(c.due.date)}` : c.closed ? 'Closed' : ''}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function PatientView({ patientId }: { patientId: string }) {
  const p = usePatient(patientId)
  useDocumentTitle(p?.displayName ?? null)
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">{p?.displayName ?? 'Patient'}</h1>
        {p ? (
          <p className="page-facts">
            <span className="od-nowrap">{p.payer}</span>
          </p>
        ) : null}
      </header>
      <ComposerSlot />
      <section className="page-sec" aria-labelledby="cases-h">
        <h2 className="sec-h" id="cases-h">
          Cases
        </h2>
        <CaseRows patientId={patientId} />
      </section>
    </div>
  )
}
