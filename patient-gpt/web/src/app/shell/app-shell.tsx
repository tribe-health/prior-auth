// TJ-ARCH-MOB-001 compliant
// The app shell (patient-chat.html `.app`): sidebar, scrim, main column with
// top bar, view and docked composer. The third grid column stays free for the
// Files panel and record viewers.
import { useEffect, useMemo, useState } from 'react'
import { Outlet } from '@tanstack/react-router'
import { ChatRuntimeProvider } from '../../features/chat/presentation/chat-runtime-provider'
import { ComposerDock } from '../../features/chat/presentation/composer-placement'
import type { ActiveThread } from '../../features/chat/presentation/active-thread'
import { SearchDialog } from './search-dialog'
import { Sidebar } from './sidebar'
import { TopBar } from './top-bar'
import { useShellLayout } from './use-shell-layout'
import { useShellRoute } from './use-shell-route'
import { selectionOf } from './use-sidebar-nav'

const DATA_SCOPE = { all: 'global', patient: 'patient', case: 'case' } as const

export function AppShell() {
  const route = useShellRoute()
  const layout = useShellLayout()
  const [searchOpen, setSearchOpen] = useState(false)
  const selection = selectionOf(route)

  const active = useMemo<ActiveThread>(
    () => ({
      view: route.name === 'chat' ? 'chat' : 'page',
      scope: route.scope ?? { kind: 'all' },
      conversationId: route.name === 'chat' ? route.conversationId : null,
      canCompose: route.scope !== null,
    }),
    [route],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <ChatRuntimeProvider active={active}>
      <a
        className="skip"
        id="skip"
        href="#view"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('view')?.focus()
        }}
      >
        Skip to conversation
      </a>
      <div
        className="app"
        id="app"
        data-sidebar={layout.sidebar}
        data-drawer={layout.drawerOpen ? 'open' : undefined}
        data-route={route.name}
        data-scope={DATA_SCOPE[selection.kind]}
      >
        <Sidebar selection={selection} onClose={layout.closeSidebar} onSearch={() => setSearchOpen(true)} />
        <div className="scrim" id="scrim" hidden={!layout.drawerOpen} onClick={layout.closeDrawer} />
        <div className="main od-screen" id="main" inert={layout.drawerOpen}>
          <TopBar selection={selection} onOpenSidebar={layout.openSidebar} />
          <main className="view od-scroll" id="view" tabIndex={-1}>
            <Outlet />
          </main>
          <ComposerDock />
        </div>
      </div>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </ChatRuntimeProvider>
  )
}
