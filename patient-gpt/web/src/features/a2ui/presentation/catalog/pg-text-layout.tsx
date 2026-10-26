// TJ-ARCH-MOB-001 compliant
// Text, Row, Column, List, Card and Divider: official names, schemas and
// child semantics; PatientGPT rendering (thread.css prose, surfaces.css fill,
// `--od-gap` rhythm, Flat 2.0 space in place of rules).
import { Fragment, use, type CSSProperties, type ReactNode } from 'react'
import {
  createPrometheusA2uiComponent,
  getPrometheusA2uiOfficialComponent,
  type PrometheusA2uiComponentRenderProps,
} from '@prometheus-ags/a2ui-react'
import { useA2uiFallbackName } from '../use-a2ui-state'
import { A2uiFallback } from './a2ui-fallback'
import { InlineTextContext } from './render-contexts'

type BuildChild = PrometheusA2uiComponentRenderProps['buildChild']
type ChildRef = string | { id: string; basePath?: string }

const JUSTIFY: Record<string, CSSProperties['justifyContent']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  spaceAround: 'space-around',
  spaceBetween: 'space-between',
  spaceEvenly: 'space-evenly',
  stretch: 'stretch',
}
const ALIGN: Record<string, CSSProperties['alignItems']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
}

/** Row/Column `weight` is flex-grow, as the official renderer applies it. */
export function weightStyle(weight: unknown): CSSProperties | undefined {
  return typeof weight === 'number' ? { flex: `${weight}`, minWidth: 0, minHeight: 0 } : undefined
}

function flexStyle(props: Record<string, unknown>): CSSProperties {
  const justify = typeof props.justify === 'string' ? JUSTIFY[props.justify] : undefined
  const align = typeof props.align === 'string' ? ALIGN[props.align] : undefined
  return { ...weightStyle(props.weight), justifyContent: justify, alignItems: align }
}

export function ChildList({ list, buildChild }: { list: unknown; buildChild: BuildChild }): ReactNode {
  if (!Array.isArray(list)) return null
  return (list as ChildRef[]).map((ref, i) =>
    typeof ref === 'string' ? (
      <Fragment key={`${ref}-${i}`}>{buildChild(ref)}</Fragment>
    ) : (
      <Fragment key={`${ref.id}-${ref.basePath ?? i}`}>{buildChild(ref.id, ref.basePath)}</Fragment>
    ),
  )
}

// ── Text ──────────────────────────────────────────────────────────────
const HEADING_LEVEL: Record<string, number> = { h1: 3, h2: 3, h3: 4, h4: 4, h5: 5 }

function PgText({ props, context }: PrometheusA2uiComponentRenderProps) {
  const inline = use(InlineTextContext)
  const skipped = useA2uiFallbackName(context.componentModel.id)
  if (skipped) return <A2uiFallback name={skipped} />
  const text = typeof props.text === 'string' ? props.text : String(props.text ?? '')
  const style = weightStyle(props.weight)
  // Plain text only: Markdown is not interpreted, so a surface cannot carry a link.
  if (inline) return <span style={style}>{text}</span>
  const variant = typeof props.variant === 'string' ? props.variant : 'body'
  const level = HEADING_LEVEL[variant]
  if (level) {
    return (
      <p className={`a2-text a2-${variant}`} role="heading" aria-level={level} style={style}>
        {text}
      </p>
    )
  }
  if (variant === 'caption') {
    return (
      <p className="a2-text a2-caption" style={style}>
        {text}
      </p>
    )
  }
  return (
    <p className="a2-text prose" style={style}>
      {text}
    </p>
  )
}

// ── Row, Column, List ────────────────────────────────────────────────
function PgRow({ props, buildChild }: PrometheusA2uiComponentRenderProps) {
  return (
    <div className="a2-row" style={flexStyle(props)}>
      <ChildList list={props.children} buildChild={buildChild} />
    </div>
  )
}

function PgColumn({ props, buildChild }: PrometheusA2uiComponentRenderProps) {
  return (
    <div className="a2-col" style={flexStyle(props)}>
      <ChildList list={props.children} buildChild={buildChild} />
    </div>
  )
}

function PgList({ props, buildChild }: PrometheusA2uiComponentRenderProps) {
  const horizontal = props.direction === 'horizontal'
  const align = typeof props.align === 'string' ? ALIGN[props.align] : undefined
  return (
    <div className={horizontal ? 'a2-list a2-list-h' : 'a2-list'} role="list" style={{ ...weightStyle(props.weight), alignItems: align }}>
      {Array.isArray(props.children)
        ? (props.children as ChildRef[]).map((ref, i) => (
            <div role="listitem" key={typeof ref === 'string' ? `${ref}-${i}` : `${ref.id}-${ref.basePath ?? i}`}>
              {typeof ref === 'string' ? buildChild(ref) : buildChild(ref.id, ref.basePath)}
            </div>
          ))
        : null}
    </div>
  )
}

// ── Card, Divider ────────────────────────────────────────────────────
function PgCard({ props, buildChild }: PrometheusA2uiComponentRenderProps) {
  return (
    <div className="surface a2-card" style={weightStyle(props.weight)}>
      {typeof props.child === 'string' ? buildChild(props.child) : null}
    </div>
  )
}

/** Flat 2.0 has no rules: separation is space alone. */
function PgDivider({ props }: PrometheusA2uiComponentRenderProps) {
  return <div className={props.axis === 'vertical' ? 'a2-space a2-space-v' : 'a2-space'} aria-hidden="true" />
}

export const pgText = createPrometheusA2uiComponent(getPrometheusA2uiOfficialComponent('Text'), PgText)
export const pgRow = createPrometheusA2uiComponent(getPrometheusA2uiOfficialComponent('Row'), PgRow)
export const pgColumn = createPrometheusA2uiComponent(getPrometheusA2uiOfficialComponent('Column'), PgColumn)
export const pgList = createPrometheusA2uiComponent(getPrometheusA2uiOfficialComponent('List'), PgList)
export const pgCard = createPrometheusA2uiComponent(getPrometheusA2uiOfficialComponent('Card'), PgCard)
export const pgDivider = createPrometheusA2uiComponent(getPrometheusA2uiOfficialComponent('Divider'), PgDivider)
