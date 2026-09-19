import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { useRequiredSession, useSessionEpoch } from '@/app/providers/session-provider';
import { ApiError } from '@/shared/api/http-client';
import {
  claimRuntimeCommand,
  clearRuntimeCommand,
  getRuntimeCommand,
  markRuntimeCommandAwaitingProjection,
  markRuntimeCommandUncertain,
  subscribeRuntimeCommand,
  type RuntimeCommandScope,
} from '@/shared/runtime-command-registry';
import { viewScope } from '@/shared/scoped-view-store';
import { useScopedViewStore } from '@/shared/use-scoped-view-store';
import { signingApi } from '../api/signing-api';
import type { SignLetterResult, SigningTarget } from '../model/signing';

type SigningOutcome =
  | 'idle'
  | 'refused'
  | 'conflict'
  | 'uncertain'
  | 'awaiting-projection'
  | 'confirmed';

interface SigningView {
  readonly target: SigningTarget | null;
  readonly acceptedReceipt: SignLetterResult | null;
  readonly result: SignLetterResult | null;
  readonly loading: boolean;
  readonly message: string | null;
  readonly outcome: SigningOutcome;
}

function initialView(): SigningView {
  return {
    target: null,
    acceptedReceipt: null,
    result: null,
    loading: true,
    message: null,
    outcome: 'idle',
  };
}

export function useLetterSigning(letterId: string) {
  const session = useRequiredSession();
  const epoch = useSessionEpoch();
  const viewInstanceId = useRef(crypto.randomUUID()).current;
  const scope = useMemo(
    () => viewScope(session, epoch, `letter:${letterId}`, viewInstanceId),
    [epoch, letterId, session, viewInstanceId],
  );
  const [view, lease] = useScopedViewStore(scope, initialView);
  const { target, acceptedReceipt, result, loading, message, outcome } = view;
  const update = useCallback((patch: Partial<SigningView>) => {
    lease.publish((current) => ({ ...current, ...patch }));
  }, [lease]);
  const commandScope = useMemo<RuntimeCommandScope>(() => ({
    feature: 'letter-signing',
    sessionId: session.sessionId,
    authorizationRevision: session.authorizationRevision,
    epoch,
    identityId: session.identityId,
    practiceId: session.practiceId,
    caseId: `letter:${letterId}`,
  }), [epoch, letterId, session]);
  const command = useSyncExternalStore(
    useCallback((listener: () => void) => subscribeRuntimeCommand(commandScope, listener), [commandScope]),
    useCallback(() => getRuntimeCommand(commandScope), [commandScope]),
    useCallback(() => getRuntimeCommand(commandScope), [commandScope]),
  );

  const refresh = useCallback(async (options?: { preserveMessage?: boolean }) => {
    update({ loading: true });
    try {
      const nextTarget = await signingApi.readTarget(letterId, session.practiceId, epoch);
      update({
        target: nextTarget,
        ...(!options?.preserveMessage && { message: null }),
      });
    } catch (error) {
      if (!options?.preserveMessage) {
        update({ message: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      update({ loading: false });
    }
  }, [epoch, letterId, session.practiceId, update]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const confirmProjection = useCallback(async (receipt: SignLetterResult) => {
    try {
      const projection = await signingApi.readTarget(letterId, session.practiceId, epoch);
      update({ target: projection });
      const confirmed = projection.letterId === receipt.letterId
        && projection.caseId === receipt.caseId
        && projection.letterVersion === receipt.letterVersion
        && projection.signatureVersion === receipt.signatureVersion
        && projection.status === 'signed';
      if (!confirmed) {
        update({
          outcome: 'awaiting-projection',
          message: 'Signing was accepted. Waiting for the signed letter to appear.',
        });
        return false;
      }
      clearRuntimeCommand(commandScope, receipt.commandId);
      update({
        acceptedReceipt: null,
        result: receipt,
        outcome: 'confirmed',
        message: 'Letter signing confirmed.',
      });
      return true;
    } catch (error) {
      update({
        outcome: 'awaiting-projection',
        message: error instanceof Error
          ? `Signing was accepted. The signed letter could not be confirmed: ${error.message}`
          : 'Signing was accepted. The signed letter could not be confirmed.',
      });
      return false;
    }
  }, [commandScope, epoch, letterId, session.practiceId, update]);

  const sign = useCallback(async () => {
    if (!target || target.signatureVersion === null) return;
    if (getRuntimeCommand(commandScope)) return;
    const commandId = crypto.randomUUID();
    if (!claimRuntimeCommand(commandScope, { id: commandId, status: 'submitting' })) return;
    update({ message: null, outcome: 'idle', acceptedReceipt: null, result: null });
    try {
      const receipt = await signingApi.sign(
        letterId,
        commandId,
        target,
        session.practiceId,
        epoch,
      );
      markRuntimeCommandAwaitingProjection(commandScope, commandId, {
        state: 'signed',
        revision: `${receipt.letterVersion}:${receipt.signatureVersion}`,
      });
      update({
        acceptedReceipt: receipt,
        outcome: 'awaiting-projection',
        message: 'Signing was accepted. Waiting for the signed letter to appear.',
      });
      await confirmProjection(receipt);
    } catch (error) {
      if (error instanceof ApiError && !error.isCommitOutcomeUncertain) {
        clearRuntimeCommand(commandScope, commandId);
        update({
          outcome: error.isCapabilityDenied ? 'refused' : 'conflict',
          message: error.message,
        });
        await refresh({ preserveMessage: true });
        return;
      }
      markRuntimeCommandUncertain(commandScope, commandId);
      update({
        outcome: 'uncertain',
        message: 'The signing result is unknown. Check the command before trying again.',
      });
    }
  }, [commandScope, confirmProjection, epoch, letterId, refresh, session.practiceId, target, update]);

  const reconcile = useCallback(async () => {
    if (!command) return;
    try {
      const receipt = await signingApi.lookup(
        letterId,
        command.id,
        session.practiceId,
        epoch,
      );
      markRuntimeCommandAwaitingProjection(commandScope, command.id, {
        state: 'signed',
        revision: `${receipt.letterVersion}:${receipt.signatureVersion}`,
      });
      update({
        acceptedReceipt: receipt,
        outcome: 'awaiting-projection',
        message: 'The prior signing command completed. Waiting for the signed letter to appear.',
      });
      await confirmProjection(receipt);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        clearRuntimeCommand(commandScope, command.id);
        update({
          acceptedReceipt: null,
          result: null,
          outcome: 'conflict',
          message: 'The prior signing command did not complete. Review the current revision.',
        });
        await refresh({ preserveMessage: true });
        return;
      }
      update({ message: error instanceof Error ? error.message : String(error) });
    }
  }, [command, commandScope, confirmProjection, epoch, letterId, refresh, session.practiceId, update]);

  return {
    target,
    acceptedReceipt,
    result,
    loading,
    message,
    outcome,
    submitting: command?.status === 'submitting',
    uncertain: command?.status === 'uncertain',
    awaitingProjection: command?.status === 'awaiting-projection',
    refresh,
    sign,
    reconcile,
  };
}
