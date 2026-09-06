/**
 * ADR-006's boundary, asserted.
 *
 * The rule is easy to state and easy to erode: a `selectedEntryId` becomes a
 * `selectedEntry` object, which becomes a cached copy of a record, which
 * drifts. Nothing mechanical stops that — `audit.sh` checks structure, not
 * store contents — so these tests are the guard.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { useInteractionStore } from "./interaction-store";
import { filterEntries, countStates } from
  "@/features/evidence-timeline/components/evidence-timeline";
import type { TimelineEntry } from "@/features/evidence-timeline/model/timeline-entry";

const entry = (id: string, state: TimelineEntry["state"]): TimelineEntry => ({
  id,
  caseId: "c1",
  policyCriterionId: "pc1",
  criterionLabel: null,
  state,
  assessedAt: null,
  citations: [],
});

beforeEach(() => {
  useInteractionStore.getState().resetForCase();
});

describe("the store holds identifiers, never records", () => {
  it("selects by id", () => {
    useInteractionStore.getState().selectEntry("e1");
    expect(useInteractionStore.getState().selectedEntryId).toBe("e1");
  });

  it("holds only primitives and arrays of primitives", () => {
    const s = useInteractionStore.getState();
    s.selectEntry("e1");
    s.toggleEntryExpanded("e1");
    s.setEvidenceStateFilter("gap");

    const { evidenceStateFilter, expandedEntryIds, selectedEntryId } =
      useInteractionStore.getState();

    // If any of these ever becomes an object, someone has put a record in the
    // store and the drift ADR-001 refused has arrived through ADR-006's door.
    for (const value of [evidenceStateFilter, selectedEntryId]) {
      expect(typeof value === "string" || value === null).toBe(true);
    }
    expect(expandedEntryIds.every((id) => typeof id === "string")).toBe(true);
  });
});

describe("expansion is a toggle and never mutates", () => {
  it("adds then removes", () => {
    const s = () => useInteractionStore.getState();
    s().toggleEntryExpanded("e1");
    expect(s().expandedEntryIds).toEqual(["e1"]);
    s().toggleEntryExpanded("e1");
    expect(s().expandedEntryIds).toEqual([]);
  });

  it("returns a NEW array, so reference-comparing subscribers re-render", () => {
    const before = useInteractionStore.getState().expandedEntryIds;
    useInteractionStore.getState().toggleEntryExpanded("e1");
    const after = useInteractionStore.getState().expandedEntryIds;
    expect(after).not.toBe(before);
  });
});

describe("null filter is not an empty filter", () => {
  const entries = [entry("a", "met"), entry("b", "gap"), entry("c", "void")];

  it("null shows everything", () => {
    expect(filterEntries(entries, null)).toHaveLength(3);
  });

  it("a state shows only that state", () => {
    expect(filterEntries(entries, "void").map((e) => e.id)).toEqual(["c"]);
  });

  it("a filter matching nothing returns empty, distinct from null", () => {
    const onlyMet = [entry("a", "met")];
    expect(filterEntries(onlyMet, "void")).toHaveLength(0);
    expect(filterEntries(onlyMet, null)).toHaveLength(1);
  });
});

describe("counts do not follow the filter", () => {
  it("tallies the FULL set regardless of what is being shown", () => {
    const entries = [entry("a", "met"), entry("b", "gap"), entry("c", "void")];
    useInteractionStore.getState().setEvidenceStateFilter("met");

    // The failure this prevents: a coordinator reads "0 not documented" off a
    // screen that is merely hiding them. Counts describe the case; the filter
    // describes the lens.
    expect(countStates(entries)).toEqual({ met: 1, gap: 1, void: 1 });
    expect(filterEntries(entries, "met")).toHaveLength(1);
  });
});

describe("interaction state is per case", () => {
  it("resetForCase clears everything", () => {
    const s = () => useInteractionStore.getState();
    s().selectEntry("e1");
    s().toggleEntryExpanded("e1");
    s().setEvidenceStateFilter("gap");

    s().resetForCase();

    expect(s().selectedEntryId).toBeNull();
    expect(s().expandedEntryIds).toEqual([]);
    expect(s().evidenceStateFilter).toBeNull();
  });
});
