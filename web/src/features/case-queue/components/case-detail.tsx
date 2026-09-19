import { ArrowRight, CalendarDays, FileText, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdministeringEntityPanel } from '@/features/administering-entity/components/administering-entity-panel';
import { useAdministeringEntityResolution } from '@/features/administering-entity/hooks/use-administering-entity-resolution';
import { useCaseDetailProjection } from '../hooks/use-case-projection';
import { statusLabel } from './case-queue';

export function CaseDetail({ caseId }: { readonly caseId: string }) {
  const projection = useCaseDetailProjection(caseId);
  const navigate = useNavigate();
  const onInputsIncomplete = useCallback(() => {
    if (projection.status !== 'ready') return;
    void navigate(`/cases/${caseId}/intake?focus=resolution&notice=case_inputs_incomplete`);
  }, [caseId, navigate, projection]);
  const coverage = useAdministeringEntityResolution(caseId, {
    onInputsIncomplete,
  });
  if (projection.status === 'pending') {
    return <p role="status" className="p-4 text-sm text-ui-muted-foreground sm:p-6">Loading committed case…</p>;
  }
  if (projection.status === 'unavailable') {
    return (
      <div className="p-4 sm:p-6">
        <Alert variant="destructive">
          <AlertTitle>Case unavailable</AlertTitle>
          <AlertDescription>This case is not present in the current authorized practice data.</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (projection.status === 'error') {
    return (
      <div className="p-4 sm:p-6">
        <Alert variant="destructive"><AlertTitle>Case unavailable</AlertTitle><AlertDescription>{projection.error}</AlertDescription></Alert>
      </div>
    );
  }
  const record = projection.case;

  return (
    <section className="mx-auto grid w-full max-w-5xl gap-5 p-4 sm:p-6" aria-labelledby="case-detail-title">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.16em] text-ui-muted-foreground uppercase">Case dashboard</p>
          <h1 id="case-detail-title" className="font-heading text-2xl font-medium tracking-tight">{record.caseNumber}</h1>
          <p className="mt-1 break-all text-sm text-ui-muted-foreground">Case ID {record.id}</p>
        </div>
        <Badge variant="outline" className="self-start">{statusLabel(record.status)}</Badge>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><UserRound aria-hidden="true" /> Patient and care team</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              <div><dt className="text-ui-muted-foreground">Patient identifier</dt><dd className="break-all font-medium">{record.patientId}</dd></div>
              <div><dt className="text-ui-muted-foreground">Surgeon identifier</dt><dd className="break-all font-medium">{record.surgeonId}</dd></div>
              <div><dt className="text-ui-muted-foreground">Coordinator identifier</dt><dd className="break-all font-medium">{record.coordinatorId ?? 'Not assigned'}</dd></div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck aria-hidden="true" /> Coverage</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              <div><dt className="text-ui-muted-foreground">Payer identifier</dt><dd className="break-all font-medium">{record.payerId}</dd></div>
              <div><dt className="text-ui-muted-foreground">Gate affirmation</dt><dd className="font-medium">{record.gateAffirmedAt ? 'Affirmed' : 'Not affirmed'}</dd></div>
            </dl>
          </CardContent>
        </Card>
        <AdministeringEntityPanel
          view={coverage.view}
          onResolve={() => { void coverage.resolve(); }}
          onReconcile={() => { void coverage.reconcile(); }}
          onReload={() => { void coverage.reload(); }}
        />
        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarDays aria-hidden="true" /> Intake status</CardTitle>
            <CardDescription>Review case identifiers before uploading clinical records.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div><p className="text-sm text-ui-muted-foreground">Date of service</p><p className="font-medium">{record.dateOfService ?? 'Not entered'}</p></div>
            <div><p className="text-sm text-ui-muted-foreground">Committed revision</p><p className="font-medium tabular-nums">{record.revision}</p></div>
            <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
              <Link className={buttonVariants({ className: 'min-h-11 w-full sm:w-auto' })} to={`/cases/${caseId}/intake`}>
                <FileText aria-hidden="true" /> Review intake
              </Link>
              {coverage.blocked ? (
                <span
                  className={buttonVariants({ variant: 'outline', className: 'min-h-11 w-full cursor-not-allowed opacity-60 sm:w-auto' })}
                  aria-disabled="true"
                  title="Resolve the coverage path before opening evidence."
                >
                  <LockKeyhole aria-hidden="true" /> Evidence blocked
                </span>
              ) : (
                <Link className={buttonVariants({ variant: 'outline', className: 'min-h-11 w-full sm:w-auto' })} to={`/cases/${caseId}/evidence`}>
                  Open evidence <ArrowRight aria-hidden="true" />
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
