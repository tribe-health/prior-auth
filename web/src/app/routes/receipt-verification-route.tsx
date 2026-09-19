import { useParams } from 'react-router';
import { ReceiptVerificationWorkspace } from '@/features/submission-workflow/components/submission-workspace';

export function Component() {
  const { caseId } = useParams();
  return caseId ? <ReceiptVerificationWorkspace caseId={caseId} /> : null;
}
