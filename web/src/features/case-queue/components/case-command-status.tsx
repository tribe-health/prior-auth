import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { CaseCommandOutcome } from '../hooks/use-case-command';

export function CaseCommandStatus({
  outcome,
  message,
  canReconcile,
  onReconcile,
}: {
  readonly outcome: CaseCommandOutcome;
  readonly message: string | null;
  readonly canReconcile: boolean;
  readonly onReconcile: () => Promise<unknown>;
}) {
  if (outcome === 'idle') return null;
  const title = outcome === 'submitting'
    ? 'Saving case'
    : outcome === 'awaiting-projection'
      ? 'Waiting for committed data'
      : outcome === 'confirmed'
        ? 'Case saved'
        : outcome === 'uncertain'
          ? 'Case result unknown'
          : outcome === 'refused'
            ? 'Case change refused'
            : 'Case changed';
  const destructive = outcome === 'refused' || outcome === 'conflict';

  return (
    <Alert variant={destructive ? 'destructive' : 'default'} role="status">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{message ?? 'The case command is in progress.'}</span>
        {canReconcile ? (
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void onReconcile()}>
            Check saved result
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
