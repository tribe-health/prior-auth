import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { useRequiredSession, useSessionEpoch } from '../../../app/providers/session-provider';
import { ApiError } from '../../../shared/api/http-client';
import type { EvidenceState } from '../../../shared/model/evidence-state';
import { type ViewScope } from '../../../shared/scoped-view-store';
import { useScopedViewStore } from '../../../shared/use-scoped-view-store';
import {
  claimRuntimeCommand,
  clearRuntimeCommand,
  getRuntimeCommand,
  markRuntimeCommandAwaitingProjection,
  markRuntimeCommandUncertain,
  subscribeRuntimeCommand,
  type RuntimeCommandScope,
} from '../../../shared/runtime-command-registry';
import type { ReassessEvidenceResult, TimelineEntry } from '../model/timeline-entry';
import { timelineApi } from '../api/timeline-api';
import { useEvidenceTimelineProjection } from './use-evidence-timeline-projection';

// What components import. It owns loading, error and intent-shaped operations;
// components render, they do not orchestrate.
//
// No query cache (ADR-001). Electric commits into the PEM graph, so freshness
// is owned one layer down and every render joins the same normalized records.

export interface UseEvidenceTimeline {
  entries: readonly TimelineEntry[];
  loading: boolean;
  /** The store is not open yet. Distinct from `loading` — nothing was asked. */
  unavailable: boolean;
  /** Set when a read failed. The screen shows this rather than an empty list. */
  error: string | null;
  /** Present when a write was REFUSED — e.g. the caller lacks the capability. */
  refusal: string | null;
  /** Retained until an uncertain or accepted command is reconciled with its projection. */
  lastCommandId: string | null;
  lastCommandEntryId: string | null;
  commandOutcome: CommandOutcome;
  commandMessage: string | null;
  awaitingProjection: boolean;
  /** True while one reassessment request owns the mutation slot. */
  submitting: boolean;
  reassess: (entryId: string, state: EvidenceState) => Promise<void>;
  lookupCommand: (entryId: string, commandId: string) => Promise<ReassessEvidenceResult>;
}

type CommandOutcome =
  | 'idle'
  | 'refused'
  | 'conflict'
  | 'uncertain'
  | 'awaiting-projection'
  | 'confirmed';

type TimelineView = Pick<
  UseEvidenceTimeline,
  'refusal' | 'commandOutcome' | 'commandMessage'
>;

function initialView(): TimelineView {
  return {
    refusal: null as string | null,
    commandOutcome: 'idle',
    commandMessage: null as string | null,
  };
}

