import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EVIDENCE_STATES, evidenceLabel, type EvidenceState } from '@/shared/model/evidence-state';
import type { TimelineEntry } from '../model/timeline-entry';

export function EvidenceReassessmentDialog({
  entry,
  submitting,
  onClose,
  onSubmit,
}: {
  entry: TimelineEntry;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (state: EvidenceState) => Promise<void>;
}) {
  const [state, setState] = useState<EvidenceState>(entry.state);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      await onSubmit(state);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !submitting) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto motion-reduce:duration-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reassess evidence</DialogTitle>
          <DialogDescription>
            Record what the chart shows for {entry.criterionLabel ?? 'this criterion'}.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Evidence state</legend>
          {EVIDENCE_STATES.map((candidate) => (
            <label key={candidate} className="flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 has-checked:border-foreground">
              <input
                type="radio"
                name="evidence-state"
                value={candidate}
                checked={state === candidate}
                onChange={() => setState(candidate)}
              />
              <span>{evidenceLabel[candidate]}</span>
            </label>
          ))}
        </fieldset>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" disabled={submitting} onClick={onClose}>Cancel</Button>
          <Button type="button" className="min-h-11" disabled={submitting || state === entry.state} onClick={() => void submit()}>
            {submitting ? 'Saving…' : 'Save assessment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
