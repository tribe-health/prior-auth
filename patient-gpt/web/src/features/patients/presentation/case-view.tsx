// TJ-ARCH-MOB-001 compliant
// A new chat in the context of one case (shell.js `caseView`), limited to
// what the scaffold contract carries.
import { useDocumentTitle } from '../../../shared/dom/use-document-title'
import { ComposerSlot } from '../../chat/presentation/composer-placement'
import { useCase, usePatient } from './use-patient-directory'

export function CaseView({ caseId }: { caseId: string }) {
  const c = useCase(caseId)
  const p = usePatient(c?.patientId ?? null)
  useDocumentTitle(p ? `${p.displayName} · ${caseId}` : caseId)
  if (!c) {
    return (
      <div className="page">
        <header className="page-head">
          <h1 className="page-title">{caseId}</h1>
          <p className="sec-note">This case is not in the lists loaded on this device yet.</p>
        </header>
      </div>
    )
  }
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">{c.procedure}</h1>
        <p className="page-facts">
          {[c.id, p?.displayName, c.payer].filter(Boolean).map((f) => (
            <span key={f} className="od-nowrap">
              {f}
            </span>
          ))}
        </p>
      </header>
      <ComposerSlot />
    </div>
  )
}
