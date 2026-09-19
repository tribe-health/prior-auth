import { useEffect, useState } from 'react';

import { useRequiredSession } from '@/app/providers/session-provider';
import { caseApi } from '@/features/case-queue/api/case-api';
import { criteriaSelectionApi } from '@/features/criteria-selection/api/criteria-selection-api';
import type { GateReviewContext } from '../model/gate-state';

type View = {
  readonly context: GateReviewContext | null;
  readonly loading: boolean;
  readonly error: string | null;
};

export function useGateReviewContext(caseId: string): View {
  const session = useRequiredSession();
  const [view, setView] = useState<View>({ context: null, loading: true, error: null });

  useEffect(() => {
    let live = true;
    Promise.all([
      criteriaSelectionApi.read(caseId, session.practiceId),
      caseApi.read(caseId, session.practiceId),
    ]).then(([selection, caseRecord]) => {
      if (!live) return;
      const sections = [...new Set(selection.criteria.map((criterion) => criterion.section).filter(Boolean))];
      const procedureFamilies = [...new Set(selection.criteria.map((criterion) => criterion.procedureFamily).filter(Boolean))];
      const recordedPlan = typeof caseRecord.data.operativePlan === 'string'
        ? caseRecord.data.operativePlan.trim()
        : '';
      const selectionSource = `Criteria selection ${selection.criteriaSelectionRevision}`;
      const caseSource = `Case input revision ${caseRecord.caseInputRevision}`;
      setView({
        loading: false,
        error: null,
        context: {
          policy: {
            value: `${selection.policy.name} — ${selection.policy.policyNumber}, version ${selection.policy.version}; effective ${selection.policy.effectiveFrom}`,
            source: selectionSource,
          },
          section: {
            value: sections.length > 0 ? sections.map((section) => `Section ${section}`).join(', ') : null,
            source: selectionSource,
          },
          pathway: {
            value: procedureFamilies.length > 0
              ? procedureFamilies.join(', ')
              : caseRecord.procedureCode ? `Procedure ${caseRecord.procedureCode}` : null,
            source: procedureFamilies.length > 0 ? selectionSource : caseSource,
          },
          plan: {
            value: recordedPlan || (caseRecord.procedureCode ? `Procedure ${caseRecord.procedureCode}` : null),
            source: caseSource,
          },
        },
      });
    }).catch((cause: unknown) => {
      if (live) setView({ context: null, loading: false, error: cause instanceof Error ? cause.message : String(cause) });
    });
    return () => { live = false; };
  }, [caseId, session.practiceId]);

  return view;
}
