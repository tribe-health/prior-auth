import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { useSession, useSessionEpoch } from '../../../app/providers/session-provider';
import { ApiError } from '../../../shared/api/http-client';
import type { ViewScope } from '../../../shared/scoped-view-store';
import { useScopedViewStore } from '../../../shared/use-scoped-view-store';
import {
  claimRuntimeCommand,
  clearRuntimeCommand,
  getRuntimeCommand,
  markRuntimeCommandUncertain,
  subscribeRuntimeCommand,
  type RuntimeCommandScope,
} from '../../../shared/runtime-command-registry';
import { gateApi } from '../api/gate-api';
import { gateStateFromSnapshot } from '../model/gate-state';
import type { GateAffirmationKind, GateCommandResult, GateState } from '../model/gate-state';

// The feature hook is what components import. It owns loading, error and
// intent-shaped operations; components render, they do not orchestrate.
//
// No query cache. A synced local store already knows freshness — see
// docs/architecture/adr-001-no-query-cache.md.

interface UseSurgeonGate {
  state: GateState | null;
  loading: boolean;
  /**
   * Set when the READ failed. Distinct from `state === null` after a
   * successful read, and the caller must render it differently.
   *
   * Without this, a 500 or a dropped connection leaves `state` null with
   * `loading` false, and any caller writing `state?.affirmed ?? false` — the
   * natural reading — shows an AFFIRMED case as unaffirmed. That is a runtime
   * failure masquerading as domain state, which ADR-003 forbids: loading,
   * offline and error are runtime states, never additional evidence states.
   */
  error: string | null;
  /** Present when the last affirmation was REFUSED — e.g. by an administrator. */
  refusal: string | null;
  /** Retained after an uncertain response for explicit command lookup. */
  lastCommandId: string | null;
  /** True while one gate command owns the mutation slot. */
  submitting: boolean;
  affirm: (kind: GateAffirmationKind) => Promise<void>;
  remove: (kind: GateAffirmationKind) => Promise<void>;
  lookupCommand: (commandId: string) => Promise<GateCommandResult>;
}

interface SurgeonGateScope {
  practiceId?: string;
}

type GateView = Pick<
  UseSurgeonGate,
  'state' | 'loading' | 'error' | 'refusal'
>;

function initialView(): GateView {
  return {
    state: null as GateState | null,
    loading: true,
    error: null as string | null,
    refusal: null as string | null,
  };
}

export function useSurgeonGate(caseId: string, options?: SurgeonGateScope): UseSurgeonGate {
  const session = useSession();
  const epoch = useSessionEpoch();
  const practiceId = options?.practiceId ?? session?.practiceId;
  const identityId = session?.identityId ?? 'unverified-session';
  const viewInstanceId = useRef(crypto.randomUUID()).current;
  const viewScope = useMemo<ViewScope>(() => ({
    identityId,
    sessionId: session?.sessionId ?? 'unverified-session',
    practiceId: practiceId ?? 'unverified-practice',
    authorizationRevision: session?.authorizationRevision ?? 'unverified-session',
    epoch,
    caseId,
    viewInstanceId,
  }), [caseId, epoch, identityId, practiceId, session?.authorizationRevision, session?.sessionId, viewInstanceId]);
  const commandScope = useMemo<RuntimeCommandScope>(() => ({
    feature: 'surgeon-gate',
    sessionId: session?.sessionId ?? 'unverified-session',
    authorizationRevision: session?.authorizationRevision ?? 'unverified-session',
    epoch,
    identityId,
    practiceId,
    caseId,
  }), [caseId, epoch, identityId, practiceId, session?.authorizationRevision, session?.sessionId]);
  const runtimeCommand = useSyncExternalStore(
    useCallback(
      (listener: () => void) => subscribeRuntimeCommand(commandScope, listener),
      [commandScope],
    ),
    useCallback(() => getRuntimeCommand(commandScope), [commandScope]),
    useCallback(() => getRuntimeCommand(commandScope), [commandScope]),
  );
  const [view, lease] = useScopedViewStore(viewScope, initialView);
  const { state, loading, error, refusal } = view;
  const scope = lease.scope;
  const lastCommandId = runtimeCommand?.status === 'uncertain' ? runtimeCommand.id : null;
  const submitting = runtimeCommand?.status === 'submitting';
  const update = useCallback((patch: Partial<GateView>) => {
    lease.publish((current) => ({ ...current, ...patch }));
  }, [lease]);

  useEffect(() => {
    let live = true;
    gateApi
      .read(scope.caseId, practiceId, scope.epoch)
      .then((snapshot) => {
        if (!live) return;
        update({ state: gateStateFromSnapshot(snapshot), error: null });
      })
      .catch((e: unknown) => {
        // The gate is the highest-stakes read in the product. A swallowed
        // failure here is indistinguishable from "not affirmed".
        if (live) update({ error: e instanceof Error ? e.message : String(e) });
      })
      .finally(() => live && update({ loading: false }));
    return () => {
      live = false;
    };
  }, [practiceId, scope, update]);

  const mutate = useCallback(
    async (action: 'affirm' | 'remove', kind: GateAffirmationKind) => {
      const currentCommand = getRuntimeCommand(commandScope);
      if (currentCommand) {
        throw new Error(
          currentCommand.status === 'uncertain'
            ? 'The prior gate command outcome must be reconciled.'
            : 'A gate command is already pending.',
        );
      }
      const commandId = crypto.randomUUID();
      const claimed = claimRuntimeCommand(commandScope, { id: commandId, status: 'submitting' });
      if (!claimed) {
        throw new Error('A gate command is already pending.');
      }
      update({ refusal: null });
      try {
        const result = await gateApi[action](
          scope.caseId,
          { commandId, kind },
          practiceId,
          scope.epoch,
        );
        clearRuntimeCommand(commandScope, commandId);
        update({ state: gateStateFromSnapshot(result.gate) });
      } catch (e) {
        // A refusal is information the user needs, not an exception to swallow.
        // "You may not affirm this" tells a coordinator exactly what to do next.
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
    [commandScope, practiceId, scope, update],
  );

  const affirm = useCallback((kind: GateAffirmationKind) => mutate('affirm', kind), [mutate]);
  const remove = useCallback((kind: GateAffirmationKind) => mutate('remove', kind), [mutate]);
  const lookupCommand = useCallback(
    async (commandId: string) => {
      const receipt = await gateApi.lookupCommand(
        scope.caseId,
        commandId,
        practiceId,
        scope.epoch,
      );
      clearRuntimeCommand(commandScope, commandId);
      try {
        // A receipt is historical: refresh the current gate after recovery.
        const current = await gateApi.read(scope.caseId, practiceId, scope.epoch);
        update({ state: gateStateFromSnapshot(current), error: null });
      } catch (e) {
        update({ state: null, error: e instanceof Error ? e.message : String(e) });
      }
      return receipt;
    },
    [commandScope, practiceId, scope, update],
  );

  return {
    state,
    loading,
    error,
    refusal,
    lastCommandId,
    submitting,
    affirm,
    remove,
    lookupCommand,
  };
}
