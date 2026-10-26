// TJ-ARCH-MOB-001 compliant
// Read-side hooks over the transient A2UI store. Components use these and
// never the store itself.
import { use } from 'react'
import { useA2uiStore } from '../data/a2ui-store'
import type { A2uiIntent } from '../domain/a2ui-intent'
import { SurfaceIdContext } from './catalog/render-contexts'

/** The skipped component's name when this component id is a fallback stand-in. */
export function useA2uiFallbackName(componentId: string): string | null {
  const surfaceId = use(SurfaceIdContext)
  return useA2uiStore((s) => (surfaceId ? (s.fallbacks[surfaceId]?.[componentId] ?? null) : null))
}

export function useA2uiFailure(surfaceId: string): string | null {
  return useA2uiStore((s) => s.failures[surfaceId] ?? null)
}

export function useLatestA2uiIntent(): A2uiIntent | null {
  return useA2uiStore((s) => s.intents.at(-1) ?? null)
}
