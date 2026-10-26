// TJ-ARCH-MOB-001 compliant
// TextField, CheckBox, ChoicePicker, DateTimeInput and Slider: the `--field`
// fill controls of tokens.css/base.css. Fields are found by their fill, so
// the fill carries the 3:1; focus swaps it to --field-focus. Values write
// back only to the surface's own data model through the official setter.
import { useId, useState, type ChangeEvent } from 'react'
import {
  createPrometheusA2uiComponent,
  getPrometheusA2uiOfficialComponent,
  type PrometheusA2uiComponentRenderProps,
} from '@prometheus-ags/a2ui-react'
import { weightStyle } from './pg-text-layout'

type Setter = (value: unknown) => void

function setterOf(props: Record<string, unknown>): Setter {
  return typeof props.setValue === 'function' ? (props.setValue as Setter) : () => undefined
}

function labelOf(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

function FieldError({ errors }: { errors: unknown }) {
  const first = Array.isArray(errors) && typeof errors[0] === 'string' ? errors[0] : null
  return first ? (
    <p className="a-q-err" role="alert">
      {first}
    </p>
  ) : null
}

// ── TextField ────────────────────────────────────────────────────────
const INPUT_TYPE: Record<string, string> = { number: 'number', obscured: 'password' }

function PgTextField({ props }: PrometheusA2uiComponentRenderProps) {
  const id = useId()
  const set = setterOf(props)
  const label = labelOf(props.label)
  const value = typeof props.value === 'string' || typeof props.value === 'number' ? String(props.value) : ''
  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(e.target.value)
  const variant = typeof props.variant === 'string' ? props.variant : 'shortText'
  return (
    <div className="od-field a2-field" style={weightStyle(props.weight)}>
      {label ? (
        <label className="a-q-label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      {variant === 'longText' ? (
        <textarea id={id} className="a-q-note" rows={3} value={value} onChange={onChange} />
      ) : (
        <input id={id} className="a2-input" type={INPUT_TYPE[variant] ?? 'text'} value={value} onChange={onChange} />
      )}
      <FieldError errors={props.validationErrors} />
    </div>
  )
}

// ── CheckBox ─────────────────────────────────────────────────────────
function PgCheckBox({ props }: PrometheusA2uiComponentRenderProps) {
  const set = setterOf(props)
  return (
    <div className="od-field a2-field" style={weightStyle(props.weight)}>
      <label className="a2-check od-row">
        <input type="checkbox" checked={props.value === true} onChange={(e) => set(e.target.checked)} />
        <span className="od-fill">{String(props.label ?? '')}</span>
      </label>
      <FieldError errors={props.validationErrors} />
    </div>
  )
}

// ── ChoicePicker ─────────────────────────────────────────────────────
type Option = { label?: unknown; value?: unknown }

function PgChoicePicker({ props }: PrometheusA2uiComponentRenderProps) {
  const id = useId()
  const [filter, setFilter] = useState('')
  const set = setterOf(props)
  const label = labelOf(props.label)
  const selected: unknown[] = Array.isArray(props.value) ? props.value : []
  const exclusive = props.variant !== 'multipleSelection'
  const toggle = (v: string) =>
    set(exclusive ? [v] : selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])
  const needle = filter.trim().toLowerCase()
  const options = (Array.isArray(props.options) ? (props.options as Option[]) : []).filter(
    (o) => !props.filterable || needle === '' || String(o.label ?? '').toLowerCase().includes(needle),
  )
  const filterBox = props.filterable ? (
    <input
      className="a2-input"
      type="search"
      aria-label={label ? `Filter ${label}` : 'Filter options'}
      placeholder="Filter options"
      value={filter}
      onChange={(e) => setFilter(e.target.value)}
    />
  ) : null

  if (props.displayStyle === 'chips') {
    return (
      <div className="od-field a2-field" role="group" aria-labelledby={label ? `${id}-l` : undefined} style={weightStyle(props.weight)}>
        {label ? (
          <span className="a-q-label" id={`${id}-l`}>
            {label}
          </span>
        ) : null}
        {filterBox}
        <div className="od-cluster a2-chips">
          {options.map((o) => {
            const v = String(o.value ?? '')
            return (
              <button key={v} type="button" className="chip" aria-pressed={selected.includes(v)} onClick={() => toggle(v)}>
                {String(o.label ?? '')}
              </button>
            )
          })}
        </div>
        <FieldError errors={props.validationErrors} />
      </div>
    )
  }

  return (
    <fieldset className="od-field a2-field" style={weightStyle(props.weight)}>
      {label ? <legend className="a-q-label">{label}</legend> : null}
      {filterBox}
      <div className="a-q-opts">
        {options.map((o) => {
          const v = String(o.value ?? '')
          return (
            <label key={v} className="a-q-opt od-row">
              <input
                type={exclusive ? 'radio' : 'checkbox'}
                name={exclusive ? id : undefined}
                checked={selected.includes(v)}
                onChange={() => toggle(v)}
              />
              <span className="od-fill">{String(o.label ?? '')}</span>
            </label>
          )
        })}
      </div>
      <FieldError errors={props.validationErrors} />
    </fieldset>
  )
}

