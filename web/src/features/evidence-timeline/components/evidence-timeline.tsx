/**
 * The evidence timeline for one case.
 *
 * The reference pattern later features copy: component renders and submits
 * intent, the hook orchestrates, the api module talks to the store and the
 * server. No `fetch` or `invoke` appears here — `audit.sh` check 3 enforces it.
 */
import { useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useCan } from '@/app/providers/session-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AnnotationSection } from '@/features/annotations/components/annotation-section';
import { SourcePreview } from '@/features/source-preview/components/source-preview';
import { useSourcePreview } from '@/features/source-preview/hooks/use-source-preview';
import { EvidenceCountsSummary, EvidenceStateChip } from '../../../shared/ui';
import type { EvidenceCounts, EvidenceState, EvidenceTally } from '../../../shared/model/evidence-state';
import { EVIDENCE_STATES, evidenceLabel, loadedTally, pendingTally } from '../../../shared/model/evidence-state';
import { useInteractionStore } from '../../../shared/store/interaction-store';
import { useEvidenceTimeline } from '../hooks/use-evidence-timeline';
import type { TimelineEntry } from '../model/timeline-entry';
import { TimelineEntryRow } from './timeline-entry-row';
import { EvidenceReassessmentDialog } from './evidence-reassessment-dialog';

export interface EvidenceTimelineProps {
  caseId: string;
}

