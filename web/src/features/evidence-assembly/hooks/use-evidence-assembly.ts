import { useCallback, useEffect, useState } from 'react';

import { useRequiredSession } from '@/app/providers/session-provider';
import { caseApi } from '@/features/case-queue/api/case-api';
import { criteriaSelectionApi } from '@/features/criteria-selection/api/criteria-selection-api';
import type { CriteriaSelectionSnapshot } from '@/features/criteria-selection/model/criteria-selection';
import { useDocumentStatuses } from '@/features/document-intake/hooks/use-document-statuses';
import { ApiError } from '@/shared/api/http-client';
import { evidenceAssemblyApi } from '../api/evidence-assembly-api';
import type { AssembleEvidenceMutation, EvidenceSnapshot } from '../model/evidence-assembly';

type View =
  | { readonly status: 'loading'; readonly selection: null; readonly evidence: null; readonly documentSetRevision: 0; readonly message: null }
  | { readonly status: 'error'; readonly selection: null; readonly evidence: null; readonly documentSetRevision: 0; readonly message: string }
  | { readonly status: 'ready' | 'saving'; readonly selection: CriteriaSelectionSnapshot; readonly evidence: EvidenceSnapshot; readonly documentSetRevision: number; readonly message: string | null };

function errorMessage(cause: unknown): string {
  if (!(cause instanceof ApiError)) return 'Evidence could not be loaded.';
  const messages: Record<string, string> = {
    criteria_unresolved: 'Select the governing policy before assembling evidence.',
    citation_incomplete: 'A met or not-met assessment needs an exact source document, page, and quote.',
    evidence_invalid: 'Each selected criterion must be classified as Met, Not met, or Not documented.',
    stale_revision: 'The documents or governing criteria changed. Review the current records and try again.',
    action_forbidden: 'You do not have permission to assemble evidence for this case.',
  };
  return messages[cause.code] ?? 'The evidence service is temporarily unavailable. Your committed work is unchanged.';
}

export function useEvidenceAssembly(caseId: string) {
  const session = useRequiredSession();
  const documents = useDocumentStatuses(caseId);
  const [view, setView] = useState<View>({ status: 'loading', selection: null, evidence: null, documentSetRevision: 0, message: null });

  const load = useCallback(async () => {
    setView({ status: 'loading', selection: null, evidence: null, documentSetRevision: 0, message: null });
    try {
      const [caseRecord, selection, evidence] = await Promise.all([
        caseApi.read(caseId, session.practiceId),
        criteriaSelectionApi.read(caseId, session.practiceId),
        evidenceAssemblyApi.read(caseId, session.practiceId),
      ]);
      setView({ status: 'ready', selection, evidence, documentSetRevision: caseRecord.documentSetRevision, message: null });
    } catch (cause) {
      setView({ status: 'error', selection: null, evidence: null, documentSetRevision: 0, message: errorMessage(cause) });
    }
  }, [caseId, session.practiceId]);

  useEffect(() => { void load(); }, [load]);

  const assemble = useCallback(async (evidenceInputs: AssembleEvidenceMutation['evidenceInputs']) => {
    if (view.status !== 'ready') return;
    const commandId = crypto.randomUUID();
    const mutation: AssembleEvidenceMutation = {
      commandId,
      expectedRevisions: {
        documentSetRevision: `${caseId}:documentSetRevision:r${view.documentSetRevision}`,
        criteriaSelectionRevision: view.selection.criteriaSelectionRevision,
        evidenceWorkRevision: view.evidence.evidenceWorkRevision,
      },
      evidenceInputs,
    };
    setView({ ...view, status: 'saving', message: null });
    try {
      await evidenceAssemblyApi.assemble(caseId, session.practiceId, mutation);
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.isCommitOutcomeUncertain) {
        try {
          await evidenceAssemblyApi.lookup(caseId, commandId, session.practiceId);
          await load();
          return;
        } catch {
          setView({ ...view, message: 'The result is unknown. Check the committed evidence before trying again.' });
          return;
        }
      }
      setView({ ...view, message: errorMessage(cause) });
    }
  }, [caseId, load, session.practiceId, view]);

  return { view, documents, assemble, reload: load } as const;
}