// ── DateTimeInput ────────────────────────────────────────────────────
type DateKind = 'date' | 'time' | 'datetime-local'

/** Same normalisation as the official renderer: ISO 8601 into the input's format. */
function normalize(value: string, kind: DateKind): string {
  if (!value) return ''
  const hasT = value.includes('T')
  const [a = '', b = ''] = value.split('T')
  const date = (hasT ? a : value).slice(0, 10)
  const time = (hasT ? b : value).slice(0, 5)
  if (kind === 'date') return date
  if (kind === 'time') return time
  return `${date}T${time}`
}

function PgDateTimeInput({ props }: PrometheusA2uiComponentRenderProps) {
  const id = useId()
  const set = setterOf(props)
  if (!props.enableDate && !props.enableTime) return null
  const kind: DateKind = props.enableDate && props.enableTime ? 'datetime-local' : props.enableDate ? 'date' : 'time'
  const label = labelOf(props.label)
  return (
    <div className="od-field a2-field" style={weightStyle(props.weight)}>
      {label ? (
        <label className="a-q-label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <input
        id={id}
        className="a2-input a2-date"
        type={kind}
        value={normalize(typeof props.value === 'string' ? props.value : '', kind)}
        min={typeof props.min === 'string' ? props.min : undefined}
        max={typeof props.max === 'string' ? props.max : undefined}
        onChange={(e) => set(e.target.value)}
      />
      <FieldError errors={props.validationErrors} />
    </div>
  )
}

// ── Slider ───────────────────────────────────────────────────────────
function PgSlider({ props }: PrometheusA2uiComponentRenderProps) {
  const id = useId()
  const set = setterOf(props)
  const label = labelOf(props.label)
  const min = typeof props.min === 'number' ? props.min : 0
  const max = typeof props.max === 'number' ? props.max : 100
  const value = typeof props.value === 'number' ? props.value : min
  return (
    <div className="od-field a2-field" style={weightStyle(props.weight)}>
      <div className="od-row a2-slider-head">
        {label ? (
          <label className="a-q-label od-fill" htmlFor={id}>
            {label}
          </label>
        ) : (
          <span className="od-fill" />
        )}
        <output className="a2-value" htmlFor={id}>
          {value}
        </output>
      </div>
      <input id={id} className="a2-range" type="range" min={min} max={max} value={value} onChange={(e) => set(Number(e.target.value))} />
    </div>
  )
}

export const pgTextField = createPrometheusA2uiComponent(getPrometheusA2uiOfficialComponent('TextField'), PgTextField)
export const pgCheckBox = createPrometheusA2uiComponent(getPrometheusA2uiOfficialComponent('CheckBox'), PgCheckBox)
export const pgChoicePicker = createPrometheusA2uiComponent(getPrometheusA2uiOfficialComponent('ChoicePicker'), PgChoicePicker)
export const pgDateTimeInput = createPrometheusA2uiComponent(getPrometheusA2uiOfficialComponent('DateTimeInput'), PgDateTimeInput)
export const pgSlider = createPrometheusA2uiComponent(getPrometheusA2uiOfficialComponent('Slider'), PgSlider)
