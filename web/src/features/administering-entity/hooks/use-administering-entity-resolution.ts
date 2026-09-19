import { useCallback, useEffect, useId, useMemo } from 'react';

import { useRequiredSession, useSessionEpoch } from '@/app/providers/session-provider';
import { caseApi } from '@/features/case-queue/api/case-api';
import { CASE_INPUTS_INCOMPLETE_MESSAGE } from '@/features/case-queue/model/case-command';
import { ApiError } from '@/shared/api/http-client';
import { viewScope } from '@/shared/scoped-view-store';
import { useScopedViewStore } from '@/shared/use-scoped-view-store';
import { administeringEntityApi } from '../api/administering-entity-api';
import type { AdministeringEntityResolution } from '../model/administering-entity';
import {
  pendingResolutionCommandKey,
  pendingResolutionCommands,
  type PendingResolutionCommand,
} from '../stores/pending-resolution-command-store';

export type ResolutionViewStatus =
  | 'loading'
  | 'unresolved'
  | 'resolving'
  | 'ready'
  | 'uncertain'
  | 'error';

export interface ResolutionView {
  readonly status: ResolutionViewStatus;
  readonly resolution: AdministeringEntityResolution | null;
  readonly message: string | null;
  readonly pendingCommandId: string | null;
}

class TerminalPendingCommandError extends Error {}

export function resolutionBlocksDownstream(view: ResolutionView): boolean {
  return view.status !== 'ready' || view.resolution?.state !== 'resolved';
}

function errorMessage(cause: unknown): string {
  if (cause instanceof ApiError && cause.code === 'case_inputs_incomplete') {
    return CASE_INPUTS_INCOMPLETE_MESSAGE;
  }
  if (cause instanceof ApiError && cause.code === 'stale_revision') {
    return 'Case inputs changed. Reload the case and resolve coverage again.';
  }
  if (cause instanceof ApiError && cause.isCapabilityDenied) {
    return 'You do not have permission to resolve the coverage path.';
  }
  return cause instanceof Error ? cause.message : String(cause);
}

function isTerminalPendingCommandError(cause: unknown): boolean {
  return cause instanceof TerminalPendingCommandError
    || (cause instanceof ApiError
      && (cause.code === 'stale_revision' || cause.code === 'case_inputs_incomplete'));
}

interface ResolutionOptions {
  readonly onInputsIncomplete?: () => void;
}

