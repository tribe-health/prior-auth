import {
  CheckCircle2,
  LockKeyhole,
  RefreshCw,
  Route,
  TriangleAlert,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/app/providers/session-provider';
import {
  RESOLUTION_COPY,
  type AdministeringEntityResolution,
} from '../model/administering-entity';
import type { ResolutionView } from '../hooks/use-administering-entity-resolution';

function value(value: string | null): string {
  return value ?? 'Not available';
}

export function AdministeringEntityPanel({
  view,
  onResolve,
  onReconcile,
  onReload,
}: {
  readonly view: ResolutionView;
  readonly onResolve: () => void;
  readonly onReconcile: () => void;
  readonly onReload: () => void;
}) {
  const canResolve = useCan('resolve_administering_entity');
  const busy = view.status === 'loading' || view.status === 'resolving';

  return (
    <Card className="sm:col-span-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Route aria-hidden="true" /> Coverage path
            </CardTitle>
            <CardDescription>
              The effective payer rule determines the entity, criteria, submission channel, and appeal path.
            </CardDescription>
          </div>
          {view.resolution ? (
            <Badge variant={view.resolution.state === 'resolved' ? 'secondary' : 'outline'}>
              {RESOLUTION_COPY[view.resolution.state].label}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {view.status === 'loading' ? <ResolutionSkeleton /> : null}
        {view.status === 'unresolved' ? (
          <Alert>
            <LockKeyhole aria-hidden="true" />
            <AlertTitle>Coverage path not resolved</AlertTitle>
            <AlertDescription>
              Resolve the current member, plan, procedure, and service date before criteria selection or evidence assembly.
            </AlertDescription>
          </Alert>
        ) : null}
        {view.resolution ? <ResolutionDetails resolution={view.resolution} /> : null}
        {view.message ? (
          <Alert variant={view.status === 'error' ? 'destructive' : 'default'}>
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>{view.status === 'uncertain' ? 'Resolution status unknown' : 'Coverage path unavailable'}</AlertTitle>
            <AlertDescription>{view.message}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          {view.status === 'uncertain' ? (
            <Button className="min-h-11 w-full sm:w-auto" onClick={onReconcile}>
              <RefreshCw aria-hidden="true" /> Check saved command
            </Button>
          ) : (
            <Button
              className="min-h-11 w-full sm:w-auto"
              disabled={!canResolve || busy}
              onClick={onResolve}
            >
              <RefreshCw className={view.status === 'resolving' ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />
              {view.resolution ? 'Resolve again' : 'Resolve coverage path'}
            </Button>
          )}
          <Button
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
            disabled={busy}
            onClick={onReload}
          >
            Reload committed result
          </Button>
        </div>
        {!canResolve ? (
          <p className="text-sm text-ui-muted-foreground">Your current access can view this result but cannot resolve it.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ResolutionDetails({ resolution }: { readonly resolution: AdministeringEntityResolution }) {
  const copy = RESOLUTION_COPY[resolution.state];
  if (resolution.state !== 'resolved') {
    return (
      <Alert>
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>{copy.label}</AlertTitle>
        <AlertDescription>{copy.description} Downstream work remains blocked.</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2" data-testid="resolved-coverage-path">
      <div className="sm:col-span-2 flex items-start gap-2 text-sm">
        <CheckCircle2 className="mt-0.5 text-primary" aria-hidden="true" />
        <p>{copy.description}</p>
      </div>
      <Field label="Administering entity" value={value(resolution.entityName)} />
      <Field label="Criteria set" value={value(resolution.criteriaSetKey)} />
      <Field label="Submission channel" value={value(resolution.submissionChannelKey)} />
      <Field label="Appeal path" value={value(resolution.appealPathKey)} />
      <Field label="Effective from" value={value(resolution.validFrom)} />
      <Field label="Effective until (exclusive)" value={value(resolution.validTo)} />
      <Field label="Source document" value={value(resolution.sourceDocumentName)} />
      <Field label="Source effective date" value={value(resolution.sourceDocumentEffectiveDate)} />
      <Field
        label="Source version"
        value={resolution.sourceDocumentVersion == null
          ? 'Not available'
          : `Version ${resolution.sourceDocumentVersion}`}
      />
      <Field label="Entity revision" value={revision(resolution.entityRevision)} />
      <Field label="Plan revision" value={revision(resolution.planRevision)} />
      <Field label="Enrollment revision" value={revision(resolution.enrollmentRevision)} />
      <Field label="Rule revision" value={revision(resolution.ruleRevision)} />
    </div>
  );
}

function revision(value: number | null): string {
  return value == null ? 'Not available' : `Revision ${value}`;
}

function Field({ label, value: fieldValue }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium tracking-wide text-ui-muted-foreground uppercase">{label}</p>
      <p className="mt-1 break-words font-medium">{fieldValue}</p>
    </div>
  );
}

function ResolutionSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-label="Loading coverage path">
      <Skeleton className="h-14" />
      <Skeleton className="h-14" />
      <Skeleton className="h-14" />
      <Skeleton className="h-14" />
    </div>
  );
}
