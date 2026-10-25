// TJ-ARCH-MOB-001 compliant
// The composer sits inside the page on wide home, patient and case views and
// docks at the bottom on phones and in chats (composer.js `place`).
import { useMediaQuery, WIDE } from '../../../shared/dom/use-media-query'
import { useActiveThread } from './active-thread'
import { Composer } from './composer'

export function useComposerPlacement(): 'slot' | 'dock' | 'none' {
  const active = useActiveThread()
  const wide = useMediaQuery(WIDE)
  if (!active.canCompose) return 'none'
  return wide && active.view === 'page' ? 'slot' : 'dock'
}

/** Rendered by pages where the prototype has `data-composer-slot`. */
export function ComposerSlot() {
  return useComposerPlacement() === 'slot' ? <Composer /> : null
}

export function ComposerDock() {
  const placement = useComposerPlacement()
  return (
    <div className="dock" id="dock" hidden={placement !== 'dock'}>
      {placement === 'dock' ? <Composer /> : null}
    </div>
  )
}
