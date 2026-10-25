// TJ-ARCH-MOB-001 compliant
// The one navy field on the page (shell.css `.composer`), on Assistant UI's
// composer primitives. Chips, attach menu, dictation and the disclaimer
// follow docs/design/patient-chat/composer.js.
import { useState } from 'react'
import { ComposerPrimitive, ThreadPrimitive } from '@assistant-ui/react'
import { Icon } from '../../../shared/icons/icon'
import { Menu, type MenuEntry } from '../../../shared/ui/menu'
import { useComposerContext } from './use-composer-context'
import { useComposerDraft } from './use-composer-draft'
import { useDictation } from './use-dictation'

const NO_CASE: MenuEntry[] = [{ kind: 'note', text: 'Set a case as the context to attach a chart document.' }]
const UNFILED_NOT_LOADED: MenuEntry[] = [{ kind: 'note', text: 'Unfiled documents are not loaded in this build.' }]

export function Composer() {
  const ctx = useComposerContext()
  const [hint, setHint] = useState('')
  const dictation = useDictation(setHint)
  useComposerDraft(ctx.draftKey)

  return (
    <div className="composer-wrap" id="composer-wrap">
      {ctx.prompts.length > 0 && !ctx.isRunning ? (
        <div className="chips od-rail" id="chips" role="group" aria-label="Suggested prompts">
          {ctx.prompts.map((p) => (
            <ThreadPrimitive.Suggestion key={p} className="chip" prompt={p} send>
              {p}
            </ThreadPrimitive.Suggestion>
          ))}
        </div>
      ) : null}
      <ComposerPrimitive.Root className="composer on-field" id="composer" autoComplete="off">
        <ul className="tray" id="tray" aria-label="Attached documents" />
        <label className="sr-only" htmlFor="prompt">
          Message
        </label>
        <ComposerPrimitive.Input id="prompt" rows={1} placeholder={ctx.placeholder} />
        <p className="composer-hint" id="composer-hint" role="status" hidden={hint === ''}>
          {hint}
        </p>
        <div className="composer-row od-row">
          <div className="menu-anchor od-fixed">
            <Menu
              label="Attach"
              place="above-start"
              entries={ctx.canAttach ? UNFILED_NOT_LOADED : NO_CASE}
              trigger={(props) => (
                <button {...props} className="icon-btn" id="attach-btn" type="button" aria-label="Attach a chart document">
                  <Icon name="plus" />
                </button>
              )}
            />
          </div>
          <span className="od-fill" />
          <button
            className="icon-btn od-fixed"
            id="mic-btn"
            type="button"
            aria-label="Dictate"
            aria-pressed={dictation.listening}
            onClick={dictation.toggle}
          >
            <Icon name="mic" />
          </button>
          {ctx.isRunning ? (
            <ComposerPrimitive.Cancel className="icon-btn send od-fixed" id="send-btn" aria-label="Stop the assistant">
              <Icon name="stop" />
            </ComposerPrimitive.Cancel>
          ) : (
            <ComposerPrimitive.Send className="icon-btn send od-fixed" id="send-btn" aria-label="Send message">
              <Icon name="up" />
            </ComposerPrimitive.Send>
          )}
        </div>
      </ComposerPrimitive.Root>
      <p className="disclaimer">Synthetic demo data. The assistant drafts and cites. The surgeon decides.</p>
    </div>
  )
}
