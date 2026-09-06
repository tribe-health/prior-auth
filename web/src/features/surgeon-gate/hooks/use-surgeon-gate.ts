import { useCallback, useEffect, useState } from 'react';

import { ApiError } from '../../../shared/api/http-client';
import { gateApi } from '../api/gate-api';
import type { GateAffirmationKind, GateState } from '../model/gate-state';

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
  affirm: (kind: GateAffirmationKind) => Promise<void>;
}

export function useSurgeonGate(caseId: string, actor: string): UseSurgeonGate {
  const [state, setState] = useState<GateState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    gateApi
      .read(caseId)
      .then((s) => {
        if (!live) return;
        setState(s);
        setError(null);
      })
      .catch((e: unknown) => {
        // The gate is the highest-stakes read in the product. A swallowed
        // failure here is indistinguishable from "not affirmed".
        if (live) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [caseId]);

  const affirm = useCallback(
    async (kind: GateAffirmationKind) => {
      setRefusal(null);
      try {
        setState(await gateApi.affirm(caseId, kind, actor));
      } catch (e) {
        // A refusal is information the user needs, not an exception to swallow.
        // "You may not affirm this" tells a coordinator exactly what to do next.
        if (e instanceof ApiError && e.isCapabilityDenied) {
          setRefusal(e.message);
          return;
        }
        throw e;
      }
    },
    [caseId, actor],
  );

  return { state, loading, error, refusal, affirm };
}
