/**
 * Evidence state, rendered.
 *
 * The three states are the product's most important semantic (ADR-003), so
 * this component encodes them on **three independent channels**:
 *
 *   1. **Text label** — "Met" / "Not met" / "Not documented". Always present.
 *   2. **Shape** — circle / square / diamond, transcribed from the prototype
 *      (`assets/aso.css:357-362`). Survives greyscale, monochrome printing,
 *      and every form of colour blindness.
 *   3. **Colour** — reinforcement only, and the last channel added.
 *
 * Removing any one channel must still leave the state unambiguous. That is
 * the test in `evidence-state-chip.test.tsx`, and it is why the shape is not
 * decoration that a later refactor may drop.
 *
 * The label, token role, and required action all come from
 * `shared/model/evidence-state.ts`. They are deliberately NOT restated here —
 * one source, or they drift.
 */
import type { EvidenceState } from "@/shared/model/evidence-state";
import { evidenceLabel, evidenceTokenRole } from "@/shared/model/evidence-state";
import { cn } from "@/lib/utils";

/**
 * The non-colour channel.
 *
 * Circle reads as closed and complete; square as a defined thing that is
 * unmet; diamond as an absence — it is the only rotated form, so it is
 * distinguishable from the square by outline alone at 6px.
 */
const stateShape: Record<EvidenceState, string> = {
  met: "rounded-full",
  gap: "rounded-[1px]",
  void: "rounded-[1px] rotate-45",
};

export interface EvidenceStateChipProps {
  state: EvidenceState;
  /** Overrides the canonical label. For counts ("3 not documented"), not renaming. */
  children?: React.ReactNode;
  className?: string;
}

export function EvidenceStateChip({ state, children, className }: EvidenceStateChipProps) {
  const role = evidenceTokenRole[state];

  return (
    <span
      data-evidence-state={state}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full",
        "px-2.5 py-0.5 font-mono text-[0.64rem] uppercase tracking-[0.08em]",
        className,
      )}
      style={{
        backgroundColor: `var(--color-${role}-surface)`,
        color: `var(--color-${role})`,
      }}
    >
      {/* aria-hidden: the shape restates the label for sighted users. A screen
          reader already gets the label, so announcing it twice is noise. */}
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 bg-current", stateShape[state])}
      />
      {children ?? evidenceLabel[state]}
    </span>
  );
}
