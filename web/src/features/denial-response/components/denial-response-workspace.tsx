import { AlertCircle, CalendarClock, FileWarning, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';

import { useCan } from '@/app/providers/session-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useCaseDetail } from '@/features/case-queue/hooks/use-case-detail';
import { DocumentIntake } from '@/features/document-intake/components/document-intake';
import { useDocumentStatuses } from '@/features/document-intake/hooks/use-document-statuses';
import { LetterWorkspace } from '@/features/letter-workflow/components/letter-workspace';
import { cn } from '@/lib/utils';
import { useDenialResponse } from '../hooks/use-denial-response';

export function DenialResponseWorkspace({ caseId, letterId, onGenerated }: {
  readonly caseId: string;
  readonly letterId: string | null;
  readonly onGenerated: (id: string) => void;
}) {
  const detail = useCaseDetail(caseId, null);
  const documents = useDocumentStatuses(caseId);
  const denial = useDenialResponse(caseId);
  const canRecord = useCan('determination_record');
  const readyDocuments = documents.status === 'ready'
    ? documents.documents.filter((document) => document.processingStatus === 'ready')
    : [];

  if (detail.loading || denial.loading) return <p role="status" className="p-6 text-sm text-ui-muted-foreground">Loading denial response…</p>;
  if (detail.error || !detail.record) return <Alert variant="destructive" className="m-4 w-auto sm:m-6"><AlertTitle>Denial response unavailable</AlertTitle><AlertDescription>{detail.error ?? 'The case record could not be loaded.'}</AlertDescription></Alert>;

  return (
    <section className="workflow-surface grid min-h-full w-full min-w-0 content-start gap-6 p-4 sm:p-6 lg:p-8" aria-labelledby="denial-response-title">
      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Step 11</Badge><Badge className="bg-status-gap-surface text-status-gap">Denial response</Badge></div>
        <h1 id="denial-response-title" className="font-display text-3xl font-semibold tracking-[-0.025em] text-balance">Turn the payer decision into a sourced appeal.</h1>
        <p className="max-w-3xl text-sm leading-6 text-ui-muted-foreground">Upload the denial, record the payer’s stated reason and deadline, then return the clinical argument to the surgeon for a new four-part affirmation before generating the response letter.</p>
      </header>

      {!denial.determination ? (
        <>
          <DocumentIntake caseId={caseId} caseInputRevision={detail.record.caseInputRevision} documentSetRevision={detail.record.documentSetRevision} initialDocumentTypeKey="payer-determination" />
          <Card className="workflow-card">
            <CardHeader><CardTitle>Record adverse determination</CardTitle><CardDescription>The source must be a processed document uploaded as “Payer determination.”</CardDescription></CardHeader>
            <CardContent>
              <form id="denial-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void denial.record(); }}>
                <div className="grid gap-2 sm:col-span-2"><Label htmlFor="denial-source">Denial source</Label><NativeSelect id="denial-source" value={denial.draft.documentId} onChange={(event) => denial.updateDraft({ documentId: event.currentTarget.value })}><NativeSelectOption value="">Select a processed document</NativeSelectOption>{readyDocuments.map((document) => <NativeSelectOption key={document.id} value={document.id}>{document.name} · {document.effectiveDate}</NativeSelectOption>)}</NativeSelect></div>
                <div className="grid gap-2"><Label htmlFor="denial-date">Determination date</Label><Input id="denial-date" type="date" value={denial.draft.decidedOn} onChange={(event) => denial.updateDraft({ decidedOn: event.currentTarget.value })} /></div>
                <div className="grid gap-2"><Label htmlFor="appeal-deadline">Appeal deadline</Label><Input id="appeal-deadline" type="date" value={denial.draft.appealDeadline} onChange={(event) => denial.updateDraft({ appealDeadline: event.currentTarget.value })} /></div>
                <div className="grid gap-2 sm:col-span-2"><Label htmlFor="denial-code">Reason code</Label><Input id="denial-code" value={denial.draft.reasonCode} onChange={(event) => denial.updateDraft({ reasonCode: event.currentTarget.value })} /></div>
                <div className="grid gap-2 sm:col-span-2"><Label htmlFor="denial-reason">Payer’s stated reason</Label><Textarea id="denial-reason" rows={4} value={denial.draft.reasonText} onChange={(event) => denial.updateDraft({ reasonText: event.currentTarget.value })} placeholder="Enter the reason as stated in the determination." /></div>
              </form>
              {denial.message ? <Alert variant="destructive" className="mt-4"><AlertTitle>Determination not recorded</AlertTitle><AlertDescription>{denial.message}</AlertDescription></Alert> : null}
            </CardContent>
            <CardFooter className="justify-end"><Button form="denial-form" type="submit" className="min-h-11" disabled={!canRecord || denial.submitting || !denial.draft.documentId || !denial.draft.decidedOn || !denial.draft.reasonText.trim()}><FileWarning aria-hidden="true" />{denial.submitting ? 'Recording…' : 'Record denial and open appeal'}</Button></CardFooter>
          </Card>
        </>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-4">
            <Card className="workflow-card border-status-gap/30">
              <CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 [overflow-wrap:anywhere]"><CardTitle>Adverse determination</CardTitle><CardDescription>{denial.determination.documentName}</CardDescription></div><Badge className="bg-status-gap-surface text-status-gap">Medical necessity</Badge></div></CardHeader>
              <CardContent className="grid gap-4"><blockquote className="rounded-lg border-l-4 border-status-gap bg-status-gap-surface/55 px-4 py-3 text-sm leading-6">“{denial.determination.reasonText}”</blockquote><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-ui-muted-foreground">Decision date</dt><dd className="font-medium">{denial.determination.decidedOn}</dd></div><div><dt className="text-ui-muted-foreground">Reason code</dt><dd className="font-medium">{denial.determination.reasonCode ?? 'Not stated'}</dd></div></dl></CardContent>
            </Card>
            <Card className="workflow-card bg-cool-surface/55">
              <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="size-5 text-cool" aria-hidden="true" />Appeal clock</CardTitle></CardHeader>
              <CardContent><p className="font-display text-2xl font-semibold">{denial.determination.appealDeadline ?? 'No deadline stated'}</p><p className="mt-2 text-sm leading-6 text-ui-muted-foreground">The response letter remains blocked until the treating surgeon affirms the policy, section, pathway, and operative plan for this appeal cycle.</p></CardContent>
              <CardFooter><Link className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 w-full')} to={`/cases/${caseId}/gate`}><ShieldCheck aria-hidden="true" />Open surgeon review</Link></CardFooter>
            </Card>
          </div>
          {!denial.determination.responseMode ? <Card className="workflow-card">
            <CardHeader><CardTitle>Choose the response path</CardTitle><CardDescription>This decision is recorded with the determination and cannot be changed by retrying the request.</CardDescription></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Button type="button" variant="outline" className="h-auto min-h-16 whitespace-normal px-4 py-3" disabled={!canRecord || denial.submitting} onClick={() => { void denial.confirmMode('corrected_resubmission'); }}>Correct and resubmit the request</Button>
              <Button type="button" className="h-auto min-h-16 whitespace-normal px-4 py-3" disabled={!canRecord || denial.submitting} onClick={() => { void denial.confirmMode('clinical_appeal'); }}>Prepare a clinical appeal</Button>
            </CardContent>
            {denial.message ? <CardFooter><Alert variant="destructive" className="w-full"><AlertTitle>Response path not saved</AlertTitle><AlertDescription>{denial.message}</AlertDescription></Alert></CardFooter> : null}
          </Card> : <>
            {denial.determination.responseMode === 'clinical_appeal'
              ? <Alert><AlertCircle aria-hidden="true" /><AlertTitle>Fresh surgeon affirmation required</AlertTitle><AlertDescription>The clinical appeal uses a new four-part affirmation completed after this payer decision.</AlertDescription></Alert>
              : <Alert><AlertTitle>Corrected resubmission</AlertTitle><AlertDescription>The response corrects the prior request and retains its existing clinical authority. Review every changed source before generating.</AlertDescription></Alert>}
            <LetterWorkspace caseId={caseId} letterId={letterId} onGenerated={onGenerated} purpose={denial.determination.responseMode} />
          </>}
        </>
      )}
    </section>
  );
}
