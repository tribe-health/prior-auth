// TJ-ARCH-MOB-001 compliant
// Transient A2UI state: the intents surfaces reported, which components were
// replaced by a fallback, and whether a surface was rejected. Nothing here is
// a record and nothing is applied to the entity graph or persisted.
import { create } from 'zustand'
import type { A2uiIntent } from '../domain/a2ui-intent'
import type { QuarantinedComponent } from '../domain/quarantine-components'

const INTENT_LIMIT = 20

type A2uiState = {
  intents: readonly A2uiIntent[]
  /** surfaceId → componentId → skipped component name. */
  fallbacks: Readonly<Record<string, Readonly<Record<string, string>>>>
  /** surfaceId → why it was not rendered. */
  failures: Readonly<Record<string, string>>
  sampleOpen: boolean
}

type A2uiActions = {
  report: (intent: A2uiIntent) => void
  recordFallbacks: (items: readonly QuarantinedComponent[]) => void
  setFailure: (surfaceId: string, text: string) => void
  forgetSurface: (surfaceId: string) => void
  setSampleOpen: (open: boolean) => void
}

function without<T>(rec: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const { [key]: _drop, ...rest } = rec
  return rest
}

export const useA2uiStore = create<A2uiState & A2uiActions>()((set) => ({
  intents: [],
  fallbacks: {},
  failures: {},
  sampleOpen: false,

  report: (intent) => set((s) => ({ intents: [...s.intents, intent].slice(-INTENT_LIMIT) })),
  recordFallbacks: (items) =>
    set((s) => {
      if (items.length === 0) return s
      const next: Record<string, Record<string, string>> = { ...s.fallbacks }
      for (const q of items) next[q.surfaceId] = { ...next[q.surfaceId], [q.componentId]: q.name }
      return { fallbacks: next }
    }),
  setFailure: (surfaceId, text) => set((s) => ({ failures: { ...s.failures, [surfaceId]: text } })),
  forgetSurface: (surfaceId) =>
    set((s) => ({ fallbacks: without(s.fallbacks, surfaceId), failures: without(s.failures, surfaceId) })),
  setSampleOpen: (open) => set({ sampleOpen: open }),
}))
