import { useCallback, useEffect, useId, useMemo, useSyncExternalStore } from 'react';

import { useRequiredSession, useSessionEpoch } from '@/app/providers/session-provider';
import { ApiError } from '@/shared/api/http-client';
import { viewScope } from '@/shared/scoped-view-store';
import {
  claimRuntimeCommand,
  clearRuntimeCommand,
  getRuntimeCommand,
  markRuntimeCommandAwaitingProjection,
  markRuntimeCommandUncertain,
  subscribeRuntimeCommand,
  type RuntimeCommandProjection,
  type RuntimeCommandScope,
} from '@/shared/runtime-command-registry';
import { useScopedViewStore } from '@/shared/use-scoped-view-store';
import { caseApi } from '../api/case-api';
import type { CaseInput } from '../model/case-command';
import type { CaseRecord, CaseStatus } from '../model/case-record';

type CaseCommandAction = 'create' | 'update' | 'transition';
export type CaseCommandOutcome =
  | 'idle'
  | 'submitting'
  | 'uncertain'
  | 'awaiting-projection'
  | 'confirmed'
  | 'refused'
  | 'conflict';

interface CaseCommandView {
  readonly outcome: CaseCommandOutcome;
  readonly message: string | null;
}

function summaryFingerprint(record: CaseRecord): string {
  return JSON.stringify([
    record.id,
    record.caseNumber,
    record.patientId,
    record.surgeonId,
    record.coordinatorId,
    record.payerId,
    record.dateOfService,
  ]);
}

function inputFingerprint(caseId: string, input: CaseInput): string {
  return JSON.stringify([
    caseId,
    input.caseNumber,
    input.patientId,
    input.surgeonId,
    input.coordinatorId,
    input.payerId,
    input.dateOfService,
  ]);
}

function detailFingerprint(input: CaseInput): string {
  return JSON.stringify([
    input.caseNumber,
    input.patientId,
    input.surgeonId,
    input.coordinatorId,
    input.facilityId,
    input.payerId,
    input.memberId,
    input.dateOfService,
    input.procedureCode,
    input.planKey,
    input.data,
  ]);
}

function commandMessage(action: CaseCommandAction): string {
  if (action === 'create') return 'Case created and confirmed.';
  if (action === 'update') return 'Case changes saved and confirmed.';
  return 'Case status updated and confirmed.';
}

