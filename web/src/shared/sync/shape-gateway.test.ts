import { describe, expect, it } from "vitest";

import { requireShapeGatewayUrl } from "./shape-gateway";

describe("requireShapeGatewayUrl", () => {
  it("uses the authorized shape gateway", () => {
    expect(requireShapeGatewayUrl({ VITE_ASO_SHAPE_GATEWAY: "https://gate.example.invalid" }))
      .toBe("https://gate.example.invalid");
  });

  it("refuses startup when only the application API is configured", () => {
    expect(() => requireShapeGatewayUrl({})).toThrow(
      "VITE_ASO_SHAPE_GATEWAY is required to open the authorized replica.",
    );
  });
});
