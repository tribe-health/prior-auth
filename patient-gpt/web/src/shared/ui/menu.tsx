// TJ-ARCH-MOB-001 compliant
// The prototype's inverse-fill menu (ui.js `menu`): one open at a time, focus
// moves to the first item, arrow keys move, Escape closes and returns focus,
// Tab or a press outside closes. Render it inside a `.menu-anchor` element.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react'
import { Icon } from '../icons/icon'
import type { IconName } from '../icons/icon-paths'

export type MenuEntry =
  | { kind: 'heading'; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'item'; icon?: IconName; label: string; sub?: string; current?: boolean; onSelect: () => void }

export type MenuTriggerProps = {
  ref: Ref<HTMLButtonElement>
  onClick: () => void
  'aria-haspopup': 'menu'
  'aria-expanded': boolean
  'aria-controls'?: string
}

type MenuProps = {
  label: string
  place: 'below-start' | 'above-start'
  entries: MenuEntry[]
  trigger: (props: MenuTriggerProps) => ReactNode
}

export function Menu({ label, place, entries, trigger }: MenuProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const id = useId()

  const close = useCallback((focusBack: boolean) => {
    setOpen(false)
    if (focusBack) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const menu = menuRef.current
    menu?.querySelector<HTMLElement>('.menu-item')?.focus()
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node
      if (!menu?.contains(t) && !triggerRef.current?.contains(t)) close(false)
    }
    const onKey = (e: KeyboardEvent) => {
      const items = [...(menu?.querySelectorAll<HTMLElement>('.menu-item') ?? [])]
      const i = items.indexOf(document.activeElement as HTMLElement)
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close(true)
      } else if (e.key === 'Tab') {
        close(false)
      } else if (items.length && e.key === 'ArrowDown') {
        e.preventDefault()
        ;(items[i + 1] ?? items[0])?.focus()
      } else if (items.length && e.key === 'ArrowUp') {
        e.preventDefault()
        ;(items[i - 1] ?? items[items.length - 1])?.focus()
      }
    }
    document.addEventListener('pointerdown', onDoc, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDoc, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, close])

  return (
    <>
      {trigger({
        ref: triggerRef,
        onClick: () => (open ? close(true) : setOpen(true)),
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        ...(open ? { 'aria-controls': id } : {}),
      })}
      {open ? (
        <div className={`menu ${place}`} role="menu" aria-label={label} id={id} ref={menuRef}>
          {entries.map((entry, n) => {
            switch (entry.kind) {
              case 'heading':
                return <p key={n} className="menu-head">{entry.text}</p>
              case 'note':
                return <p key={n} className="menu-note">{entry.text}</p>
              case 'item':
                return (
                  <button
                    key={n}
                    className="menu-item od-row"
                    role="menuitem"
                    type="button"
                    aria-current={entry.current ? 'true' : undefined}
                    onClick={() => {
                      close(true)
                      entry.onSelect()
                    }}
                  >
                    {entry.icon ? <Icon name={entry.icon} className="od-fixed" /> : null}
                    <span className="od-field od-fill">
                      <span className="menu-label">{entry.label}</span>
                      {entry.sub ? <span className="menu-sub">{entry.sub}</span> : null}
                    </span>
                  </button>
                )
            }
          })}
        </div>
      ) : null}
    </>
  )
}
