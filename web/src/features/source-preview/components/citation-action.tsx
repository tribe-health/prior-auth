import { Button } from '@/components/ui/button';
import type { TimelineCitation } from '@/features/evidence-timeline/model/timeline-entry';
import { CitationChip } from '@/shared/ui';
import { sourceTarget, type SourcePreviewTarget } from '../model/source-preview';

function citationLabel(citation: TimelineCitation): string {
  return `${citation.documentName} · ${citation.effectiveDate}${
    citation.pageNumber === null ? '' : ` · p.${citation.pageNumber}`
  }`;
}

export function CitationAction({
  caseId,
  citation,
  onOpen,
}: {
  caseId: string;
  citation: TimelineCitation;
  onOpen: (target: SourcePreviewTarget, trigger: HTMLButtonElement) => void;
}) {
  const target = sourceTarget(caseId, citation);
  const label = citationLabel(citation);

  if (!target) {
    return (
      <span className="inline-flex flex-col gap-1">
        <CitationChip source={label} />
        <span className="text-xs text-ui-muted-foreground">Page not recorded. Preview unavailable.</span>
      </span>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className="h-auto min-h-11 max-w-full whitespace-normal px-1.5 py-1 text-left motion-reduce:transition-none"
      aria-label={`Open source ${label}`}
      onClick={(event) => onOpen(target, event.currentTarget)}
    >
      <CitationChip source={label} />
    </Button>
  );
}
