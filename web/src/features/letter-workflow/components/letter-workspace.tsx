import { useCallback } from 'react';
import { CheckCircle2, FileSignature, ShieldCheck } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useCan } from '@/app/providers/session-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { LetterSigningCard } from '@/features/letter-signing/components/letter-signing-card';
import { useLetterWorkflow } from '../hooks/use-letter-workflow';

export function LetterWorkspace({ caseId, letterId, onGenerated }: { readonly caseId: string; readonly letterId: string | null; readonly onGenerated: (letterId: string) => void }) {
  const generated = useCallback((id: string) => onGenerated(id), [onGenerated]);
  const { view, generate, review, approve } = useLetterWorkflow(caseId, letterId, generated);
  const canGenerate = useCan('letter_generate');
  const canReview = useCan('letter_review');
  const canApprove = useCan('letter_approve');

  if (view.phase === 'loading') return <p role="status" className="p-6 text-sm text-ui-muted-foreground">Loading the letter workspace…</p>;
  if (view.phase === 'error') return <Alert variant="destructive" className="m-4 sm:m-6"><AlertTitle>Letter workspace unavailable</AlertTitle><AlertDescription>{view.message}</AlertDescription></Alert>;

  if (!view.letter) {
    const ready = Boolean(
      view.prerequisites?.resolutionRevision
      && view.prerequisites.criteriaSelectionRevision
      && view.prerequisites.evidenceRevision
      && view.prerequisites.gateComplete,
    );
    return (
      <section aria-labelledby="letter-generation-heading" className="workflow-surface mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
        <header><h1 id="letter-generation-heading" className="font-display text-3xl font-semibold tracking-[-0.025em] text-balance">Generate the prior-authorization letter</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-ui-muted-foreground">The draft is assembled from the current policy, evidence revision, and surgeon confirmations. Every included assertion retains its source document, page, quote, and date.</p></header>
        <Card className="workflow-card">
          <CardHeader><CardTitle>Generation readiness</CardTitle><CardDescription>The current committed case state controls this action.</CardDescription></CardHeader>
          <CardContent className="grid gap-3">
            <Readiness label="Administering entity resolved" ready={Boolean(view.prerequisites?.resolutionRevision)} />
            <Readiness label="Governing policy selected" ready={Boolean(view.prerequisites?.criteriaSelectionRevision)} />
            <Readiness label="Evidence revision assembled" ready={Boolean(view.prerequisites?.evidenceRevision)} />
            <Readiness label="Four surgeon confirmations complete" ready={view.prerequisites?.gateComplete === true} />
            {view.message ? <Alert variant="destructive"><AlertTitle>Draft not generated</AlertTitle><AlertDescription>{view.message}</AlertDescription></Alert> : null}
          </CardContent>
          <CardFooter className="justify-end"><Button className="min-h-11" disabled={!canGenerate || !ready || view.phase === 'working'} onClick={() => void generate()}><FileSignature aria-hidden="true" />{view.phase === 'working' ? 'Generating…' : 'Generate cited draft'}</Button></CardFooter>
        </Card>
      </section>
    );
  }

  const letter = view.letter;
  return (
    <section aria-labelledby="letter-review-heading" className="workflow-surface mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 id="letter-review-heading" className="font-display text-3xl font-semibold tracking-[-0.025em] text-balance">Prior-authorization request</h1><p className="mt-2 text-sm text-ui-muted-foreground">Version {letter.version} · Generated {new Date(letter.generatedAt).toLocaleString()}</p></div><Badge variant="outline" className="w-fit capitalize">{letter.status.replace('_', ' ')}</Badge></header>
      {view.message ? <Alert variant="destructive"><AlertTitle>Action not completed</AlertTitle><AlertDescription>{view.message}</AlertDescription></Alert> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.75fr)] lg:items-start">
        <Card className="workflow-card">
          <CardHeader><CardTitle>Draft letter</CardTitle><CardDescription>Only source-backed assertions are included.</CardDescription></CardHeader>
          <CardContent><article className="letter-sheet bg-white p-5 font-serif text-[0.95rem] leading-7 text-slate-900 sm:p-8"><Markdown remarkPlugins={[remarkGfm]}>{letter.bodyMarkdown}</Markdown></article></CardContent>
        </Card>
        <div className="grid gap-4">
          <Card className="workflow-card">
            <CardHeader><CardTitle>Source review</CardTitle><CardDescription>{letter.claims.length} cited {letter.claims.length === 1 ? 'assertion' : 'assertions'}</CardDescription></CardHeader>
            <CardContent><ol className="grid gap-3">{letter.claims.map((claim) => <li key={claim.id} className="rounded-lg border p-3"><div className="flex items-start justify-between gap-3"><p className="font-medium leading-snug">{claim.claimText}</p><Badge variant={claim.supportStatus === 'supported' ? 'default' : 'outline'}>{claim.supportStatus}</Badge></div><p className="mt-2 text-xs leading-relaxed text-ui-muted-foreground">{claim.documentName} · page {claim.pageNumber} · {claim.sourceDate}</p><blockquote className="mt-2 rounded-md bg-ui-muted/55 px-3 py-2 text-sm italic leading-6 text-ui-muted-foreground">“{claim.sourceQuote}”</blockquote></li>)}</ol></CardContent>
            {letter.status === 'draft' ? <CardFooter className="justify-end"><Button className="min-h-11" disabled={!canReview || view.phase === 'working'} onClick={() => void review()}><ShieldCheck aria-hidden="true" />{view.phase === 'working' ? 'Recording review…' : 'Confirm source review'}</Button></CardFooter> : null}
            {letter.status === 'in_review' ? <CardFooter className="justify-end"><Button className="min-h-11" disabled={!canApprove || view.phase === 'working'} onClick={() => void approve()}><CheckCircle2 aria-hidden="true" />{view.phase === 'working' ? 'Approving…' : 'Approve current revision'}</Button></CardFooter> : null}
          </Card>
          {letter.status === 'approved' || letter.status === 'signed' ? <LetterSigningCard caseId={caseId} letterId={letter.id} /> : null}
        </div>
      </div>
    </section>
  );
}

function Readiness({ label, ready }: { readonly label: string; readonly ready: boolean }) {
  return <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2"><span className="text-sm">{label}</span><span className={ready ? 'font-mono text-xs font-medium uppercase tracking-wide text-status-met' : 'font-mono text-xs font-medium uppercase tracking-wide text-ui-muted-foreground'}>{ready ? 'Ready' : 'Required'}</span></div>;
}
