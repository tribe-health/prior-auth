import { useCallback } from 'react';
import { CheckCircle2, FileSignature, ShieldCheck } from 'lucide-react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useCan } from '@/app/providers/session-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { LetterSigningCard } from '@/features/letter-signing/components/letter-signing-card';
import { DocumentTaskPanel } from '@/features/document-generation/components/document-task-panel';
import { useLetterWorkflow } from '../hooks/use-letter-workflow';

// Historical documents cross the same untrusted Markdown boundary as live drafts.
const historicalMarkdownComponents: Components = {
  a: ({ children }) => <span>{children}</span>,
  img: ({ alt }) => <span>Image omitted{alt ? `: ${alt}` : ''}. Open the source document to review images.</span>,
};

export function LetterWorkspace({ caseId, letterId, onGenerated, purpose = 'prior_authorization_request' }: { readonly caseId: string; readonly letterId: string | null; readonly onGenerated: (letterId: string) => void; readonly purpose?: 'prior_authorization_request' | 'corrected_resubmission' | 'clinical_appeal' }) {
  const generated = useCallback((id: string) => onGenerated(id), [onGenerated]);
  const { view, generation, savedArtifacts, pendingAction, checkPending, generate, review, approve, newRequest } = useLetterWorkflow(caseId, letterId, generated, purpose);
  const canGenerate = useCan('letter_generate');
  const canReview = useCan('letter_review');
  const canApprove = useCan('letter_approve');

  if (view.phase === 'loading') return <p role="status" className="p-6 text-sm text-ui-muted-foreground">Loading the letter workspace…</p>;
  if (view.phase === 'error') return <Alert variant="destructive" className="m-4 w-auto sm:m-6"><AlertTitle>Letter workspace unavailable</AlertTitle><AlertDescription>{view.message}</AlertDescription></Alert>;

  if (!view.letter) {
    const ready = Boolean(
      view.prerequisites?.resolutionRevision
      && view.prerequisites.criteriaSelectionRevision
      && view.prerequisites.evidenceRevision
      && view.prerequisites.gateComplete,
    );
    return (
      <section aria-labelledby="letter-generation-heading" className="workflow-surface flex w-full min-w-0 flex-col gap-6 p-4 sm:p-6">
        <header><h1 id="letter-generation-heading" className="font-display text-3xl font-semibold tracking-[-0.025em] text-balance">{purpose === 'clinical_appeal' ? 'Generate the clinical appeal' : purpose === 'corrected_resubmission' ? 'Generate the corrected resubmission' : 'Generate the prior-authorization letter'}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-ui-muted-foreground">The draft is assembled from the current policy, evidence revision, and clinical authority. Every included assertion retains its source document, page, quote, and date.</p></header>
        <Card className="workflow-card">
          <CardHeader><CardTitle>Generation readiness</CardTitle><CardDescription>The current committed case state controls this action.</CardDescription></CardHeader>
          <CardContent className="grid gap-3">
            <Readiness label="Administering entity resolved" ready={Boolean(view.prerequisites?.resolutionRevision)} />
            <Readiness label="Governing policy selected" ready={Boolean(view.prerequisites?.criteriaSelectionRevision)} />
            <Readiness label="Evidence revision assembled" ready={Boolean(view.prerequisites?.evidenceRevision)} />
            <Readiness label={purpose === 'corrected_resubmission' ? 'Prior clinical authority retained' : 'Four surgeon confirmations complete'} ready={view.prerequisites?.gateComplete === true} />
            {view.message ? <Alert variant="destructive"><AlertTitle>Draft not generated</AlertTitle><AlertDescription>{view.message}</AlertDescription></Alert> : null}
          </CardContent>
          <CardFooter className="justify-end"><Button className="min-h-11" disabled={!canGenerate || !ready || Boolean(generation.state.command)} onClick={() => void generate()}><FileSignature aria-hidden="true" />{generation.state.command ? 'Generation request started' : 'Generate cited draft'}</Button></CardFooter>
        </Card>
        <DocumentTaskPanel caseId={caseId} state={generation.state} replicatedStatus={generation.replicatedStatus} canManage={canGenerate} onReconnect={() => { void generation.reconnect(); }} onCancel={() => { void generation.cancel(); }} onResume={() => { void generation.resume(); }} onNewRequest={newRequest} />
      </section>
    );
  }

  const letter = view.letter;
  return (
    <section aria-labelledby="letter-review-heading" className="workflow-surface @container/letter flex w-full min-w-0 flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 id="letter-review-heading" className="font-display text-3xl font-semibold tracking-[-0.025em] text-balance">{letter.purpose === 'clinical_appeal' ? 'Clinical appeal' : letter.purpose === 'corrected_resubmission' ? 'Corrected resubmission' : 'Prior-authorization request'}</h1><p className="mt-2 text-sm text-ui-muted-foreground">Version {letter.version} · Generated {new Date(letter.generatedAt).toLocaleString()}</p></div><Badge variant="outline" className="w-fit capitalize">{letter.status.replace('_', ' ')}</Badge></header>
      {view.message ? <Alert variant="destructive"><AlertTitle>{pendingAction ? 'Clinical action not confirmed' : 'Action not completed'}</AlertTitle><AlertDescription>{view.message}</AlertDescription></Alert> : null}
      {savedArtifacts ? <DocumentTaskPanel caseId={caseId} state={generation.state} replicatedStatus={generation.replicatedStatus} savedLetterId={letter.id} savedLetterStatus={letter.status} savedArtifacts={savedArtifacts} canManage={canGenerate} onReconnect={() => { void generation.reconnect(); }} onCancel={() => { void generation.cancel(); }} onResume={() => { void generation.resume(); }} /> : null}
      <div className="grid min-w-0 grid-cols-1 gap-6 @min-[60rem]/letter:grid-cols-[minmax(0,1.45fr)_minmax(0,0.75fr)] @min-[60rem]/letter:items-start [&>*]:min-w-0">
        {!savedArtifacts ? <Card className="workflow-card">
          <CardHeader><CardTitle>Draft letter</CardTitle><CardDescription>Only source-backed assertions are included.</CardDescription></CardHeader>
          <CardContent><article className="letter-sheet min-w-0 [overflow-wrap:anywhere] [&_pre]:overflow-x-auto [&_table]:block [&_table]:overflow-x-auto bg-white p-5 font-serif text-[0.95rem] leading-7 text-slate-900 sm:p-8"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={historicalMarkdownComponents}>{letter.bodyMarkdown}</Markdown></article></CardContent>
        </Card> : null}
        <div className="grid gap-4">
          <Card className="workflow-card">
            <CardHeader><CardTitle>Source review</CardTitle><CardDescription>{letter.claims.length} cited {letter.claims.length === 1 ? 'assertion' : 'assertions'}</CardDescription></CardHeader>
            <CardContent>{savedArtifacts ? <p className="text-sm leading-6 text-ui-muted-foreground">Review the saved claims, source documents, and QA findings above before confirming this revision.</p> : <ol className="grid min-w-0 gap-3 [overflow-wrap:anywhere]">{letter.claims.map((claim) => <li key={claim.id} className="rounded-lg border p-3"><div className="flex items-start justify-between gap-3"><p className="min-w-0 font-medium leading-snug">{claim.claimText}</p><Badge variant={claim.supportStatus === 'supported' ? 'default' : 'outline'}>{claim.supportStatus}</Badge></div><p className="mt-2 text-xs leading-relaxed text-ui-muted-foreground">{claim.documentName} · page {claim.pageNumber} · {claim.sourceDate}</p><blockquote className="mt-2 rounded-md bg-ui-muted/55 px-3 py-2 text-sm italic leading-6 text-ui-muted-foreground">“{claim.sourceQuote}”</blockquote></li>)}</ol>}</CardContent>
            {pendingAction ? <CardFooter className="justify-end"><Button className="min-h-11" variant="outline" disabled={view.phase === 'working'} onClick={() => void checkPending()}>Check the same clinical request</Button></CardFooter> : null}
            {!pendingAction && letter.status === 'draft' ? <CardFooter className="justify-end"><Button className="min-h-11" disabled={!canReview || view.phase === 'working'} onClick={() => void review()}><ShieldCheck aria-hidden="true" />{view.phase === 'working' ? 'Recording review…' : 'Confirm source review'}</Button></CardFooter> : null}
            {!pendingAction && letter.status === 'in_review' ? <CardFooter className="justify-end"><Button className="min-h-11" disabled={!canApprove || view.phase === 'working'} onClick={() => void approve()}><CheckCircle2 aria-hidden="true" />{view.phase === 'working' ? 'Approving…' : 'Approve current revision'}</Button></CardFooter> : null}
          </Card>
          {!pendingAction && (letter.status === 'approved' || letter.status === 'signed') ? <LetterSigningCard caseId={caseId} letterId={letter.id} /> : null}
        </div>
      </div>
    </section>
  );
}

function Readiness({ label, ready }: { readonly label: string; readonly ready: boolean }) {
  return <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2"><span className="text-sm">{label}</span><span className={ready ? 'font-mono text-xs font-medium uppercase tracking-wide text-status-met' : 'font-mono text-xs font-medium uppercase tracking-wide text-ui-muted-foreground'}>{ready ? 'Ready' : 'Required'}</span></div>;
}
