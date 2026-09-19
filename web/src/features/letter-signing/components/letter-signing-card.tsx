import { useMemo } from 'react';

import { useCan } from '@/app/providers/session-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TargetedCorrectionDraft } from '@/features/drafts/components/targeted-correction-draft';
import { useLetterSigning } from '../hooks/use-letter-signing';
import { signingBlockers } from '../model/signing';

export function LetterSigningCard({ letterId, caseId }: { letterId: string; caseId: string }) {
  const canSign = useCan('sign_letter');
  const {
    target,
    result,
    loading,
    message,
    outcome,
    submitting,
    uncertain,
    awaitingProjection,
    sign,
    reconcile,
  } =
    useLetterSigning(letterId);
  const blockers = useMemo(() => target && !result ? signingBlockers(target) : [], [result, target]);
  const wrongCase = target !== null && target.caseId !== caseId;
  const ready = canSign && target !== null && blockers.length === 0 && !wrongCase;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Surgeon signature</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading ? <p role="status" className="text-sm text-ui-muted-foreground">Checking the current revision…</p> : null}
        {!canSign ? (
          <Alert><AlertTitle>Signature unavailable</AlertTitle><AlertDescription>A surgeon with signing authority must complete this step.</AlertDescription></Alert>
        ) : null}
        {wrongCase ? (
          <Alert variant="destructive"><AlertTitle>Letter mismatch</AlertTitle><AlertDescription>This letter does not belong to the open case.</AlertDescription></Alert>
        ) : null}
        {blockers.length > 0 ? (
          <Alert>
            <AlertTitle>Signature requirements</AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-1 pl-5">{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
            </AlertDescription>
          </Alert>
        ) : null}
        {message ? (
          <p
            role={outcome === 'refused' || outcome === 'conflict' ? 'alert' : 'status'}
            aria-live="polite"
            className="text-sm"
          >
            {message}
          </p>
        ) : null}
        {outcome === 'confirmed' && result ? (
          <p className="text-sm text-ui-muted-foreground">Signed {new Date(result.signedAt).toLocaleString()}.</p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {uncertain || awaitingProjection ? (
            <Button className="min-h-11 w-full sm:w-auto" onClick={() => void reconcile()}>
              {uncertain ? 'Check signing result' : 'Check signed letter'}
            </Button>
          ) : (
            <Button
              className="min-h-11 w-full sm:w-auto"
              disabled={!ready || submitting || outcome === 'confirmed'}
              onClick={() => void sign()}
            >
              {submitting ? 'Signing…' : outcome === 'confirmed' ? 'Signed' : 'Sign letter'}
            </Button>
          )}
        </div>
        <TargetedCorrectionDraft
          caseId={caseId}
          letterId={letterId}
          baseRevision={target ? `${target.letterVersion}:${target.qaRevision}` : null}
        />
      </CardContent>
    </Card>
  );
}
