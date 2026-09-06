/**
 * The met / gap / void summary.
 *
 * Renders all three states **even at zero**. A criterion set with no voids
 * still shows "0 Not documented", because the absence of a number and a zero
 * are different claims: one says nothing was checked, the other says something
 * was checked and found empty. Collapsing them is how a coordinator concludes
 * a chart is complete when it was never examined.
 */
import type { EvidenceCounts, EvidenceState } from "@/shared/model/evidence-state";
import { EVIDENCE_STATES, evidenceAction, evidenceLabel } from "@/shared/model/evidence-state";
import { EvidenceStateChip } from "./evidence-state-chip";
import { cn } from "@/lib/utils";

export interface EvidenceCountsSummaryProps {
  counts: EvidenceCounts;
  /**
   * Show what each non-zero state asks a human to do — "Argue it", "Obtain it".
   * The reason the three states exist is that they route work to different
   * people, so the action is the useful part on a worklist.
   */
  showAction?: boolean;
  className?: string;
}

export function EvidenceCountsSummary({
  counts,
  showAction = false,
  className,
}: EvidenceCountsSummaryProps) {
  return (
    <ul className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1", className)}>
      {EVIDENCE_STATES.map((state: EvidenceState) => (
        <li key={state} className="flex items-center gap-1.5">
          <EvidenceStateChip state={state}>
            {counts[state]} {labelFor(state)}
          </EvidenceStateChip>
          {showAction && counts[state] > 0 ? (
            <span className="text-xs text-ui-muted-foreground">{evidenceAction[state]}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Lowercased label for use after a number.
 *
 * "3 Not met" reads as a title; "3 not met" reads as a count. Derived from the
 * canonical label rather than a second table, so a change to the wording in
 * `evidence-state.ts` reaches here automatically.
 */
function labelFor(state: EvidenceState): string {
  return evidenceLabel[state].toLowerCase();
}
