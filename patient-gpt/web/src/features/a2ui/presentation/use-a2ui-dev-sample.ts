// TJ-ARCH-MOB-001 compliant
// Development builds only: opens and closes the sample surface.
import { useCallback } from 'react'
import { useA2uiStore } from '../data/a2ui-store'
import { SAMPLE_MESSAGES, SAMPLE_SURFACE_ID } from '../data/sample-surface'
import { processA2uiMessages, removeA2uiSurface } from './use-a2ui-runtime'

export function useA2uiDevSample() {
  const open = useA2uiStore((s) => s.sampleOpen)
  const setOpen = useA2uiStore((s) => s.setSampleOpen)
  const toggle = useCallback(() => {
    if (open) {
      removeA2uiSurface(SAMPLE_SURFACE_ID)
      setOpen(false)
      return
    }
    removeA2uiSurface(SAMPLE_SURFACE_ID)
    processA2uiMessages(SAMPLE_MESSAGES)
    setOpen(true)
  }, [open, setOpen])
  return { open, toggle, surfaceId: SAMPLE_SURFACE_ID }
}
