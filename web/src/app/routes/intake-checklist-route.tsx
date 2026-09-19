import { useParams, useSearchParams } from 'react-router';

import { CaseIntake } from '@/features/case-queue/components/case-intake';
import { isResolutionInputField } from '@/features/case-queue/model/case-command';

export function Component() {
  const { caseId } = useParams();
  const [searchParams] = useSearchParams();
  if (!caseId) return null;
  const requestedFocus = searchParams.get('focus');
  return (
    <CaseIntake
      caseId={caseId}
      focusField={isResolutionInputField(requestedFocus) ? requestedFocus : null}
      focusFirstMissingResolutionInput={requestedFocus === 'resolution'}
      showInputsIncompleteNotice={searchParams.get('notice') === 'case_inputs_incomplete'}
    />
  );
}
