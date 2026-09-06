import { useCallback, useEffect, useState } from 'react';

import { useLocalStore } from '../../../app/providers/graph-provider';
import { ApiError } from '../../../shared/api/http-client';
import type { EvidenceState } from '../../../shared/model/evidence-state';
import type { TimelineEntry } from '../model/timeline-entry';
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
  reassess: (entryId: string, state: EvidenceState) => Promise<void>;
}

export function useEvidenceTimeline(caseId: string): UseEvidenceTimeline {
  const db = useLocalStore();
  const [entries, setEntries] = useState<readonly TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;

    let live = true;
    setLoading(true);
    readTimeline(db, caseId)
      .then((rows) => {
        if (!live) return;
        setEntries(rows);
        setError(null);
      })
      .catch((e: unknown) => {
        // An empty list and a failed read look identical on screen, and one of
        // them means "no evidence recorded" while the other means "we do not
        // know". Never let a failure render as the former.
        if (live) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [db, caseId]);

  const reassess = useCallback(
    async (entryId: string, state: EvidenceState) => {
      setRefusal(null);
      try {
        await timelineApi.reassess(caseId, entryId, state);
      } catch (e) {
        // A refusal is information the coordinator needs, not an exception to
        // swallow. It tells them who must act instead.
        if (e instanceof ApiError && e.isCapabilityDenied) {
          setRefusal(e.message);
          return;
        }
        throw e;
      }
    },
    [caseId],
  );

  return { entries, loading, unavailable: db === null, error, refusal, reassess };
}
