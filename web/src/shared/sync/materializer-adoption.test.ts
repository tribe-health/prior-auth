import { describe, expect, it } from "vitest";

import { isExperimentalMaterializerEnabled } from "./materializer-adoption";

describe("isExperimentalMaterializerEnabled", () => {
  it("keeps the blocked browser materializer disabled by default", () => {
    expect(isExperimentalMaterializerEnabled(undefined)).toBe(false);
    expect(isExperimentalMaterializerEnabled("true")).toBe(false);
    expect(isExperimentalMaterializerEnabled("production")).toBe(false);
  });

  it("allows the exact experimental qualification value", () => {
    expect(isExperimentalMaterializerEnabled("experimental")).toBe(true);
  });
});