export function useCaseCommand(caseId: string, projectedCase: CaseRecord | null) {
  const session = useRequiredSession();
  const epoch = useSessionEpoch();
  const viewInstanceId = useId();
  const commandScope = useMemo<RuntimeCommandScope>(() => ({
    feature: 'case-management',
    sessionId: session.sessionId,
    authorizationRevision: session.authorizationRevision,
    epoch,
    identityId: session.identityId,
    practiceId: session.practiceId,
    caseId,
  }), [caseId, epoch, session]);
  const owner = useSyncExternalStore(
    useCallback(
      (listener: () => void) => subscribeRuntimeCommand(commandScope, listener),
      [commandScope],
    ),
    useCallback(() => getRuntimeCommand(commandScope), [commandScope]),
    useCallback(() => getRuntimeCommand(commandScope), [commandScope]),
  );
  const scope = useMemo(
    () => viewScope(session, epoch, caseId, viewInstanceId),
    [caseId, epoch, session, viewInstanceId],
  );
  const [view, lease] = useScopedViewStore<CaseCommandView>(scope, () => ({
    outcome: 'idle',
    message: null,
  }));
  const publish = useCallback((outcome: CaseCommandOutcome, message: string | null) => {
    lease.publish(() => ({ outcome, message }));
  }, [lease]);

  useEffect(() => {
    if (owner?.status !== 'awaiting-projection' || !owner.expectedProjection || !projectedCase) {
      return;
    }
    const expectedRevision = Number(owner.expectedProjection.revision);
    if (projectedCase.revision < expectedRevision) return;
    const expectedStatus = owner.expectedProjection.state;
    const statusMatches = expectedStatus === undefined || projectedCase.status === expectedStatus;
    const fingerprintMatches = owner.expectedProjection.fingerprint === undefined
      || summaryFingerprint(projectedCase) === owner.expectedProjection.fingerprint;
    const action = owner.action as CaseCommandAction | undefined;
    if (projectedCase.revision !== expectedRevision || !statusMatches || !fingerprintMatches || !action) {
      clearRuntimeCommand(commandScope, owner.id);
      publish('conflict', 'The committed case changed again. Review its current values.');
      return;
    }

    const expectedDetail = owner.expectedProjection.detailFingerprint;
    if (expectedDetail === undefined) {
      clearRuntimeCommand(commandScope, owner.id);
      publish('confirmed', commandMessage(action));
      return;
    }

    let cancelled = false;
    void caseApi.read(caseId, session.practiceId).then((detail) => {
      if (cancelled) return;
      const current = getRuntimeCommand(commandScope);
      if (current?.id !== owner.id || current.status !== 'awaiting-projection') return;
      clearRuntimeCommand(commandScope, owner.id);
      if (detail.revision === expectedRevision && detailFingerprint(detail) === expectedDetail) {
        publish('confirmed', commandMessage(action));
      } else {
        publish('conflict', 'The committed case changed again. Review its current values.');
      }
    }).catch(() => {
      if (cancelled) return;
      const current = getRuntimeCommand(commandScope);
      if (current?.id !== owner.id || current.status !== 'awaiting-projection') return;
      markRuntimeCommandUncertain(commandScope, owner.id);
      publish('uncertain', 'The case committed, but its saved details could not be confirmed. Check the saved command again.');
    });
    return () => {
      cancelled = true;
    };
  }, [caseId, commandScope, owner, projectedCase, publish, session.practiceId]);

  const claim = useCallback((
    action: CaseCommandAction,
    expectedProjection: RuntimeCommandProjection,
  ) => {
    if (getRuntimeCommand(commandScope)) throw new Error('A case command is already pending.');
    const commandId = crypto.randomUUID();
    if (!claimRuntimeCommand(commandScope, {
      id: commandId,
      action,
      targetId: caseId,
      status: 'submitting',
      expectedProjection,
    })) {
      throw new Error('A case command is already pending.');
    }
    publish('submitting', null);
    return commandId;
  }, [caseId, commandScope, publish]);

  const handleFailure = useCallback((commandId: string, cause: unknown) => {
    if (cause instanceof ApiError && cause.isCapabilityDenied) {
      clearRuntimeCommand(commandScope, commandId);
      publish('refused', 'You do not have permission to change this case.');
      return true;
    }
    if (cause instanceof ApiError && cause.isPreconditionUnmet) {
      clearRuntimeCommand(commandScope, commandId);
      publish('conflict', 'The case changed. Reload it before trying again.');
      return true;
    }
    if (cause instanceof ApiError && !cause.isCommitOutcomeUncertain) {
      clearRuntimeCommand(commandScope, commandId);
      publish('conflict', cause.message);
      return true;
    }
    markRuntimeCommandUncertain(commandScope, commandId);
    publish('uncertain', 'The result is unknown. Check the saved command before trying again.');
    return false;
  }, [commandScope, publish]);

  const awaitProjection = useCallback((commandId: string, action: CaseCommandAction) => {
    const expectedProjection = getRuntimeCommand(commandScope)?.expectedProjection;
    if (!expectedProjection) return;
    markRuntimeCommandAwaitingProjection(commandScope, commandId, expectedProjection);
    publish(
      'awaiting-projection',
      `${action === 'transition' ? 'Status change' : 'Case change'} accepted. Waiting for committed data.`,
    );
  }, [commandScope, publish]);

  const create = useCallback(async (input: CaseInput) => {
    const commandId = claim('create', {
      revision: '1',
      state: 'intake',
      fingerprint: inputFingerprint(caseId, input),
      detailFingerprint: detailFingerprint(input),
    });
    try {
      const receipt = await caseApi.create(session.practiceId, { commandId, caseId, input });
      awaitProjection(commandId, 'create');
      return receipt;
    } catch (cause) {
      if (handleFailure(commandId, cause)) return null;
      throw cause;
    }
  }, [awaitProjection, caseId, claim, handleFailure, session.practiceId]);

  const update = useCallback(async (input: CaseInput, expectedRevision: number) => {
    const commandId = claim('update', {
      revision: String(expectedRevision + 1),
      state: projectedCase?.status,
      fingerprint: inputFingerprint(caseId, input),
      detailFingerprint: detailFingerprint(input),
    });
    try {
      const receipt = await caseApi.update(caseId, session.practiceId, {
        commandId,
        expectedRevision,
        input,
      });
      awaitProjection(commandId, 'update');
      return receipt;
    } catch (cause) {
      if (handleFailure(commandId, cause)) return null;
      throw cause;
    }
  }, [awaitProjection, caseId, claim, handleFailure, projectedCase?.status, session.practiceId]);

  const transition = useCallback(async (
    targetStatus: CaseStatus,
    expectedStatusRevision: number,
    expectedRevision: number,
  ) => {
    const commandId = claim('transition', {
      revision: String(expectedRevision + 1),
      state: targetStatus,
    });
    try {
      const receipt = await caseApi.transition(caseId, session.practiceId, {
        commandId,
        expectedStatusRevision,
        targetStatus,
      });
      awaitProjection(commandId, 'transition');
      return receipt;
    } catch (cause) {
      if (handleFailure(commandId, cause)) return null;
      throw cause;
    }
  }, [awaitProjection, caseId, claim, handleFailure, session.practiceId]);

  const reconcile = useCallback(async () => {
    const current = getRuntimeCommand(commandScope);
    if (!current?.action) throw new Error('No case command needs reconciliation.');
    try {
      const receipt = current.action === 'create'
        ? await caseApi.lookupCreate(current.id, session.practiceId)
        : await caseApi.lookup(caseId, current.id, session.practiceId);
      awaitProjection(current.id, current.action as CaseCommandAction);
      return receipt;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        clearRuntimeCommand(commandScope, current.id);
        publish('conflict', 'The prior command did not commit. Review the case before trying again.');
        return null;
      }
      if (handleFailure(current.id, cause)) return null;
      throw cause;
    }
  }, [awaitProjection, caseId, commandScope, handleFailure, publish, session.practiceId]);

  return {
    outcome: view.outcome,
    message: view.message,
    pending: owner !== null,
    canReconcile: owner?.status === 'uncertain',
    create,
    update,
    transition,
    reconcile,
  } as const;
}
