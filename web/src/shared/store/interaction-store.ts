/**
 * Transient interaction state. Nothing durable lives here.
 *
 * ADR-006 draws the line with one question, and it is not "does this change
 * often?" — it is:
 *
 *   **If two views disagreed about this value, would that be a bug?**
 *
 * If yes, it is an entity and belongs in the graph. If no, it is interaction
 * state and belongs here.
 *
 * Applied to each field below:
 *
 * | field                | two views disagree? | verdict |
 * |----------------------|---------------------|---------|
 * | `evidenceStateFilter`| No — a filter is a per-viewer lens. Two tabs showing different filters is the feature, not a bug. | store |
 * | `expandedEntryIds`   | No — one reader expanding a row says nothing about another reader. | store |
 * | `selectedEntryId`    | No — a cursor, not a fact about the case. | store |
 *
 * What is deliberately NOT here: the entries themselves, their evidence state,
 * their citations. Those are entities. A `selectedEntryId` that grew into a
 * `selectedEntry` object would become a cached copy of a record that then
 * drifts — the same two-sources-of-truth failure ADR-001 refused, arriving
 * through a different door. Hold identifiers; re-join the record at render.
 *
 * Nothing here survives a reload, and nothing here is persisted. The store is
 * deliberately NOT wrapped in `persist`: a persisted filter is a per-viewer
 * preference, which is a product decision nobody has taken, and persisting
 * anything keyed to a case would put case identifiers in browser storage.
 */
import { create } from "zustand";

import type { EvidenceState } from "@/shared/model/evidence-state";

/** `null` means no filter — show every state. Not the same as an empty set. */
export type EvidenceStateFilter = EvidenceState | null;

export interface InteractionState {
  /** Which evidence state the timeline is narrowed to, or null for all. */
  evidenceStateFilter: EvidenceStateFilter;
  /** Timeline rows the viewer has expanded. Identifiers only. */
  expandedEntryIds: readonly string[];
  /** The row under the cursor, or null. An identifier, never a record. */
  selectedEntryId: string | null;

  setEvidenceStateFilter: (state: EvidenceStateFilter) => void;
  toggleEntryExpanded: (entryId: string) => void;
  selectEntry: (entryId: string | null) => void;
  /** Reset on case change — one case's interaction state is not another's. */
  resetForCase: () => void;
}

const EMPTY: Pick<
  InteractionState,
  "evidenceStateFilter" | "expandedEntryIds" | "selectedEntryId"
> = {
  evidenceStateFilter: null,
  expandedEntryIds: [],
  selectedEntryId: null,
};

export const useInteractionStore = create<InteractionState>((set) => ({
  ...EMPTY,

  setEvidenceStateFilter: (evidenceStateFilter) => set({ evidenceStateFilter }),

  toggleEntryExpanded: (entryId) =>
    set((s) => ({
      // New array, never a mutation — a spliced array in place would not
      // trigger a re-render for subscribers comparing by reference.
      expandedEntryIds: s.expandedEntryIds.includes(entryId)
        ? s.expandedEntryIds.filter((id) => id !== entryId)
        : [...s.expandedEntryIds, entryId],
    })),

  selectEntry: (selectedEntryId) => set({ selectedEntryId }),

  resetForCase: () => set({ ...EMPTY }),
}));
