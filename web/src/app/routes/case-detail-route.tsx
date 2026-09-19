import { useParams } from 'react-router';

import { CaseDetail } from '@/features/case-queue/components/case-detail';

export function Component() {
  const { caseId } = useParams();
  if (!caseId) return null;
  return <CaseDetail caseId={caseId} />;
}
