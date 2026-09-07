/**
 * The subscriber-trace test.
 *
 * ADR-009 requires coherence be shown by **subscriber traces, not rendered
 * screens**, and the distinction is the whole point: React batches its own
 * renders, so a component test can pass while an imperative subscriber — which
 * reads Zustand directly — observes every intermediate `set`.
 *
 * These record what a subscriber actually saw, then assert about the *sequence*
 * of observations rather than the final state. A test that only checked the end
 * state would pass against the defect this guards.
 */
import { describe, expect, it, vi } from "vitest";

import { publishRevision, toBatches, type PublishTarget } from "./replica-publisher";

/**
 * A store that records every ingest call, standing in for Zustand.
 *
 * Each recorded entry is one publication — one thing a subscriber would wake
 * for. Counting them is how "did the graph go through a partial state?" becomes
 * an assertion.
 */
function tracingTarget() {
  const publications: Array<{
    type: string;
    ids: string[];
    sideTypes: string[];
  }> = [];

  const target: PublishTarget = {
    getState: () => ({
      ingestFetchedList: (type, entries, options) => {
        publications.push({
          type,
          ids: entries.map((e) => e.id),
          sideTypes: (options?.sideBatches ?? []).map((b) => b.type),
        });
      },
    }),
  };

  return { target, publications };
}

const caseRows = [{ id: "c1", status: "open" }];
const citationRows = [{ id: "cit1", document_id: "d1" }];
const documentRows = [{ id: "d1", name: "Chart" }];

describe("publishRevision — one revision is one publication", () => {
  it("publishes three related tables in a SINGLE store update", () => {
    // The defect: three tables published separately means three publications,
    // and a subscriber woken after the first sees citations pointing at
    // documents that have not arrived.
    const { target, publications } = tracingTarget();

    publishRevision(target, [
      { type: "Case", entries: [{ id: "c1", data: caseRows[0] }] },
      { type: "Citation", entries: [{ id: "cit1", data: citationRows[0] }] },
      { type: "Document", entries: [{ id: "d1", data: documentRows[0] }] },
    ]);

    expect(publications).toHaveLength(1);
  });

  it("carries the non-primary tables as sideBatches of that one update", () => {
    // PEM documents sideBatches as "rows that must commit or fail with the
    // primary batch" — that is the mechanism the single publication relies on.
    const { target, publications } = tracingTarget();

    publishRevision(target, [
      { type: "Case", entries: [{ id: "c1", data: caseRows[0] }] },
      { type: "Citation", entries: [{ id: "cit1", data: citationRows[0] }] },
      { type: "Document", entries: [{ id: "d1", data: documentRows[0] }] },
    ]);

    expect(publications[0]?.type).toBe("Case");
    expect(publications[0]?.sideTypes).toEqual(["Citation", "Document"]);
  });

  it("never lets a subscriber observe a partial relationship", () => {
    // The trace assertion. A subscriber that woke between tables would see a
    // citation whose document is absent; with one publication there is no
    // "between" to wake in.
    const observed: Array<{ hasCitation: boolean; hasDocument: boolean }> = [];
    const graph = { Citation: new Set<string>(), Document: new Set<string>() };

    const target: PublishTarget = {
      getState: () => ({
        ingestFetchedList: (type, entries, options) => {
          for (const batch of [{ type, entries }, ...(options?.sideBatches ?? [])]) {
            for (const entry of batch.entries) {
              if (batch.type === "Citation") graph.Citation.add(entry.id);
              if (batch.type === "Document") graph.Document.add(entry.id);
            }
          }
          // The subscriber runs once per publication, after it lands.
          observed.push({
            hasCitation: graph.Citation.has("cit1"),
            hasDocument: graph.Document.has("d1"),
          });
        },
      }),
    };

    publishRevision(target, [
      { type: "Citation", entries: [{ id: "cit1", data: citationRows[0] }] },
      { type: "Document", entries: [{ id: "d1", data: documentRows[0] }] },
    ]);

    // Every observation is complete: never a citation without its document.
    expect(observed).toHaveLength(1);
    for (const snapshot of observed) {
      expect(snapshot.hasCitation).toBe(snapshot.hasDocument);
    }
  });

  it("publishes nothing when the revision is empty", () => {
    // An empty publication would wake every subscriber to announce no change.
    const { target, publications } = tracingTarget();
    publishRevision(target, [{ type: "Case", entries: [] }]);
    expect(publications).toHaveLength(0);
  });

  it("drops empty batches rather than publishing them as side batches", () => {
    const { target, publications } = tracingTarget();
    publishRevision(target, [
      { type: "Case", entries: [{ id: "c1", data: caseRows[0] }] },
      { type: "Citation", entries: [] },
    ]);
    expect(publications).toHaveLength(1);
    expect(publications[0]?.sideTypes).toEqual([]);
  });

  it("issues no side batches when only one table changed", () => {
    const { target } = tracingTarget();
    const spy = vi.fn();
    const single: PublishTarget = { getState: () => ({ ingestFetchedList: spy }) };
    void target;

    publishRevision(single, [{ type: "Case", entries: [{ id: "c1", data: caseRows[0] }] }]);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[2]).toEqual({});
  });
});

describe("toBatches", () => {
  it("maps rows to entries keyed by the declared id column", () => {
    const batches = toBatches([{ type: "Case", rows: caseRows }]);
    expect(batches).toEqual([
      { type: "Case", entries: [{ id: "c1", data: { id: "c1", status: "open" } }] },
    ]);
  });

  it("honours a non-default id column", () => {
    const batches = toBatches([
      { type: "State", rows: [{ key: "met", label: "Met" }], idColumn: "key" },
    ]);
    expect(batches[0]?.entries[0]?.id).toBe("met");
  });

  it("copies row data rather than aliasing it", () => {
    // A published entry that aliased its source row would mutate the graph
    // when the caller reused its buffer.
    const rows = [{ id: "c1", status: "open" }];
    const batches = toBatches([{ type: "Case", rows }]);
    rows[0].status = "closed";
    expect(batches[0]?.entries[0]?.data.status).toBe("open");
  });
});
