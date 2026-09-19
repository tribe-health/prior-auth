import { ArrowRight, RotateCcw } from 'lucide-react';
import { Link } from 'react-router';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCan } from '@/app/providers/session-provider';
import { DocumentIntake } from '@/features/document-intake/components/document-intake';
import { useCaseCommand } from '../hooks/use-case-command';
import { useCaseDetail } from '../hooks/use-case-detail';
import { useCaseIntakeProjection } from '../hooks/use-case-projection';
import { CaseCommandStatus } from './case-command-status';
import { CaseForm } from './case-form';
import { statusLabel } from './case-queue';
import {
  CASE_INPUTS_INCOMPLETE_MESSAGE,
  firstMissingResolutionInput,
  type ResolutionInputField,
} from '../model/case-command';

export function CaseIntake({
  caseId,
  focusField = null,
  focusFirstMissingResolutionInput = false,
  showInputsIncompleteNotice = false,
}: {
  readonly caseId: string;
  readonly focusField?: ResolutionInputField | null;
  readonly focusFirstMissingResolutionInput?: boolean;
  readonly showInputsIncompleteNotice?: boolean;
}) {
  const projection = useCaseIntakeProjection(caseId);
  const projectedCase = projection.status === 'ready' ? projection.case : null;
  const detail = useCaseDetail(caseId, projectedCase?.revision ?? null);
  const command = useCaseCommand(caseId, projectedCase);
  const canWrite = useCan('case_write');

  if (projection.status === 'pending' || detail.loading) {
    return <p role="status" className="p-4 text-sm text-ui-muted-foreground sm:p-6">Loading case intake…</p>;
  }
  if (projection.status === 'unavailable') {
    return (
      <div className="p-4 sm:p-6"><Alert variant="destructive"><AlertTitle>Case unavailable</AlertTitle><AlertDescription>This case is not in the current authorized practice data.</AlertDescription></Alert></div>
    );
  }
  if (projection.status === 'error' || detail.error || !projectedCase || !detail.record || !detail.draft) {
    return (
      <div className="p-4 sm:p-6">
        <Alert variant="destructive">
          <AlertTitle>Case intake unavailable</AlertTitle>
          <AlertDescription>{projection.status === 'error' ? projection.error : detail.error ?? 'The case record could not be loaded.'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const busy = command.pending || detail.loading;
  const resolvedFocusField = focusFirstMissingResolutionInput
    ? firstMissingResolutionInput(detail.draft)
    : focusField;
  return (
    <section className="mx-auto grid w-full max-w-5xl gap-5 p-4 sm:p-6" aria-labelledby="case-intake-title">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.16em] text-ui-muted-foreground uppercase">Intake checklist</p>
          <h1 id="case-intake-title" className="font-heading text-2xl font-medium tracking-tight">{projectedCase.caseNumber}</h1>
          <p className="mt-1 text-sm text-ui-muted-foreground">Confirm the case identifiers before evidence collection begins.</p>
        </div>
        <Badge variant="outline" className="self-start">{statusLabel(projectedCase.status)}</Badge>
      </header>

      {showInputsIncompleteNotice ? (
        <Alert>
          <AlertTitle>Case information required</AlertTitle>
          <AlertDescription>{CASE_INPUTS_INCOMPLETE_MESSAGE}</AlertDescription>
        </Alert>
      ) : null}

      <CaseCommandStatus outcome={command.outcome} message={command.message} canReconcile={command.canReconcile} onReconcile={command.reconcile} />

      <Card>
        <CardHeader>
          <CardTitle>Case information</CardTitle>
          <CardDescription>Changes are shown as saved only after the committed case returns through the authorized projection.</CardDescription>
        </CardHeader>
        <CardContent>
          <CaseForm
            value={detail.draft}
            focusField={resolvedFocusField}
            submitLabel="Save case"
            disabled={!canWrite || busy}
            onChange={detail.updateDraft}
            onSubmit={() => command.update(detail.draft!, detail.record!.revision)}
          />
        </CardContent>
      </Card>

      <DocumentIntake
        caseId={caseId}
        caseInputRevision={detail.record.caseInputRevision}
        documentSetRevision={detail.record.documentSetRevision}
      />

      <Card>
        <CardHeader>
          <CardTitle>Next step</CardTitle>
          <CardDescription>Advance intake after the identifiers and case documents above are complete.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" disabled={busy} onClick={() => void detail.reload()}>
            <RotateCcw aria-hidden="true" /> Reload committed data
          </Button>
          {projectedCase.status === 'intake' ? (
            <Button
              type="button"
              className="min-h-11 w-full sm:w-auto"
              disabled={!canWrite || busy}
              onClick={() => void command.transition('evidence', detail.record!.statusRevision, detail.record!.revision)}
            >
              Advance to evidence <ArrowRight aria-hidden="true" />
            </Button>
          ) : (
            <Link className={buttonVariants({ className: 'min-h-11 w-full sm:w-auto' })} to={`/cases/${caseId}/evidence`}>
              Open evidence <ArrowRight aria-hidden="true" />
            </Link>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
