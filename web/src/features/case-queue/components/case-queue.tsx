import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Plus, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useCan } from '@/app/providers/session-provider';
import { useCaseCommand } from '../hooks/use-case-command';
import { useCaseQueueProjection } from '../hooks/use-case-projection';
import { useCaseQueueView, type CaseStatusFilter } from '../hooks/use-case-queue-view';
import { EMPTY_CASE_INPUT, type CaseInput } from '../model/case-command';
import { CASE_STATUSES, type CaseRecord } from '../model/case-record';
import { CaseCommandStatus } from './case-command-status';
import { CaseForm } from './case-form';

export function statusLabel(status: string): string {
  return status.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function CaseQueueCard({ record, onSelect }: { record: CaseRecord; onSelect: () => void }) {
  return (
    <Card className="transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-sm motion-reduce:transform-none motion-reduce:transition-none">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>{record.caseNumber}</CardTitle>
            <CardDescription>Patient {record.patientId}</CardDescription>
          </div>
          <Badge variant="outline">{statusLabel(record.status)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-ui-muted-foreground">Payer</dt>
            <dd className="break-all font-medium">{record.payerId}</dd>
          </div>
          <div>
            <dt className="text-ui-muted-foreground">Service date</dt>
            <dd className="font-medium">{record.dateOfService ?? 'Not entered'}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-ui-muted-foreground">Surgeon</dt>
            <dd className="break-all font-medium">{record.surgeonId}</dd>
          </div>
        </dl>
        <Link
          to={`/cases/${record.id}`}
          onClick={onSelect}
          className={buttonVariants({ variant: 'outline', className: 'min-h-11 w-full justify-between' })}
        >
          Open case
          <ArrowRight aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}

export function CaseQueue() {
  const projection = useCaseQueueProjection();
  const view = useCaseQueueView();
  const canWrite = useCan('case_write');
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [draftCaseId, setDraftCaseId] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState<CaseInput>(() => ({ ...EMPTY_CASE_INPUT }));
  const projectedDraft = projection.cases.find((record) => record.id === draftCaseId) ?? null;
  const command = useCaseCommand(draftCaseId, projectedDraft);

  useEffect(() => {
    if (command.outcome === 'confirmed' && projectedDraft) {
      navigate(`/cases/${projectedDraft.id}`);
    }
  }, [command.outcome, navigate, projectedDraft]);

  const visibleCases = useMemo(() => {
    const search = view.state.search.trim().toLocaleLowerCase();
    return projection.cases.filter((record) => {
      const matchesStatus = view.state.statusFilter === 'all'
        || record.status === view.state.statusFilter;
      const matchesSearch = search === '' || [
        record.caseNumber,
        record.patientId,
        record.payerId,
        record.surgeonId,
      ].some((value) => value.toLocaleLowerCase().includes(search));
      return matchesStatus && matchesSearch;
    });
  }, [projection.cases, view.state.search, view.state.statusFilter]);

  const beginCreate = () => {
    setDraftCaseId(crypto.randomUUID());
    setDraft({ ...EMPTY_CASE_INPUT });
    setCreating(true);
  };

  return (
    <section className="mx-auto grid w-full max-w-7xl gap-5 p-4 sm:p-6" aria-labelledby="case-queue-title">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.16em] text-ui-muted-foreground uppercase">Authorization workbench</p>
          <h1 id="case-queue-title" className="font-heading text-2xl font-medium tracking-tight">Cases</h1>
          <p className="mt-1 text-sm text-ui-muted-foreground">Create a case or continue work from committed practice data.</p>
        </div>
        {canWrite && !creating ? (
          <Button type="button" className="min-h-11 w-full sm:w-auto" onClick={beginCreate}>
            <Plus aria-hidden="true" />
            New case
          </Button>
        ) : null}
      </header>

      {creating ? (
        <Card className="animate-in fade-in-0 slide-in-from-top-2 duration-200 motion-reduce:animate-none">
          <CardHeader>
            <CardTitle>Create case</CardTitle>
            <CardDescription>Enter the identifiers needed to begin intake. Clinical evidence is added after the case is committed.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <CaseCommandStatus
              outcome={command.outcome}
              message={command.message}
              canReconcile={command.canReconcile}
              onReconcile={command.reconcile}
            />
            <CaseForm
              value={draft}
              submitLabel="Create case"
              disabled={command.pending}
              onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
              onSubmit={() => command.create(draft)}
              onCancel={() => setCreating(false)}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card size="sm">
        <CardContent className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="case-search">Search cases</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ui-muted-foreground" aria-hidden="true" />
              <Input
                id="case-search"
                type="search"
                value={view.state.search}
                placeholder="Case, patient, payer, or surgeon ID"
                className="min-h-11 pl-9"
                onChange={(event) => view.setSearch(event.currentTarget.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="case-status-filter">Status</Label>
            <NativeSelect className="w-full" value={view.state.statusFilter} onChange={(event) => view.setStatusFilter(event.currentTarget.value as CaseStatusFilter)}>
              <NativeSelectOption value="all">All statuses</NativeSelectOption>
              {CASE_STATUSES.map((status) => (
                <NativeSelectOption key={status} value={status}>{statusLabel(status)}</NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </CardContent>
      </Card>

      {projection.status === 'pending' ? (
        <p role="status" className="rounded-xl border p-5 text-sm text-ui-muted-foreground">Loading committed cases…</p>
      ) : projection.status === 'error' ? (
        <Alert variant="destructive">
          <AlertTitle>Cases unavailable</AlertTitle>
          <AlertDescription>{projection.error}</AlertDescription>
        </Alert>
      ) : visibleCases.length === 0 ? (
        <div className="grid min-h-48 place-items-center rounded-xl border border-dashed p-6 text-center">
          <div>
            <h2 className="font-heading text-lg font-medium">No matching cases</h2>
            <p className="mt-1 text-sm text-ui-muted-foreground">Change the filters or create the first case for this practice.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Case results">
          {visibleCases.map((record) => (
            <CaseQueueCard key={record.id} record={record} onSelect={() => view.selectCase(record.id)} />
          ))}
        </div>
      )}
    </section>
  );
}
