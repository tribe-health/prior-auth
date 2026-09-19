/**
 * Rebuild semantics — G3's second half.
 *
 * c003 made rows and checkpoint commit together. This asserts the other half:
 * that a replica which cannot be trusted is *discarded and re-fetched*, not
 * merged into.
 */
import { describe, expect, it } from "vitest";

import { rebuildGeneration, rebuildTrigger } from "./replica-rebuild";
import type { TableTarget } from "./chunk-writer";

interface Call {
  kind: "query" | "exec";
  sql: string;
}

function mockClient(startingGeneration = 1) {
  const calls: Call[] = [];
  let generation = startingGeneration;
  const client = {
    async query<T = Record<string, unknown>>(sql: string): Promise<{ rows: T[] }> {
      calls.push({ kind: "query", sql });
      if (/UPDATE _replica_meta/.test(sql)) {
        generation += 1;
        return { rows: [{ generation }] as T[] };
      }
      return { rows: [] };
    },
    async exec(sql: string) {
      calls.push({ kind: "exec", sql });
    },
  };
  return { client, calls, generation: () => generation };
}

const targets: TableTarget[] = [
  { table: "fixture_widgets", columns: ["id", "label"] },
  { table: "fixture_gadgets", columns: ["id", "kind"] },
];

describe("rebuildTrigger", () => {
  it("returns null when nothing is wrong", () => {
    expect(rebuildTrigger({})).toBeNull();
  });

  it("detects must-refetch", () => {
    expect(rebuildTrigger({ mustRefetch: true })).toBe("must-refetch");
  });

  it("detects a rejected resume", () => {
    expect(rebuildTrigger({ resumeRejected: true })).toBe("resume-rejected");
  });

  it("prefers must-refetch when both apply", () => {
    // The server asserting its history is gone is a stronger statement than the
    // client being unable to place itself in that history.
    expect(rebuildTrigger({ mustRefetch: true, resumeRejected: true })).toBe("must-refetch");
  });
});

describe("rebuildGeneration", () => {
  it("bumps the generation BEFORE clearing rows", async () => {
    // Crash-safety ordering. Bumped-but-not-cleared is safe: old checkpoints
    // read as stale and the next start rebuilds again. Cleared-but-not-bumped
    // is not: an empty replica still claiming the old generation would be
    // accepted by a resume.
    const { client, calls } = mockClient();
    await rebuildGeneration(client, targets, "must-refetch");

    const bumpAt = calls.findIndex((c) => /UPDATE _replica_meta/.test(c.sql));
    const firstDeleteAt = calls.findIndex((c) => c.sql.startsWith("DELETE FROM"));
    expect(bumpAt).toBeGreaterThanOrEqual(0);
    expect(firstDeleteAt).toBeGreaterThan(bumpAt);
  });

  it("clears every target and reports them", async () => {
    const { client, calls } = mockClient();
    const result = await rebuildGeneration(client, targets, "resume-rejected");

    expect(result.cleared).toEqual(["fixture_gadgets", "fixture_widgets"]);
    expect(calls.some((c) => c.sql === "DELETE FROM fixture_widgets")).toBe(true);
    expect(calls.some((c) => c.sql === "DELETE FROM fixture_gadgets")).toBe(true);
  });

  it("clears child targets before their declared parents", async () => {
    const { client, calls } = mockClient();
    await rebuildGeneration(client, targets, "must-refetch");

    const deletes = calls.filter((call) => call.sql.startsWith("DELETE FROM"));
    expect(deletes.map((call) => call.sql)).toEqual([
      "DELETE FROM fixture_gadgets",
      "DELETE FROM fixture_widgets",
    ]);
  });

  it("returns the generation the replica is now on", async () => {
    const { client } = mockClient(4);
    const result = await rebuildGeneration(client, targets, "must-refetch");
    expect(result.generation).toBe(5);
  });

  it("records why the rebuild happened", async () => {
    const { client } = mockClient();
    const result = await rebuildGeneration(client, targets, "resume-rejected");
    expect(result.trigger).toBe("resume-rejected");
  });

  it("never issues an UPDATE that would merge instead of clearing", async () => {
    // Guards the intent, not just the current SQL: a future "optimisation"
    // that reconciled rather than deleted would strand upstream-deleted rows.
    const { client, calls } = mockClient();
    await rebuildGeneration(client, targets, "must-refetch");

    const rowWrites = calls.filter((c) => /INSERT INTO fixture_|UPDATE fixture_/.test(c.sql));
    expect(rowWrites).toEqual([]);
  });

  it("checks authority between every generation and row mutation", async () => {
    const { client, calls } = mockClient();
    let checks = 0;

    await expect(rebuildGeneration(client, targets, "must-refetch", () => {
      checks += 1;
      if (checks === 4) throw new Error("authority changed during rebuild");
    })).rejects.toThrow("authority changed during rebuild");

    expect(calls.filter((call) => call.sql.startsWith("DELETE FROM"))).toHaveLength(1);
  });
});
