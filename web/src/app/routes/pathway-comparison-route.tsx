import { useParams } from 'react-router';

import { PathwayComparison } from '@/features/criteria-selection/components/pathway-comparison';

export function Component() {
  const { caseId } = useParams();
  if (!caseId) return <p className="p-6 text-sm text-destructive">No case selected.</p>;
  return <PathwayComparison caseId={caseId} />;
}
