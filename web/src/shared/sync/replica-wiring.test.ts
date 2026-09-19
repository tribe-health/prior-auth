import { describe, expect, it } from "vitest";

import { CHECKPOINT_SCHEMA_SQL, createPGliteCheckpointStore } from "./replica-wiring";

function checkpointStore(serialized: string | null) {
  return createPGliteCheckpointStore({
    async query<T>() {
      return { rows: [{ value: "transaction", checkpoint: serialized } as T] };
    },
    async exec() {},
  });
}

describe("createPGliteCheckpointStore", () => {
  it("returns a complete stored cursor", async () => {
    expect(CHECKPOINT_SCHEMA_SQL).not.toMatch(/\bUNLOGGED\b/);
    const checkpoint = { generation: 3, shapes: { cases: { handle: "h", offset: "7" } } };
    await expect(checkpointStore(JSON.stringify(checkpoint)).read("scope")).resolves.toEqual({
      value: "transaction",
      checkpoint,
    });
  });

  it.each([
    ["invalid JSON", "{"],
    ["missing cursor values", JSON.stringify({ generation: 3, shapes: { cases: {} } })],
    ["empty cursor values", JSON.stringify({ generation: 3, shapes: { cases: { handle: "", offset: "7" } } })],
  ])("refuses %s", async (_label, serialized) => {
    await expect(checkpointStore(serialized).read("scope")).resolves.toEqual({
      value: "transaction",
      checkpoint: null,
    });
  });
});
