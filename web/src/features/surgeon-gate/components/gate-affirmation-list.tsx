import { Check, Circle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { GateAffirmationKind, GateReviewContext, GateState } from '../model/gate-state';
import { GATE_KINDS, gateKindLabel, gateKindPrompt } from '../model/gate-state';

// Presentational. Receives everything it needs; owns no fetching, no store
// access, no invoke(). That is what makes it renderable in a golden test and
// identical on desktop and web.

interface Props {
  state: GateState;
  context: GateReviewContext;
  /** False for staff and administrators. The list stays VISIBLE and becomes
   *  non-interactive — a coordinator who cannot see the gate cannot understand
   *  why a case is stalled. */
  mayAffirm: boolean;
  refusal: string | null;
  onAffirm: (kind: GateAffirmationKind) => void;
}

export function GateAffirmationList({ state, context, mayAffirm, refusal, onAffirm }: Props) {
  const completed = GATE_KINDS.length - state.outstanding.length;
  return (
    <section aria-labelledby="gate-heading" className="workflow-surface grid gap-5">
      <div className="flex flex-col gap-3 rounded-xl bg-cool-surface p-4 text-cool sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="gate-heading" className="font-display text-xl font-semibold">Four confirmations</h2>
          <p className="mt-1 text-sm leading-6">{completed} of {GATE_KINDS.length} affirmed for this case.</p>
        </div>
        <Badge variant="outline" className="border-cool/25 bg-background/70 text-cool">Clinical action</Badge>
      </div>

      {!mayAffirm && (
        <p className="rounded-lg bg-ui-muted p-4 text-sm leading-6 text-ui-muted-foreground">
          Visible, not affirmable. Affirming is a clinical act reserved to the
          treating surgeon.
        </p>
      )}

      {refusal && (
        <p role="alert" className="rounded-lg bg-status-gap-surface p-4 text-sm text-status-gap">
          {refusal}
        </p>
      )}

      <ol className="grid gap-3">
        {GATE_KINDS.map((kind) => {
          const done = !state.outstanding.includes(kind);
          const fact = context[kind];
          const ready = Boolean(fact.value);
          return (
            <li key={kind}>
              <Card className={done ? 'workflow-card bg-status-met-surface/55' : 'workflow-card'}>
                <CardHeader className="grid-cols-[auto_1fr_auto] items-center gap-3">
                  <span className={done ? 'flex size-8 items-center justify-center rounded-full bg-status-met text-white' : 'flex size-8 items-center justify-center rounded-full bg-ui-muted text-ui-muted-foreground'}>
                    {done ? <Check aria-hidden="true" className="size-4" /> : <Circle aria-hidden="true" className="size-4" />}
                  </span>
                  <CardTitle>{gateKindLabel[kind]}</CardTitle>
                  <Badge variant={done ? 'secondary' : 'outline'}>{done ? 'Affirmed' : 'Outstanding'}</Badge>
                </CardHeader>
                <CardContent className="grid gap-2 pl-[4.25rem] text-sm leading-6">
                  <p className="text-ui-muted-foreground">{gateKindPrompt[kind]}</p>
                  <p className="rounded-md bg-ui-muted/60 px-3 py-2 font-medium">{fact.value ?? 'Required information is not recorded.'}</p>
                  <p className="font-mono text-xs text-ui-muted-foreground">{fact.source}</p>
                </CardContent>
                {!done && mayAffirm ? <CardFooter className="justify-end"><Button type="button" className="min-h-11" disabled={!ready} onClick={() => onAffirm(kind)}>Affirm {gateKindLabel[kind].toLowerCase()}</Button></CardFooter> : null}
              </Card>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
