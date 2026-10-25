// TJ-ARCH-MOB-001 compliant
// Transient UI state only: sidebar and drawer, expanded patients, the theme,
// and the local key of the next conversation per scope. Nothing here is a
// record; nothing here is persisted except the theme choice the prototype keeps.
import { create } from 'zustand'

const THEME_KEY = 'aso-theme'

function newDraftKey(): string {
  return `local-${crypto.randomUUID()}`
}

type UiState = {
  sidebarOpen: boolean
  drawerOpen: boolean
  expanded: Record<string, boolean>
  dark: boolean
  draftKeys: Record<string, string>
}

type UiActions = {
  setSidebarOpen: (open: boolean) => void
  setDrawerOpen: (open: boolean) => void
  toggleExpanded: (patientId: string) => void
  expand: (patientId: string) => void
  setDark: (dark: boolean) => void
  draftKeyFor: (scopeKey: string) => string
  rotateDraftKey: (scopeKey: string) => void
}

export const useUiStore = create<UiState & UiActions>()((set, get) => ({
  sidebarOpen: true,
  drawerOpen: false,
  expanded: {},
  dark: typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  draftKeys: {},

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  toggleExpanded: (id) => set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } })),
  expand: (id) => set((s) => (s.expanded[id] ? s : { expanded: { ...s.expanded, [id]: true } })),
  setDark: (dark) => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
    } catch {
      /* storage is unavailable in sandboxed previews; the choice lasts this session */
    }
    set({ dark })
  },
  draftKeyFor: (scopeKey) => {
    const existing = get().draftKeys[scopeKey]
    if (existing) return existing
    const key = newDraftKey()
    set((s) => ({ draftKeys: { ...s.draftKeys, [scopeKey]: key } }))
    return key
  },
  rotateDraftKey: (scopeKey) => set((s) => ({ draftKeys: { ...s.draftKeys, [scopeKey]: newDraftKey() } })),
}))
