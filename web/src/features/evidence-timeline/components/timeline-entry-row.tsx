/**
 * One criterion, its evidence state, and what that state asks someone to do.
 *
 * The action is not decoration. The three states exist because they route work
 * to different people — `gap` goes to whoever can argue it, `void` to whoever
 * can obtain it — so a row that showed only the state would make a coordinator
 * look the distinction up somewhere else.
 */
import { CitationChip, EvidenceStateChip } from '../../../shared/ui';
import { evidenceAction } from '../../../shared/model/evidence-state';
import { isUnsupported, type TimelineEntry } from '../model/timeline-entry';

export interface TimelineEntryRowProps {
  entry: TimelineEntry;
}

export function TimelineEntryRow({ entry }: TimelineEntryRowProps) {
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
              <CitationChip
                source={`${citation.documentName} · ${citation.effectiveDate}${
                  citation.pageNumber === null ? '' : ` · p.${citation.pageNumber}`
                }`}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {isUnsupported(entry) ? (
        // `met` with nothing behind it. An unsourced assertion is the one
        // failure a reviewer cannot see by reading the row, so it is stated.
        <p className="pl-1 text-xs text-destructive">
          Marked met with no citation on file.
        </p>
      ) : null}
    </li>
  );
}
