// TJ-ARCH-MOB-001 compliant
// Button, Icon, Tabs and Modal. Buttons are `.btn.primary` / `.btn.ghost`
// (base.css); focus is the fill swap base.css draws. Tabs use the `.tab`
// pills of surfaces.css. The modal is a native dialog on --bg over --scrim.
import { use, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import {
  createPrometheusA2uiComponent,
  getPrometheusA2uiOfficialComponent,
  type PrometheusA2uiComponentRenderProps,
} from '@prometheus-ags/a2ui-react'
import { Icon } from '../../../../shared/icons/icon'
import type { IconName } from '../../../../shared/icons/icon-paths'
import { classifyAction } from '../../domain/classify-action'
import { A2uiFallback } from './a2ui-fallback'
import { weightStyle } from './pg-text-layout'
import { InlineTextContext, ModalCloseContext } from './render-contexts'

// ── Button ───────────────────────────────────────────────────────────
const BUTTON_CLASS: Record<string, string> = {
  primary: 'btn primary',
  borderless: 'btn a2-borderless',
}

function PgButton({ props, buildChild, context }: PrometheusA2uiComponentRenderProps) {
  const closeModal = use(ModalCloseContext)
  // The raw definition decides what is wired; the resolved `action` is a closure.
  const kind = classifyAction(context.componentModel.properties.action)
  if (kind.kind === 'unsupported') return <A2uiFallback name={`Button ${kind.label}`} />
  if (kind.kind === 'closeModal' && !closeModal) return <A2uiFallback name='Button action "closeModal" outside a modal' />
  const run = kind.kind === 'event' ? props.action : closeModal
  const variant = typeof props.variant === 'string' ? props.variant : 'default'
  return (
    <button
      type="button"
      className={BUTTON_CLASS[variant] ?? 'btn ghost'}
      style={weightStyle(props.weight)}
      disabled={props.isValid === false}
      onClick={typeof run === 'function' ? () => run() : undefined}
    >
      <InlineTextContext value={true}>{typeof props.child === 'string' ? buildChild(props.child) : null}</InlineTextContext>
    </button>
  )
}

// ── Icon ─────────────────────────────────────────────────────────────
/**
 * Official icon names whose meaning exists in the prototype set (ui.js).
 * Any other name, and any raw `svgPath`, renders the labelled fallback.
 */
const ICON_NAMES: Record<string, IconName> = {
  add: 'plus',
  check: 'check',
  close: 'x',
  edit: 'edit',
  folder: 'folder',
  lock: 'lock',
  search: 'search',
}

function PgIcon({ props }: PrometheusA2uiComponentRenderProps) {
  const name = typeof props.name === 'string' ? props.name : null
  const icon = name ? ICON_NAMES[name] : undefined
  if (!icon) return <A2uiFallback name={name ? `Icon "${name}"` : 'Icon path'} />
  return (
    <span className="a2-icon" style={weightStyle(props.weight)}>
      <Icon name={icon} />
    </span>
  )
}

// ── Tabs ─────────────────────────────────────────────────────────────
type TabDef = { title?: unknown; child?: unknown }

function PgTabs({ props, buildChild }: PrometheusA2uiComponentRenderProps) {
  const [selected, setSelected] = useState(0)
  const base = useId()
  const tabs: TabDef[] = Array.isArray(props.tabs) ? (props.tabs as TabDef[]) : []
  const current = Math.min(selected, Math.max(tabs.length - 1, 0))
  const active = tabs[current]
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (step === 0 || tabs.length === 0) return
    e.preventDefault()
    const next = (current + step + tabs.length) % tabs.length
    setSelected(next)
    document.getElementById(`${base}-tab-${next}`)?.focus()
  }
  return (
    <div className="a2-tabs" style={weightStyle(props.weight)}>
      <div className="od-cluster a2-tablist" role="tablist" onKeyDown={onKey}>
        {tabs.map((tab, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            id={`${base}-tab-${i}`}
            className="tab"
            aria-selected={i === current}
            aria-controls={`${base}-panel`}
            tabIndex={i === current ? 0 : -1}
            onClick={() => setSelected(i)}
          >
            {String(tab.title ?? '')}
          </button>
        ))}
      </div>
      <div className="a2-tabpanel" role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${current}`}>
        {active && typeof active.child === 'string' ? buildChild(active.child) : null}
      </div>
    </div>
  )
}

// ── Modal ────────────────────────────────────────────────────────────
function PgModal({ props, buildChild }: PrometheusA2uiComponentRenderProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <>
      <button type="button" className="btn ghost a2-modal-trigger" style={weightStyle(props.weight)} onClick={() => setOpen(true)}>
        <InlineTextContext value={true}>{typeof props.trigger === 'string' ? buildChild(props.trigger) : null}</InlineTextContext>
      </button>
      <dialog
        ref={ref}
        className="a2-modal"
        aria-label="Agent-generated dialog"
        onClose={close}
        onClick={(e) => {
          if (e.target === e.currentTarget) close()
        }}
      >
        {open ? (
          <ModalCloseContext value={close}>
            <div className="a2-modal-body">{typeof props.content === 'string' ? buildChild(props.content) : null}</div>
          </ModalCloseContext>
        ) : null}
      </dialog>
    </>
  )
}

export const pgButton = createPrometheusA2uiComponent(getPrometheusA2uiOfficialComponent('Button'), PgButton)
export const pgIcon = createPrometheusA2uiComponent(getPrometheusA2uiOfficialComponent('Icon'), PgIcon)
export const pgTabs = createPrometheusA2uiComponent(getPrometheusA2uiOfficialComponent('Tabs'), PgTabs)
export const pgModal = createPrometheusA2uiComponent(getPrometheusA2uiOfficialComponent('Modal'), PgModal)
