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

import { createReplicaAuthorityGuard, graphStorageKey } from "./graph-provider";
import type { VerifiedSession } from "@/shared/model/session";

function session(overrides: Partial<VerifiedSession> = {}): VerifiedSession {
  return {
    identityId: "identity-1",
    sessionId: "session-1",
    userId: "user-1",
    practiceId: "practice-1",
    displayName: "Dr Ada",
    capabilities: [],
    principal: "user",
    expiresAt: "2099-01-01T00:00:00Z",
    authorizationRevision: "test:1",
    ...overrides,
  };
}

describe("graphStorageKey", () => {
  it("separates deployment namespaces", () => {
    expect(graphStorageKey(session(), "staging")).not.toEqual(
      graphStorageKey(session(), "production"),
    );
  });

  it("escapes delimiter characters in adjacent scope components", () => {
    const first = graphStorageKey(
      session({ practiceId: "practice:x", identityId: "identity" }),
      "test",
    );
    const second = graphStorageKey(
      session({ practiceId: "practice", identityId: "x:identity" }),
      "test",
    );
    expect(first).not.toEqual(second);
  });

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

  it("separates sessions and authorization revisions for one identity", () => {
    expect(graphStorageKey(session({ sessionId: "session-a" }))).not.toEqual(
      graphStorageKey(session({ sessionId: "session-b" })),
    );
    expect(graphStorageKey(session({ authorizationRevision: "test:1" }))).not.toEqual(
      graphStorageKey(session({ authorizationRevision: "test:2" })),
    );
  });

  it("is stable for the same session", () => {
    expect(graphStorageKey(session())).toEqual(graphStorageKey(session()));
  });

  it("carries a replica generation so a schema change invalidates the namespace", () => {
    expect(graphStorageKey(session())).toMatch(/(^|:)g6(:|$)/);
  });

  it("does not key by practice alone", () => {
    // Guards the specific §7 prohibition rather than the current format.
    expect(graphStorageKey(session())).not.toEqual("aso:practice-1");
  });
});

describe("createReplicaAuthorityGuard", () => {
  it("reads renewed expiry from the latest same-session value", () => {
    let current = session({ expiresAt: "2026-09-14T12:00:01Z" });
    const guard = createReplicaAuthorityGuard(
      graphStorageKey(current),
      () => current,
      () => Date.parse("2026-09-14T12:00:02Z"),
    );

    expect(() => guard()).toThrow("Replica authority expired");
    current = session({ expiresAt: "2026-09-14T12:05:00Z" });
    expect(() => guard()).not.toThrow();
  });

  it("rejects a changed authority tuple and an invalid expiry", () => {
    let current = session();
    const guard = createReplicaAuthorityGuard(graphStorageKey(current), () => current);

    current = session({ authorizationRevision: "test:2" });
    expect(() => guard()).toThrow("Replica authority changed");

    current = session({ expiresAt: "invalid" });
    const invalidExpiry = createReplicaAuthorityGuard(graphStorageKey(current), () => current);
    expect(() => invalidExpiry()).toThrow("Replica authority expired");
  });
});
