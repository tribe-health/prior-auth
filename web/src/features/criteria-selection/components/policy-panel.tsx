import { ArrowRight, Check, FileSearch, RefreshCw, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import { useCan } from '@/app/providers/session-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { CatalogPolicy } from '../model/criteria-selection';
import { useCriteriaSelection } from '../hooks/use-criteria-selection';

function effective(policy: CatalogPolicy, serviceDate: string | null): boolean {
  if (!serviceDate) return false;
  return policy.effectiveFrom <= serviceDate
    && (policy.effectiveTo === null || serviceDate < policy.effectiveTo);
}

export function PolicyPanel({ caseId }: { readonly caseId: string }) {
  const { view, reload, selectPolicy } = useCriteriaSelection(caseId);
  const canSelect = useCan('criteria_select');
  const [chosenPolicyId, setChosenPolicyId] = useState<string | null>(null);

  const effectivePolicies = useMemo(() => {
    if (view.status !== 'ready' && view.status !== 'saving') return [];
    return view.catalog.policies.filter((policy) => effective(policy, view.caseRecord.dateOfService));
  }, [view]);

  if (view.status === 'loading') return <PolicyPanelSkeleton />;
  if (view.status === 'error') {
    return (
      <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        <Alert variant="destructive">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>Policy criteria unavailable</AlertTitle>
          <AlertDescription>{view.message}</AlertDescription>
        </Alert>
        <Button className="mt-4 min-h-11" variant="outline" onClick={() => void reload()}>
          <RefreshCw aria-hidden="true" /> Reload policy criteria
        </Button>
      </main>
    );
  }

  const selectedPolicyId = view.selection?.policy.id ?? null;
  const activePolicyId = chosenPolicyId ?? selectedPolicyId ?? effectivePolicies[0]?.id ?? null;
  const activePolicy = effectivePolicies.find((policy) => policy.id === activePolicyId) ?? null;
  const criteria = activePolicy
    ? view.catalog.criteria.filter((criterion) => criterion.policyId === activePolicy.id)
    : [];
  const blocked = view.resolution.state !== 'resolved' || effectivePolicies.length === 0;

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 p-4 sm:p-6" aria-labelledby="policy-title">
      <header className="grid gap-4 border-b pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="max-w-3xl">
          <h1 id="policy-title" className="font-heading text-3xl font-medium tracking-tight text-balance sm:text-4xl">
            Confirm the policy that governs this request
          </h1>
          <p className="mt-3 max-w-[70ch] text-sm leading-6 text-ui-muted-foreground sm:text-base">
            The service date, payer, and resolved coverage path determine which policy version can be selected. Every requirement below retains its source document and page.
          </p>
        </div>
        <Badge variant={view.selection?.state === 'current' ? 'secondary' : 'outline'} className="w-fit">
          {view.selection?.state === 'current' ? 'Current selection' : 'Selection required'}
        </Badge>
      </header>

      {view.message ? (
        <Alert variant="destructive">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>Selection not saved</AlertTitle>
          <AlertDescription>{view.message}</AlertDescription>
        </Alert>
      ) : null}

      {view.selection?.state === 'stale' ? (
        <Alert>
          <RefreshCw aria-hidden="true" />
          <AlertTitle>The saved policy is out of date</AlertTitle>
          <AlertDescription>Review the current coverage path and policy version, then save a new selection. Evidence and letters remain blocked.</AlertDescription>
        </Alert>
      ) : null}

      {blocked ? (
        <Alert>
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>No effective policy can be selected</AlertTitle>
          <AlertDescription>
            {view.resolution.state !== 'resolved'
              ? 'Resolve the coverage path from the case dashboard before continuing.'
              : 'No sourced policy in the catalog is effective on this case’s service date.'}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <nav aria-label="Effective policy versions" className="grid content-start gap-2">
            {effectivePolicies.map((policy) => {
              const isActive = policy.id === activePolicyId;
              const isCommitted = policy.id === selectedPolicyId && view.selection?.state === 'current';
              return (
                <button
                  key={policy.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setChosenPolicyId(policy.id)}
                  className={`min-h-11 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive ? 'border-primary bg-ui-muted' : 'bg-card hover:bg-ui-muted/60'}`}
                >
                  <span className="flex items-center justify-between gap-3 text-sm font-semibold">
                    {policy.policyNumber}
                    {isCommitted ? <Check className="size-4 text-primary" aria-label="Saved selection" /> : null}
                  </span>
                  <span className="mt-1 block text-sm text-ui-muted-foreground">Version {policy.version}</span>
                  <span className="mt-2 block text-xs text-ui-muted-foreground">Effective {policy.effectiveFrom}</span>
                </button>
              );
            })}
          </nav>

          {activePolicy ? (
            <section className="min-w-0" aria-labelledby="active-policy-title">
              <Card>
                <CardHeader className="gap-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle id="active-policy-title" className="font-heading text-2xl">{activePolicy.name}</CardTitle>
                      <CardDescription className="mt-2">
                        {activePolicy.policyNumber} · version {activePolicy.version} · effective {activePolicy.effectiveFrom}
                        {activePolicy.effectiveTo ? ` through ${activePolicy.effectiveTo}` : ''}
                      </CardDescription>
                    </div>
                    <Badge variant="outline">{criteria.length} requirements</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-ui-muted-foreground">
                    <FileSearch className="size-4" aria-hidden="true" />
                    Source document {activePolicy.sourceDocumentId}
                  </div>
                </CardHeader>
                <CardContent className="grid gap-1">
                  {criteria.map((criterion) => (
                    <article key={criterion.id} className="grid gap-2 border-t py-4 first:border-t-0 first:pt-0 sm:grid-cols-[3rem_minmax(0,1fr)_auto]">
                      <span className="font-mono text-xs text-ui-muted-foreground">§ {criterion.section ?? '—'}</span>
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold">{criterion.label}</h2>
                        <p className="mt-1 text-sm leading-6 text-ui-muted-foreground">{criterion.requirement}</p>
                      </div>
                      <Badge variant="outline" className="h-fit w-fit">Page {criterion.sourcePageNumber ?? '—'}</Badge>
                    </article>
                  ))}
                </CardContent>
              </Card>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button
                  className="min-h-11 w-full sm:w-auto"
                  disabled={!canSelect || view.status === 'saving' || criteria.length === 0}
                  onClick={() => void selectPolicy(activePolicy.id)}
                >
                  {view.status === 'saving' ? <RefreshCw className="motion-safe:animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
                  {activePolicy.id === selectedPolicyId ? 'Save current snapshot again' : 'Select this policy'}
                </Button>
                {view.selection?.state === 'current' ? (
                  <Link className={buttonVariants({ variant: 'outline', className: 'min-h-11 w-full sm:w-auto' })} to={`/cases/${caseId}/pathways`}>
                    Compare pathways <ArrowRight aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
              {!canSelect ? <p className="mt-3 text-sm text-ui-muted-foreground">Your current access can review policy sources but cannot select the controlling snapshot.</p> : null}
            </section>
          ) : null}
        </div>
      )}
    </main>
  );
}

function PolicyPanelSkeleton() {
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-5 p-4 sm:p-6" aria-label="Loading policy criteria">
      <Skeleton className="h-24" />
      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Skeleton className="h-48" />
        <Skeleton className="h-96" />
      </div>
    </main>
  );
}
