import { useCallback, useEffect, useState } from 'react';

import { useRequiredSession } from '@/app/providers/session-provider';
import { administeringEntityApi } from '@/features/administering-entity/api/administering-entity-api';
import { criteriaSelectionApi } from '@/features/criteria-selection/api/criteria-selection-api';
import { evidenceAssemblyApi } from '@/features/evidence-assembly/api/evidence-assembly-api';
import { gateApi } from '@/features/surgeon-gate/api/gate-api';
import { ApiError } from '@/shared/api/http-client';
import { letterWorkflowApi } from '../api/letter-workflow-api';
import type { LetterSnapshot } from '../model/letter-workflow';

type Prerequisites = { readonly resolutionRevision: string; readonly criteriaSelectionRevision: string; readonly evidenceRevision: string; readonly gateComplete: boolean };
type View = { readonly phase: 'loading' | 'ready' | 'working' | 'error'; readonly letter: LetterSnapshot | null; readonly prerequisites: Prerequisites | null; readonly message: string | null };

function message(cause: unknown): string {
  if (!(cause instanceof ApiError)) return 'The letter workspace could not be loaded.';
  const copy: Record<string, string> = {
    gate_stale: 'The surgeon must complete all four confirmations before generating the letter.',
    evidence_work_incomplete: 'Complete every required evidence item before generating the letter.',
    citation_incomplete: 'This assertion has no source document. It will not be included.',
    qa_incomplete: 'Complete the blocking letter checks before approval or signing.',
    stale_revision: 'The case changed. Review the current evidence before continuing.',
    action_forbidden: 'You do not have permission to perform this action.',
  };
  return copy[cause.code] ?? 'The letter service is temporarily unavailable. Your committed work is unchanged.';
}

export function useLetterWorkflow(caseId: string, letterId: string | null, onGenerated: (letterId: string) => void) {
  const session = useRequiredSession();
  const [view, setView] = useState<View>({ phase: 'loading', letter: null, prerequisites: null, message: null });
  const load = useCallback(async () => {
    setView((current) => ({ ...current, phase: 'loading', message: null }));
    try {
      if (letterId) {
        const letter = await letterWorkflowApi.read(letterId, session.practiceId);
        setView({ phase: 'ready', letter, prerequisites: null, message: null });
        return;
      }
      const [resolution, selection, evidence, gate] = await Promise.all([
        administeringEntityApi.read(caseId, session.practiceId),
        criteriaSelectionApi.read(caseId, session.practiceId),
        evidenceAssemblyApi.read(caseId, session.practiceId),
        gateApi.read(caseId, session.practiceId),
      ]);
      setView({ phase: 'ready', letter: null, prerequisites: {
        resolutionRevision: `${caseId}:resolutionRevision:r${resolution.revision}`,
        criteriaSelectionRevision: selection.criteriaSelectionRevision,
        evidenceRevision: evidence.evidenceRevision,
        gateComplete: gate.affirmed.length === 4,
      }, message: null });
    } catch (cause) {
      setView({ phase: 'error', letter: null, prerequisites: null, message: message(cause) });
    }
  }, [caseId, letterId, session.practiceId]);
  useEffect(() => { void load(); }, [load]);

  const run = useCallback(async (operation: 'generate' | 'review' | 'approve') => {
    if (view.phase !== 'ready') return;
    const commandId = crypto.randomUUID();
    setView({ ...view, phase: 'working', message: null });
    try {
      if (operation === 'generate') {
        if (!view.prerequisites) return;
        const receipt = await letterWorkflowApi.generate(caseId, session.practiceId, {
          commandId,
          expectedRevisions: {
            resolutionRevision: view.prerequisites.resolutionRevision,
            criteriaSelectionRevision: view.prerequisites.criteriaSelectionRevision,
            evidenceRevision: view.prerequisites.evidenceRevision,
          },
          purpose: 'prior_authorization_request',
        });
        onGenerated(receipt.letterId);
        return;
      }
      if (!view.letter) return;
      if (operation === 'review') {
        await letterWorkflowApi.review(view.letter.id, session.practiceId, { commandId, expectedLetterVersion: view.letter.version });
      } else {
        await letterWorkflowApi.approve(view.letter.id, session.practiceId, { commandId, expectedLetterVersion: view.letter.version, expectedQaRevision: view.letter.qaRevision });
      }
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.isCommitOutcomeUncertain) {
        try {
          const receipt = await letterWorkflowApi.lookup(caseId, commandId, session.practiceId);
          if (operation === 'generate') onGenerated(receipt.letterId); else await load();
          return;
        } catch { /* retain explicit uncertainty below */ }
      }
      setView({ ...view, phase: 'ready', message: message(cause) });
    }
  }, [caseId, load, onGenerated, session.practiceId, view]);
  return { view, generate: () => run('generate'), review: () => run('review'), approve: () => run('approve'), reload: load } as const;
}
