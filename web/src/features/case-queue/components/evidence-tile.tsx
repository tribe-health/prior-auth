import type { EvidenceState } from '../../../shared/model/evidence-state';
import { evidenceAction, evidenceLabel } from '../../../shared/model/evidence-state';

// A clickable summary tile. Clicking drills into the evidence behind the
// number — a count nobody can trace is a number nobody trusts.

interface Props {
  state: EvidenceState;
  count: number;
  onDrill: (state: EvidenceState) => void;
}

const surfaceFor: Record<EvidenceState, string> = {
  met: 'bg-status-met-surface',
  gap: 'bg-status-gap-surface',
  void: 'bg-status-void-surface',
};

const textFor: Record<EvidenceState, string> = {
  met: 'text-status-met',
  gap: 'text-status-gap',
  void: 'text-status-void',
};

export function EvidenceTile({ state, count, onDrill }: Props) {
  return (
    <button
      type="button"
      onClick={() => onDrill(state)}
      className={`min-h-11 rounded-lg p-s4 text-left ${surfaceFor[state]} focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus`}
    >
      <span className={`block font-mono text-display ${textFor[state]}`}>{count}</span>
      <span className="mt-s1 block text-ui font-semibold text-text">{evidenceLabel[state]}</span>
      <span className="mt-s1 block text-meta text-muted">{evidenceAction[state]}</span>
    </button>
  );
}
