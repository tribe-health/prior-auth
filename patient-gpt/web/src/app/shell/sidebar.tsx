// TJ-ARCH-MOB-001 compliant
// Sidebar (shell.css `.sidebar`, 268px on --s1): brand, workspace nav,
// patients with their cases, global history, account.
import { Link } from '@tanstack/react-router'
import { BrandMark } from '../../shared/icons/brand-mark'
import { Icon } from '../../shared/icons/icon'
import { HistoryList } from '../../features/conversations/presentation/history-list'
import { PatientNav } from '../../features/patients/presentation/patient-nav'
import { ProfileMenu } from './profile-menu'
import { useSidebarNav, type NavSelection } from './use-sidebar-nav'

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

type Props = { selection: NavSelection; onClose: () => void; onSearch: () => void }

function Patients({ selection }: { selection: NavSelection }) {
  const { directory, expanded, toggle } = useSidebarNav(selection)
  switch (directory.status) {
    case 'loading':
      return <li className="sb-empty">Loading patients.</li>
    case 'error':
      return <li className="sb-empty">Patients could not be loaded. {directory.message}</li>
    case 'ready':
      if (directory.rows.length === 0) return <li className="sb-empty">No patients are assigned to you.</li>
      return (
        <>
          {directory.rows.map((row) => (
            <PatientNav
              key={row.patient.id}
              row={row}
              selection={selection}
              open={!!expanded[row.patient.id]}
              onToggle={() => toggle(row.patient.id)}
            />
          ))}
        </>
      )
  }
}

export function Sidebar({ selection, onClose, onSearch }: Props) {
  return (
    <aside className="sidebar" id="sidebar" aria-label="Patients, cases and history">
      <div className="sb-head od-row">
        <Link className="brand od-row od-fill" to="/" aria-label="PatientGPT, Advanced Spine & Orthopedics, home">
          <BrandMark />
          <span className="brand-name od-fill od-truncate">PatientGPT</span>
        </Link>
        <button className="icon-btn od-fixed" id="sb-toggle" type="button" aria-label="Close sidebar" onClick={onClose}>
          <Icon name="panel" />
        </button>
      </div>

      <nav className="sb-nav" aria-label="Workspace">
        <Link className="sb-item od-row" to="/">
          <span className="od-fixed">
            <Icon name="edit" />
          </span>
          <span className="od-fill">New chat</span>
        </Link>
        <button className="sb-item od-row" id="open-search" type="button" onClick={onSearch}>
          <span className="od-fixed">
            <Icon name="search" />
          </span>
          <span className="od-fill">Search</span>
          <kbd className="sb-kbd od-fixed" id="search-kbd">
            {IS_MAC ? '⌘K' : 'Ctrl K'}
          </kbd>
        </button>
      </nav>

      <div className="od-scroll">
        <h2 className="sb-label" id="sb-patients-h">
          Patients
        </h2>
        <ul className="sb-patients" id="sb-patients" aria-labelledby="sb-patients-h">
          <Patients selection={selection} />
        </ul>
        <h2 className="sb-label" id="sb-history-h">
          History
        </h2>
        <ul className="sb-history" id="sb-history" aria-labelledby="sb-history-h">
          <HistoryList
            scope={{ kind: 'all' }}
            selectedId={selection.conversationId}
            empty="Chats with no patient selected appear here."
            variant="global"
          />
        </ul>
      </div>

      <div className="sb-foot menu-anchor">
        <ProfileMenu />
      </div>
    </aside>
  )
}