export function useEvidenceTimeline(caseId: string): UseEvidenceTimeline {
  const session = useRequiredSession();
  const epoch = useSessionEpoch();
  const practiceId = session.practiceId;
  const identityId = session.identityId;
  const viewInstanceId = useRef(crypto.randomUUID()).current;
  const viewScope = useMemo<ViewScope>(() => ({
    identityId,
    sessionId: session.sessionId,
    practiceId,
    authorizationRevision: session.authorizationRevision,
    epoch,
    caseId,
    viewInstanceId,
  }), [caseId, epoch, identityId, practiceId, session.authorizationRevision, session.sessionId, viewInstanceId]);
  const commandScope = useMemo<RuntimeCommandScope>(() => ({
    feature: 'evidence-reassessment',
    sessionId: session.sessionId,
    authorizationRevision: session.authorizationRevision,
    epoch,
    identityId,
    practiceId,
    caseId,
  }), [caseId, epoch, identityId, practiceId, session.authorizationRevision, session.sessionId]);
  const runtimeCommand = useSyncExternalStore(
    useCallback(
      (listener: () => void) => subscribeRuntimeCommand(commandScope, listener),
      [commandScope],
    ),
    useCallback(() => getRuntimeCommand(commandScope), [commandScope]),
    useCallback(() => getRuntimeCommand(commandScope), [commandScope]),
  );
  const [view, lease] = useScopedViewStore(viewScope, initialView);
  const { refusal, commandOutcome, commandMessage } = view;
  const scope = lease.scope;
  const projection = useEvidenceTimelineProjection(scope.caseId, practiceId);
  const entries = projection.entries;
  const lastCommandId = runtimeCommand?.status === 'submitting' ? null : runtimeCommand?.id ?? null;
  const lastCommandEntryId = runtimeCommand?.status === 'submitting'
    ? null
    : runtimeCommand?.targetId ?? null;
  const submitting = runtimeCommand?.status === 'submitting';
  const awaitingProjection = runtimeCommand?.status === 'awaiting-projection';
  const update = useCallback(
    (patch: Partial<TimelineView>) => {
      lease.publish((current) => ({ ...current, ...patch }));
    },
    [lease],
  );

  useEffect(() => {
    if (runtimeCommand?.status !== 'awaiting-projection') return;
    const expected = runtimeCommand.expectedProjection;
    const projected = entries.find((candidate) => candidate.id === runtimeCommand.targetId);
    if (!expected || typeof expected.state !== 'string' || typeof expected.revision !== 'string' || !projected) return;
    if (projected.state === expected.state && projected.assessedAt === expected.revision) {
      clearRuntimeCommand(commandScope, runtimeCommand.id);
      update({
        commandOutcome: 'confirmed',
        commandMessage: 'Evidence assessment confirmed.',
      });
      return;
    }
    if (
      projected.assessedAt !== null
      && Date.parse(projected.assessedAt) > Date.parse(expected.revision)
    ) {
      clearRuntimeCommand(commandScope, runtimeCommand.id);
      update({
        commandOutcome: 'conflict',
        commandMessage: 'The evidence changed again after this assessment was accepted. Review the current record.',
      });
    }
  }, [commandScope, entries, runtimeCommand, update]);

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
      update({ refusal: null, commandOutcome: 'idle', commandMessage: null });
      try {
        const receipt = await timelineApi.reassess(
          scope.caseId,
          entryId,
          commandId,
          state,
          entry.assessedAt,
          practiceId,
          scope.epoch,
        );
        markRuntimeCommandAwaitingProjection(commandScope, commandId, {
          state: receipt.state,
          revision: receipt.assessedAt,
        });
        update({
          commandOutcome: 'awaiting-projection',
          commandMessage: 'Assessment accepted. Waiting for the evidence record to update.',
        });
      } catch (e) {
        // A refusal is information the coordinator needs, not an exception to
        // swallow. It tells them who must act instead.
        if (e instanceof ApiError) {
          if (e.isCapabilityDenied || e.isPreconditionUnmet) {
            clearRuntimeCommand(commandScope, commandId);
            update({
              refusal: e.message,
              commandOutcome: e.isCapabilityDenied ? 'refused' : 'conflict',
              commandMessage: e.message,
            });
            return;
          }
          if (e.isCommitOutcomeUncertain) {
            markRuntimeCommandUncertain(commandScope, commandId);
            update({
              commandOutcome: 'uncertain',
              commandMessage: 'The assessment result is unknown. Check the command before trying again.',
            });
          } else {
            clearRuntimeCommand(commandScope, commandId);
          }
        } else {
          markRuntimeCommandUncertain(commandScope, commandId);
          update({
            commandOutcome: 'uncertain',
            commandMessage: 'The assessment result is unknown. Check the command before trying again.',
          });
        }
        if (e instanceof ApiError && (e.isCapabilityDenied || e.isPreconditionUnmet)) {
          return;
        }
        throw e;
      }
    },
    [commandScope, entries, practiceId, scope, update],
  );

  const lookupCommand = useCallback(
    async (entryId: string, commandId: string) => {
      try {
        const receipt = await timelineApi.lookupCommand(
          scope.caseId,
          entryId,
          commandId,
          practiceId,
          scope.epoch,
        );
        markRuntimeCommandAwaitingProjection(commandScope, commandId, {
          state: receipt.state,
          revision: receipt.assessedAt,
        });
        update({
          commandOutcome: 'awaiting-projection',
          commandMessage: 'The prior command completed. Waiting for the evidence record to update.',
        });
        return receipt;
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 404) {
          clearRuntimeCommand(commandScope, commandId);
          update({
            commandOutcome: 'conflict',
            commandMessage: 'The prior assessment did not complete. Review the current evidence record.',
          });
        } else {
          update({ commandMessage: cause instanceof Error ? cause.message : String(cause) });
        }
        throw cause;
      }
    },
    [commandScope, practiceId, scope, update],
  );

  return {
    entries,
    loading: projection.status === 'pending',
    unavailable: false,
    error: projection.error,
    refusal,
    lastCommandId,
    lastCommandEntryId,
    commandOutcome,
    commandMessage,
    awaitingProjection,
    submitting,
    reassess,
    lookupCommand,
  };
}
