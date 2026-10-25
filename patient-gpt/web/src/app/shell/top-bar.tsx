// TJ-ARCH-MOB-001 compliant
// Top bar (52px): sidebar opener, context control, new chat; then the strip.
import { Link } from '@tanstack/react-router'
import { Icon } from '../../shared/icons/icon'
import { Menu } from '../../shared/ui/menu'
import { StateChip } from '../../shared/ui/state-chip'
import { useContextMenu } from './use-context-menu'
import { useContextStrip } from './use-context-strip'
import type { NavSelection } from './use-sidebar-nav'

function ContextButton({ selection }: { selection: NavSelection }) {
  const ctx = useContextMenu(selection)
  return (
    <Menu
      label="Context"
      place="below-start"
      entries={ctx.entries}
      trigger={(props) => (
        <button {...props} className="ctx-btn od-row" type="button" aria-label={ctx.aria}>
          <span className="od-truncate">{ctx.label}</span>
          {ctx.caseId ? <span className="ctx-id od-fixed od-nowrap">{ctx.caseId}</span> : null}
          <Icon name="chevDown" className="od-fixed" />
        </button>
      )}
    />
  )
}

function Strip({ selection }: { selection: NavSelection }) {
  const strip = useContextStrip(selection)
  switch (strip.kind) {
    case 'none':
      return <div className="strip" id="strip" hidden />
    case 'patient':
      return (
        <div className="strip" id="strip">
          <span className="strip-fact od-nowrap">
            {strip.caseCount} {strip.caseCount === 1 ? 'case' : 'cases'}
          </span>
          <span className="strip-next">{strip.payer}</span>
        </div>
      )
    case 'case': {
      const t = strip.record.tally
      return (
        <div className="strip" id="strip">
          <span className="tally od-cluster" role="group" aria-label="Criteria">
            <StateChip state="met" label={`${t.met} MET`} />
            <StateChip state="gap" label={`${t.gap} GAP`} />
            <StateChip state="void" label={`${t.void} VOID`} />
          </span>
          {strip.due ? (
            <span className={strip.soon ? 'strip-due od-nowrap soon' : 'strip-due od-nowrap'}>
              <Icon name="clock" className="od-fixed" />
              <span>{strip.due}</span>
            </span>
          ) : null}
        </div>
      )
    }
  }
}

export function TopBar({ selection, onOpenSidebar }: { selection: NavSelection; onOpenSidebar: () => void }) {
  return (
    <header className="topbar">
      <div className="tb-row od-row">
        <button className="icon-btn od-fixed" id="sb-open" type="button" aria-label="Open sidebar" onClick={onOpenSidebar}>
          <Icon name="panel" />
        </button>
        <div className="menu-anchor od-fill" id="ctx">
          <ContextButton selection={selection} />
        </div>
        <Link className="icon-btn od-fixed" id="tb-new" to="/" aria-label="New chat">
          <Icon name="edit" />
        </Link>
      </div>
      <Strip selection={selection} />
    </header>
  )
}
