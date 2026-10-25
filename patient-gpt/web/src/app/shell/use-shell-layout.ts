// TJ-ARCH-MOB-001 compliant
// Collapsible sidebar at 768px and up, a drawer with a scrim below it
// (shell.js `openSidebar` / `closeSidebar` / `closeDrawer`).
import { useCallback, useEffect } from 'react'
import { useMediaQuery, WIDE } from '../../shared/dom/use-media-query'
import { useUiStore } from './ui-store'

function focusById(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.focus())
}

export function useShellLayout() {
  const wide = useMediaQuery(WIDE)
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const drawerOpen = useUiStore((s) => s.drawerOpen)
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen)
  const setDrawerOpen = useUiStore((s) => s.setDrawerOpen)

  const closeDrawer = useCallback(() => setDrawerOpen(false), [setDrawerOpen])

  const openSidebar = useCallback(() => {
    if (wide) setSidebarOpen(true)
    else setDrawerOpen(true)
    focusById('sb-toggle')
  }, [wide, setSidebarOpen, setDrawerOpen])

  const closeSidebar = useCallback(() => {
    if (wide) setSidebarOpen(false)
    else setDrawerOpen(false)
    focusById('sb-open')
  }, [wide, setSidebarOpen, setDrawerOpen])

  // Crossing to wide closes the drawer, as the prototype's media listener does.
  useEffect(() => {
    if (wide) setDrawerOpen(false)
  }, [wide, setDrawerOpen])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open]')) return
      setDrawerOpen(false)
      focusById('sb-open')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen, setDrawerOpen])

  return {
    sidebar: sidebarOpen ? ('open' as const) : ('closed' as const),
    drawerOpen: !wide && drawerOpen,
    openSidebar,
    closeSidebar,
    closeDrawer,
  }
}

export function useTheme() {
  const dark = useUiStore((s) => s.dark)
  const setDark = useUiStore((s) => s.setDark)
  return { dark, toggle: () => setDark(!dark) }
}
