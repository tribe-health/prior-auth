import { useId } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AcknowledgementDraft } from '../model/submission-workflow';

export function AcknowledgementForm({ draft, disabled, submitting, onChange, onSubmit }: {
  readonly draft: AcknowledgementDraft;
  readonly disabled: boolean;
  readonly submitting: boolean;
  readonly onChange: (patch: Partial<AcknowledgementDraft>) => void;
  readonly onSubmit: () => void;
}) {
  const id = useId();
  return <Card className="workflow-card min-w-0">
    <CardHeader><CardTitle>Record payer acknowledgement</CardTitle><CardDescription>Enter the payer’s reference, acknowledgement time, and acknowledged page count.</CardDescription></CardHeader>
    <CardContent><form className="grid min-w-0 gap-5" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <fieldset disabled={disabled || submitting} className="grid min-w-0 gap-5">
        <legend className="sr-only">Payer acknowledgement</legend>
        <div className="grid min-w-0 gap-2"><Label htmlFor={`${id}-reference`}>Payer reference</Label><Input id={`${id}-reference`} value={draft.payerReference} required autoComplete="off" className="min-h-11" onChange={(event) => onChange({ payerReference: event.target.value })} /></div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="grid min-w-0 gap-2"><Label htmlFor={`${id}-time`}>Acknowledged at</Label><Input id={`${id}-time`} type="datetime-local" value={draft.acknowledgedAt} required className="min-h-11 max-w-full" aria-describedby={`${id}-timezone`} onChange={(event) => onChange({ acknowledgedAt: event.target.value })} /><p id={`${id}-timezone`} className="text-xs leading-5 text-ui-muted-foreground">Local time · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p></div>
          <div className="grid min-w-0 content-start gap-2"><Label htmlFor={`${id}-pages`}>Acknowledged pages</Label><Input id={`${id}-pages`} type="number" min={0} step={1} inputMode="numeric" value={draft.pageCount} required className="min-h-11" onChange={(event) => onChange({ pageCount: event.target.value })} /></div>
        </div>
      </fieldset>
      <p className="text-sm leading-6 text-ui-muted-foreground">An acknowledgement records payer receipt. It does not confirm reviewer access.</p>
      <Button type="submit" disabled={disabled || submitting} className="min-h-11 justify-self-start whitespace-normal"><CheckCircle2 aria-hidden="true" />{submitting ? 'Recording acknowledgement…' : 'Record acknowledgement'}</Button>
    </form></CardContent>
  </Card>;
}
