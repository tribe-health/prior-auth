/**
 * Chunk writer, against a **fixture schema**.
 *
 * Every table here is invented for the test. No ASO clinical table appears,
 * which is the point: if these tests needed `case_evidence` to pass, the writer
 * would not be schema-agnostic and could not have shipped before the catalog
 * was settled.
 */
import { describe, expect, it } from "vitest";

import {
  CHUNK_ROW_OPERATION,
  truncateTarget,
  validateTarget,
  writeChunk,
  type TableTarget,
  type WriterClient,
} from "./chunk-writer";

interface Call {
  kind: "query" | "exec";
  sql: string;
  params?: unknown[];
}

function mockClient(
  failOnInsert = false,
  updateMatches = true,
): { client: WriterClient; calls: Call[] } {
  const calls: Call[] = [];
  const client: WriterClient = {
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
      calls.push({ kind: "query", sql, params });
      if (failOnInsert && /INSERT INTO/.test(sql)) throw new Error("write failed");
      if (sql.startsWith("UPDATE")) {
        return { rows: updateMatches ? [{ id: params?.at(-1) } as T] : [] };
      }
      return { rows: [] };
    },
    async exec(sql) {
      calls.push({ kind: "exec", sql });
    },
  };
  return { client, calls };
}

/** A fixture target — deliberately nothing to do with the clinical schema. */
const widgets: TableTarget = {
  table: "fixture_widgets",
  columns: ["id", "label", "size"],
};

describe("validateTarget", () => {
  it("accepts a well-formed target", () => {
    expect(() => validateTarget(widgets)).not.toThrow();
  });

  it("rejects a table name that is not an identifier", () => {
    // Table names reach SQL by interpolation — parameters cannot bind them —
    // so a hostile name must fail here rather than downstream.
    expect(() =>
      validateTarget({ table: "widgets; DROP TABLE x", columns: ["id"] }),
    ).toThrow(/invalid table name/);
  });

  it("rejects a column name that is not an identifier", () => {
    expect(() =>
      validateTarget({ table: "fixture_widgets", columns: ["id", "a b"] }),
    ).toThrow(/invalid column name/);
  });

  it("rejects a target declaring no columns", () => {
    expect(() => validateTarget({ table: "fixture_widgets", columns: [] })).toThrow(
      /declares no columns/,
    );
  });

  it("rejects a target whose id column is not among its columns", () => {
    // Otherwise the upsert conflict target would reference a column the write
    // never supplies.
    expect(() =>
      validateTarget({ table: "fixture_widgets", columns: ["label"], idColumn: "id" }),
    ).toThrow(/omits its id column/);
  });
});

