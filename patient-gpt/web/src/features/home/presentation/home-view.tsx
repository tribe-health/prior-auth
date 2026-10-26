// TJ-ARCH-MOB-001 compliant
// Nothing selected: the greeting, the chat box and "Due next" (shell.js `homeView`).
import { Link } from '@tanstack/react-router'
import { useDocumentTitle } from '../../../shared/dom/use-document-title'
import { A2uiDevSlot } from '../../a2ui/presentation/a2ui-dev-slot'
import { ComposerSlot } from '../../chat/presentation/composer-placement'
import { useOpenCases } from '../../patients/presentation/use-patient-directory'
import { useSession } from '../../session/presentation/use-session'

function DueNext() {
  const rows = useOpenCases()
  if (rows.length === 0) return null
  return (
    <section className="due" aria-labelledby="due-h">
      <h2 className="sec-h" id="due-h">
        Due next
      </h2>
      <ul className="queue">
        {rows.map((r) => (
          <li key={r.record.id}>
            <Link className="q-row" to="/c/$caseId" params={{ caseId: r.record.id }}>
              <span className="od-field">
                <span className="q-name">{r.patientName}</span>
                <span className="q-title">{r.record.procedure}</span>
              </span>
              <span className="od-field">
                {r.due ? <span className={r.soon ? 'q-due od-nowrap soon' : 'q-due od-nowrap'}>{r.due}</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function HomeView() {
  const session = useSession()
  useDocumentTitle(null)
  return (
    <div className="home">
      <h1 className="greeting">
        {session.status === 'ready' ? `Which case first, ${session.greetingName}?` : 'Which case first?'}
      </h1>
      <ComposerSlot />
      <DueNext />
      <A2uiDevSlot />
    </div>
  )
}
