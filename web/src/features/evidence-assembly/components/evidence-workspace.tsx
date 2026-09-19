import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileSearch, Save } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { EvidenceTimeline } from '@/features/evidence-timeline/components/evidence-timeline';
import { SourcePreview } from '@/features/source-preview/components/source-preview';
import { useSourcePreview } from '@/features/source-preview/hooks/use-source-preview';
import type { SourcePreviewTarget } from '@/features/source-preview/model/source-preview';
import { EvidenceStateChip } from '@/shared/ui';
import { useEvidenceAssembly } from '../hooks/use-evidence-assembly';
import type { EvidenceInput, EvidenceState } from '../model/evidence-assembly';

interface DraftEvidence {
  readonly id: string;
  readonly criterionId: string;
  readonly state: EvidenceState | null;
  readonly documentId: string;
  readonly pageNumber: string;
  readonly quote: string;
  readonly rationale: string;
}

const stateCopy: Readonly<Record<EvidenceState, string>> = {
  met: 'The chart documents that this criterion is satisfied.',
  gap: 'The chart addresses this criterion and falls short. A surgeon must argue the exception.',
  void: 'The chart is silent. A coordinator must obtain the missing evidence.',
};

export function EvidenceWorkspace({ caseId }: { readonly caseId: string }) {
  const { view, documents, assemble } = useEvidenceAssembly(caseId);
  const sourcePreview = useSourcePreview(caseId);
  const [drafts, setDrafts] = useState<readonly DraftEvidence[]>([]);

  useEffect(() => {
    if (view.status !== 'ready') return;
    const existing = new Map(view.evidence.entries.map((entry) => [entry.criterionId, entry]));
    setDrafts(view.selection.criteria.map((criterion) => {
      const entry = existing.get(criterion.id);
      const citation = entry?.citations[0];
      return {
        id: entry?.id ?? crypto.randomUUID(),
        criterionId: criterion.id,
        state: entry?.state ?? null,
        documentId: citation?.documentId ?? '',
        pageNumber: citation ? String(citation.pageNumber) : '',
        quote: citation?.quote ?? '',
        rationale: entry?.rationale ?? '',
      };
    }));
  }, [view]);

  const readyDocuments = useMemo(
    () => documents.documents.filter((document) => document.processingStatus === 'ready'),
    [documents.documents],
  );
  const draftsByCriterion = useMemo(
    () => new Map(drafts.map((draft) => [draft.criterionId, draft])),
    [drafts],
  );
  const assessedCount = useMemo(
    () => drafts.filter((draft) => draft.rationale.trim()).length,
    [drafts],
  );
  const stateCounts = useMemo(() => drafts.reduce((counts, draft) => {
    if (!draft.state) return counts;
    return { ...counts, [draft.state]: counts[draft.state] + 1 };
  }, { met: 0, gap: 0, void: 0 }), [drafts]);

  if (view.status === 'loading') return <Notice>Loading selected criteria and source documents…</Notice>;
  if (view.status === 'error') return <Notice tone="error">{view.message}</Notice>;

  const update = (criterionId: string, patch: Partial<DraftEvidence>) => {
    setDrafts((current) => current.map((draft) => draft.criterionId === criterionId
      ? { ...draft, ...patch }
      : draft));
  };
  const complete = drafts.length === view.selection.criteria.length && drafts.every((draft) => {
    if (!draft.state || !draft.rationale.trim()) return false;
    const selectedDocument = readyDocuments.find((document) => document.id === draft.documentId);
    const pageNumber = Number(draft.pageNumber);
    return draft.state === 'void' || Boolean(
      selectedDocument
      && pageNumber > 0
      && pageNumber <= (selectedDocument.pageCount ?? Number.POSITIVE_INFINITY)
      && draft.quote.trim(),
    );
  });
  const submit = () => {
    if (!complete) return;
    const inputs: EvidenceInput[] = drafts.map((draft) => ({
      id: draft.id,
      criterionId: draft.criterionId,
      expectedState: draft.state!,
      documentId: draft.state === 'void' ? null : draft.documentId,
      pageNumber: draft.state === 'void' ? null : Number(draft.pageNumber),
      quote: draft.state === 'void' ? null : draft.quote.trim(),
      rationale: draft.rationale.trim(),
    }));
    void assemble(inputs);
  };

  return (
    <div className="workflow-surface mx-auto flex w-full max-w-6xl flex-col gap-8 p-4 sm:p-6">
      <section aria-labelledby="evidence-heading" className="flex flex-col gap-5">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 id="evidence-heading" className="font-display text-3xl font-semibold tracking-[-0.025em] text-balance">Compare the chart with the policy</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ui-muted-foreground">
              Classify every criterion. Met and Not met require an exact source quote. Not documented records that the chart is silent.
            </p>
          </div>
          <div className="rounded-lg bg-ui-muted px-3 py-2 font-mono text-xs text-ui-muted-foreground">
            {view.selection.policy.policyNumber} · version {view.selection.policy.version}
          </div>
        </header>

        {view.message ? <Alert variant="destructive"><AlertTitle>Evidence not saved</AlertTitle><AlertDescription>{view.message}</AlertDescription></Alert> : null}
        {documents.status === 'pending' ? <Notice>Source documents are still loading.</Notice> : null}
        {documents.status === 'error' ? <Notice tone="error">Source documents could not be read.</Notice> : null}

        <div className="grid gap-3 rounded-xl bg-ui-muted/45 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium">Assessment progress</p>
              <p className="font-mono text-xs text-ui-muted-foreground">{assessedCount} / {drafts.length}</p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background" aria-hidden="true">
              <div className="workflow-progress-fill h-full rounded-full bg-accent" style={{ width: drafts.length === 0 ? '0%' : `${Math.round((assessedCount / drafts.length) * 100)}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Evidence state totals">
            <EvidenceStateChip state="met" /> <span className="font-mono text-xs tabular-nums">{stateCounts.met}</span>
            <EvidenceStateChip state="gap" /> <span className="font-mono text-xs tabular-nums">{stateCounts.gap}</span>
            <EvidenceStateChip state="void" /> <span className="font-mono text-xs tabular-nums">{stateCounts.void}</span>
          </div>
        </div>

        <div className="grid gap-4">
          {view.selection.criteria.map((criterion, index) => {
            const draft = draftsByCriterion.get(criterion.id);
            if (!draft) return null;
            const selectedDocument = readyDocuments.find((document) => document.id === draft.documentId);
            const pageNumber = Number(draft.pageNumber);
            const pageIsValid = selectedDocument && pageNumber > 0 && pageNumber <= (selectedDocument.pageCount ?? Number.POSITIVE_INFINITY);
            const previewTarget: SourcePreviewTarget | null = pageIsValid
              ? { id: `draft:${criterion.id}`, caseId, documentId: selectedDocument.id, documentName: selectedDocument.name, effectiveDate: selectedDocument.effectiveDate, pageNumber: Number(draft.pageNumber), relevance: draft.state === 'gap' ? 'contradicts' : 'supports' }
              : null;
            return (
              <Card key={criterion.id} className="workflow-card overflow-visible">
                <CardHeader>
                  <CardTitle className="flex items-start gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ui-muted font-mono text-xs">{index + 1}</span>
                    <span>{criterion.label}</span>
                  </CardTitle>
                  <CardDescription className="pl-10">{criterion.requirement}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
                  <fieldset className="grid gap-2">
                    <legend className="mb-1 text-sm font-medium">Chart finding</legend>
                    {!draft.state ? <p className="mb-1 text-xs leading-5 text-ui-muted-foreground">Choose a finding after reviewing the chart.</p> : null}
                    {(['met', 'gap', 'void'] as const).map((state) => (
                      <label key={state} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-[:checked]:border-accent-foreground/45 has-[:checked]:bg-accent">
                        <input
                          type="radio"
                          name={`state-${criterion.id}`}
                          value={state}
                          checked={draft.state === state}
                          onChange={() => update(criterion.id, state === 'void'
                            ? { state, documentId: '', pageNumber: '', quote: '' }
                            : { state })}
                          className="mt-1"
                        />
                        <span className="grid gap-1"><EvidenceStateChip state={state} /><span className="text-xs leading-relaxed text-ui-muted-foreground">{stateCopy[state]}</span></span>
                      </label>
                    ))}
                  </fieldset>

                  <div className="grid gap-4">
                    {draft.state && draft.state !== 'void' ? (
                      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end">
                        <div className="grid gap-1.5">
                          <Label htmlFor={`document-${criterion.id}`}>Source document</Label>
                          <NativeSelect id={`document-${criterion.id}`} className="w-full" value={draft.documentId} onChange={(event) => update(criterion.id, { documentId: event.target.value })}>
                            <NativeSelectOption value="">Choose a ready document</NativeSelectOption>
                            {readyDocuments.map((document) => <NativeSelectOption key={document.id} value={document.id}>{document.name} · {document.effectiveDate}</NativeSelectOption>)}
                          </NativeSelect>
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor={`page-${criterion.id}`}>Page</Label>
                          <Input id={`page-${criterion.id}`} type="number" min={1} max={selectedDocument?.pageCount ?? undefined} value={draft.pageNumber} onChange={(event) => update(criterion.id, { pageNumber: event.target.value })} />
                        </div>
                        <Button type="button" variant="outline" className="min-h-10" disabled={!previewTarget} onClick={() => { if (previewTarget) void sourcePreview.open(previewTarget); }}>
                          <FileSearch aria-hidden="true" /> View source
                        </Button>
                      </div>
                    ) : null}
                    {draft.state && draft.state !== 'void' ? (
                      <div className="grid gap-1.5">
                        <Label htmlFor={`quote-${criterion.id}`}>Exact source quote</Label>
                        <Textarea id={`quote-${criterion.id}`} rows={3} value={draft.quote} onChange={(event) => update(criterion.id, { quote: event.target.value })} placeholder="Copy the exact sentence from the selected page." />
                      </div>
                    ) : null}
                    <div className="grid gap-1.5">
                      <Label htmlFor={`rationale-${criterion.id}`}>{draft.state === 'void' ? 'What is missing' : 'Assessment rationale'}</Label>
                      <Textarea id={`rationale-${criterion.id}`} rows={2} value={draft.rationale} disabled={!draft.state} onChange={(event) => update(criterion.id, { rationale: event.target.value })} placeholder={!draft.state ? 'Choose a chart finding first.' : draft.state === 'void' ? 'State what the chart does not document.' : 'Explain how the source relates to this criterion.'} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <CardFooter className="workflow-action-bar sticky bottom-0 z-10 flex-col items-stretch gap-3 rounded-xl border bg-background/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-ui-muted-foreground"><CheckCircle2 aria-hidden="true" className="size-4" />{assessedCount} of {drafts.length} criteria assessed</p>
          <Button type="button" disabled={!complete || view.status === 'saving'} onClick={submit} className="min-h-11">
            <Save aria-hidden="true" /> {view.status === 'saving' ? 'Saving evidence…' : 'Save evidence revision'}
          </Button>
        </CardFooter>
      </section>

      {view.evidence.entries.length > 0 ? <EvidenceTimeline caseId={caseId} /> : null}
      <SourcePreview state={sourcePreview.state} onClose={sourcePreview.close} onPageChange={(page) => { void sourcePreview.goToPage(page); }} />
    </div>
  );
}

function Notice({ children, tone = 'neutral' }: { readonly children: React.ReactNode; readonly tone?: 'neutral' | 'error' }) {
  return <p role={tone === 'error' ? 'alert' : 'status'} className={tone === 'error' ? 'm-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive' : 'm-4 rounded-lg border bg-ui-muted/40 p-4 text-sm text-ui-muted-foreground'}>{children}</p>;
}
