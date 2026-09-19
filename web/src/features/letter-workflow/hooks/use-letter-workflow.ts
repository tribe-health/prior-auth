import { useCallback, useEffect, useRef, useState } from 'react';

import { useRequiredSession } from '@/app/providers/session-provider';
import { administeringEntityApi } from '@/features/administering-entity/api/administering-entity-api';
import { criteriaSelectionApi } from '@/features/criteria-selection/api/criteria-selection-api';
import { evidenceAssemblyApi } from '@/features/evidence-assembly/api/evidence-assembly-api';
import { gateApi } from '@/features/surgeon-gate/api/gate-api';
import { documentTaskApi } from '@/features/document-generation/api/document-task-api';
import { useDocumentGeneration } from '@/features/document-generation/hooks/use-document-generation';
import type { DocumentTaskArtifacts } from '@/features/document-generation/model/document-task';
import { ApiError } from '@/shared/api/http-client';
import { subscribeRuntimeCommandSessionClear } from '@/shared/runtime-command-registry';
import { letterWorkflowApi } from '../api/letter-workflow-api';
import type { LetterSnapshot } from '../model/letter-workflow';

type LetterPurpose = LetterSnapshot['purpose'];

type PendingAction = { readonly commandId: string; readonly operation: 'review' | 'approve'; readonly expectedLetterVersion: number; readonly expectedQaRevision: number };
const COMMAND_PREFIX = 'aso.letter-command.v1:';
const pendingCommands = new Map<string, PendingAction>();
const UNCERTAIN = 'The clinical action is not confirmed. Check the same request before starting another action.';
function readPending(key: string): PendingAction | null {
  const retained = pendingCommands.get(key);
  if (retained) return retained;
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const item = value as Record<string, unknown>;
    if (typeof item.commandId !== 'string' || !item.commandId || !['review', 'approve'].includes(item.operation as string)
      || !Number.isSafeInteger(item.expectedLetterVersion) || (item.expectedLetterVersion as number) < 1
      || !Number.isSafeInteger(item.expectedQaRevision) || (item.expectedQaRevision as number) < 0) return null;
    const pending: PendingAction = { commandId: item.commandId, operation: item.operation as PendingAction['operation'],
      expectedLetterVersion: item.expectedLetterVersion as number, expectedQaRevision: item.expectedQaRevision as number };
    pendingCommands.set(key, pending);
    return pending;
  } catch { return null; }
}
function retainPending(key: string, pending: PendingAction): void {
  pendingCommands.set(key, pending);
  try { sessionStorage.setItem(key, JSON.stringify(pending)); } catch { /* Retain the same command in memory when browser storage is unavailable. */ }
}
function clearPending(key: string, commandId: string): void {
  if (readPending(key)?.commandId !== commandId) return;
  pendingCommands.delete(key);
  try { sessionStorage.removeItem(key); } catch { /* No clinical payload is stored. */ }
}
subscribeRuntimeCommandSessionClear((sessionId, reason) => {
  if (reason === 'revalidation') return;
  const keys = new Set(pendingCommands.keys());
  try { for (const key of Object.keys(sessionStorage)) if (key.startsWith(COMMAND_PREFIX)) keys.add(key); } catch { /* Memory ownership still clears. */ }
  for (const key of keys) {
    try {
      if ((JSON.parse(key.slice(COMMAND_PREFIX.length)) as { sessionId?: string }).sessionId === sessionId) {
        pendingCommands.delete(key);
        sessionStorage.removeItem(key);
      }
    } catch { /* Ignore malformed pointers rather than trusting their scope. */ }
  }
});


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

