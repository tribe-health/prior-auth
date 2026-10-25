// TJ-ARCH-MOB-001 compliant
// Date wording ported from docs/design/patient-chat/ui.js.
import type { CaseSummary } from '../../../app/transport/dto'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_MS = 86_400_000

function parseDate(d: string): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, day ?? 1)
}

function today(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

export function fmtDate(d: string): string {
  const x = parseDate(d)
  return `${MONTHS[x.getMonth()]} ${x.getDate()}`
}

export function daysUntil(d: string): number {
  return Math.round((parseDate(d).getTime() - today().getTime()) / DAY_MS)
}

export function dueLabel(d: string): string {
  const n = daysUntil(d)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n > 1) return `in ${n} days`
  if (n === -1) return 'yesterday'
  return `${-n} days ago`
}

export function dueText(c: CaseSummary): string | null {
  return c.due ? `${c.due.kind} ${fmtDate(c.due.date)} · ${dueLabel(c.due.date)}` : null
}

export function isSoon(c: CaseSummary): boolean {
  return c.due !== null && daysUntil(c.due.date) <= 1
}

/** The nearest deadline among a patient's open cases (ported from D.nearestDue). */
export function nearestDue(cases: readonly CaseSummary[]): string | null {
  let best: string | null = null
  for (const c of cases) {
    if (c.closed || !c.due) continue
    if (best === null || c.due.date < best) best = c.due.date
  }
  return best
}
