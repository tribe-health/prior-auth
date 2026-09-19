import { useParams } from 'react-router';
import { SubmissionPacketWorkspace } from '@/features/submission-workflow/components/submission-workspace';

export function Component() {
  const { caseId } = useParams();
  return caseId ? <SubmissionPacketWorkspace caseId={caseId} /> : null;
}
