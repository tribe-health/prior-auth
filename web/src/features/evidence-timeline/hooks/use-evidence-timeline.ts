import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { useLocalStore } from '../../../app/providers/graph-provider';
import { useSession } from '../../../app/providers/session-provider';
import { ApiError } from '../../../shared/api/http-client';
import type { EvidenceState } from '../../../shared/model/evidence-state';
import {
  claimRuntimeCommand,
  clearRuntimeCommand,
  getRuntimeCommand,
  markRuntimeCommandUncertain,
  subscribeRuntimeCommand,
  type RuntimeCommandScope,
} from '../../../shared/runtime-command-registry';
import type { ReassessEvidenceResult, TimelineEntry } from '../model/timeline-entry';
import { readTimeline, timelineApi } from '../api/timeline-api';

// What components import. It owns loading, error and intent-shaped operations;
// components render, they do not orchestrate.
//
// No query cache (ADR-001). The local store is kept current by Electric, so
// "is this stale?" is already answered one layer down.

export interface UseEvidenceTimeline {
  entries: readonly TimelineEntry[];
  loading: boolean;
  /** The store is not open yet. Distinct from `loading` — nothing was asked. */
  unavailable: boolean;
  /** Set when a read failed. The screen shows this rather than an empty list. */
  error: string | null;
  /** Present when a write was REFUSED — e.g. the caller lacks the capability. */
  refusal: string | null;
  /** Retained when a transport result is uncertain so lookup can reconcile it. */
  lastCommandId: string | null;
  /** True while one reassessment request owns the mutation slot. */
  submitting: boolean;
  reassess: (entryId: string, state: EvidenceState) => Promise<void>;
  lookupCommand: (entryId: string, commandId: string) => Promise<ReassessEvidenceResult>;
}

type TimelineView = Pick<
  UseEvidenceTimeline,
  'entries' | 'loading' | 'error' | 'refusal'
>;

interface EvidenceTimelineScope {
  practiceId?: string;
}

function initialView(caseId: string, practiceId: string | undefined, identityId: string) {
  return {
    scope: { caseId, practiceId, identityId },
    entries: [] as readonly TimelineEntry[],
    loading: true,
    error: null as string | null,
    refusal: null as string | null,
  };
}

export function useEvidenceTimeline(
  caseId: string,
  options?: EvidenceTimelineScope,
): UseEvidenceTimeline {
  const db = useLocalStore();
  const session = useSession();
  const practiceId = options?.practiceId ?? session?.practiceId;
  const identityId = session?.identityId ?? 'unverified-session';
  const commandScope = useMemo<RuntimeCommandScope>(() => ({
    feature: 'evidence-reassessment',
    identityId,
    practiceId,
    caseId,
  }), [caseId, identityId, practiceId]);
  const runtimeCommand = useSyncExternalStore(
    useCallback(
      (listener: () => void) => subscribeRuntimeCommand(commandScope, listener),
      [commandScope],
    ),
    useCallback(() => getRuntimeCommand(commandScope), [commandScope]),
    useCallback(() => getRuntimeCommand(commandScope), [commandScope]),
  );
  const [storedView, setView] = useState(() => initialView(caseId, practiceId, identityId));
  let view = storedView;
  if (
    view.scope.caseId !== caseId
    || view.scope.practiceId !== practiceId
    || view.scope.identityId !== identityId
  ) {
    // Clear the previous case before any new-case render can expose its rows,
    // refusal or uncertain command correlation.
    view = initialView(caseId, practiceId, identityId);
    setView(view);
  }
  const { scope, entries, loading, error, refusal } = view;
  const lastCommandId = runtimeCommand?.status === 'uncertain' ? runtimeCommand.id : null;
  const submitting = runtimeCommand?.status === 'submitting';
  const update = useCallback(
    (patch: Partial<TimelineView>) => {
      // Scope object identity also fences a late completion after A -> B -> A.
      setView((current) => (current.scope === scope ? { ...current, ...patch } : current));
    },
    [scope],
  );

  useEffect(() => {
    if (!db) return;

    let live = true;
    readTimeline(db, scope.caseId)
      .then((rows) => {
        if (!live) return;
        update({ entries: rows, error: null });
      })
      .catch((e: unknown) => {
        // An empty list and a failed read look identical on screen, and one of
        // them means "no evidence recorded" while the other means "we do not
        // know". Never let a failure render as the former.
        if (live) update({ error: e instanceof Error ? e.message : String(e) });
      })
      .finally(() => {
        if (live) update({ loading: false });
      });

    return () => {
      live = false;
    };
  }, [db, scope, update]);

  const reassess = useCallback(
    async (entryId: string, state: EvidenceState) => {
      const currentCommand = getRuntimeCommand(commandScope);
      if (currentCommand) {
        throw new Error(
          currentCommand.status === 'uncertain'
            ? 'The prior evidence reassessment outcome must be reconciled.'
            : 'An evidence reassessment is already pending.',
        );
      }
      const entry = entries.find((candidate) => candidate.id === entryId);
      if (!entry?.assessedAt) {
        throw new Error('The current evidence assessment revision is unavailable.');
      }
      const commandId = crypto.randomUUID();
      const claimed = claimRuntimeCommand(commandScope, {
        id: commandId,
        targetId: entryId,
        status: 'submitting',
      });
      if (!claimed) {
        throw new Error('An evidence reassessment is already pending.');
      }
      update({ refusal: null });
      try {
        await timelineApi.reassess(
          scope.caseId,
          entryId,
          commandId,
          state,
          entry.assessedAt,
          scope.practiceId,
        );
        clearRuntimeCommand(commandScope, commandId);
      } catch (e) {
        // A refusal is information the coordinator needs, not an exception to
        // swallow. It tells them who must act instead.
        if (e instanceof ApiError) {
          if (e.isCapabilityDenied || e.isPreconditionUnmet) {
            clearRuntimeCommand(commandScope, commandId);
            update({ refusal: e.message });
            return;
          }
          if (e.isCommitOutcomeUncertain) {
            markRuntimeCommandUncertain(commandScope, commandId);
          } else {
            clearRuntimeCommand(commandScope, commandId);
          }
        } else {
          markRuntimeCommandUncertain(commandScope, commandId);
        }
        if (e instanceof ApiError && (e.isCapabilityDenied || e.isPreconditionUnmet)) {
          return;
        }
        throw e;
      }
    },
    [commandScope, entries, scope, update],
  );

  const lookupCommand = useCallback(
    async (entryId: string, commandId: string) => {
      const receipt = await timelineApi.lookupCommand(
        scope.caseId,
        entryId,
        commandId,
        scope.practiceId,
      );
      const unresolved = getRuntimeCommand(commandScope);
      if (unresolved?.targetId === entryId) {
        clearRuntimeCommand(commandScope, commandId);
      }
      return receipt;
    },
    [commandScope, scope],
  );

  return {
    entries,
    loading,
    unavailable: db === null,
    error,
    refusal,
    lastCommandId,
    submitting,
    reassess,
    lookupCommand,
  };
}
