import { useEffect, useMemo, useRef } from 'react';
import { useStore } from 'zustand';

import {
  createScopedViewStore,
  sameViewScope,
  type CapturedViewScope,
  type ScopedViewStore,
  type ViewScope,
} from './scoped-view-store';

/**
 * Owns one transient Zustand store for a mounted feature view. A scope change
 * aborts the old generation during render so its data cannot cross into the
 * next identity, practice, epoch, case or view instance.
 */
export function useScopedViewStore<T>(
  scope: ViewScope,
  initialValue: () => T,
): readonly [T, CapturedViewScope<T>] {
  const ownerRef = useRef<{
    scope: ViewScope;
    runtime: ScopedViewStore<T>;
    mountGeneration: number;
  } | null>(null);

  if (!ownerRef.current || !sameViewScope(ownerRef.current.scope, scope)) {
    ownerRef.current?.runtime.close();
    ownerRef.current = {
      scope,
      runtime: createScopedViewStore(scope, initialValue()),
      mountGeneration: 0,
    };
  }

  const owner = ownerRef.current;
  const runtime = owner.runtime;
  const value = useStore(runtime.store, (state) => state.value);
  const lease = useMemo(() => runtime.capture(), [runtime]);

  useEffect(() => {
    const mountGeneration = ++owner.mountGeneration;
    return () => {
      queueMicrotask(() => {
        if (owner.mountGeneration === mountGeneration) runtime.close();
      });
    };
  }, [owner, runtime]);

  return [value, lease] as const;
}