export function EvidenceTimeline({ caseId }: EvidenceTimelineProps) {
  const {
    entries,
    loading,
    unavailable,
    error,
    refusal,
    lastCommandId,
    lastCommandEntryId,
    commandOutcome,
    commandMessage,
    awaitingProjection,
    submitting,
    reassess,
    lookupCommand,
  } = useEvidenceTimeline(caseId);
  const sourcePreview = useSourcePreview(caseId);
  const canReassess = useCan('annotate');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sourceTriggerRef = useRef<HTMLButtonElement | null>(null);

  const closeSourcePreview = () => {
    sourcePreview.close();
    const trigger = sourceTriggerRef.current;
    sourceTriggerRef.current = null;
    queueMicrotask(() => trigger?.focus());
  };

  // Transient interaction state (ADR-006). useShallow so a component
  // subscribing to two fields re-renders on either, not on every store write.
  const { filter, setFilter } = useInteractionStore(
    useShallow((s) => ({
      filter: s.evidenceStateFilter,
      setFilter: s.setEvidenceStateFilter,
    })),
  );

  // Four states, told apart on purpose. "No evidence recorded" and "we could
  // not read the evidence" are opposite claims, and an empty list that means
  // the second is how a case looks clean when it is unknown.
  const visible = filterEntries(entries, filter);
  const selected = selectedId === null
    ? null
    : entries.find((entry) => entry.id === selectedId) ?? null;

  if (unavailable) {
    return <Notice>Local store is not open. Evidence cannot be shown.</Notice>;
  }
  if (loading) {
    return (
      <Notice role="status">
        Loading evidence…
      </Notice>
    );
  }
  if (error) {
    return (
      <Notice role="alert" tone="error">
        Evidence could not be read. {error}
      </Notice>
    );
  }

  return (
    <section aria-labelledby="evidence-timeline-heading" className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-3">
        <h1 id="evidence-timeline-heading" className="text-lg font-medium">
          Evidence timeline
        </h1>
        {/* Counts are ALWAYS of the full set, never the filtered view. A
            summary that moved with the filter would let a coordinator read
            "0 not documented" off a screen that is hiding them. */}
        <EvidenceCountsSummary counts={countStates(entries)} showAction />
        <StateFilter value={filter} onChange={setFilter} />
      </header>

      {refusal ? (
        <Alert variant="destructive">
          <AlertTitle>{commandOutcome === 'conflict' ? 'Assessment changed' : 'Assessment refused'}</AlertTitle>
          <AlertDescription>{refusal}</AlertDescription>
        </Alert>
      ) : null}
      {lastCommandId && lastCommandEntryId && commandOutcome === 'uncertain' ? (
        <Alert>
          <AlertTitle>Assessment result unknown</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Check the prior command before submitting another assessment.</span>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full sm:w-auto"
              onClick={() => void lookupCommand(lastCommandEntryId, lastCommandId).catch(() => undefined)}
            >
              Check result
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {lastCommandId && lastCommandEntryId && awaitingProjection ? (
        <Alert>
          <AlertTitle>Assessment accepted</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Waiting for the evidence record to show the accepted assessment.</span>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full sm:w-auto"
              onClick={() => void lookupCommand(lastCommandEntryId, lastCommandId).catch(() => undefined)}
            >
              Check evidence record
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {commandMessage ? <p role="status" aria-live="polite" className="text-sm">{commandMessage}</p> : null}

      {entries.length === 0 ? (
        <Notice>No evidence has been recorded for this case.</Notice>
      ) : visible.length === 0 ? (
        // The filter matched nothing. Distinct from "no evidence recorded" —
        // one is a fact about the case, the other about the current lens.
        <Notice>
          {/* The label itself is a negation ("Not met", "Not documented"), so
              the frame must not add a second one. "No criteria are not
              documented" is a double negative on the one screen whose whole
              job is telling a silent chart from a contradicted one. */}
          Nothing matches the {evidenceLabel[filter as EvidenceState]} filter.
          Hiding all {entries.length} {entries.length === 1 ? 'criterion' : 'criteria'}.
        </Notice>
      ) : (
        <ul className="flex flex-col">
          {visible.map((entry) => (
            <TimelineEntryRow
              key={entry.id}
              entry={entry}
              canReassess={canReassess}
              disabled={submitting || lastCommandId !== null}
              onReassess={(entry) => setSelectedId(entry.id)}
              onOpenSource={(target, trigger) => {
                sourceTriggerRef.current = trigger;
                void sourcePreview.open(target);
              }}
            />
          ))}
        </ul>
      )}
      {selected ? (
        <EvidenceReassessmentDialog
          key={selected.id}
          entry={selected}
          submitting={submitting}
          onClose={() => setSelectedId(null)}
          onSubmit={(state) => reassess(selected.id, state)}
        />
      ) : null}
      <SourcePreview
        state={sourcePreview.state}
        onClose={closeSourcePreview}
        onPageChange={(page) => { void sourcePreview.goToPage(page); }}
      />
      <AnnotationSection caseId={caseId} />
    </section>
  );
}

/**
 * Narrow entries to the active filter.
 *
 * `null` means no filter, which is not the same as a filter matching nothing —
 * the caller renders those two cases differently.
 */
export function filterEntries(
  entries: readonly TimelineEntry[],
  filter: EvidenceState | null,
): readonly TimelineEntry[] {
  return filter === null ? entries : entries.filter((e) => e.state === filter);
}

/**
 * Tally the three states.
 *
 * Seeded at zero for all three so a state with no entries reports `0` rather
 * than being absent — the distinction `EvidenceCountsSummary` exists to keep.
 *
 * **Only call this with entries you have.** All-zero counts from this function
 * mean "loaded, and nothing matched"; they are indistinguishable from a case
 * still hydrating, which is why an unloaded caller must use `pendingTally()`
 * rather than passing an empty array here. `tallyStates` makes that choice
 * explicit and is the safer entry point.
 */
export function countStates(entries: readonly TimelineEntry[]): EvidenceCounts {
  const counts: EvidenceCounts = { met: 0, gap: 0, void: 0 };
  for (const entry of entries) {
    counts[entry.state] += 1;
  }
  return counts;
}

/**
 * Tally, carrying whether the entries are known at all.
 *
 * `entries` is `null` while the case's evidence is still arriving. Returning a
 * tally rather than counts forces every downstream reader to distinguish "no
 * outstanding evidence" from "no evidence yet" — the distinction that let a
 * mid-hydration case report "Ready to draft".
 */
export function tallyStates(entries: readonly TimelineEntry[] | null): EvidenceTally {
  return entries === null ? pendingTally() : loadedTally(countStates(entries));
}

function StateFilter({
  value,
  onChange,
}: {
  value: EvidenceState | null;
  onChange: (next: EvidenceState | null) => void;
}) {
  return (
    <div role="group" aria-label="Filter by evidence state" className="flex flex-wrap gap-1.5">
      <button
        type="button"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
        className={`rounded-full px-2.5 py-0.5 font-mono text-[0.64rem] uppercase tracking-[0.08em] ${
          value === null ? 'bg-foreground text-background' : 'bg-ui-muted text-ui-muted-foreground'
        }`}
      >
        All
      </button>
      {EVIDENCE_STATES.map((state) => (
        <button
          key={state}
          type="button"
          aria-pressed={value === state}
          // Clicking the active filter clears it — the second click of a
          // toggle should undo the first.
          onClick={() => onChange(value === state ? null : state)}
          className={value === state ? 'ring-2 ring-offset-1 rounded-full' : ''}
        >
          <EvidenceStateChip state={state} />
        </button>
      ))}
    </div>
  );
}

function Notice({
  children,
  role,
  tone,
}: {
  children: React.ReactNode;
  role?: 'status' | 'alert';
  tone?: 'error';
}) {
  return (
    <p
      role={role}
      aria-live={role === 'status' ? 'polite' : undefined}
      className={`p-6 text-sm ${tone === 'error' ? 'text-destructive' : 'text-ui-muted-foreground'}`}
    >
      {children}
    </p>
  );
}
