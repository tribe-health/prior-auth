// TJ-ARCH-MOB-001 compliant
// Keeps the composer text as a local-lane draft per scope or conversation:
// restored when the context changes, saved shortly after typing stops.
import { useEffect, useRef } from 'react'
import { useAui, useAuiState } from '@assistant-ui/react'
import { drafts } from '../../conversations/data/draft-repository'

const SAVE_DELAY_MS = 400

export function useComposerDraft(draftKey: string): void {
  const aui = useAui()
  const text = useAuiState((s) => s.composer.text)
  const loadedFor = useRef<string | null>(null)

  useEffect(() => {
    let live = true
    loadedFor.current = null
    drafts
      .read(draftKey)
      .then((body) => {
        if (!live) return
        if (body && aui.composer().getState().text === '') aui.composer().setText(body)
        loadedFor.current = draftKey
      })
      .catch((err: unknown) => {
        console.error('PatientGPT: the composer draft could not be read from the local lane.', err)
        if (live) loadedFor.current = draftKey
      })
    return () => {
      live = false
    }
  }, [draftKey, aui])

  // Saved shortly after typing stops, and at once when the page is hidden or
  // the context changes, so a reload inside the delay does not lose the draft.
  const pending = useRef<{ key: string; body: string } | null>(null)
  const flush = useRef(() => {
    const p = pending.current
    if (!p) return
    pending.current = null
    drafts.write(p.key, p.body).catch((err: unknown) => {
      console.error('PatientGPT: the composer draft could not be saved to the local lane.', err)
    })
  })

  useEffect(() => {
    if (loadedFor.current !== draftKey) return
    pending.current = { key: draftKey, body: text }
    const t = window.setTimeout(flush.current, SAVE_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [draftKey, text])

  useEffect(() => {
    const onHide = () => flush.current()
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onHide)
      onHide()
    }
  }, [draftKey])
}
