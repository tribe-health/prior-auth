import { useParams } from 'react-router';

import { useCan } from '@/app/providers/session-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { GateAffirmationList } from '@/features/surgeon-gate/components/gate-affirmation-list';
import { useGateReviewContext } from '@/features/surgeon-gate/hooks/use-gate-review-context';
import { useSurgeonGate } from '@/features/surgeon-gate/hooks/use-surgeon-gate';

export function Component() {
  const { caseId } = useParams();
  if (!caseId) return null;
  return <SurgeonGateRoute caseId={caseId} />;
}

function SurgeonGateRoute({ caseId }: { readonly caseId: string }) {
  const gate = useSurgeonGate(caseId);
  const review = useGateReviewContext(caseId);
  const mayAffirm = useCan('affirm_gate');
  if (gate.loading || review.loading) return <p role="status" className="p-6 text-sm text-ui-muted-foreground">Loading surgeon confirmations…</p>;
  if (gate.error || review.error || !gate.state || !review.context) return <Alert variant="destructive" className="m-4 sm:m-6"><AlertTitle>Clinical gate unavailable</AlertTitle><AlertDescription>{gate.error ?? review.error ?? 'The current gate context could not be read.'}</AlertDescription></Alert>;
  return (
    <div className="workflow-surface mx-auto w-full max-w-3xl p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-[-0.025em] text-balance">Surgeon review</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ui-muted-foreground">The treating surgeon confirms the policy, section, pathway, and operative plan before a letter can be generated.</p>
      </header>
      <GateAffirmationList state={gate.state} context={review.context} mayAffirm={mayAffirm} refusal={gate.refusal} onAffirm={(kind) => { void gate.affirm(kind); }} />
    </div>
  );
}
