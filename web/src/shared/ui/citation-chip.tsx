/**
 * A citation — where an assertion came from.
 *
 * The prototype's stylesheet states the rule as a comment: *"An assertion
 * without one is a rendering bug."* (`assets/aso.css:368`). This component
 * makes the absent case explicit rather than allowing an empty render: a
 * missing citation shows the exclusion consequence without changing the
 * assertion's evidence state.
 *
 * That matters because the failure being prevented is silent. A citation that
 * renders as nothing looks identical to one the layout simply did not have room
 * for, and a clinician cannot tell an unsourced claim from a sourced one.
 */
import { cn } from "@/lib/utils";

export interface CitationChipProps {
  /**
   * Human-readable source — "Epic · MRI L4-L5 · 2026-03-14".
   *
   * `null` means no source exists. Citation absence is independent of the
   * assertion's `met`, `gap`, or `void` state.
   */
  source: string | null;
  className?: string;
}

export function CitationChip({ source, className }: CitationChipProps) {
  if (source === null) {
    return (
      <span
        data-citation-status="missing"
        className={cn(
          "inline-flex rounded-[3px] border border-destructive/40 bg-destructive/5",
          "px-1.5 py-0.5 text-xs font-medium text-destructive",
          className,
        )}
      >
        This assertion has no source document. It will not be included.
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-block max-w-full whitespace-normal break-words rounded-[3px] bg-ui-muted",
        "px-1.5 py-0.5 font-mono text-xs text-ui-muted-foreground",
        className,
      )}
    >
      {source}
    </span>
  );
}
