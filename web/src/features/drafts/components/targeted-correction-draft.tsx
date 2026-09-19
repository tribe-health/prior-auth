import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCorrectionDraft } from '../hooks/use-correction-draft';

export function TargetedCorrectionDraft({
  caseId,
  letterId,
  baseRevision,
}: {
  caseId: string;
  letterId: string;
  baseRevision: string | null;
}) {
  const draft = useCorrectionDraft({
    caseId,
    draftId: `letter:${letterId}:targeted-correction`,
    baseRevision,
  });

  return (
    <section className="flex flex-col gap-3 border-t pt-4" aria-labelledby="targeted-correction-title">
      <div>
        <h3 id="targeted-correction-title" className="text-sm font-medium">Targeted correction</h3>
        <p className="text-sm text-ui-muted-foreground">
          Record a correction request for the underlying facts. An authorized command must apply it before the letter can change.
        </p>
      </div>

      <p className="text-xs text-ui-muted-foreground">{draft.retentionNotice}</p>

      {draft.hasRecoverableDraft ? (
        <Alert>
          <AlertTitle>Unsent correction available</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <span>Review this draft before returning it to the editor.</span>
            <span className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" className="min-h-11 w-full sm:w-auto" onClick={draft.recover}>
                Review draft
              </Button>
              <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={draft.discard}>
                Discard draft
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="targeted-correction">Correction request</Label>
          <Textarea
            id="targeted-correction"
            value={draft.content}
            disabled={!draft.available || baseRevision === null}
            placeholder="Name the chart fact that needs correction."
            onChange={(event) => draft.save(event.currentTarget.value)}
          />
          {draft.dirty ? (
            <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto sm:self-end" onClick={draft.discard}>
              Discard draft
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
