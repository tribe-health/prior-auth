// TJ-ARCH-MOB-001 compliant
// Met, gap and void always carry a label and a shape, never colour alone.
import type { EvidenceState } from '../../app/transport/dto'
import { STATE_MARKS } from '../icons/icon-paths'

export function StateChip({ state, label }: { state: EvidenceState; label: string }) {
  return (
    <span className={`state state-${state}`}>
      <svg
        className="mark-state"
        viewBox="0 0 14 14"
        aria-hidden="true"
        focusable="false"
        dangerouslySetInnerHTML={{ __html: STATE_MARKS[state] }}
      />
      <span>{label}</span>
    </span>
  )
}
