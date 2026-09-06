/**
 * The persisted-namespace test.
 *
 * The runtime architecture (§7) says outright: *"Do not key private storage
 * only by practice ID."* The key was `aso:${practiceId}` — practice alone — so
 * two clinicians sharing a workstation shared a namespace.
 *
 * These assertions are about a privacy boundary, not formatting. A change that
 * makes two different principals collide here is a disclosure, and that is what
 * the first test exists to catch.
 */
import { describe, expect, it } from "vitest";

import { graphStorageKey } from "./graph-provider";
import type { VerifiedSession } from "@/shared/model/session";

function session(overrides: Partial<VerifiedSession> = {}): VerifiedSession {
  return {
    identityId: "identity-1",
    userId: "user-1",
    practiceId: "practice-1",
    displayName: "Dr Ada",
    capabilities: [],
    principal: "user",
    ...overrides,
  };
}

describe("graphStorageKey", () => {
  it("separates two identities inside one practice", () => {
    // The defect: both of these used to be `aso:practice-1`.
    const a = graphStorageKey(session({ identityId: "identity-a" }));
    const b = graphStorageKey(session({ identityId: "identity-b" }));
    expect(a).not.toEqual(b);
  });

  it("separates two practices for one identity", () => {
    const a = graphStorageKey(session({ practiceId: "practice-a" }));
    const b = graphStorageKey(session({ practiceId: "practice-b" }));
    expect(a).not.toEqual(b);
  });

  it("separates a user from an agent acting for them", () => {
    // ADR-002: an agent acting for a clinician is a different principal, so it
    // does not inherit the clinician's namespace.
    const user = graphStorageKey(session({ principal: "user" }));
    const agent = graphStorageKey(session({ principal: "agent" }));
    expect(user).not.toEqual(agent);
  });

  it("is stable for the same session", () => {
    expect(graphStorageKey(session())).toEqual(graphStorageKey(session()));
  });

  it("carries a replica generation so a schema change invalidates the namespace", () => {
    expect(graphStorageKey(session())).toMatch(/(^|:)g\d+(:|$)/);
  });

  it("does not key by practice alone", () => {
    // Guards the specific §7 prohibition rather than the current format.
    expect(graphStorageKey(session())).not.toEqual("aso:practice-1");
  });
});
