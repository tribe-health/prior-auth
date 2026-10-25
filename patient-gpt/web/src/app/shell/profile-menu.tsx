// TJ-ARCH-MOB-001 compliant
// Account button and menu (shell.js `profile`): theme switch and who is signed in.
import { Menu, type MenuEntry } from '../../shared/ui/menu'
import { useSession } from '../../features/session/presentation/use-session'
import { useTheme } from './use-shell-layout'

export function ProfileMenu() {
  const session = useSession()
  const theme = useTheme()
  const name = session.status === 'ready' ? session.name : 'Session not loaded'
  const role = session.status === 'ready' ? session.role : session.status === 'error' ? session.message : 'Loading.'
  const entries: MenuEntry[] = [
    {
      kind: 'item',
      icon: theme.dark ? 'sun' : 'moon',
      label: theme.dark ? 'Switch to light theme' : 'Switch to dark theme',
      onSelect: theme.toggle,
    },
    {
      kind: 'note',
      text:
        session.status === 'ready'
          ? `Signed in as ${session.name}, ${session.role.toLowerCase()}. Synthetic demo data only.`
          : 'The session has not loaded. Synthetic demo data only.',
    },
  ]
  return (
    <Menu
      label="Account"
      place="above-start"
      entries={entries}
      trigger={(props) => (
        <button
          {...props}
          className="sb-item od-row"
          id="profile-btn"
          type="button"
          aria-label={session.status === 'ready' ? `Account: ${session.name}, ${session.role.toLowerCase()}` : 'Account'}
        >
          <span className="avatar od-fixed" aria-hidden="true">
            {session.status === 'ready' ? session.initials : ''}
          </span>
          <span className="od-field od-fill">
            <span className="sb-user">{name}</span>
            <span className="sb-role">{role}</span>
          </span>
        </button>
      )}
    />
  )
}
