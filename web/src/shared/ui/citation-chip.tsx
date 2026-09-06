/**
 * A citation — where an assertion came from.
 *
 * The prototype's stylesheet states the rule as a comment: *"An assertion
 * without one is a rendering bug."* (`assets/aso.css:368`). This component
 * makes the absent case explicit rather than allowing an empty render: a
 * missing citation shows "Not documented", carrying the same void treatment as
 * everywhere else.
 *
 * That matters because the failure being prevented is silent. A citation that
 * renders as nothing looks identical to one the layout simply did not have room
 * for, and a clinician cannot tell an unsourced claim from a sourced one.
 */
import { EvidenceStateChip } from "./evidence-state-chip";
import { cn } from "@/lib/utils";

export interface CitationChipProps {
  /**
   * Human-readable source — "Epic · MRI L4-L5 · 2026-03-14".
   *
   * `null` means no source exists, which is a void, not an empty string. The
   * two are different claims and are rendered differently.
   */
  source: string | null;
  className?: string;
}

export function CitationChip({ source, className }: CitationChipProps) {
  if (source === null) {
    return <EvidenceStateChip state="void" className={className} />;
  }

  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-[3px] bg-ui-muted",
        "px-1.5 py-0.5 font-mono text-xs text-ui-muted-foreground",
        className,
      )}
    >
      {source}
    </span>
  );
}