export function useAdministeringEntityResolution(
  caseId: string,
  options: ResolutionOptions = {},
) {
  const { onInputsIncomplete } = options;
  const session = useRequiredSession();
  const epoch = useSessionEpoch();
  const viewInstanceId = useId();
  const pendingStorageKey = useMemo(
    () => pendingResolutionCommandKey(session, epoch, caseId),
    [caseId, epoch, session],
  );
  const scope = useMemo(
    () => viewScope(session, epoch, caseId, viewInstanceId),
    [caseId, epoch, session, viewInstanceId],
  );
  const [view, lease] = useScopedViewStore<ResolutionView>(scope, () => ({
    status: 'loading',
    resolution: null,
    message: null,
    pendingCommandId: pendingResolutionCommands.read(pendingStorageKey)?.commandId ?? null,
  }));

  const recoverPending = useCallback(async (pending: PendingResolutionCommand) => {
    try {
      return await lease.execute((captured) => administeringEntityApi.lookup(
        captured.caseId,
        pending.commandId,
        captured.practiceId,
      ));
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.status === 404)) throw cause;
      if (pending.expectedCaseInputRevision == null) {
        throw new TerminalPendingCommandError(
          'The prior command was not saved. Resolve the coverage path again.',
        );
      }
      return lease.execute((captured) => administeringEntityApi.resolve(
        captured.caseId,
        captured.practiceId,
        {
          commandId: pending.commandId,
          expectedCaseInputRevision: pending.expectedCaseInputRevision!,
        },
      ));
    }
  }, [lease]);

  const load = useCallback(async () => {
    lease.publish((current) => ({ ...current, status: 'loading', message: null }));
    const pending = pendingResolutionCommands.read(pendingStorageKey);
    let terminalMessage: string | null = null;
    if (pending) {
      try {
        const recovered = await recoverPending(pending);
        if (recovered.status !== 'current') return;
      } catch (cause) {
        if (isTerminalPendingCommandError(cause)) {
          pendingResolutionCommands.clear(pendingStorageKey);
          terminalMessage = errorMessage(cause);
          if (cause instanceof ApiError && cause.code === 'case_inputs_incomplete') {
            onInputsIncomplete?.();
          }
        } else {
        lease.publish((current) => ({
          ...current,
          status: 'uncertain',
          message: 'A prior resolution command needs to be checked before trying again.',
          pendingCommandId: pending.commandId,
        }));
        return;
        }
      }
    }
    try {
      const result = await lease.execute((captured) =>
        administeringEntityApi.read(captured.caseId, captured.practiceId));
      if (result.status === 'current') {
        pendingResolutionCommands.clear(pendingStorageKey);
        lease.publish(() => ({
          status: 'ready',
          resolution: result.value,
          message: terminalMessage,
          pendingCommandId: null,
        }));
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        if (pending) pendingResolutionCommands.clear(pendingStorageKey);
        lease.publish(() => ({
          status: 'unresolved',
          resolution: null,
          message: terminalMessage,
          pendingCommandId: null,
        }));
      } else {
        lease.publish((current) => ({
          ...current,
          status: 'error',
          message: errorMessage(cause),
        }));
      }
    }
  }, [lease, onInputsIncomplete, pendingStorageKey, recoverPending]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshCommitted = useCallback(async () => {
    try {
      const result = await lease.execute((captured) =>
        administeringEntityApi.read(captured.caseId, captured.practiceId));
      if (result.status === 'current') {
        pendingResolutionCommands.clear(pendingStorageKey);
        lease.publish(() => ({
          status: 'ready',
          resolution: result.value,
          message: null,
          pendingCommandId: null,
        }));
      }
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.status === 404)) throw cause;
      pendingResolutionCommands.clear(pendingStorageKey);
      lease.publish(() => ({
        status: 'unresolved',
        resolution: null,
        message: 'The saved coverage path was invalidated. Resolve it again.',
        pendingCommandId: null,
      }));
    }
  }, [lease, pendingStorageKey]);

  const resolve = useCallback(async () => {
    const commandId = crypto.randomUUID();
    lease.publish((current) => ({
      ...current,
      status: 'resolving',
      message: null,
      pendingCommandId: commandId,
    }));
    let detail;
    try {
      detail = await lease.execute((captured) =>
        caseApi.read(captured.caseId, captured.practiceId));
    } catch (cause) {
      lease.publish((current) => ({
        ...current,
        status: 'error',
        message: errorMessage(cause),
        pendingCommandId: null,
      }));
      return null;
    }
    if (detail.status !== 'current') return null;
    try {
      pendingResolutionCommands.retain(pendingStorageKey, {
        commandId,
        expectedCaseInputRevision: detail.value.caseInputRevision,
      });
      const receipt = await lease.execute((captured) => administeringEntityApi.resolve(
        captured.caseId,
        captured.practiceId,
        { commandId, expectedCaseInputRevision: detail.value.caseInputRevision },
      ));
      if (receipt.status !== 'current') return null;
      try {
        await refreshCommitted();
      } catch (cause) {
        pendingResolutionCommands.retain(pendingStorageKey, {
          commandId: receipt.value.commandId,
          expectedCaseInputRevision: detail.value.caseInputRevision,
        });
        lease.publish((current) => ({
          ...current,
          status: 'uncertain',
          message: `The resolution was saved, but the committed state could not be reloaded. ${errorMessage(cause)}`,
          pendingCommandId: receipt.value.commandId,
        }));
      }
      return receipt.value;
    } catch (cause) {
      if (cause instanceof ApiError && cause.isCommitOutcomeUncertain) {
        lease.publish((current) => ({
          ...current,
          status: 'uncertain',
          message: 'The result is unknown. Check the saved command before trying again.',
          pendingCommandId: commandId,
        }));
        return null;
      }
      lease.publish((current) => ({
        ...current,
        status: 'error',
        message: errorMessage(cause),
        pendingCommandId: null,
      }));
      if (cause instanceof ApiError && cause.code === 'case_inputs_incomplete') {
        onInputsIncomplete?.();
      }
      pendingResolutionCommands.clear(pendingStorageKey);
      return null;
    }
  }, [lease, onInputsIncomplete, pendingStorageKey, refreshCommitted]);

  const reconcile = useCallback(async () => {
    const pending = pendingResolutionCommands.read(pendingStorageKey);
    if (!pending || pending.commandId !== view.pendingCommandId) return null;
    try {
      const result = await recoverPending(pending);
      if (result.status !== 'current') return null;
      await refreshCommitted();
      return result.value;
    } catch (cause) {
      if (isTerminalPendingCommandError(cause)) {
        pendingResolutionCommands.clear(pendingStorageKey);
        await load();
        lease.publish((current) => (
          current.status === 'ready' || current.status === 'unresolved'
            ? { ...current, message: errorMessage(cause) }
            : current
        ));
        if (cause instanceof ApiError && cause.code === 'case_inputs_incomplete') {
          onInputsIncomplete?.();
        }
        return null;
      }
      lease.publish((current) => ({ ...current, message: errorMessage(cause) }));
      return null;
    }
  }, [load, onInputsIncomplete, pendingStorageKey, recoverPending, refreshCommitted, view.pendingCommandId]);

  return {
    view,
    blocked: resolutionBlocksDownstream(view),
    resolve,
    reconcile,
    reload: load,
  } as const;
}
