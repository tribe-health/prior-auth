import { ArrowRight, CheckCircle2, Send } from 'lucide-react';
import { Link } from 'react-router';
import { useCan } from '@/app/providers/session-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSubmissionWorkflow } from '../hooks/use-submission-workflow';
import { signedCurrentPacket, type PayerReceipt, type SubmissionPacket } from '../model/submission-workflow';
import { AcknowledgementForm } from './acknowledgement-form';
import { PacketAttachments } from './packet-attachments';

const dateTime = (value: string) => new Date(value).toLocaleString();
const purposeLabel = { prior_authorization_request: 'Prior-authorization request', corrected_resubmission: 'Corrected resubmission', clinical_appeal: 'Clinical appeal' };
const linkClass = `${buttonVariants({ variant: 'outline' })} min-h-11 h-auto whitespace-normal py-2`;

function PacketIdentity({ packet }: { readonly packet: SubmissionPacket }) {
  return <Card className="workflow-card min-w-0"><CardHeader><CardTitle>Packet summary</CardTitle></CardHeader><CardContent className="grid min-w-0 gap-4 [overflow-wrap:anywhere]">
    <dl className="grid gap-4 text-sm">
      <div><dt className="text-ui-muted-foreground">Letter</dt><dd className="mt-1 font-medium">{packet.letter ? `${purposeLabel[packet.letter.purpose]} · version ${packet.letter.version}` : 'No letter available'}</dd></div>
      <div><dt className="text-ui-muted-foreground">Signature</dt><dd className="mt-1">{packet.letter?.signedAt ? `Signed ${dateTime(packet.letter.signedAt)}` : 'Signature required'}</dd></div>
      <div><dt className="text-ui-muted-foreground">Manifest</dt><dd className="mt-1">{packet.attachments.length} {packet.attachments.length === 1 ? 'item' : 'items'} · {packet.attachments.reduce((total, item) => total + item.pageCount, 0)} pages</dd></div>
      {packet.submission ? <><div><dt className="text-ui-muted-foreground">Transmission</dt><dd className="mt-1">{packet.submission.channel.replaceAll('_', ' ')} · attempt {packet.submission.attempt}</dd></div><div><dt className="text-ui-muted-foreground">Sent at</dt><dd className="mt-1">{dateTime(packet.submission.submittedAt)}</dd></div></> : null}
    </dl>
    {packet.letter ? <Link className={linkClass} to={`/cases/${encodeURIComponent(packet.caseId)}/letter?letterId=${encodeURIComponent(packet.letter.id)}`}>Review letter<ArrowRight aria-hidden="true" className="size-4" /></Link> : null}
    <details className="min-w-0 text-xs"><summary className="min-h-11 cursor-pointer py-3 text-sm">Packet identity</summary><dl className="grid gap-3 pb-2"><div><dt>Letter content hash</dt><dd className="mt-1 break-all font-mono">{packet.letter?.contentSha256Text ?? 'Not available'}</dd></div>{packet.submission ? <div><dt>Transmitted manifest hash</dt><dd className="mt-1 break-all font-mono">{packet.submission.manifestSha256Text}</dd></div> : null}</dl></details>
  </CardContent></Card>;
}

function TransmissionState({ packet, receipt }: { readonly packet: SubmissionPacket; readonly receipt: PayerReceipt | null | undefined }) {
  const acknowledgedInFull = Boolean(receipt) && packet.submission?.status === 'acknowledged'
    && receipt?.pageCount === packet.submission.totalPages;
  return <Card className="workflow-card min-w-0"><CardHeader><CardTitle>Transmission and acknowledgement</CardTitle><CardDescription>Sending the packet and the payer acknowledging it are recorded separately.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
    <div className="rounded-lg border p-4"><p className="mb-3 text-sm font-medium">Transmission</p><Badge variant="outline">{packet.submission ? 'Sent' : 'Not sent'}</Badge><p className="mt-3 text-sm leading-6 text-ui-muted-foreground">{packet.submission ? `Recorded ${dateTime(packet.submission.submittedAt)}` : 'No transmission has been recorded for this packet.'}</p></div>
    <div className="rounded-lg border p-4"><p className="mb-3 text-sm font-medium">Payer receipt</p><Badge variant="outline" className="h-auto max-w-full whitespace-normal">{acknowledgedInFull ? 'Acknowledged in full' : receipt ? 'Partial acknowledgement · disputed' : 'Not acknowledged'}</Badge><p className="mt-3 text-sm leading-6 text-ui-muted-foreground">{acknowledgedInFull ? 'The payer acknowledged every transmitted page.' : receipt ? 'The complete packet is not acknowledged. Review the receipt and transmitted page counts below.' : 'Payer silence is not confirmation of receipt.'}</p></div>
  </CardContent></Card>;
}