describe("writeChunk", () => {
  it("upserts rows in one bounded statement inside one transaction", async () => {
    const { client, calls } = mockClient();
    await writeChunk(client, widgets, [
      { id: "w1", label: "One", size: 1 },
      { id: "w2", label: "Two", size: 2 },
    ]);

    expect(calls[0]).toMatchObject({ kind: "exec", sql: "BEGIN" });
    expect(calls.at(-1)).toMatchObject({ kind: "exec", sql: "COMMIT" });
    expect(calls.filter((c) => /INSERT INTO/.test(c.sql))).toHaveLength(1);
    expect(calls.find((c) => /INSERT INTO/.test(c.sql))?.params).toEqual([
      "w1", "One", 1, "w2", "Two", 2,
    ]);
  });

  it("projects rows onto the declared columns and drops the rest", async () => {
    // The enforced boundary: a value the transport sent for an undeclared
    // column must not reach local storage, even if a shape were mis-projected
    // upstream.
    const { client, calls } = mockClient();
    await writeChunk(client, widgets, [
      { id: "w1", label: "One", size: 1, secret_note: "PHI-ish" },
    ]);

    const insert = calls.find((c) => /INSERT INTO/.test(c.sql));
    expect(insert?.params).toEqual(["w1", "One", 1]);
    expect(insert?.params).not.toContain("PHI-ish");
    expect(insert?.sql).not.toMatch(/secret_note/);
  });

  it("omits a declared column the row does not carry, rather than nulling it", async () => {
    // Electric update frames carry only the columns that changed. Padding the
    // row out to the full declared list would write NULL over every column the
    // frame did not mention — silent data loss on the first update after a
    // snapshot. The column must not appear in the statement at all.
    const { client, calls } = mockClient();
    await writeChunk(client, widgets, [{ id: "w1", label: "One" }]);
    const update = calls.find((c) => c.sql.startsWith("UPDATE"));
    expect(update?.params).toEqual(["One", "w1"]);
    expect(update?.sql).not.toMatch(/\bsize\b/);
  });

  it("inserts a partial cold-snapshot row when its operation says insert", async () => {
    const { client, calls } = mockClient();
    await writeChunk(client, widgets, [
      { id: "w1", label: "One", [CHUNK_ROW_OPERATION]: "insert" },
    ]);

    const insert = calls.find((call) => call.sql.startsWith("INSERT INTO"));
    expect(insert?.params).toEqual(["w1", "One"]);
    expect(calls.some((call) => call.sql.startsWith("UPDATE"))).toBe(false);
  });

  it("still writes an explicit null the frame actually sent", async () => {
    // Absent and explicitly-null are different: clearing a value is a real
    // update, and must not be confused with "this frame did not mention it".
    const { client, calls } = mockClient();
    await writeChunk(client, widgets, [{ id: "w1", label: "One", size: null }]);
    const insert = calls.find((c) => /INSERT INTO/.test(c.sql));
    expect(insert?.params).toEqual(["w1", "One", null]);
    expect(insert?.sql).toMatch(/\bsize\b/);
  });

  it("updates only the columns a partial frame carries", async () => {
    const { client, calls } = mockClient();
    await writeChunk(client, widgets, [{ id: "w1", size: 7 }]);
    const update = calls.find((c) => c.sql.startsWith("UPDATE"));
    expect(update?.params).toEqual([7, "w1"]);
    expect(update?.sql).toMatch(/SET size = \$1/);
    expect(update?.sql).not.toMatch(/\blabel\b/);
  });

  it("rolls back a partial frame when its base row is absent", async () => {
    const { client, calls } = mockClient(false, false);

    await expect(writeChunk(client, widgets, [{ id: "missing", size: 7 }])).rejects.toThrow(
      /matched no existing id/,
    );
    expect(calls.some((call) => call.sql === "ROLLBACK")).toBe(true);
    expect(calls.some((call) => call.sql === "COMMIT")).toBe(false);
  });

  it("makes an id-only frame a no-op instead of a conflicting empty update", async () => {
    const { client, calls } = mockClient();
    await writeChunk(client, widgets, [{ id: "w1" }]);
    expect(calls.some((c) => /INSERT INTO|^UPDATE/.test(c.sql))).toBe(false);
  });

  it("refuses a row with no id — there is no conflict key to upsert on", async () => {
    const { client } = mockClient();
    await expect(writeChunk(client, widgets, [{ label: "orphan" }])).rejects.toThrow(/no id/);
  });

  it("returns the ids it wrote, in order", async () => {
    const { client } = mockClient();
    const result = await writeChunk(client, widgets, [
      { id: "w1", label: "One", size: 1 },
      { id: "w2", label: "Two", size: 2 },
    ]);
    expect(result).toEqual({ table: "fixture_widgets", written: 2, ids: ["w1", "w2"] });
  });

  it("rolls back when a row fails", async () => {
    // Leaving the connection in a failed transaction would make every later
    // statement fail with a misleading error.
    const { client, calls } = mockClient(true);
    await expect(
      writeChunk(client, widgets, [{ id: "w1", label: "One", size: 1 }]),
    ).rejects.toThrow(/write failed/);
    expect(calls.some((c) => c.sql === "ROLLBACK")).toBe(true);
    expect(calls.some((c) => c.sql === "COMMIT")).toBe(false);
  });

  it("writes nothing for an empty chunk", async () => {
    const { client, calls } = mockClient();
    const result = await writeChunk(client, widgets, []);
    expect(result.written).toBe(0);
    expect(calls.some((c) => c.sql === "BEGIN")).toBe(false);
  });

  it("upserts on conflict rather than failing on a repeat", async () => {
    const { client, calls } = mockClient();
    await writeChunk(client, widgets, [{ id: "w1", label: "One", size: 1 }]);
    const insert = calls.find((c) => /INSERT INTO/.test(c.sql));
    expect(insert?.sql).toMatch(/ON CONFLICT \(id\) DO UPDATE/);
    // The id is not in the SET list — updating a row's key to itself is noise.
    expect(insert?.sql).not.toMatch(/SET.*\bid = EXCLUDED\.id/s);
  });
});

describe("truncateTarget", () => {
  it("deletes every row rather than merging", async () => {
    // ADR-009: a rebuild removes stale rows. A merge would strand rows that
    // were deleted upstream, since they simply never arrive again.
    const { client, calls } = mockClient();
    await truncateTarget(client, widgets);
    expect(calls.some((c) => c.sql === "DELETE FROM fixture_widgets")).toBe(true);
  });

  it("validates the target before touching the database", async () => {
    const { client, calls } = mockClient();
    await expect(
      truncateTarget(client, { table: "bad name", columns: ["id"] }),
    ).rejects.toThrow(/invalid table name/);
    expect(calls).toHaveLength(0);
  });
});
