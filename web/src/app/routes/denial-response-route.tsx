import { useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router';

import { DenialResponseWorkspace } from '@/features/denial-response/components/denial-response-workspace';

export function Component() {
  const { caseId } = useParams();
  const [search, setSearch] = useSearchParams();
  const setLetterId = useCallback((letterId: string) => setSearch({ letterId }, { replace: true }), [setSearch]);
  if (!caseId) return null;
  return <DenialResponseWorkspace caseId={caseId} letterId={search.get('letterId')} onGenerated={setLetterId} />;
}
