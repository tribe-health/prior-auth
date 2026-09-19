import { useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router';

import { LetterWorkspace } from '@/features/letter-workflow/components/letter-workspace';

export function Component() {
  const { caseId } = useParams();
  const [search, setSearch] = useSearchParams();
  const letterId = search.get('letterId');

  const setLetterId = useCallback((id: string) => setSearch({ letterId: id }, { replace: true }), [setSearch]);
  if (!caseId) return null;
  return <LetterWorkspace caseId={caseId} letterId={letterId} onGenerated={setLetterId} />;
}
