import { describe, expect, it } from "vitest";

import {
  publishSessionRevocation,
  subscribeSessionRevocation,
} from "./session-revocation-events";

describe("session revocation events", () => {
  it("notifies every listener when an earlier listener throws", () => {
    const observed: string[] = [];
    const failure = new Error("diagnostic subscriber failed");
    const unsubscribeFailure = subscribeSessionRevocation(() => {
      throw failure;
    });
    const unsubscribeBoundary = subscribeSessionRevocation((reason) => observed.push(reason));

    try {
      expect(publishSessionRevocation("Replica authority changed.")).toEqual([failure]);
    } finally {
      unsubscribeFailure();
      unsubscribeBoundary();
    }

    expect(observed).toEqual(["Replica authority changed."]);
  });
});
