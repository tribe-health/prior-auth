import { createStore, type StoreApi } from 'zustand/vanilla';

import type { VerifiedSession } from '@/shared/model/session';

export interface ViewScope {
  readonly identityId: string;
  readonly sessionId: string;
  readonly practiceId: string;
  readonly authorizationRevision: string;
  readonly epoch: number;
  readonly caseId: string;
  readonly viewInstanceId: string;
}

export interface ScopedViewState<T> {
  readonly scope: ViewScope;
  readonly value: T;
}

export type ScopedEffectResult<T> =
  | { readonly status: 'current'; readonly value: T }
  | { readonly status: 'stale' };

export interface CapturedViewScope<T> {
  readonly scope: ViewScope;
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  publish(update: (current: T) => T): boolean;
  execute<R>(effect: (scope: ViewScope, signal: AbortSignal) => Promise<R>): Promise<ScopedEffectResult<R>>;
}

export interface ScopedViewStore<T> {
  readonly store: StoreApi<ScopedViewState<T>>;
  capture(): CapturedViewScope<T>;
  replaceScope(scope: ViewScope, initialValue: T): void;
  close(): void;
}

export function viewScope(
  session: VerifiedSession,
  epoch: number,
  caseId: string,
  viewInstanceId: string,
): ViewScope {
  return Object.freeze({
    identityId: session.identityId,
    sessionId: session.sessionId,
    practiceId: session.practiceId,
    authorizationRevision: session.authorizationRevision,
    epoch,
    caseId,
    viewInstanceId,
  });
}

function scopeKey(scope: ViewScope): string {
  return JSON.stringify([
    scope.identityId,
    scope.sessionId,
    scope.practiceId,
    scope.authorizationRevision,
    scope.epoch,
    scope.caseId,
    scope.viewInstanceId,
  ]);
}

export function sameViewScope(left: ViewScope, right: ViewScope): boolean {
  return scopeKey(left) === scopeKey(right);
}

/**
 * Own one transient view store and fence every callback captured from its old
 * identity/practice/epoch/case/view instance.
 */
export function createScopedViewStore<T>(
  initialScope: ViewScope,
  initialValue: T,
): ScopedViewStore<T> {
  const store = createStore<ScopedViewState<T>>(() => ({
    scope: initialScope,
    value: initialValue,
  }));
  let generation = new AbortController();
  let closed = false;

  const replaceScope = (scope: ViewScope, value: T) => {
    generation.abort();
    generation = new AbortController();
    closed = false;
    store.setState({ scope, value }, true);
  };

  const capture = (): CapturedViewScope<T> => {
    const capturedScope = store.getState().scope;
    const capturedKey = scopeKey(capturedScope);
    const capturedGeneration = generation;
    const isCurrent = () => !closed
      && !capturedGeneration.signal.aborted
      && capturedKey === scopeKey(store.getState().scope);

    return {
      scope: capturedScope,
      signal: capturedGeneration.signal,
      isCurrent,
      publish(update) {
        if (!isCurrent()) return false;
        store.setState((state) => ({ ...state, value: update(state.value) }), true);
        return true;
      },
      async execute(effect) {
        if (!isCurrent()) return { status: 'stale' };
        const value = await effect(capturedScope, capturedGeneration.signal);
        return isCurrent() ? { status: 'current', value } : { status: 'stale' };
      },
    };
  };

  return {
    store,
    capture,
    replaceScope,
    close() {
      closed = true;
      generation.abort();
    },
  };
}
