/**
 * The defaults are the point of these tests.
 *
 * A replica on disk is PHI at rest on a machine this application does not
 * control, so every path that is not an explicit, recognised opt-in must land
 * on memory. These assert that from the unsafe direction: given anything
 * ambiguous, does it still refuse to persist?
 */
import { describe, expect, it } from "vitest";

import {
  assertMaterializerStoragePolicy,
  pgliteDataDir,
  resolveStoragePolicy,
} from "./storage-policy";

describe("resolveStoragePolicy", () => {
  it("persists only on an explicit opt-in", () => {
    const policy = resolveStoragePolicy("persistent");
    expect(policy).toEqual({
      mode: "persistent",
      reason: "explicit-persistent",
      misconfigured: false,
    });
  });

  it("defaults to memory when unset", () => {
    // The common case: no one configured anything. ADR-009 makes this
    // memory-only, because an unmanaged or shared device is the assumption
    // until a deployment says otherwise.
    for (const unset of [undefined, null, "", "   "]) {
      const policy = resolveStoragePolicy(unset);
      expect(policy.mode).toBe("memory");
      expect(policy.misconfigured).toBe(false);
    }
  });

  it("honours an explicit memory setting without flagging it", () => {
    const policy = resolveStoragePolicy("memory");
    expect(policy).toEqual({ mode: "memory", reason: "explicit-memory", misconfigured: false });
  });

  it("tolerates surrounding whitespace and case", () => {
    // A value from an .env file or a CI variable often carries these.
    expect(resolveStoragePolicy("  Persistent  ").mode).toBe("persistent");
    expect(resolveStoragePolicy("MEMORY").mode).toBe("memory");
  });

  it("falls back to memory on an unrecognised value, and says so", () => {
    // "No silent runtime fallback changes storage." A deployment that meant to
    // persist and mistyped must not quietly run ephemeral and look fine.
    const policy = resolveStoragePolicy("enabled");
    expect(policy.mode).toBe("memory");
    expect(policy.misconfigured).toBe(true);
    expect(policy.reason).toBe("unrecognised-defaults-to-memory");
  });

  it("never persists on a truthy-looking value that is not the opt-in", () => {
    // The failure this guards: someone writes `true`, `1` or `yes` expecting
    // persistence. Each is a misconfiguration, and each stays in memory.
    for (const value of ["true", "1", "yes", "on", "idb"]) {
      const policy = resolveStoragePolicy(value);
      expect(policy.mode, `${value} must not enable persistence`).toBe("memory");
      expect(policy.misconfigured).toBe(true);
    }
  });
});

describe("pgliteDataDir", () => {
  it("namespaces a persistent replica by storage key", () => {
    // Two principals or practices on one browser must not share a database.
    const policy = resolveStoragePolicy("persistent");
    expect(pgliteDataDir(policy, "aso:g1:user:practice-1:identity-1")).toBe(
      "idb://aso:g1:user:practice-1:identity-1",
    );
  });

  it("returns undefined for memory, which is PGlite's in-memory default", () => {
    const policy = resolveStoragePolicy("memory");
    expect(pgliteDataDir(policy, "aso:g1:user:practice-1:identity-1")).toBeUndefined();
  });
});

describe("assertMaterializerStoragePolicy", () => {
  it("refuses the experimental clinical materializer on persistent storage", () => {
    expect(() =>
      assertMaterializerStoragePolicy(resolveStoragePolicy("persistent"), true),
    ).toThrowError(
      "The experimental clinical materializer is approved only for memory-only qualification.",
    );
  });

  it("allows the experimental materializer in memory and persistent storage without it", () => {
    expect(() =>
      assertMaterializerStoragePolicy(resolveStoragePolicy("memory"), true),
    ).not.toThrow();
    expect(() =>
      assertMaterializerStoragePolicy(resolveStoragePolicy("persistent"), false),
    ).not.toThrow();
  });
});
