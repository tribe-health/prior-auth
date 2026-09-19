/**
 * One criterion, its evidence state, and what that state asks someone to do.
 *
 * The action is not decoration. The three states exist because they route work
 * to different people — `gap` goes to whoever can argue it, `void` to whoever
 * can obtain it — so a row that showed only the state would make a coordinator
 * look the distinction up somewhere else.
 */
import { CitationChip, EvidenceStateChip } from '../../../shared/ui';
import { Button } from '@/components/ui/button';
import { CitationAction } from '@/features/source-preview/components/citation-action';
import type { SourcePreviewTarget } from '@/features/source-preview/model/source-preview';
import { evidenceAction } from '../../../shared/model/evidence-state';
import type { TimelineEntry } from '../model/timeline-entry';

export interface TimelineEntryRowProps {
  entry: TimelineEntry;
  canReassess?: boolean;
  disabled?: boolean;
  onReassess?: (entry: TimelineEntry) => void;
  onOpenSource?: (target: SourcePreviewTarget, trigger: HTMLButtonElement) => void;
}

export function TimelineEntryRow({
  entry,
  canReassess,
  disabled,
  onReassess,
  onOpenSource,
}: TimelineEntryRowProps) {
  return (
    <li className="flex flex-col gap-2 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <EvidenceStateChip state={entry.state} />
        <span className="text-sm">
          {entry.criterionLabel ?? (
            // The criterion text is not among the five synced tables. Saying so
            // is better than rendering a UUID, which reads as a data bug.
            <span className="text-ui-muted-foreground italic">
              Criterion unavailable offline
            </span>
          )}
        </span>
        <span className="ml-auto font-mono text-xs text-ui-muted-foreground">
          {evidenceAction[entry.state]}
        </span>
      </div>

      {entry.citations.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 pl-1">
          {entry.citations.map((citation) => (
            <li key={citation.id}>
              {onOpenSource ? (
                <CitationAction caseId={entry.caseId} citation={citation} onOpen={onOpenSource} />
              ) : (
                <CitationChip
                  source={`${citation.documentName} · ${citation.effectiveDate}${
                    citation.pageNumber === null ? '' : ` · p.${citation.pageNumber}`
                  }`}
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="pl-1">
          <CitationChip source={null} />
        </div>
      )}

      {canReassess && onReassess ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full motion-reduce:transition-none sm:w-auto sm:self-end"
          disabled={disabled || entry.assessedAt === null}
          onClick={() => onReassess(entry)}
        >
          Reassess evidence
        </Button>
      ) : null}
    </li>
  );
}