function SubmissionWorkspace({ caseId, mode }: { readonly caseId: string; readonly mode: 'packet' | 'receipt' }) {
  const workflow = useSubmissionWorkflow(caseId, mode);
  const canManage = useCan('submit');
  const packet = workflow.packet;
  const receipt = workflow.receiptView?.receipt;
  const blocked = !packet || !signedCurrentPacket(packet);
  const busy = workflow.command.busy;
  const pending = workflow.command.pending !== null;
  const title = mode === 'packet' ? 'Review the submission packet.' : 'Verify the payer’s acknowledgement.';

  return <section className="workflow-surface @container/submission flex w-full min-w-0 flex-col gap-6 p-4 sm:p-6 [overflow-wrap:anywhere]" aria-labelledby="submission-heading">
    <header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><p className="mb-2 font-mono text-xs uppercase tracking-wider text-ui-muted-foreground">{mode === 'packet' ? 'Step 08 · Submission packet' : 'Step 09 · Receipt and custody'}</p><h1 id="submission-heading" className="font-display text-3xl font-semibold tracking-[-0.025em] text-balance">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-ui-muted-foreground">{mode === 'packet' ? 'Review the signed letter and the ordered attachment manifest before submitting.' : 'Transmission records show what was sent. Record a payer acknowledgement separately; reviewer access remains a separate fact.'}</p></div><Link className={`${linkClass} self-start`} to={`/cases/${encodeURIComponent(caseId)}/${mode === 'packet' ? 'receipt' : 'packet'}`}>{mode === 'packet' ? 'Track receipt and custody' : 'Review submission packet'}<ArrowRight aria-hidden="true" className="size-4" /></Link></header>
    {workflow.command.message ? <Alert><AlertTitle>{pending ? 'Command outcome unconfirmed' : 'Submission update'}</AlertTitle><AlertDescription>{workflow.command.message}</AlertDescription></Alert> : null}
    {pending ? <div className="flex flex-wrap items-center gap-3"><p className="text-sm text-ui-muted-foreground">An earlier request may have completed. Check its status before continuing.</p><Button className="min-h-11 h-auto whitespace-normal" variant="outline" disabled={busy} onClick={() => { void workflow.reconcile(); }}>{busy ? 'Checking submission status…' : 'Check status and retry same request'}</Button></div> : null}
    {workflow.phase === 'loading' ? <p role="status" aria-live="polite" className="py-6 text-sm text-ui-muted-foreground">Loading the current submission record…</p> : null}
    {workflow.phase === 'error' ? <Alert variant="destructive"><AlertTitle>Submission record unavailable</AlertTitle><AlertDescription>{workflow.message}<Button variant="outline" className="mt-3 min-h-11 w-fit" onClick={() => { void workflow.reload(); }}>Reload submission record</Button></AlertDescription></Alert> : null}
    {workflow.phase === 'ready' && packet ? <>
      {workflow.message ? <Alert variant="destructive"><AlertTitle>Review the acknowledgement fields</AlertTitle><AlertDescription>{workflow.message}</AlertDescription></Alert> : null}
      {mode === 'packet' ? <>
        {!packet.letter ? <Alert><AlertTitle>A signed letter is required</AlertTitle><AlertDescription>Generate, review, approve, and sign the current letter before submitting its packet.</AlertDescription></Alert> : null}
        <div className="grid min-w-0 gap-6 @min-[60rem]/submission:grid-cols-[minmax(0,1.5fr)_minmax(0,0.85fr)] [&>*]:min-w-0"><PacketAttachments attachments={packet.attachments} /><PacketIdentity packet={packet} /></div>
        <Card className="workflow-card min-w-0"><CardContent className="flex min-w-0 flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><h2 className="font-semibold">{packet.submission ? 'Transmission recorded' : blocked ? 'Packet requires review' : 'Ready to submit'}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-ui-muted-foreground">{packet.submission ? 'Open receipt and custody to review the payer acknowledgement.' : !canManage ? 'Your current access allows review of this packet.' : blocked ? packet.blockReason?.includes(' ') ? packet.blockReason : 'The host has not cleared this packet for submission. Review the current letter and signature.' : 'Submit this signed letter revision with the listed attachments. Payer acknowledgement is recorded separately.'}</p></div><Button className="min-h-11 h-auto self-start whitespace-normal sm:self-center" disabled={!canManage || blocked || busy || pending} onClick={() => { void workflow.submit(); }}><Send aria-hidden="true" />{busy ? 'Submitting packet…' : 'Submit signed packet'}</Button></CardContent></Card>
      </> : <>
        <TransmissionState packet={packet} receipt={receipt} />
        {!packet.submission ? <Alert><AlertTitle>No transmission to acknowledge</AlertTitle><AlertDescription>Submit the current signed packet before recording the payer’s acknowledgement.</AlertDescription></Alert> : null}
        <div className="grid min-w-0 gap-6 @min-[60rem]/submission:grid-cols-[minmax(0,1.5fr)_minmax(0,0.85fr)] [&>*]:min-w-0"><div className="grid min-w-0 gap-4">
          {receipt ? <Card className="workflow-card min-w-0"><CardHeader><CardTitle><span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4" aria-hidden="true" />Payer acknowledgement</span></CardTitle></CardHeader><CardContent><dl className="grid gap-4 text-sm"><div><dt className="text-ui-muted-foreground">Payer reference</dt><dd className="mt-1 font-medium">{receipt.payerReference}</dd></div><div><dt className="text-ui-muted-foreground">Acknowledged at</dt><dd className="mt-1">{dateTime(receipt.acknowledgedAt)}</dd></div><div><dt className="text-ui-muted-foreground">Acknowledged pages</dt><dd className="mt-1">{receipt.pageCount} of {packet.submission?.totalPages} transmitted pages</dd></div><div><dt className="text-ui-muted-foreground">Recorded at</dt><dd className="mt-1">{dateTime(receipt.recordedAt)}</dd></div></dl>{receipt.pageCount !== packet.submission?.totalPages ? <Alert className="mt-4"><AlertTitle>Page counts differ</AlertTitle><AlertDescription>Compare the payer acknowledgement with the transmitted manifest.</AlertDescription></Alert> : null}</CardContent></Card> : packet.submission ? <AcknowledgementForm draft={workflow.draft} disabled={!canManage || pending} submitting={busy} onChange={workflow.updateDraft} onSubmit={() => { void workflow.acknowledge(); }} /> : null}
          <PacketAttachments attachments={packet.attachments} />
        </div><div className="grid min-w-0 content-start gap-4"><PacketIdentity packet={packet} /><Card className="workflow-card min-w-0"><CardHeader><CardTitle>Custody record</CardTitle><CardDescription>Recorded events for this submission.</CardDescription></CardHeader><CardContent>{workflow.receiptView?.custody.length ? <ol className="grid gap-4">{workflow.receiptView.custody.map((event) => <li key={event.sequence} className="border-l-2 border-chrome pl-3"><p className="text-sm font-medium capitalize">{event.event.replaceAll('_', ' ')}</p><p className="mt-1 text-xs leading-5 text-ui-muted-foreground">{dateTime(event.occurredAt)} · {event.actorLabel}</p></li>)}</ol> : <p className="text-sm leading-6 text-ui-muted-foreground">No custody events are recorded.</p>}</CardContent></Card></div></div>
      </>}
    </> : null}
  </section>;
}
export function SubmissionPacketWorkspace({ caseId }: { readonly caseId: string }) { return <SubmissionWorkspace caseId={caseId} mode="packet" />; }
export function ReceiptVerificationWorkspace({ caseId }: { readonly caseId: string }) { return <SubmissionWorkspace caseId={caseId} mode="receipt" />; }
