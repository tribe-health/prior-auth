// TJ-ARCH-MOB-001 compliant
// History rows (nav.js `histRow` / `histList`).
import { Link } from '@tanstack/react-router'
import type { ConversationScope } from '../../../app/transport/dto'
import { useConversations } from './use-conversations'

const SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
function when(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : SHORT.format(d)
}

type Props = {
  scope: ConversationScope
  selectedId: string | null
  empty: string
  /** `global` renders the rows straight into the sidebar's History list. */
  variant: 'global' | 'nested'
}

export function HistoryList({ scope, selectedId, empty, variant }: Props) {
  const list = useConversations(scope)
  if (list.status === 'loading') {
    return variant === 'global' ? <li className="sb-empty">Loading history.</li> : <p className="sb-empty">Loading history.</p>
  }
  if (list.status === 'error') {
    const text = `History could not be loaded. ${list.message}`
    return variant === 'global' ? <li className="sb-empty">{text}</li> : <p className="sb-empty">{text}</p>
  }
  if (list.items.length === 0) {
    return variant === 'global' ? <li className="sb-empty">{empty}</li> : <p className="sb-empty">{empty}</p>
  }
  const rows = list.items.map((c) => (
    <li key={c.id}>
      <Link
        className="sb-hist-row od-row"
        to="/chat/$conversationId"
        params={{ conversationId: c.id }}
        aria-current={selectedId === c.id ? 'page' : undefined}
      >
        <span className="od-fill od-truncate">{c.title}</span>
        <span className="sb-meta od-fixed od-nowrap">{when(c.updatedAt)}</span>
      </Link>
    </li>
  ))
  return variant === 'global' ? <>{rows}</> : <ul className="sb-hist">{rows}</ul>
}
