// TJ-ARCH-MOB-001 compliant
// Real dictation where the browser offers it; a plain message where it does
// not (ported from docs/design/patient-chat/composer.js `toggleMic`).
import { useCallback, useRef, useState } from 'react'
import { useAui } from '@assistant-ui/react'

type Recognition = {
  lang: string
  interimResults: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const LISTENING = 'Listening. Press the microphone again to stop.'

export function useDictation(setHint: (text: string) => void) {
  const aui = useAui()
  const rec = useRef<Recognition | null>(null)
  const [listening, setListening] = useState(false)

  const toggle = useCallback(() => {
    if (rec.current) {
      rec.current.stop()
      return
    }
    const SR = recognitionCtor()
    if (!SR) {
      setHint('Dictation needs a browser with speech recognition. Type your message instead.')
      return
    }
    try {
      const base = aui.composer().getState().text
      const r = new SR()
      r.lang = 'en-US'
      r.interimResults = false
      r.onresult = (e) => {
        let said = ''
        for (let i = 0; i < e.results.length; i += 1) said += e.results[i]?.[0]?.transcript ?? ''
        aui.composer().setText(base ? `${base} ${said}` : said)
      }
      r.onerror = () => setHint('The microphone is not available here. Type your message instead.')
      r.onend = () => {
        rec.current = null
        setListening(false)
        setHint('')
      }
      rec.current = r
      r.start()
      setListening(true)
      setHint(LISTENING)
    } catch {
      rec.current = null
      setHint('The microphone is not available here. Type your message instead.')
    }
  }, [aui, setHint])

  return { listening, toggle }
}
