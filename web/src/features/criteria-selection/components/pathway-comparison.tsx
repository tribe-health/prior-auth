import { ArrowLeft, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCriteriaSelection } from '../hooks/use-criteria-selection';
import type { CatalogCriterion } from '../model/criteria-selection';

function groupBySection(criteria: readonly CatalogCriterion[]): Map<string, CatalogCriterion[]> {
  const grouped = new Map<string, CatalogCriterion[]>();
  for (const criterion of criteria) {
    const section = criterion.section ?? 'General';
    const group = grouped.get(section);
    if (group) group.push(criterion);
    else grouped.set(section, [criterion]);
  }
  return grouped;
}

export function PathwayComparison({ caseId }: { readonly caseId: string }) {
  const { view } = useCriteriaSelection(caseId);
  if (view.status === 'loading') return <p role="status" className="p-6 text-sm text-ui-muted-foreground">Loading the selected criteria snapshot…</p>;
  if (view.status === 'error') {
    return <div className="p-4 sm:p-6"><Alert variant="destructive"><ShieldAlert aria-hidden="true" /><AlertTitle>Pathways unavailable</AlertTitle><AlertDescription>{view.message}</AlertDescription></Alert></div>;
  }
  if (!view.selection || view.selection.state !== 'current') {
    return (
      <main className="mx-auto grid w-full max-w-4xl gap-4 p-4 sm:p-6">
        <Alert>
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>Select the controlling policy first</AlertTitle>
          <AlertDescription>A current immutable criteria snapshot is required before the case can advance.</AlertDescription>
        </Alert>
        <Link className={buttonVariants({ className: 'min-h-11 w-fit' })} to={`/cases/${caseId}/policy`}><ArrowLeft aria-hidden="true" /> Review policy</Link>
      </main>
    );
  }

  const sections = groupBySection(view.selection.criteria);
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 p-4 sm:p-6" aria-labelledby="pathways-title">
      <header className="grid gap-4 border-b pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="max-w-3xl">
          <h1 id="pathways-title" className="font-heading text-3xl font-medium tracking-tight text-balance sm:text-4xl">Review the viable policy pathways</h1>
          <p className="mt-3 max-w-[70ch] text-sm leading-6 text-ui-muted-foreground sm:text-base">
            The selected policy is fixed. These sections show the clinical commitments the evidence workspace must answer before the surgeon can affirm the request.
          </p>
        </div>
        <Badge variant="secondary">Snapshot current</Badge>
      </header>

      <div className="rounded-2xl bg-ui-muted p-4 sm:p-5">
        <p className="font-heading text-xl font-medium">{view.selection.policy.name}</p>
        <p className="mt-1 text-sm text-ui-muted-foreground">{view.selection.policy.policyNumber} · version {view.selection.policy.version} · selected {new Date(view.selection.selectedAt).toLocaleDateString()}</p>
      </div>

      <section className="grid gap-4 lg:grid-cols-3" aria-label="Policy pathway sections">
        {[...sections.entries()].map(([section, criteria], index) => (
          <Card key={section} className={index === 0 ? 'bg-ui-muted/70' : undefined}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <Badge variant={index === 0 ? 'secondary' : 'outline'}>Section {section}</Badge>
                <span className="text-xs tabular-nums text-ui-muted-foreground">{criteria.length} requirements</span>
              </div>
              <CardTitle className="font-heading text-xl">{criteria[0]?.label ?? 'Policy requirements'}</CardTitle>
              <CardDescription>Every item remains tied to the selected source version.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {criteria.map((criterion) => (
                <div key={criterion.id} className="border-t pt-4 first:border-t-0 first:pt-0">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <p className="text-sm font-medium leading-5">{criterion.label}</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-ui-muted-foreground">{criterion.requirement}</p>
                  <p className="mt-2 text-xs text-ui-muted-foreground">Source page {criterion.sourcePageNumber ?? 'not available'}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="flex flex-col gap-2 border-t pt-5 sm:flex-row sm:justify-between">
        <Link className={buttonVariants({ variant: 'outline', className: 'min-h-11 w-full sm:w-auto' })} to={`/cases/${caseId}/policy`}><ArrowLeft aria-hidden="true" /> Back to policy</Link>
        <Link className={buttonVariants({ className: 'min-h-11 w-full sm:w-auto' })} to={`/cases/${caseId}/evidence`}>Assemble evidence <ArrowRight aria-hidden="true" /></Link>
      </div>
    </main>
  );
}
