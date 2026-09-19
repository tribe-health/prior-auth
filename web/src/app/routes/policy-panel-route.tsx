import { useParams } from 'react-router';

import { PolicyPanel } from '@/features/criteria-selection/components/policy-panel';

export function Component() {
  const { caseId } = useParams();
  if (!caseId) return <p className="p-6 text-sm text-destructive">No case selected.</p>;
  return <PolicyPanel caseId={caseId} />;
}
