import type { GateAffirmationKind, GateState } from '../model/gate-state';
import { GATE_KINDS, gateKindLabel, gateKindPrompt } from '../model/gate-state';

// Presentational. Receives everything it needs; owns no fetching, no store
// access, no invoke(). That is what makes it renderable in a golden test and
// identical on desktop and web.

interface Props {
  state: GateState;
  /** False for staff and administrators. The list stays VISIBLE and becomes
   *  non-interactive — a coordinator who cannot see the gate cannot understand
   *  why a case is stalled. */
  mayAffirm: boolean;
  refusal: string | null;
  onAffirm: (kind: GateAffirmationKind) => void;
}

export function GateAffirmationList({ state, mayAffirm, refusal, onAffirm }: Props) {
  return (
    <section aria-labelledby="gate-heading">
      <h2 id="gate-heading" className="text-h2 font-display text-text">
        Four confirmations
      </h2>

      {!mayAffirm && (
        <p className="mt-s3 text-ui text-muted">
          Visible, not affirmable. Affirming is a clinical act reserved to the
          treating surgeon.
        </p>
      )}

      {refusal && (
        <p role="alert" className="mt-s3 rounded bg-status-gap-surface p-s3 text-ui text-status-gap">
          {refusal}
        </p>
      )}

      <ul className="mt-s4 grid gap-s2">
        {GATE_KINDS.map((kind) => {
          const done = !state.outstanding.includes(kind);
          return (
            <li key={kind} className="rounded-lg bg-surface p-s4">
              <div className="flex items-baseline justify-between gap-s3">
                <span className="font-semibold text-text">{gateKindLabel[kind]}</span>
                {/* Status is never colour alone — the word carries it. */}
                <span
                  className={`font-mono text-meta ${done ? 'text-status-met' : 'text-subtle'}`}
                >
                  {done ? 'affirmed' : 'outstanding'}
                </span>
              </div>
              <p className="mt-s2 text-ui text-muted">{gateKindPrompt[kind]}</p>
              {!done && mayAffirm && (
                <button
                  type="button"
                  onClick={() => onAffirm(kind)}
                  className="mt-s3 min-h-11 rounded bg-accent px-s4 text-ui text-canvas hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                >
                  Affirm
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