export function useLetterWorkflow(
  caseId: string,
  letterId: string | null,
  onGenerated: (letterId: string) => void,
  purpose: LetterPurpose = 'prior_authorization_request',
) {
  const session = useRequiredSession();
  const generation = useDocumentGeneration(caseId, purpose);
  const commandScope = COMMAND_PREFIX + JSON.stringify({ identityId: session.identityId, sessionId: session.sessionId,
    authorizationRevision: session.authorizationRevision, practiceId: session.practiceId, caseId, letterId });
  const [pendingAction, setPendingAction] = useState<PendingAction['operation'] | null>(() => readPending(commandScope)?.operation ?? null);
  const inFlight = useRef<object | null>(null);
  const delivered = useRef<string | null>(null);
  const loadRevision = useRef(0);
  const [savedArtifacts, setSavedArtifacts] = useState<DocumentTaskArtifacts | null>(null);
  const [view, setView] = useState<View>({ phase: 'loading', letter: null, prerequisites: null, message: null });
  const load = useCallback(async () => {
    const revision = ++loadRevision.current;
    setSavedArtifacts(null);
    setPendingAction(readPending(commandScope)?.operation ?? null);
    setView((current) => ({ ...current, phase: 'loading', message: null }));
    try {
      if (letterId) {
        const [letter, artifacts] = await Promise.all([
          letterWorkflowApi.read(letterId, session.practiceId),
          documentTaskApi.letterArtifacts(letterId, caseId, session.practiceId),
        ]);
        if (revision !== loadRevision.current) return;
        if (artifacts && (artifacts.assembly.canonicalMarkdown !== letter.bodyMarkdown
          || artifacts.assembly.contentSha256.replace(/^sha256:/, '') !== letter.contentSha256Text.replace(/^sha256:/, ''))) {
          throw new Error('The saved assembly does not match the letter.');
        }
        setSavedArtifacts(artifacts);
        setView({ phase: 'ready', letter, prerequisites: null, message: readPending(commandScope) ? UNCERTAIN : null });
        return;
      }
      const [resolution, selection, evidence, gate] = await Promise.all([
        administeringEntityApi.read(caseId, session.practiceId),
        criteriaSelectionApi.read(caseId, session.practiceId),
        evidenceAssemblyApi.read(caseId, session.practiceId),
        gateApi.read(caseId, session.practiceId),
      ]);
      if (revision !== loadRevision.current) return;
      const resolutionRevision = `${caseId}:resolutionRevision:r${resolution.revision}`;
      if (selection.state !== 'current' || selection.resolutionRevision !== resolutionRevision) {
        setView({ phase: 'error', letter: null, prerequisites: null,
          message: 'The selected policy snapshot is stale. Resolve the coverage path from the case dashboard, then save the current policy snapshot in Policy panel and review the evidence before generating.' });
        return;
      }
      setView({ phase: 'ready', letter: null, prerequisites: {
        resolutionRevision: resolution.state === 'resolved' ? resolutionRevision : '',
        criteriaSelectionRevision: selection.criteriaSelectionRevision,
        evidenceRevision: evidence.evidenceRevision,
        gateComplete: purpose === 'corrected_resubmission' || gate.affirmed.length === 4,
      }, message: null });
    } catch (cause) {
      if (revision !== loadRevision.current) return;
      setView({ phase: 'error', letter: null, prerequisites: null, message: message(cause) });
    }
  }, [caseId, commandScope, letterId, purpose, session.practiceId]);
  useEffect(() => { void load(); return () => { loadRevision.current += 1; }; }, [load]);
  useEffect(() => subscribeRuntimeCommandSessionClear((sessionId) => {
    if (sessionId === session.sessionId) loadRevision.current += 1;
  }), [session.sessionId]);
  useEffect(() => {
    const receipt = generation.state.artifacts?.letter;
    if (!letterId && receipt && delivered.current !== receipt.letterId) {
      delivered.current = receipt.letterId;
      onGenerated(receipt.letterId);
    }
  }, [generation.state.artifacts, letterId, onGenerated]);

  const run = useCallback(async (operation: 'generate' | 'review' | 'approve') => {
    if (view.phase !== 'ready') return;
    if (operation === 'generate') {
      if (!view.prerequisites) return;
      await generation.start({ commandId: crypto.randomUUID(), purpose, expectedRevisions: {
        resolutionRevision: view.prerequisites.resolutionRevision,
        criteriaSelectionRevision: view.prerequisites.criteriaSelectionRevision,
        evidenceRevision: view.prerequisites.evidenceRevision,
      } });
      return;
    }
    if (!view.letter || inFlight.current) return;
    const token = {};
    inFlight.current = token;
    const revision = loadRevision.current;
    const current = () => revision === loadRevision.current;
    const retained = readPending(commandScope);
    const owner: PendingAction = retained ?? { commandId: crypto.randomUUID(), operation,
      expectedLetterVersion: view.letter.version, expectedQaRevision: view.letter.qaRevision };
    retainPending(commandScope, owner);
    setPendingAction(owner.operation);
    setView({ ...view, phase: 'working', message: null });
    const finish = async (receipt: Awaited<ReturnType<typeof letterWorkflowApi.lookup>>) => {
      if (!current()) return;
      if (receipt.commandId !== owner.commandId || receipt.caseId !== caseId || receipt.letterId !== view.letter?.id) {
        throw new Error('The clinical receipt does not match this request.');
      }
      clearPending(commandScope, owner.commandId);
      setPendingAction(null);
      await load();
    };
    try {
      if (retained) {
        try {
          const receipt = await letterWorkflowApi.lookup(caseId, owner.commandId, session.practiceId);
          await finish(receipt);
          return;
        } catch (cause) {
          if (!current()) return;
          // A confirmed absence permits retrying the SAME UUID and captured
          // payload. An unavailable lookup never creates another command.
          if (!(cause instanceof ApiError) || cause.status !== 404) {
            setView({ ...view, phase: 'ready', message: UNCERTAIN });
            return;
          }
        }
      }
      if (!current()) return;
      const receipt = owner.operation === 'review'
        ? await letterWorkflowApi.review(view.letter.id, session.practiceId, { commandId: owner.commandId, expectedLetterVersion: owner.expectedLetterVersion })
        : await letterWorkflowApi.approve(view.letter.id, session.practiceId, { commandId: owner.commandId,
          expectedLetterVersion: owner.expectedLetterVersion, expectedQaRevision: owner.expectedQaRevision });
      await finish(receipt);
    } catch (cause) {
      if (!current()) return;
      if (!retained && cause instanceof ApiError && !cause.isCommitOutcomeUncertain) {
        clearPending(commandScope, owner.commandId);
        setPendingAction(null);
        setView({ ...view, phase: 'ready', message: message(cause) });
      } else {
        try {
          const receipt = await letterWorkflowApi.lookup(caseId, owner.commandId, session.practiceId);
          await finish(receipt);
        } catch {
          if (current()) setView({ ...view, phase: 'ready', message: UNCERTAIN });
        }
      }
    } finally { if (inFlight.current === token) inFlight.current = null; }
  }, [caseId, commandScope, generation, load, purpose, session.practiceId, view]);
  return { view, generation, savedArtifacts, pendingAction, checkPending: () => run(pendingAction ?? 'review'), generate: () => run('generate'), review: () => run('review'), approve: () => run('approve'), reload: load,
    newRequest: () => { if (generation.reset()) void load(); },
  } as const;
}
